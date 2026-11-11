begin;
-- Supabase Auth owns factors and validates the JWT. No client is granted access to auth tables.
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.tenants where owner_user_id=(select auth.uid()) and (
    coalesce(auth.jwt()->>'aal','aal1')='aal2' or
    not exists(select 1 from auth.mfa_factors f where f.user_id=(select auth.uid()) and f.status='verified')
  );
$$;
revoke all on function public.current_tenant_id() from public,anon;
grant execute on function public.current_tenant_id() to authenticated;
create function public.account_security_ready()
returns boolean language sql stable security invoker set search_path = '' as $$ select true; $$;
revoke all on function public.account_security_ready() from public,anon;
grant execute on function public.account_security_ready() to authenticated,service_role;
commit;
