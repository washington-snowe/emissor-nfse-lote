-- Disposable PostgreSQL fixtures only. Never execute against the hosted project.
create temporary table review_assertions(name text primary key);
grant insert on review_assertions to authenticated,anon,service_role;
create function pg_temp.review_check(condition boolean,name text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'Review assertion failed: %',name; end if;
 insert into pg_temp.review_assertions values(name);
end $$;
select set_config('test.review_company',(select c.id::text from public.companies c join public.tenants t on t.id=c.tenant_id where t.owner_user_id='00000000-0000-4000-8000-000000000001' limit 1),false);
select set_config('test.review_tenant',(select tenant_id::text from public.companies where id=current_setting('test.review_company')::uuid),false);
select set_config('test.review_profile',(select id::text from public.company_fiscal_profiles where company_id=current_setting('test.review_company')::uuid order by version desc limit 1),false);
set role service_role;
select set_config('test.review_import',public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.review_company')::uuid,'review-fixture.csv','cmV2aWV3LWZpeHR1cmU=')->>'id',false);
select set_config('test.review_job',job_id::text,false),set_config('test.review_token',lease_token::text,false),set_config('test.review_file',file_sha256,false)
  from public.claim_report_jobs(current_setting('test.review_tenant')::uuid,5) where import_id=current_setting('test.review_import')::uuid;
select pg_temp.review_check(public.finish_report_job(current_setting('test.review_job')::uuid,current_setting('test.review_token')::uuid,
 jsonb_build_object('review',jsonb_build_object('source',jsonb_build_object('fileSha256',current_setting('test.review_file'),'adapterId','shopee-seller-monthly-csv','adapterVersion','1'),
 'fiscalStatus','not_evaluated','rows','[{"location":{"row":2},"currency":"BRL","amount":"1.10"},{"location":{"row":3},"currency":"BRL","amount":"2.20"}]'::jsonb),'reportedSellers','[{},{}]'::jsonb)),'original parsed fixture stored');
reset role;
select set_config('test.review_snapshot',jsonb_build_object('contractVersion',1,'environment','homologation','companyId',c.id,'issuerCnpj',c.cnpj,
 'importId',r.id,'fileSha256',r.file_sha256,'profileId',p.id,'profileSha256',p.configuration_sha256,'profileVersion',p.version,
 'competenceDate','2026-10-31','commissionType','Synthetic commission','evidenceReference','Synthetic accounting reference','recipientRoleConfirmed',true,
 'recipientChoice','single_recipient','grouping','per_row','sourceRows',2,'currency','BRL','total','3.30','groups',jsonb_build_array(
 jsonb_build_object('sourceRows','[2]'::jsonb,'sourceClaims',jsonb_build_array(repeat('a',64)),'allocations','[{"row":2,"amount":"1.10"}]'::jsonb,'amount','1.10','recipient','{"kind":"cnpj","document":"11222333000181","country":"BR","legalName":"Synthetic recipient"}'::jsonb),
 jsonb_build_object('sourceRows','[3]'::jsonb,'sourceClaims',jsonb_build_array(repeat('b',64)),'allocations','[{"row":3,"amount":"2.20"}]'::jsonb,'amount','2.20','recipient','{"kind":"cnpj","document":"11222333000181","country":"BR","legalName":"Synthetic recipient"}'::jsonb)))::text,false)
 from public.report_imports r join public.companies c on c.id=r.company_id join public.company_fiscal_profiles p on p.id=current_setting('test.review_profile')::uuid where r.id=current_setting('test.review_import')::uuid;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
do $$ begin
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,current_setting('test.review_snapshot')::jsonb); raise exception 'Direct review save allowed';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'review preparation is server only'); end;
 begin perform public.confirm_report_review('00000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64)); raise exception 'Direct confirmation allowed';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'review confirmation is server only'); end;
 begin insert into public.review_confirmations default values; raise exception 'Direct proof forge allowed';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'confirmation insert denied'); end;
 begin update public.report_reviews set version=2; raise exception 'Review mutation allowed';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'review versions immutable to client'); end;
end $$;
reset role;
set role service_role;
do $$ begin
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000002',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,current_setting('test.review_snapshot')::jsonb); raise exception 'Foreign actor saved review';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'actor ownership checked for review preparation'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,jsonb_set(current_setting('test.review_snapshot')::jsonb,'{fileSha256}',to_jsonb(repeat('c',64)))); raise exception 'Wrong source hash accepted';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'review bound to original file hash'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,jsonb_set(current_setting('test.review_snapshot')::jsonb,'{recipientRoleConfirmed}','false')); raise exception 'Unconfirmed role accepted';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'recipient role must be explicitly confirmed'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,jsonb_set(current_setting('test.review_snapshot')::jsonb,'{groups,1,sourceRows}','[2]')); raise exception 'Duplicate coverage accepted';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'every source row covered exactly once'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,jsonb_set(current_setting('test.review_snapshot')::jsonb,'{total}','"9.99"')); raise exception 'Wrong sum accepted';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'total must equal group amounts'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,jsonb_set(jsonb_set(current_setting('test.review_snapshot')::jsonb,'{groups,0,amount}','"2.10"'),'{total}','"4.30"')); raise exception 'Changed source commission accepted';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'groups preserve exact original commissions'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,jsonb_set(current_setting('test.review_snapshot')::jsonb,'{groups,0,allocations,0,amount}','"1.99"')); raise exception 'Changed allocation accepted';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'allocation preserves source amount'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,jsonb_set(current_setting('test.review_snapshot')::jsonb,'{groups,1,allocations,0,row}','2')); raise exception 'Allocation rebound to wrong group';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'allocation belongs to its exact source group'); end;
 begin perform public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,
   jsonb_set(jsonb_set(current_setting('test.review_snapshot')::jsonb,'{groups,0,foreignAmount}','"2.00"'),'{groups,0,allocations,0,foreignAmount}','"1.99"')); raise exception 'Wrong foreign allocation sum accepted';
 exception when invalid_parameter_value then perform pg_temp.review_check(true,'foreign amount reconciles to per-row allocations'); end;
end $$;
select set_config('test.review_id',public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,0,current_setting('test.review_snapshot')::jsonb)->>'id',false);
select pg_temp.review_check((public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,1,current_setting('test.review_snapshot')::jsonb)->>'id')=current_setting('test.review_id'),'unchanged preparation reuses revision');
reset role;
select set_config('test.review_hash',(select snapshot_sha256 from public.report_reviews where id=current_setting('test.review_id')::uuid),false);
set role service_role;
do $$ begin
 begin perform public.confirm_report_review('00000000-0000-4000-8000-000000000002',current_setting('test.review_id')::uuid,current_setting('test.review_hash')); raise exception 'Foreign actor confirmed review';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'confirmation actor ownership enforced'); end;
 begin perform public.confirm_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_id')::uuid,repeat('f',64)); raise exception 'Wrong digest confirmed';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'confirmation requires exact content hash'); end;
end $$;
select set_config('test.review_confirmation',public.confirm_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_id')::uuid,current_setting('test.review_hash'))::text,false);
select pg_temp.review_check(public.confirm_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_id')::uuid,current_setting('test.review_hash'))::text=current_setting('test.review_confirmation'),'confirmation retry is idempotent');
select set_config('test.review_new_id',public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_import')::uuid,current_setting('test.review_profile')::uuid,1,jsonb_set(current_setting('test.review_snapshot')::jsonb,'{evidenceReference}','"New synthetic evidence"'))->>'id',false);
do $$ begin
 begin perform public.confirm_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_id')::uuid,current_setting('test.review_hash')); raise exception 'Superseded revision confirmed';
 exception when serialization_failure then perform pg_temp.review_check(true,'new review invalidates earlier confirmation for future operations'); end;
end $$;
reset role;
select set_config('test.review_new_hash',(select snapshot_sha256 from public.report_reviews where id=current_setting('test.review_new_id')::uuid),false);
select public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.review_company')::uuid,2,
 (select configuration from public.company_fiscal_profiles where id=current_setting('test.review_profile')::uuid),'New synthetic profile orientation','2026-01-01');
set role service_role;
do $$ begin
 begin perform public.confirm_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.review_new_id')::uuid,current_setting('test.review_new_hash')); raise exception 'Stale profile confirmed';
 exception when serialization_failure then perform pg_temp.review_check(true,'profile change requires a new reviewed snapshot'); end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.review_check((select count(*)=2 from public.report_reviews),'owner reads review history');
select pg_temp.review_check((select count(*)=1 from public.review_confirmations),'owner reads own confirmation');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.review_check((select count(*)=0 from public.report_reviews),'other tenant cannot read reviews');
select pg_temp.review_check((select count(*)=0 from public.review_confirmations),'other tenant cannot read confirmations');
reset role;
set role anon;
do $$ begin
 begin perform * from public.report_reviews; raise exception 'Anonymous review read allowed';
 exception when insufficient_privilege then perform pg_temp.review_check(true,'anonymous review read denied'); end;
end $$;
reset role;
select pg_temp.review_check((select count(*)=1 from public.audit_events where event='report_review.confirmed'),'confirmation audited once');
select pg_temp.review_check((select count(*)=0 from public.work_jobs where kind <> 'parse_import'),'review preparation never creates transmission jobs');
select 'REVIEW_ASSERTIONS='||count(*) from review_assertions;
