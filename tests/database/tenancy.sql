create temporary table passed_assertions (name text primary key);
grant insert on passed_assertions to anon, authenticated;
create function pg_temp.check_that(condition boolean, name text) returns void
language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Assertion failed: %', name; end if;
  insert into pg_temp.passed_assertions values (name);
end;
$$;

select pg_temp.check_that(session_user = 'tenant_test_client', 'unprivileged connection');
set role authenticated;
select pg_temp.check_that(current_user = 'authenticated', 'authenticated role');
select pg_temp.check_that((select not rolsuper and not rolbypassrls from pg_roles where rolname = current_user), 'cannot bypass RLS');
select pg_temp.check_that((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.tenants'::regclass), 'RLS enabled and forced');
select set_config('request.jwt.claims', '{}', false);
select pg_temp.check_that((select count(*) = 0 from public.tenants), 'missing identity reads nothing');
select pg_temp.check_that(public.current_tenant_id() is null, 'missing identity has no tenant');
do $$ begin
  begin
    perform public.ensure_tenant();
    raise exception 'Bootstrap accepted missing identity';
  exception when insufficient_privilege then
    perform pg_temp.check_that(true, 'missing identity cannot bootstrap');
  end;
end $$;

reset role;
set role anon;
do $$ begin
  begin
    perform * from public.tenants;
    raise exception 'Anonymous read accepted';
  exception when insufficient_privilege then perform pg_temp.check_that(true, 'anonymous cannot read'); end;
  begin
    perform public.ensure_tenant();
    raise exception 'Anonymous bootstrap accepted';
  exception when insufficient_privilege then perform pg_temp.check_that(true, 'anonymous cannot bootstrap'); end;
  begin
    perform public.current_tenant_id();
    raise exception 'Anonymous helper accepted';
  exception when insufficient_privilege then perform pg_temp.check_that(true, 'anonymous cannot resolve tenant'); end;
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select set_config('test.tenant_a', public.ensure_tenant()::text, false);
select pg_temp.check_that(public.ensure_tenant() = current_setting('test.tenant_a')::uuid, 'bootstrap is idempotent');
select pg_temp.check_that(public.current_tenant_id() = current_setting('test.tenant_a')::uuid, 'owner resolves own tenant');
select pg_temp.check_that((select count(*) = 1 from public.tenants), 'owner reads one tenant');
select pg_temp.check_that((select bool_and(owner_user_id = auth.uid()) from public.tenants), 'owner identity comes from JWT');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', false);
select set_config('test.tenant_b', public.ensure_tenant()::text, false);
select pg_temp.check_that(current_setting('test.tenant_a') <> current_setting('test.tenant_b'), 'accounts have distinct tenants');
select pg_temp.check_that((select count(*) = 1 from public.tenants), 'second owner reads only own tenant');
select pg_temp.check_that((select count(*) = 0 from public.tenants where id = current_setting('test.tenant_a')::uuid), 'foreign tenant invisible even by known ID');
select set_config('request.headers', json_build_object('x-tenant-id', current_setting('test.tenant_a'))::text, false);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'user_metadata', json_build_object('tenant_id', current_setting('test.tenant_a'), 'owner_user_id', '00000000-0000-4000-8000-000000000001'))::text, false);
select pg_temp.check_that(public.current_tenant_id() = current_setting('test.tenant_b')::uuid, 'headers and editable metadata cannot select another tenant');

do $$ begin
  begin
    insert into public.tenants(owner_user_id) values ('00000000-0000-4000-8000-000000000001');
    raise exception 'Direct insert accepted';
  exception when insufficient_privilege then perform pg_temp.check_that(true, 'direct tenant creation forbidden'); end;
  begin
    update public.tenants set owner_user_id = auth.uid() where id = current_setting('test.tenant_a')::uuid;
    raise exception 'Owner transfer accepted';
  exception when insufficient_privilege then perform pg_temp.check_that(true, 'owner transfer forbidden'); end;
  begin
    delete from public.tenants where id = current_setting('test.tenant_a')::uuid;
    raise exception 'Tenant deletion accepted';
  exception when insufficient_privilege then perform pg_temp.check_that(true, 'tenant deletion forbidden'); end;
  begin
    execute 'select public.ensure_tenant(''00000000-0000-4000-8000-000000000001''::uuid)';
    raise exception 'Forged owner argument accepted';
  exception when undefined_function then perform pg_temp.check_that(true, 'bootstrap accepts no forged owner parameter'); end;
  begin
    execute 'set role postgres';
    raise exception 'Privilege escalation accepted';
  exception when insufficient_privilege then perform pg_temp.check_that(true, 'client cannot escalate to migration role'); end;
end $$;

-- Caller-owned shadow objects must not affect the SECURITY DEFINER function.
reset role;
create temporary table tenants(id uuid, owner_user_id uuid);
grant all on table pg_temp.tenants to authenticated;
set role authenticated;
set search_path = pg_temp, public;
select pg_temp.check_that(public.ensure_tenant() = current_setting('test.tenant_b')::uuid, 'temporary table cannot shadow tenant storage');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select pg_temp.check_that((select count(*) = 0 from public.tenants where id = current_setting('test.tenant_b')::uuid), 'reverse isolation holds');
select set_config('request.jwt.claims', '{}', false);
select pg_temp.check_that((select count(*) = 0 from public.tenants), 'cleared identity cannot inherit previous account');
select pg_temp.check_that(public.current_tenant_id() is null, 'cleared identity resolves nothing');
reset role;
select 'ASSERTIONS=' || count(*) from passed_assertions;
