-- Disposable PostgreSQL only. Claims and Auth factors here are synthetic.
create temporary table access_assertions(name text primary key);
grant insert on access_assertions to authenticated,anon,service_role;
create function pg_temp.access_check(condition boolean,name text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Authenticated access assertion failed: %',name; end if;
  insert into pg_temp.access_assertions values(name);
end $$;
create temporary table access_expected(name text primary key,total bigint not null);
grant select on access_expected to authenticated;
select set_config('test.access_owner',(select id::text from public.tenants where owner_user_id='00000000-0000-4000-8000-000000000001'),false);
do $$ declare name text; total bigint; begin
  foreach name in array array['companies','report_imports','company_certificates','company_fiscal_profiles','report_reviews',
    'review_confirmations','fiscal_batches','fiscal_operations','fiscal_documents','standalone_templates','audit_events'] loop
    execute format('select count(*) from public.%I where tenant_id=$1',name) into total using current_setting('test.access_owner')::uuid;
    insert into pg_temp.access_expected values(name,total);
  end loop;
end $$;
insert into auth.mfa_factors(id,user_id,status) values('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','verified');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal1"}',false);
select pg_temp.access_check(public.current_tenant_id()=current_setting('test.access_owner')::uuid,'password session resolves own tenant despite enrolled factor');
do $$ declare item record; total bigint; foreign_rows bigint; begin
  for item in select * from pg_temp.access_expected loop
    execute format('select count(*),count(*) filter(where tenant_id<>public.current_tenant_id()) from public.%I',item.name) into total,foreign_rows;
    perform pg_temp.access_check(item.total>0 and total=item.total,'password session reads own '||item.name);
    perform pg_temp.access_check(foreign_rows=0,'password session cannot read foreign '||item.name);
  end loop;
end $$;
select pg_temp.access_check((select count(*)=(select total from pg_temp.access_expected where name='fiscal_operations') from public.list_fiscal_operations()),'display RPC works without second factor');
do $$ begin
  begin perform * from auth.mfa_factors; raise exception 'Direct Auth factor access allowed';
  exception when insufficient_privilege then perform pg_temp.access_check(true,'Auth factors remain private'); end;
  begin perform * from private.certificate_secrets; raise exception 'Certificate secrets exposed';
  exception when insufficient_privilege then perform pg_temp.access_check(true,'certificate secrets remain private'); end;
  begin update public.fiscal_operations set status='authorized'; raise exception 'Fiscal status forged';
  exception when insufficient_privilege then perform pg_temp.access_check(true,'password session cannot forge authorization'); end;
  begin perform public.workflow_capabilities(); raise exception 'Client called capabilities';
  exception when insufficient_privilege then perform pg_temp.access_check(true,'server capability RPC remains private'); end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","aal":"aal1","user_metadata":{"tenant_id":"00000000-0000-4000-8000-000000000001"}}',false);
select pg_temp.access_check(public.current_tenant_id() is not null and public.current_tenant_id()<>current_setting('test.access_owner')::uuid,'another password session resolves its own tenant');
do $$ declare item record; total bigint; begin
  for item in select * from pg_temp.access_expected loop
    execute format('select count(*) from public.%I where tenant_id=$1',item.name) into total using current_setting('test.access_owner')::uuid;
    perform pg_temp.access_check(total=0,'other account cannot read owner '||item.name);
  end loop;
end $$;
select pg_temp.access_check((select count(*)=0 from public.list_fiscal_operations()),'display RPC cannot expose another account');
select set_config('request.jwt.claims','{}',false);
select pg_temp.access_check(public.current_tenant_id() is null,'missing identity does not resolve a tenant');
select pg_temp.access_check((select count(*)=0 from public.companies),'missing identity cannot read companies');
reset role;
set role anon;
do $$ begin
  begin perform public.current_tenant_id(); raise exception 'Anonymous tenant helper allowed';
  exception when insufficient_privilege then perform pg_temp.access_check(true,'anonymous tenant helper denied'); end;
  begin perform * from public.fiscal_operations; raise exception 'Anonymous fiscal access allowed';
  exception when insufficient_privilege then perform pg_temp.access_check(true,'anonymous fiscal access denied'); end;
end $$;
reset role;
set role service_role;
select pg_temp.access_check(public.workflow_capabilities()->>'mfa_policy'='false','capabilities no longer advertise an MFA policy');
reset role;
select pg_temp.access_check((select count(*)=1 from auth.mfa_factors where status='verified'),'factor metadata is preserved');
delete from auth.mfa_factors;
select 'ACCESS_ASSERTIONS='||count(*) from access_assertions;
