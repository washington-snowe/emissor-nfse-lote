begin;

-- Two-step verification was removed by product decision. Identity and tenant
-- ownership still come exclusively from the Supabase-validated session.
-- SECURITY INVOKER also keeps the tenants table's owner policy in effect.
create or replace function public.current_tenant_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select id from public.tenants where owner_user_id = (select auth.uid());
$$;
revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

create or replace function public.workflow_capabilities()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('imports',true,'certificates',true,'mfa_policy',false,'fiscal_access',true,
    'vault',case when to_regclass('vault.decrypted_secrets') is null then false
      else not has_schema_privilege('authenticated','vault','usage') and not has_schema_privilege('anon','vault','usage') end);
$$;
revoke all on function public.workflow_capabilities() from public,anon,authenticated;
grant execute on function public.workflow_capabilities() to service_role;

-- No Auth factors, accounts, business data, certificate envelopes or RLS
-- policies are deleted. Existing enrolled factors no longer gate application use.
commit;
