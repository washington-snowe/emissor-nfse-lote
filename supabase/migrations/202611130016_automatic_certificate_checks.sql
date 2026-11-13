begin;

-- Only status metadata lives here. A1/key/password remain in the existing private envelope/Vault.
create table public.certificate_verifications (
  certificate_id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'queued' check(status in ('queued','checking','verified','attention')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  lease_token uuid,
  lease_until timestamptz,
  next_attempt timestamptz default now(),
  result_code text check(result_code in ('sefin_verified','contract_missing','contract_unsupported','certificate_unavailable','company_incomplete','sefin_unavailable','service_unavailable')),
  http_status integer check(http_status between 0 and 599),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  foreign key(tenant_id,company_id,certificate_id) references public.company_certificates(tenant_id,company_id,id) on delete restrict,
  check((status='checking')=(lease_token is not null and lease_until is not null)),
  check((status='verified')=(verified_at is not null)),
  check(status<>'verified' or (result_code='sefin_verified' and http_status in (200,404)))
);
alter table public.certificate_verifications enable row level security;
alter table public.certificate_verifications force row level security;
revoke all on public.certificate_verifications from public,anon,authenticated,service_role;
grant select on public.certificate_verifications to authenticated;
create policy certificate_verification_owner on public.certificate_verifications for select to authenticated
  using(tenant_id=(select public.current_tenant_id()));

create function public.enqueue_certificate_verification(p_actor uuid,p_certificate uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.company_certificates;
begin
  select cert.* into c from public.company_certificates cert join public.tenants t on t.id=cert.tenant_id
    where cert.id=p_certificate and t.owner_user_id=p_actor and cert.status='active' and cert.valid_until>now();
  if c.id is null then raise exception 'Certificate unavailable' using errcode='42501'; end if;
  insert into public.certificate_verifications(certificate_id,tenant_id,company_id,requested_by)
    values(c.id,c.tenant_id,c.company_id,p_actor) on conflict(certificate_id) do nothing;
  return true;
end $$;

create function public.claim_certificate_verification(p_tenant uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.certificate_verifications;
begin
  -- An expired worker cannot finish with its old lease. Bounded retries never send invoices.
  update public.certificate_verifications v set status='attention',lease_token=null,lease_until=null,
    result_code='service_unavailable',next_attempt=null,updated_at=now()
    where status='checking' and lease_until<=now() and attempts>=3 and (p_tenant is null or tenant_id=p_tenant);
  select v.* into j from public.certificate_verifications v join public.company_certificates c on c.id=v.certificate_id
    where (p_tenant is null or v.tenant_id=p_tenant) and c.status='active' and c.valid_until>now() and v.attempts<3
      and ((v.status in ('queued','attention') and v.next_attempt<=now()) or (v.status='checking' and v.lease_until<=now()))
    order by v.updated_at,v.certificate_id for update of v skip locked limit 1;
  if j.certificate_id is null then return null; end if;
  update public.certificate_verifications set status='checking',attempts=attempts+1,lease_token=gen_random_uuid(),
    lease_until=now()+interval '60 seconds',next_attempt=null,result_code=null,http_status=null,updated_at=now()
    where certificate_id=j.certificate_id returning * into j;
  return (select jsonb_build_object('certificateId',j.certificate_id,'tenantId',j.tenant_id,'companyId',j.company_id,
    'actorId',j.requested_by,'token',j.lease_token,'cnpj',c.cnpj,'regime',c.tax_regime,'address',c.address,
    'openedOn',c.opened_on,'profile',p.configuration,'profileVersion',p.version)
    from public.companies c left join lateral (select configuration,version from public.company_fiscal_profiles
      where company_id=c.id and tenant_id=c.tenant_id order by version desc limit 1) p on true where c.id=j.company_id and c.tenant_id=j.tenant_id);
end $$;

create function public.finish_certificate_verification(p_certificate uuid,p_token uuid,p_code text,p_http integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.certificate_verifications;
begin
  if p_code is null or p_code not in ('sefin_verified','contract_missing','contract_unsupported','certificate_unavailable','company_incomplete','sefin_unavailable','service_unavailable')
    or p_http is null or p_http not between 0 and 599 or (p_code='sefin_verified' and p_http not in (200,404)) then
    raise exception 'Invalid verification result' using errcode='22023';
  end if;
  select v.* into j from public.certificate_verifications v join public.company_certificates c on c.id=v.certificate_id
    where v.certificate_id=p_certificate and v.status='checking' and v.lease_token=p_token and v.lease_until>now()
      and c.status='active' and c.valid_until>now() for update of v;
  if j.certificate_id is null then return false; end if;
  update public.certificate_verifications set status=case when p_code='sefin_verified' then 'verified' else 'attention' end,
    lease_token=null,lease_until=null,result_code=p_code,http_status=p_http,updated_at=now(),
    verified_at=case when p_code='sefin_verified' then now() else null end,
    next_attempt=case when p_code in ('contract_missing','sefin_unavailable','service_unavailable') and j.attempts<3 then now()+interval '5 minutes' else null end
    where certificate_id=j.certificate_id;
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(j.tenant_id,j.company_id,j.requested_by,'certificate.automatic_check',j.certificate_id);
  return true;
end $$;

create function public.certificate_verification_ready(p_tenant uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.certificate_verifications v join public.company_certificates c on c.id=v.certificate_id
    where (p_tenant is null or v.tenant_id=p_tenant) and c.status='active' and c.valid_until>now() and v.attempts<3
      and ((v.status in ('queued','attention') and v.next_attempt<=now()) or (v.status='checking' and v.lease_until<=now())));
$$;

revoke all on function public.enqueue_certificate_verification(uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_certificate_verification(uuid) from public,anon,authenticated;
revoke all on function public.finish_certificate_verification(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.certificate_verification_ready(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_certificate_verification(uuid,uuid) to service_role;
grant execute on function public.claim_certificate_verification(uuid) to service_role;
grant execute on function public.finish_certificate_verification(uuid,uuid,text,integer) to service_role;
grant execute on function public.certificate_verification_ready(uuid) to service_role;

commit;
