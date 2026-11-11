-- Local harness only. Supabase owns these roles/schema/functions in the hosted project.
create role anon nologin nosuperuser nobypassrls;
create role authenticated nologin nosuperuser nobypassrls;
create role service_role nologin nosuperuser bypassrls;
create role tenant_test_client login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant anon, authenticated to tenant_test_client;
grant usage on schema public to anon, authenticated;

create schema auth;
create table auth.users (id uuid primary key);
create table auth.mfa_factors(id uuid primary key,user_id uuid not null references auth.users(id),status text not null);
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
$$;
grant execute on function auth.jwt() to anon,authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
