-- Isolated database only; no hosted Auth or Stripe traffic.
create temporary table navigation_checks(name text primary key);
grant insert on navigation_checks to authenticated,anon,service_role;
create function pg_temp.nav_check(ok boolean,name text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Account/navigation assertion failed: %',name; end if; insert into pg_temp.navigation_checks values(name); end $$;
select set_config('test.nav_a',(select id::text from public.tenants where owner_user_id='00000000-0000-4000-8000-000000000001'),false);
select set_config('test.nav_b',(select id::text from public.tenants where owner_user_id='00000000-0000-4000-8000-000000000002'),false);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.nav_check((public.save_account_profile('Synthetic owner','',0)->>'version')::integer=1,'profile persists initial version for session owner');
select pg_temp.nav_check((select count(*)=1 from public.account_profiles where tenant_id=current_setting('test.nav_a')::uuid),'own profile is readable');
select set_config('test.nav_code_a',public.ensure_referral_code(),false);
select pg_temp.nav_check(public.ensure_referral_code()=current_setting('test.nav_code_a'),'referral code is stable and idempotent');
select pg_temp.nav_check(not public.claim_referral(current_setting('test.nav_code_a')),'self referral is rejected');
do $$ begin
 begin perform public.save_account_profile('Stale synthetic edit','',0); raise exception 'Stale profile accepted'; exception when serialization_failure then perform pg_temp.nav_check(true,'stale profile version rejected'); end;
 begin insert into public.account_profiles values(current_setting('test.nav_b')::uuid,'Forged owner','',1,now()); raise exception 'Foreign insert accepted'; exception when insufficient_privilege then perform pg_temp.nav_check(true,'profile direct write denied'); end;
 begin perform * from private.referrals; raise exception 'Referral identities exposed'; exception when insufficient_privilege then perform pg_temp.nav_check(true,'referral identities remain private'); end;
 begin perform public.claim_billing_account('00000000-0000-4000-8000-000000000001',false); raise exception 'Client called billing mutation'; exception when insufficient_privilege then perform pg_temp.nav_check(true,'billing mutation is server only'); end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.nav_check((select count(*)=0 from public.account_profiles),'another account cannot read first profile');
select pg_temp.nav_check(public.claim_referral(current_setting('test.nav_code_a')),'new account can bind one referral');
select pg_temp.nav_check(not public.claim_referral(current_setting('test.nav_code_a')),'attribution does not duplicate');
select set_config('test.nav_code_b',public.ensure_referral_code(),false);
select pg_temp.nav_check((public.referral_summary()->>'registrations')::integer=0,'new account cannot see referrer totals');
select pg_temp.nav_check((select count(*)=0 from public.list_company_fiscal_operations((select company_id from public.fiscal_operations limit 1))),'company display RPC does not bypass RLS');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.nav_check(not public.claim_referral(current_setting('test.nav_code_b')),'referral cycle is rejected');
select pg_temp.nav_check((public.referral_summary()->>'registrations')::integer=1,'referrer sees real aggregate registration');
select pg_temp.nav_check((public.billing_account_summary(false)->>'commission_cents')='0','no payment fabricates a commission');
reset role;
set role anon;
do $$ begin
 begin perform public.ensure_referral_code(); raise exception 'Anonymous referral accepted'; exception when insufficient_privilege then perform pg_temp.nav_check(true,'anonymous referral denied'); end;
 begin perform * from public.billing_plans; raise exception 'Anonymous plan data exposed'; exception when insufficient_privilege then perform pg_temp.nav_check(true,'plan catalog requires account'); end;
end $$;
reset role;
select 'NAVIGATION_ASSERTIONS='||count(*) from navigation_checks;
