begin;
do $$ begin
  if to_regprocedure('public.reserve_company_operation(uuid,uuid,text)') is null or
    not (select prosecdef from pg_proc where oid='public.current_tenant_id()'::regprocedure) then
    raise exception 'Apply account security and operation migrations first' using errcode='55000';
  end if;
end $$;

create table public.company_fiscal_profiles (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null,
  version integer not null check(version > 0), configuration jsonb not null,
  configuration_sha256 text not null check(configuration_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_reference text not null check(length(evidence_reference) between 3 and 500),
  valid_from date not null check(valid_from >= date '2000-01-01' and valid_from < date '2100-01-01'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id) references public.companies(tenant_id,id) on delete restrict,
  unique(tenant_id,company_id,version), unique(tenant_id,company_id,id),
  check(jsonb_typeof(configuration)='object' and octet_length(configuration::text) <= 16000)
);
alter table public.company_fiscal_profiles enable row level security;
alter table public.company_fiscal_profiles force row level security;
revoke all on public.company_fiscal_profiles from public,anon,authenticated,service_role;
grant select on public.company_fiscal_profiles to authenticated;
create policy fiscal_profile_owner on public.company_fiscal_profiles for select to authenticated
  using(tenant_id=(select public.current_tenant_id()));

create function public.save_fiscal_profile(p_actor uuid,p_company uuid,p_expected_version integer,
  p_configuration jsonb,p_evidence text,p_valid_from date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare company public.companies; current_profile public.company_fiscal_profiles; saved public.company_fiscal_profiles;
  current_version integer; configuration_hash text;
begin
  -- Serialize all profile edits for this company; the caller cannot choose a tenant.
  select c.* into company from public.companies c join public.tenants t on t.id=c.tenant_id
    where c.id=p_company and t.owner_user_id=p_actor for update of c;
  if company.id is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  select * into current_profile from public.company_fiscal_profiles
    where company_id=company.id and tenant_id=company.tenant_id order by version desc limit 1;
  current_version := coalesce(current_profile.version,0);
  if p_expected_version is null or p_expected_version <> current_version then
    raise exception 'Fiscal profile changed' using errcode='40001';
  end if;
  if p_configuration is null or jsonb_typeof(p_configuration) is distinct from 'object' or
     p_configuration->>'simplesOption' is distinct from (case company.tax_regime when 'mei' then '2' when 'simples' then '3' else null end) or
     p_configuration->>'issuerMunicipality' is null or not (p_configuration->>'issuerMunicipality' ~ '^[1-9][0-9]{6}$') or
     p_configuration->>'series' is null or not (p_configuration->>'series' ~ '^[0-9]{1,5}$') then
    raise exception 'Invalid fiscal profile' using errcode='22023';
  end if;
  if (p_configuration->>'series')::integer not between 1 and 49999 or p_evidence is null or
    length(btrim(p_evidence)) not between 3 and 500 or p_evidence ~ '[[:cntrl:]]' or p_valid_from is null then
    raise exception 'Invalid fiscal profile' using errcode='22023';
  end if;
  configuration_hash := encode(sha256(convert_to(p_configuration::text,'UTF8')),'hex');
  if current_profile.configuration_sha256=configuration_hash and current_profile.evidence_reference=btrim(p_evidence) and
     current_profile.valid_from=p_valid_from then
    return jsonb_build_object('id',current_profile.id,'version',current_version,'sha256',configuration_hash,'unchanged',true);
  end if;
  if not private.take_limit(company.tenant_id,'save_fiscal_profile',10) then
    raise exception 'Operation limit' using errcode='P0001';
  end if;
  insert into public.company_fiscal_profiles(tenant_id,company_id,version,configuration,configuration_sha256,evidence_reference,valid_from,created_by)
    values(company.tenant_id,company.id,current_version+1,p_configuration,configuration_hash,btrim(p_evidence),p_valid_from,p_actor)
    returning * into saved;
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(company.tenant_id,company.id,p_actor,'fiscal_profile.saved',saved.id);
  return jsonb_build_object('id',saved.id,'version',saved.version,'sha256',configuration_hash,'unchanged',false);
end $$;
revoke all on function public.save_fiscal_profile(uuid,uuid,integer,jsonb,text,date) from public,anon,authenticated;
grant execute on function public.save_fiscal_profile(uuid,uuid,integer,jsonb,text,date) to service_role;

commit;
