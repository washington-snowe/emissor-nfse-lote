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
-- Switch the disposable account to the new rate after testing the historical ledger.
update public.account_subscriptions set plan_code='start-v2' where id='sub_usage';
update public.billing_plans set included_notes=3 where code='start-v2';
create temporary table new_usage_ops as select gen_random_uuid() as id,n from generate_series(1,12) n;
insert into public.fiscal_operations
 select (jsonb_populate_record(null::public.fiscal_operations,to_jsonb(template)||jsonb_build_object(
   'id',n.id,'environment','production','status','queued','transmit_count',0,'dps_id',null,'dps_number',null,'certificate_id',null
 ))).* from new_usage_ops n cross join (select * from usage_operations limit 1) template;
create function pg_temp.authorize_usage(first_note integer,last_note integer) returns void language sql as $$
 insert into public.fiscal_documents(tenant_id,company_id,operation_id,environment,access_key,xml_sha256)
 select o.tenant_id,o.company_id,o.id,'production',lpad((100+n.n)::text,50,'0'),repeat('e',64)
 from new_usage_ops n join public.fiscal_operations o on o.id=n.id where n.n between first_note and last_note order by n.n
$$;
select pg_temp.authorize_usage(1,6);
select pg_temp.usage_check((select count(*)=5 and sum(unit_subcents)=4965 from private.billing_usage where status='pending'),'five exact fractional charges stay below the minimum');
set role service_role;
select pg_temp.usage_check(not public.billing_usage_ready(current_setting('test.usage_tenant')::uuid),'below minimum will not spin the worker');
select pg_temp.usage_check(public.claim_billing_usage(current_setting('test.usage_tenant')::uuid) is null,'no Stripe intent below fifty cents');
reset role;
select pg_temp.authorize_usage(7,7);
set role service_role;
select set_config('test.usage_batch',public.claim_billing_usage(current_setting('test.usage_tenant')::uuid)::text,true);
select pg_temp.usage_check(current_setting('test.usage_batch')::jsonb->>'method'='immediate' and current_setting('test.usage_batch')::jsonb->>'amount_cents'='59' and current_setting('test.usage_batch')::jsonb->>'remainder_subcents'='58','six notes claim 59 cents and carry 0.58 cents');
select pg_temp.usage_check(not public.bind_billing_usage_invoice((current_setting('test.usage_batch')::jsonb->>'id')::uuid,(current_setting('test.usage_batch')::jsonb->>'token')::uuid,'in_immediate'),'binding requires durable intent');
select pg_temp.usage_check(public.mark_billing_usage_attempt((current_setting('test.usage_batch')::jsonb->>'id')::uuid,(current_setting('test.usage_batch')::jsonb->>'token')::uuid),'immediate invoice intent stored');
select pg_temp.usage_check(public.bind_billing_usage_invoice((current_setting('test.usage_batch')::jsonb->>'id')::uuid,(current_setting('test.usage_batch')::jsonb->>'token')::uuid,'in_immediate'),'attach invoice to leased batch');
select pg_temp.usage_check(not public.bind_billing_usage_invoice((current_setting('test.usage_batch')::jsonb->>'id')::uuid,(current_setting('test.usage_batch')::jsonb->>'token')::uuid,'in_other'),'cannot replace previously bound invoice');
select pg_temp.usage_check(public.billing_usage_invoice_context(current_setting('test.usage_tenant')::uuid,true,'cus_foreign',(current_setting('test.usage_batch')::jsonb->>'id')::uuid,'in_immediate') is null,'webhook context rejects other customers');
select pg_temp.usage_check(public.billing_usage_invoice_context(current_setting('test.usage_tenant')::uuid,true,'cus_usage',(current_setting('test.usage_batch')::jsonb->>'id')::uuid,'in_immediate')->>'amountCents'='59','webhook receives the exact bound amount');
select pg_temp.usage_check(public.finish_billing_usage((current_setting('test.usage_batch')::jsonb->>'id')::uuid,(current_setting('test.usage_batch')::jsonb->>'token')::uuid,'in_immediate'),'persist submitted invoice');
reset role;
select pg_temp.authorize_usage(8,12);
set role service_role;
select set_config('test.usage_batch',public.claim_billing_usage(current_setting('test.usage_tenant')::uuid)::text,true);
select pg_temp.usage_check(current_setting('test.usage_batch')::jsonb->>'amount_cents'='50' and current_setting('test.usage_batch')::jsonb->>'remainder_subcents'='23','carry from previous batch makes the exact difference');
select pg_temp.usage_check(not public.billing_usage_ready(current_setting('test.usage_tenant')::uuid),'active lease excludes a second dispatch');
reset role;
select pg_temp.usage_check((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind in('r','p')),'private application tables have RLS as well as restricted grants');
select 'USAGE_ASSERTIONS='||count(*) from usage_checks;
rollback;
