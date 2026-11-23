-- Disposable database only. No provider requests or real fiscal records.
begin;
create temporary table credit_checks(name text primary key);
grant insert on credit_checks to service_role, authenticated;
create function pg_temp.check_credit(ok boolean, description text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Credit assertion failed: %', description; end if;
  insert into pg_temp.credit_checks values (description);
end;
$$;

update auth.users set email = 'owner@example.test', email_confirmed_at = now()
  where id = '00000000-0000-4000-8000-000000000002';
update auth.users set email = 'account@example.test', email_confirmed_at = now()
  where id = '00000000-0000-4000-8000-000000000001';
insert into private.rex_admin (user_id, email) values ('00000000-0000-4000-8000-000000000002', 'owner@example.test');
select set_config('test.credit_actor', '00000000-0000-4000-8000-000000000002', true);
select set_config('test.credit_other', '00000000-0000-4000-8000-000000000001', true);
select set_config('test.credit_tenant', (select id::text from public.tenants where owner_user_id = current_setting('test.credit_other')::uuid), true);
select set_config('test.credit_id', gen_random_uuid()::text, true);

select pg_temp.check_credit(not has_table_privilege('authenticated', 'private.note_credit_challenges', 'select'), 'no access to verifiers');
select pg_temp.check_credit(not has_function_privilege('authenticated', 'public.rex_confirm_note_credit(uuid,uuid,text)', 'execute'), 'browser cannot call confirmation RPC');
set role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.credit_other'))::text, true);
select pg_temp.check_credit(not public.rex_admin_access(), 'customer cannot access admin');
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.credit_actor'))::text, true);
select pg_temp.check_credit(public.rex_admin_access(), 'verified bound identity is recognized');
reset role;

set role service_role;
do $$ begin
  perform public.rex_admin_dashboard(current_setting('test.credit_other')::uuid, '');
  raise exception 'Customer unexpectedly read the admin dashboard';
exception when insufficient_privilege then null;
end $$;
select pg_temp.check_credit(public.rex_admin_dashboard(current_setting('test.credit_actor')::uuid, 'account@')->'accounts'->0->>'email' = 'account@example.test', 'search finds matching account');
select pg_temp.check_credit(public.rex_begin_note_credit(current_setting('test.credit_actor')::uuid,
  current_setting('test.credit_id')::uuid, current_setting('test.credit_tenant')::uuid, 2, 'Teste local', repeat('1', 64)) = '{"recipient": "account@example.test", "destination": "owner@example.test"}'::jsonb,
  'new challenge returns verified account');
select pg_temp.check_credit(public.rex_begin_note_credit(current_setting('test.credit_actor')::uuid,
  gen_random_uuid(), current_setting('test.credit_tenant')::uuid, 100, 'Teste local', repeat('2', 64)) is null, 'resend cooldown is enforced');
select pg_temp.check_credit(public.rex_confirm_note_credit(current_setting('test.credit_actor')::uuid,
  current_setting('test.credit_id')::uuid, repeat('1',64)) = 'closed', 'code unusable before provider accepts');
select pg_temp.check_credit(public.rex_finish_note_credit_delivery(current_setting('test.credit_actor')::uuid,
  current_setting('test.credit_id')::uuid, true), 'provider acknowledgement activates attempt');
select pg_temp.check_credit(public.rex_confirm_note_credit(current_setting('test.credit_actor')::uuid,
  current_setting('test.credit_id')::uuid, repeat('2',64)) = 'invalid', 'wrong code rejected');
select pg_temp.check_credit(public.rex_confirm_note_credit(current_setting('test.credit_actor')::uuid,
  current_setting('test.credit_id')::uuid, repeat('1',64)) = 'granted', 'right verifier releases exact grant');
select pg_temp.check_credit(public.rex_confirm_note_credit(current_setting('test.credit_actor')::uuid,
  current_setting('test.credit_id')::uuid, repeat('1',64)) = 'closed', 'code cannot be reused');
reset role;
select pg_temp.check_credit((select quantity = 2 and remaining = 2 and verifier is null from private.note_credit_grants g
  join private.note_credit_challenges c using (id, quantity) where g.id = current_setting('test.credit_id')::uuid),
  'grant and verifier erasure are committed together');
set role authenticated;
select pg_temp.check_credit(public.rex_note_credit_balance() = 0, 'balance hidden from other accounts');
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.credit_other'))::text, true);
select pg_temp.check_credit(public.rex_note_credit_balance() = 2, 'recipient sees own balance');
reset role;

-- Reuse the billing suite's synthetic document pattern.
update private.note_credit_grants set created_at = now() - interval '1 minute';
update public.billing_plans set included_notes = 1 where code = 'start-v2';
insert into private.billing_accounts(tenant_id,livemode,customer_id)
  values(current_setting('test.credit_tenant')::uuid,true,'cus_credit_local');
insert into public.account_subscriptions(id,tenant_id,livemode,plan_code,cadence,status,period_start,period_end,cancel_at_period_end,created_at)
  values('sub_credit_local',current_setting('test.credit_tenant')::uuid,true,'start-v2','monthly','active',
    now()-interval '1 day',now()+interval '1 month',false,now());
do $$ declare target regclass; item record; begin
  foreach target in array array['public.fiscal_operations'::regclass, 'public.fiscal_documents'::regclass] loop
    for item in select conname from pg_constraint where conrelid=target and contype='c' and pg_get_constraintdef(oid) like '%environment%homologation%' loop
      execute format('alter table %s drop constraint %I', target, item.conname);
    end loop;
  end loop;
end $$;
create temporary table credit_operations as select gen_random_uuid() id, n from generate_series(1,5) n;
insert into public.fiscal_operations
  select (jsonb_populate_record(null::public.fiscal_operations, to_jsonb(template) || jsonb_build_object(
    'id', n.id, 'environment', case when n.n=1 then 'homologation' else 'production' end,
    'status','queued','transmit_count',0,'dps_id',null,'dps_number',null,'certificate_id',null
  ))).* from credit_operations n cross join (
    select * from public.fiscal_operations where tenant_id=current_setting('test.credit_tenant')::uuid limit 1
  ) template;
insert into public.fiscal_documents(tenant_id,company_id,operation_id,environment,access_key,xml_sha256)
  select o.tenant_id,o.company_id,o.id,o.environment,lpad((1000+n.n)::text,50,'0'),repeat('e',64)
  from credit_operations n join public.fiscal_operations o on o.id = n.id order by n.n;
select pg_temp.check_credit((select count(*) = 2 from private.note_credit_usage), 'exactly two excess authorizations consumed credits');
select pg_temp.check_credit((select count(*) = 2 and sum(unit_subcents)=0 from private.billing_usage
  where status='free_credit' and tenant_id=current_setting('test.credit_tenant')::uuid), 'credits are recorded without Stripe charges');
select pg_temp.check_credit((select count(*)=1 from private.billing_usage where status='included' and subscription_id='sub_credit_local'), 'plan allowance consumed first');
select pg_temp.check_credit((select count(*)=1 and sum(unit_subcents)=993 from private.billing_usage where status='pending' and subscription_id='sub_credit_local'), 'standard overage resumes after credits');
select pg_temp.check_credit((select remaining=0 from private.note_credit_grants where id=current_setting('test.credit_id')::uuid), 'balance never goes negative');
update auth.users set email='different@example.test' where id=current_setting('test.credit_actor')::uuid;
select pg_temp.check_credit(not private.is_rex_admin(current_setting('test.credit_actor')::uuid), 'changing the bound email removes access');
select 'CREDIT_ASSERTIONS=' || count(*) from credit_checks;
rollback;
