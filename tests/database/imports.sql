create temporary table import_assertions(name text primary key);
grant insert on import_assertions to authenticated,anon,service_role;
create function pg_temp.import_check(condition boolean,name text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'Import assertion failed: %',name; end if;
 insert into pg_temp.import_assertions values(name);
end $$;
select set_config('test.import_company_a',(select c.id::text from public.companies c join public.tenants t on t.id=c.tenant_id where t.owner_user_id='00000000-0000-4000-8000-000000000001' limit 1),false);
select set_config('test.import_company_b',(select c.id::text from public.companies c join public.tenants t on t.id=c.tenant_id where t.owner_user_id='00000000-0000-4000-8000-000000000002' limit 1),false);
select set_config('test.import_tenant_a',(select tenant_id::text from public.companies where id=current_setting('test.import_company_a')::uuid),false);

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
do $$ begin
 begin perform public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.import_company_a')::uuid,'test.csv','YQ=='); raise exception 'Client registered trusted bytes';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'registration RPC is server only'); end;
 begin perform * from public.claim_report_jobs(); raise exception 'Client claimed jobs';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'claim RPC is server only'); end;
 begin perform public.finish_report_job(gen_random_uuid(),gen_random_uuid(),'{}'); raise exception 'Client completed jobs';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'completion RPC is server only'); end;
 begin perform content from private.report_sources; raise exception 'Raw source read allowed';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'private original not directly accessible'); end;
 begin insert into public.report_imports default values; raise exception 'Direct insert allowed';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'direct trusted import insert denied'); end;
 begin update public.work_jobs set status='completed'; raise exception 'Direct job transition allowed';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'direct job transitions denied'); end;
 begin perform lease_token from public.work_jobs; raise exception 'Lease token visible';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'lease tokens not exposed to client'); end;
end $$;
reset role;
set role service_role;
do $$ begin
 begin perform public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.import_company_b')::uuid,'test.csv','YQ=='); raise exception 'Foreign company accepted';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'trusted registration still checks actor ownership'); end;
 begin perform public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.import_company_a')::uuid,'test.csv',''); raise exception 'Empty bytes accepted';
 exception when invalid_parameter_value then perform pg_temp.import_check(true,'empty source rejected'); end;
end $$;
select set_config('test.import_a',(public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.import_company_a')::uuid,'test.csv','YQ==')->>'id'),false);
select pg_temp.import_check((public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.import_company_a')::uuid,'renamed.csv','YQ==')->>'id')=current_setting('test.import_a'),'same bytes same company return same import');
select pg_temp.import_check((public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.import_company_a')::uuid,'renamed.csv','YQ==')->>'duplicate')::boolean,'duplicate explicitly reported');
select set_config('test.import_b',(public.register_report('00000000-0000-4000-8000-000000000002',current_setting('test.import_company_b')::uuid,'test.csv','YQ==')->>'id'),false);
select pg_temp.import_check(current_setting('test.import_a')<>current_setting('test.import_b'),'different tenant may import identical source independently');
select set_config('test.import_job',job_id::text,false),set_config('test.import_token',lease_token::text,false),set_config('test.import_hash',file_sha256,false)
 from public.claim_report_jobs(current_setting('test.import_tenant_a')::uuid,1);
select pg_temp.import_check(not public.finish_report_job(current_setting('test.import_job')::uuid,gen_random_uuid(),null,'invalid_csv'),'wrong lease token cannot acknowledge');
do $$ begin
 begin perform public.finish_report_job(current_setting('test.import_job')::uuid,current_setting('test.import_token')::uuid,'{"review":{"source":{"fileSha256":"forged"}}}'); raise exception 'Wrong source hash accepted';
 exception when invalid_parameter_value then perform pg_temp.import_check(true,'parsed result bound to original hash'); end;
end $$;
select pg_temp.import_check(public.finish_report_job(current_setting('test.import_job')::uuid,current_setting('test.import_token')::uuid,
 jsonb_build_object('review',jsonb_build_object('source',jsonb_build_object('fileSha256',current_setting('test.import_hash'),'adapterId','shopee-seller-monthly-csv','adapterVersion','1'),'fiscalStatus','not_evaluated','rows','[{}]'::jsonb),'reportedSellers','[{}]'::jsonb)), 'owned lease accepts one result');
select pg_temp.import_check(not public.finish_report_job(current_setting('test.import_job')::uuid,current_setting('test.import_token')::uuid,null,'invalid_csv'),'acknowledgement replay changes nothing');
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.import_check((select count(*)=1 from public.report_imports),'owner sees only own import');
select pg_temp.import_check((select status='parsed' and row_count=1 from public.report_imports),'parsed result survives independent read');
select pg_temp.import_check((select count(*)=1 from public.work_jobs),'duplicate did not create second job');
select pg_temp.import_check((select count(*)=2 from public.audit_events),'creation and parsing audited once');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.import_check((select count(*)=0 from public.report_imports where id=current_setting('test.import_a')::uuid),'known foreign import ID reveals no data');
select pg_temp.import_check((select count(*)=0 from public.audit_events where resource_id=current_setting('test.import_a')::uuid),'foreign audit inaccessible');
select set_config('request.jwt.claims','{}',false);
select pg_temp.import_check((select count(*)=0 from public.report_imports),'missing identity reads no imports');
reset role;
set role anon;
do $$ begin
 begin perform * from public.report_imports; raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then perform pg_temp.import_check(true,'anonymous imports denied'); end;
end $$;
reset role;

-- Force expiration only inside this disposable database, then prove fencing on the old token.
set role service_role;
select set_config('test.old_job',job_id::text,false),set_config('test.old_token',lease_token::text,false) from public.claim_report_jobs(null,1);
reset role;
update public.work_jobs set lease_until=now()-interval '1 minute' where id=current_setting('test.old_job')::uuid;
set role service_role;
select set_config('test.new_token',lease_token::text,false) from public.claim_report_jobs(null,1);
select pg_temp.import_check(current_setting('test.new_token')<>current_setting('test.old_token'),'expired work receives a different fencing token');
select pg_temp.import_check(not public.finish_report_job(current_setting('test.old_job')::uuid,current_setting('test.old_token')::uuid,null,'invalid_csv'),'stale worker cannot overwrite reclaimed work');
select pg_temp.import_check(public.finish_report_job(current_setting('test.old_job')::uuid,current_setting('test.new_token')::uuid,null,'invalid_csv'),'new worker may finish invalid source safely');
reset role;
select 'IMPORT_ASSERTIONS='||count(*) from import_assertions;
