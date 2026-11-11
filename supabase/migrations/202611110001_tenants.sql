begin;

-- One principal user per account in the initial product. Auth deletion must not silently delete fiscal data.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;
alter table public.tenants force row level security;

revoke all on public.tenants from public, anon, authenticated;
grant select on public.tenants to authenticated;

create policy tenants_select_owner on public.tenants
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

-- Bootstrap is the only write path; no caller-supplied owner or tenant is accepted.
create function public.ensure_tenant()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  tenant_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select id into tenant_id from public.tenants where owner_user_id = caller_id;
  if tenant_id is not null then
    return tenant_id;
  end if;

  insert into public.tenants (owner_user_id) values (caller_id)
    on conflict (owner_user_id) do nothing;
  select id into tenant_id from public.tenants where owner_user_id = caller_id;
  if tenant_id is null then
    raise exception 'Tenant bootstrap must be retried' using errcode = '40001';
  end if;
  return tenant_id;
end;
$$;

revoke all on function public.ensure_tenant() from public, anon;
grant execute on function public.ensure_tenant() to authenticated;

-- Read-only helper for tenant_id policies in subsequent business modules.
create function public.current_tenant_id()
returns uuid
language sql stable
security invoker
set search_path = ''
as $$
  select id from public.tenants where owner_user_id = (select auth.uid());
$$;

revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

commit;
