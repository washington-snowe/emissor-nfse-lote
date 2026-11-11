begin;

-- Standard PostgreSQL test images do not ship Vault; missing capability stays closed.
do $$ begin
  if exists(select 1 from pg_available_extensions where name='supabase_vault') then
    execute 'create extension if not exists supabase_vault with schema vault';
  end if;
  if to_regnamespace('vault') is not null then
    execute 'revoke all on schema vault from public, anon, authenticated';
    execute 'revoke all on all tables in schema vault from public, anon, authenticated';
    -- Native crypto functions belong to the managed platform. Schema/table ACLs block client access.
  end if;
end $$;

create table public.company_certificates (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  subject_cnpj text not null check(public.valid_company_cnpj(subject_cnpj)),
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  serial_number text not null check(length(serial_number) between 1 and 128),
  valid_from timestamptz not null,
  valid_until timestamptz not null check(valid_until>valid_from),
  status text not null default 'active' check(status in ('active','replaced','revoked')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id) references public.companies(tenant_id,id) on delete restrict,
  unique(tenant_id,company_id,id)
);
create unique index one_active_certificate on public.company_certificates(tenant_id,company_id) where status='active';
create table private.certificate_envelopes (
  certificate_id uuid primary key references public.company_certificates(id) on delete restrict,
  envelope jsonb not null check(octet_length(envelope::text)<=500000),
  vault_secret_id uuid not null
);
alter table public.company_certificates enable row level security;
alter table public.company_certificates force row level security;
revoke all on public.company_certificates from public,anon,authenticated,service_role;
grant select on public.company_certificates to authenticated;
create policy certificates_owner on public.company_certificates for select to authenticated using(tenant_id=(select public.current_tenant_id()));

create function public.store_certificate(p_actor uuid,p_company uuid,p_id uuid,p_metadata jsonb,p_envelope jsonb,p_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare company public.companies; secret_id uuid;
begin
  select c.* into company from public.companies c join public.tenants t on t.id=c.tenant_id
    where c.id=p_company and t.owner_user_id=p_actor for update of c;
  if company.id is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  if to_regclass('vault.decrypted_secrets') is null then raise exception 'Protected key manager unavailable' using errcode='55000'; end if;
  if has_schema_privilege('authenticated','vault','usage') or has_schema_privilege('anon','vault','usage') then
    raise exception 'Protected key manager permissions unavailable' using errcode='55000';
  end if;
  if p_metadata->>'subject_cnpj' is distinct from company.cnpj or
    p_metadata->>'fingerprint' is null or length(p_metadata->>'fingerprint')<>64 or
    (p_metadata->>'valid_from')::timestamptz>now() or (p_metadata->>'valid_until')::timestamptz<=now() or
    p_key is null or length(p_key)>64 or octet_length(decode(p_key,'base64'))<>32 or
    p_envelope->>'version' is distinct from '1' or
    length(coalesce(p_envelope->>'iv',''))<>24 or length(coalesce(p_envelope->>'tag',''))<>32 or
    length(coalesce(p_envelope->>'ciphertext','')) not between 1 and 450000 then
    raise exception 'Invalid protected certificate' using errcode='22023';
  end if;
  if not private.take_limit(company.tenant_id,'store_certificate',10) then raise exception 'Rate limit' using errcode='P0001'; end if;
  execute 'select vault.create_secret($1,$2,$3)' into secret_id using p_key,'nfse-a1:'||p_id::text,'Per-certificate envelope key';
  update public.company_certificates set status='replaced' where company_id=company.id and status='active';
  insert into public.company_certificates(id,tenant_id,company_id,subject_cnpj,fingerprint,serial_number,valid_from,valid_until,created_by)
    values(p_id,company.tenant_id,company.id,p_metadata->>'subject_cnpj',p_metadata->>'fingerprint',p_metadata->>'serial_number',
      (p_metadata->>'valid_from')::timestamptz,(p_metadata->>'valid_until')::timestamptz,p_actor);
  insert into private.certificate_envelopes(certificate_id,envelope,vault_secret_id) values(p_id,p_envelope,secret_id);
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(company.tenant_id,company.id,p_actor,'certificate.stored',p_id);
  return p_id;
end $$;

create function public.certificate_material(p_company uuid,p_certificate uuid,p_purpose text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare certificate public.company_certificates; stored private.certificate_envelopes; decrypted text;
begin
  if p_purpose is null or p_purpose not in ('access_check','emit','reconcile') then raise exception 'Invalid purpose' using errcode='22023'; end if;
  select * into certificate from public.company_certificates where id=p_certificate and company_id=p_company;
  if certificate.id is null or certificate.status='revoked' or
    (certificate.status='replaced' and p_purpose<>'reconcile') or certificate.valid_until<=now() then
    raise exception 'Certificate unavailable' using errcode='42501';
  end if;
  select * into stored from private.certificate_envelopes where certificate_id=certificate.id;
  if stored.certificate_id is null then raise exception 'Certificate unavailable' using errcode='42501'; end if;
  if to_regclass('vault.decrypted_secrets') is null then raise exception 'Protected key manager unavailable' using errcode='55000'; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where id=$1' into decrypted using stored.vault_secret_id;
  if decrypted is null then raise exception 'Key unavailable' using errcode='55000'; end if;
  insert into public.audit_events(tenant_id,company_id,event,resource_id)
    values(certificate.tenant_id,certificate.company_id,'certificate.access.'||p_purpose,certificate.id);
  return jsonb_build_object('tenant_id',certificate.tenant_id,'company_id',certificate.company_id,'certificate_id',certificate.id,
    'key',decrypted,'envelope',stored.envelope,'subject_cnpj',certificate.subject_cnpj,'fingerprint',certificate.fingerprint);
end $$;

create function public.revoke_certificate(p_actor uuid,p_certificate uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare certificate public.company_certificates;
begin
  select c.* into certificate from public.company_certificates c join public.tenants t on t.id=c.tenant_id
    where c.id=p_certificate and t.owner_user_id=p_actor for update of c;
  if certificate.id is null then raise exception 'Certificate unavailable' using errcode='42501'; end if;
  update public.company_certificates set status='revoked' where id=certificate.id;
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(certificate.tenant_id,certificate.company_id,p_actor,'certificate.revoked',certificate.id);
  return true;
end $$;

revoke all on function public.store_certificate(uuid,uuid,uuid,jsonb,jsonb,text),public.certificate_material(uuid,uuid,text),public.revoke_certificate(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.store_certificate(uuid,uuid,uuid,jsonb,jsonb,text),public.certificate_material(uuid,uuid,text),public.revoke_certificate(uuid,uuid)
  to service_role;

commit;
