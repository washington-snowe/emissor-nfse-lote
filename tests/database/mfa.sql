create temporary table mfa_assertions(name text primary key);
grant insert on mfa_assertions to authenticated;
create function pg_temp.mfa_check(condition boolean,name text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'MFA assertion failed: %',name; end if;
 insert into pg_temp.mfa_assertions values(name);
end $$;
insert into auth.mfa_factors(id,user_id,status) values('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','verified');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}',false);
select pg_temp.mfa_check(public.current_tenant_id() is null,'verified factor requires aal2 in data policies');
select pg_temp.mfa_check((select count(*)=0 from public.companies),'aal1 cannot bypass app guard through company REST');
select pg_temp.mfa_check((select count(*)=0 from public.report_imports),'aal1 cannot read import data directly');
select pg_temp.mfa_check((select count(*)=0 from public.company_certificates),'aal1 cannot read certificate metadata directly');
select pg_temp.mfa_check((select count(*)=0 from public.audit_events),'aal1 cannot read protected audit data');
do $$ begin
 begin perform * from auth.mfa_factors; raise exception 'Direct Auth factor access allowed';
 exception when insufficient_privilege then perform pg_temp.mfa_check(true,'auth factors remain private'); end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2"}',false);
select pg_temp.mfa_check(public.current_tenant_id() is not null,'validated aal2 resolves owner tenant');
select pg_temp.mfa_check((select count(*)=1 from public.companies),'aal2 restores own company access');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal2"}',false);
select pg_temp.mfa_check((select count(*)=0 from public.companies where tenant_id=(select id from public.tenants where owner_user_id='00000000-0000-4000-8000-000000000001')),'aal2 does not bypass tenant ownership');
reset role;
update auth.mfa_factors set status='unverified';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}',false);
select pg_temp.mfa_check(public.current_tenant_id() is not null,'unverified enrollment does not lock out account');
reset role;
delete from auth.mfa_factors;
select 'MFA_ASSERTIONS='||count(*) from mfa_assertions;
