begin;
do $$ begin
  if to_regprocedure('public.reserve_company_operation(uuid,uuid,text)') is null or
    not (select prosecdef from pg_proc where oid='public.current_tenant_id()'::regprocedure) then
    raise exception 'Apply account security and operation migrations first' using errcode='55000';
  end if;
end $$;

create table public.fiscal_access_checks (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,certificate_id uuid not null,
  environment text not null check(environment='homologation'),
  http_status integer not null check(http_status between 0 and 599),
  outcome text not null check(outcome in ('response_received','unavailable')),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id,certificate_id) references public.company_certificates(tenant_id,company_id,id) on delete restrict
);
alter table public.fiscal_access_checks enable row level security;
alter table public.fiscal_access_checks force row level security;
revoke all on public.fiscal_access_checks from public,anon,authenticated,service_role;
grant select on public.fiscal_access_checks to authenticated;
create policy fiscal_access_owner on public.fiscal_access_checks for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create function public.record_fiscal_access(p_actor uuid,p_certificate uuid,p_status integer,p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
declare certificate public.company_certificates;
begin
  select c.* into certificate from public.company_certificates c join public.tenants t on t.id=c.tenant_id
    where c.id=p_certificate and t.owner_user_id=p_actor;
  if certificate.id is null then raise exception 'Certificate unavailable' using errcode='42501'; end if;
  insert into public.fiscal_access_checks(tenant_id,company_id,certificate_id,environment,http_status,outcome)
    values(certificate.tenant_id,certificate.company_id,certificate.id,'homologation',p_status,p_outcome);
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(certificate.tenant_id,certificate.company_id,p_actor,'certificate.access_check',certificate.id);
end $$;
revoke all on function public.record_fiscal_access(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.record_fiscal_access(uuid,uuid,integer,text) to service_role;

create table private.nfse_api_contracts (
  environment text primary key check(environment in ('homologation','production')),
  source_url text not null,
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  structural_contract jsonb not null check(octet_length(structural_contract::text)<=1000000),
  captured_at timestamptz not null default now()
);
create function public.store_official_nfse_contract(p_environment text,p_url text,p_sha256 text,p_contract jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_environment not in ('homologation','production') or jsonb_typeof(p_contract#>'{paths,/nfse}') is distinct from 'object' or
    (p_environment='homologation' and p_url not like 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/%') or
    (p_environment='production' and p_url not like 'https://sefin.nfse.gov.br/SefinNacional/%') then
    raise exception 'Invalid official contract' using errcode='22023';
  end if;
  insert into private.nfse_api_contracts(environment,source_url,sha256,structural_contract)
    values(p_environment,p_url,p_sha256,p_contract)
    on conflict(environment) do update set source_url=excluded.source_url,sha256=excluded.sha256,
      structural_contract=excluded.structural_contract,captured_at=now();
end $$;

-- Public integration metadata contains structural API documentation only, never certificates or taxpayer records.
create function public.nfse_contract_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('environment',environment,'source_url',source_url,'sha256',sha256,
    'captured_at',captured_at,'contract',structural_contract)),'[]'::jsonb) from private.nfse_api_contracts;
$$;
revoke all on function public.store_official_nfse_contract(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_official_nfse_contract(text,text,text,jsonb) to service_role;
revoke all on function public.nfse_contract_status() from public;
grant execute on function public.nfse_contract_status() to anon,authenticated,service_role;

create or replace function public.workflow_capabilities()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('imports',true,'certificates',true,'mfa_policy',true,'fiscal_access',true,
    'vault',case when to_regclass('vault.decrypted_secrets') is null then false
      else not has_schema_privilege('authenticated','vault','usage') and not has_schema_privilege('anon','vault','usage') end);
$$;
revoke all on function public.workflow_capabilities() from public,anon,authenticated;
grant execute on function public.workflow_capabilities() to service_role;
commit;
