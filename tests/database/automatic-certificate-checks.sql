-- Disposable database only: fake certificate metadata, no Vault/key/service call.
begin;
create temporary table automatic_assertions(name text primary key);
grant insert on automatic_assertions to authenticated,anon,service_role;
create function pg_temp.auto_check(condition boolean,name text) returns void language plpgsql as $$
begin if condition is distinct from true then raise exception 'Automatic check assertion failed: %',name; end if;
insert into pg_temp.automatic_assertions values(name); end $$;
create temporary table auto_fixture as select c.id company_id,c.tenant_id,t.owner_user_id actor,gen_random_uuid() certificate
  from public.companies c join public.tenants t on t.id=c.tenant_id
  where t.owner_user_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')
  order by c.created_at limit 2;
-- Select exactly one company per owner, independent of other scenarios' fixture counts.
truncate auto_fixture;
insert into auto_fixture select distinct on(t.owner_user_id) c.id,c.tenant_id,t.owner_user_id,gen_random_uuid()
  from public.companies c join public.tenants t on t.id=c.tenant_id
  where t.owner_user_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002') order by t.owner_user_id,c.id;
update public.company_certificates set status='replaced' where company_id in(select company_id from auto_fixture) and status='active';
insert into public.company_certificates(id,tenant_id,company_id,subject_cnpj,fingerprint,serial_number,valid_from,valid_until,created_by)
 select f.certificate,f.tenant_id,f.company_id,c.cnpj,repeat('e',64),'AUTOMATIC SYNTHETIC FIXTURE',now()-interval '1 day',now()+interval '1 day',f.actor
 from auto_fixture f join public.companies c on c.id=f.company_id;
select set_config('test.auto_a',(select certificate::text from auto_fixture where actor='00000000-0000-4000-8000-000000000001'),true);
select set_config('test.auto_b',(select certificate::text from auto_fixture where actor='00000000-0000-4000-8000-000000000002'),true);
select set_config('test.tenant_a',(select tenant_id::text from auto_fixture where actor='00000000-0000-4000-8000-000000000001'),true);
select set_config('test.tenant_b',(select tenant_id::text from auto_fixture where actor='00000000-0000-4000-8000-000000000002'),true);
set role service_role;
do $$ begin
 begin perform public.enqueue_certificate_verification('00000000-0000-4000-8000-000000000002',current_setting('test.auto_a')::uuid); raise exception 'Foreign enqueue accepted';
 exception when insufficient_privilege then perform pg_temp.auto_check(true,'server RPC independently checks certificate owner'); end;
end $$;
select pg_temp.auto_check(public.enqueue_certificate_verification('00000000-0000-4000-8000-000000000001',current_setting('test.auto_a')::uuid),'owner enqueues A');
select pg_temp.auto_check(public.enqueue_certificate_verification('00000000-0000-4000-8000-000000000001',current_setting('test.auto_a')::uuid),'duplicate enqueue is idempotent');
select pg_temp.auto_check(public.enqueue_certificate_verification('00000000-0000-4000-8000-000000000002',current_setting('test.auto_b')::uuid),'owner enqueues B');
reset role;
select pg_temp.auto_check((select count(*)=2 from public.certificate_verifications),'one durable record per certificate');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
select pg_temp.auto_check((select count(*)=1 from public.certificate_verifications),'A sees only own status');
select pg_temp.auto_check((select count(*)=0 from public.certificate_verifications where certificate_id=current_setting('test.auto_b')::uuid),'foreign known certificate ID stays invisible');
do $$ begin
 begin update public.certificate_verifications set status='verified'; raise exception 'Client forged verification';
 exception when insufficient_privilege then perform pg_temp.auto_check(true,'client cannot write status'); end;
 begin perform public.enqueue_certificate_verification('00000000-0000-4000-8000-000000000001',current_setting('test.auto_a')::uuid); raise exception 'Client called trusted RPC';
 exception when insufficient_privilege then perform pg_temp.auto_check(true,'enqueue is server only'); end;
 begin perform public.claim_certificate_verification(null); raise exception 'Client claimed all tenants';
 exception when insufficient_privilege then perform pg_temp.auto_check(true,'claim is server only'); end;
 begin perform public.finish_certificate_verification(current_setting('test.auto_a')::uuid,gen_random_uuid(),'sefin_verified',200); raise exception 'Client forged finish';
 exception when insufficient_privilege then perform pg_temp.auto_check(true,'finish is server only'); end;
end $$;
reset role;
set role anon;
do $$ begin begin perform * from public.certificate_verifications; raise exception 'Anonymous metadata exposed';
 exception when insufficient_privilege then perform pg_temp.auto_check(true,'anonymous status access denied'); end; end $$;
reset role;
set role service_role;
select set_config('test.claim_a',public.claim_certificate_verification(current_setting('test.tenant_a')::uuid)::text,true);
select pg_temp.auto_check(current_setting('test.claim_a')::jsonb->>'certificateId'=current_setting('test.auto_a'),'tenant filter claims own certificate');
select pg_temp.auto_check(public.claim_certificate_verification(current_setting('test.tenant_a')::uuid) is null,'active lease prevents duplicate worker');
select pg_temp.auto_check(not public.finish_certificate_verification(current_setting('test.auto_a')::uuid,gen_random_uuid(),'sefin_verified',200),'wrong token cannot complete');
do $$ begin begin perform public.finish_certificate_verification(current_setting('test.auto_a')::uuid,(current_setting('test.claim_a')::jsonb->>'token')::uuid,'sefin_verified',401); raise exception '401 marked verified';
 exception when invalid_parameter_value then perform pg_temp.auto_check(true,'invalid verified status rejected'); end; end $$;
select pg_temp.auto_check(public.finish_certificate_verification(current_setting('test.auto_a')::uuid,(current_setting('test.claim_a')::jsonb->>'token')::uuid,'sefin_verified',404),'documented 404 result can be recorded by trusted verifier');
select pg_temp.auto_check(not public.finish_certificate_verification(current_setting('test.auto_a')::uuid,(current_setting('test.claim_a')::jsonb->>'token')::uuid,'sefin_verified',404),'completion commits once');
select public.enqueue_certificate_verification('00000000-0000-4000-8000-000000000001',current_setting('test.auto_a')::uuid);
select pg_temp.auto_check(not public.certificate_verification_ready(current_setting('test.tenant_a')::uuid),'visiting verified certificate does not restart it');
select set_config('test.old_b',public.claim_certificate_verification(current_setting('test.tenant_b')::uuid)::text,true);
reset role;
update public.certificate_verifications set lease_until=now()-interval '1 second' where certificate_id=current_setting('test.auto_b')::uuid;
set role service_role;
select set_config('test.claim_b',public.claim_certificate_verification(current_setting('test.tenant_b')::uuid)::text,true);
select pg_temp.auto_check(current_setting('test.claim_b')::jsonb->>'token'<>current_setting('test.old_b')::jsonb->>'token','expired worker gets a different lease');
select pg_temp.auto_check(not public.finish_certificate_verification(current_setting('test.auto_b')::uuid,(current_setting('test.old_b')::jsonb->>'token')::uuid,'sefin_verified',200),'stale worker cannot overwrite result');
select public.finish_certificate_verification(current_setting('test.auto_b')::uuid,(current_setting('test.claim_b')::jsonb->>'token')::uuid,'sefin_unavailable',503);
select pg_temp.auto_check(not public.certificate_verification_ready(current_setting('test.tenant_b')::uuid),'transient error respects retry delay');
reset role;
update public.certificate_verifications set next_attempt=now()-interval '1 second' where certificate_id=current_setting('test.auto_b')::uuid;
set role service_role;
select pg_temp.auto_check(public.certificate_verification_ready(current_setting('test.tenant_b')::uuid),'scheduled retry becomes ready');
select set_config('test.claim_b',public.claim_certificate_verification(current_setting('test.tenant_b')::uuid)::text,true);
select public.finish_certificate_verification(current_setting('test.auto_b')::uuid,(current_setting('test.claim_b')::jsonb->>'token')::uuid,'sefin_unavailable',503);
select pg_temp.auto_check(not public.certificate_verification_ready(current_setting('test.tenant_b')::uuid),'retry budget is bounded');
reset role;
select pg_temp.auto_check((select attempts=3 and next_attempt is null and status='attention' from public.certificate_verifications where certificate_id=current_setting('test.auto_b')::uuid),'three unsuccessful attempts stop automatically');
select pg_temp.auto_check((select count(*)=0 from public.fiscal_operations where created_at=now()),'certificate checks do not create invoice operations');
update public.company_certificates set status='revoked' where id=current_setting('test.auto_a')::uuid;
set role service_role;
do $$ begin begin perform public.enqueue_certificate_verification('00000000-0000-4000-8000-000000000001',current_setting('test.auto_a')::uuid); raise exception 'Revoked certificate accepted';
 exception when insufficient_privilege then perform pg_temp.auto_check(true,'revoked certificate cannot enqueue'); end; end $$;
reset role;
select 'AUTOMATIC_ASSERTIONS='||count(*) from automatic_assertions;
rollback;
