-- Local transaction only. Synthetic production metadata exercises pricing;
-- rollback restores all guards. This file must NEVER run in hosted Supabase.
begin;
create temporary table usage_checks(name text primary key);
grant insert on usage_checks to authenticated,service_role;
create function pg_temp.usage_check(ok boolean,name text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Usage assertion failed: %',name; end if; insert into pg_temp.usage_checks values(name); end $$;
select set_config('test.usage_tenant',(select id::text from public.tenants where owner_user_id='00000000-0000-4000-8000-000000000001'),true);
select pg_temp.usage_check((select included_notes=150 and overage_cents=30 from public.billing_plans where code='start'),'approved production allowance is 150 at thirty cents overage');
-- Temporarily reduce the allowance to exercise its exact boundary with two rows.
update public.billing_plans set included_notes=1 where code='start';
do $$ declare target regclass; item record; begin
 foreach target in array array['public.fiscal_operations'::regclass,'public.fiscal_documents'::regclass] loop
  for item in select conname from pg_constraint where conrelid=target and contype='c' and pg_get_constraintdef(oid) like '%environment%homologation%' loop
   execute format('alter table %s drop constraint %I',target,item.conname);
  end loop;
 end loop;
end $$;
insert into private.billing_accounts(tenant_id,livemode,customer_id) values(current_setting('test.usage_tenant')::uuid,true,'cus_usage');
insert into public.account_subscriptions(id,tenant_id,livemode,plan_code,cadence,status,period_start,period_end,cancel_at_period_end,created_at)
 values('sub_usage',current_setting('test.usage_tenant')::uuid,true,'start','monthly','active',now()-interval '1 day',now()+interval '1 month',false,now());
create temporary table usage_operations as select o.* from public.fiscal_operations o where tenant_id=current_setting('test.usage_tenant')::uuid and not exists(select 1 from public.fiscal_documents d where d.operation_id=o.id) order by id limit 2;
select pg_temp.usage_check((select count(*)=2 from usage_operations),'two synthetic operations available');
update public.fiscal_operations set environment='production' where id in(select id from usage_operations);
insert into public.fiscal_documents(tenant_id,company_id,operation_id,environment,access_key,xml_sha256)
 select tenant_id,company_id,id,'production',lpad(row_number()over(order by id)::text,50,'0'),repeat('e',64) from usage_operations order by id;
select pg_temp.usage_check((select count(*)=1 from private.billing_usage where status='included'),'allowance counts actual document once');
select pg_temp.usage_check((select count(*)=1 and sum(unit_cents)=30 from private.billing_usage where status='pending'),'first excess authorization costs exactly thirty cents');
set role service_role;
select set_config('test.usage_batch',public.claim_billing_usage(current_setting('test.usage_tenant')::uuid)::text,true);
select pg_temp.usage_check((current_setting('test.usage_batch')::jsonb->>'amount_cents')::integer=30,'batch preserves exact excess amount');
select pg_temp.usage_check((current_setting('test.usage_batch')::jsonb->>'notes')::integer=1,'batch contains excess only');
select pg_temp.usage_check(public.claim_billing_usage(current_setting('test.usage_tenant')::uuid) is null,'active lease cannot create another fee batch');
select pg_temp.usage_check(not public.mark_billing_usage_attempt((current_setting('test.usage_batch')::jsonb->>'id')::uuid,gen_random_uuid()),'stale worker cannot record charge intent');
select pg_temp.usage_check(public.mark_billing_usage_attempt((current_setting('test.usage_batch')::jsonb->>'id')::uuid,(current_setting('test.usage_batch')::jsonb->>'token')::uuid),'intent is stored before external charge');
select pg_temp.usage_check(not public.finish_billing_usage((current_setting('test.usage_batch')::jsonb->>'id')::uuid,gen_random_uuid(),'ii_usage'),'stale worker cannot confirm fee receipt');
select pg_temp.usage_check(public.finish_billing_usage((current_setting('test.usage_batch')::jsonb->>'id')::uuid,(current_setting('test.usage_batch')::jsonb->>'token')::uuid,'ii_usage'),'verified fee receipt completes own batch');
select pg_temp.usage_check(public.claim_billing_usage(current_setting('test.usage_tenant')::uuid) is null,'recorded fee never gets another dispatch');
reset role;
select pg_temp.usage_check((select count(*)=1 and sum(amount_cents)=30 from private.billing_usage_batches where status='recorded'),'single fee remains durably recorded');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
select pg_temp.usage_check(public.billing_account_summary(true)->>'billable_authorizations'='2','account sees actual monthly authorized usage');
select pg_temp.usage_check(public.billing_account_summary(false)->>'billable_authorizations'='0','test mode cannot show live billable usage');
reset role;
select 'USAGE_ASSERTIONS='||count(*) from usage_checks;
rollback;
