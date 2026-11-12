begin;
create table public.standalone_templates (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,profile_id uuid not null,
  version integer not null check(version>0),provider text not null check(provider='shopee'),defaults jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id,profile_id) references public.company_fiscal_profiles(tenant_id,company_id,id) on delete restrict,
  unique(company_id,provider,version),check(jsonb_typeof(defaults)='object' and octet_length(defaults::text)<=30000)
);
alter table public.standalone_templates enable row level security;
alter table public.standalone_templates force row level security;
revoke all on public.standalone_templates from public,anon,authenticated,service_role;
grant select on public.standalone_templates to authenticated;
create policy standalone_template_owner on public.standalone_templates for select to authenticated using(tenant_id=(select public.current_tenant_id()));

create function public.issue_standalone(p_actor uuid,p_company uuid,p_profile uuid,p_expected_profile_sha256 text,p_request uuid,
  p_data jsonb,p_configuration jsonb,p_remember boolean,p_expected_template_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; previous public.standalone_templates; company public.companies; defaults jsonb; next_version integer;
begin
  select c.* into company from public.companies c join public.tenants t on t.id=c.tenant_id where c.id=p_company and t.owner_user_id=p_actor for update of c;
  if company.id is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  select * into previous from public.standalone_templates where company_id=company.id and provider='shopee' order by version desc limit 1;
  result:=public.enqueue_standalone_fiscal(p_actor,p_company,p_profile,p_expected_profile_sha256,p_request,p_data,p_configuration);
  next_version:=coalesce(previous.version,0);
  if p_remember is true and (result->>'duplicate')::boolean is not true then
    if p_expected_template_version is distinct from next_version then raise exception 'Template changed' using errcode='40001'; end if;
    defaults:=jsonb_build_object('recipient',p_data->'recipient','intermediary',p_data->'intermediary','commissionType',p_data->>'commissionType','configuration',p_configuration);
    if previous.id is null or previous.defaults is distinct from defaults or previous.profile_id is distinct from p_profile then
      next_version:=next_version+1;
      insert into public.standalone_templates(tenant_id,company_id,profile_id,version,provider,defaults,created_by)
        values(company.tenant_id,company.id,p_profile,next_version,'shopee',defaults,p_actor);
      insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
        values(company.tenant_id,company.id,p_actor,'standalone_template.saved',company.id);
    end if;
  end if;
  return result||jsonb_build_object('templateVersion',next_version);
end $$;
revoke all on function public.issue_standalone(uuid,uuid,uuid,text,uuid,jsonb,jsonb,boolean,integer) from public,anon,authenticated;
grant execute on function public.issue_standalone(uuid,uuid,uuid,text,uuid,jsonb,jsonb,boolean,integer) to service_role;
commit;
