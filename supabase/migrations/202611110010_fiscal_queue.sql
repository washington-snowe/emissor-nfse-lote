begin;

create table public.fiscal_batches (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,
  origin text not null check(origin in ('report','standalone')),environment text not null default 'homologation' check(environment='homologation'),
  review_id uuid unique,request_id uuid not null,snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id) references public.companies(tenant_id,id) on delete restrict,
  foreign key(tenant_id,company_id,review_id) references public.report_reviews(tenant_id,company_id,id) on delete restrict,
  unique(tenant_id,company_id,id),unique(company_id,request_id),
  check((origin='report')=(review_id is not null))
);
create table public.fiscal_operations (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,batch_id uuid not null,
  environment text not null check(environment='homologation'),profile_id uuid not null,profile_sha256 text not null,
  profile_snapshot jsonb not null,issuer_cnpj text not null,recipient jsonb not null,intermediary jsonb,
  competence_date date not null,commission_type text not null,amount numeric(17,2) not null check(amount>0),foreign_amount numeric(17,2) check(foreign_amount>0),
  dps_series text not null check(dps_series ~ '^[0-9]{5}$'),dps_number text check(dps_number ~ '^[1-9][0-9]{0,14}$'),
  dps_id text check(dps_id ~ '^DPS[0-9]{42}$'),certificate_id uuid,
  status text not null default 'queued' check(status in ('queued','blocked','preparing','sending','uncertain','reconciling','authorized','rejected','intervention','cancelled')),
  reason text,transmit_count integer not null default 0 check(transmit_count between 0 and 1),
  prepare_attempts integer not null default 0 check(prepare_attempts between 0 and 5),reconcile_attempts integer not null default 0 check(reconcile_attempts between 0 and 12),
  next_run_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(tenant_id,company_id,batch_id) references public.fiscal_batches(tenant_id,company_id,id) on delete restrict,
  foreign key(tenant_id,company_id,profile_id) references public.company_fiscal_profiles(tenant_id,company_id,id) on delete restrict,
  foreign key(tenant_id,company_id,certificate_id) references public.company_certificates(tenant_id,company_id,id) on delete restrict,
  unique(tenant_id,company_id,id),unique(environment,dps_id),
  check(octet_length(profile_snapshot::text)<=16000 and octet_length(recipient::text)<=8000),
  check(status not in ('sending','uncertain','reconciling','authorized','rejected') or transmit_count=1),
  check(transmit_count=0 or (status not in ('queued','blocked','preparing','cancelled') and dps_id is not null and dps_number is not null and certificate_id is not null))
);
create index fiscal_operations_ready on public.fiscal_operations(next_run_at,status);
create index fiscal_operations_owner on public.fiscal_operations(tenant_id,created_at desc);
create index fiscal_operations_batch on public.fiscal_operations(batch_id,created_at desc);
create index fiscal_profile_latest on public.company_fiscal_profiles(company_id,version desc);
create table private.dps_counters (
  issuer_cnpj text not null,municipality text not null,series text not null,environment text not null,
  next_number numeric(16,0) not null check(next_number between 1 and 1000000000000000),
  primary key(issuer_cnpj,municipality,series,environment)
);
create table private.fiscal_execution (
  operation_id uuid primary key references public.fiscal_operations(id) on delete restrict,
  lease_token uuid,lease_until timestamptz,signed_dps_xml text,dps_sha256 text,holder_certificate_pem text,
  check(signed_dps_xml is null or octet_length(signed_dps_xml)<=262144)
);
create table private.fiscal_source_reservations (
  tenant_id uuid not null,environment text not null,scope_sha256 text not null check(scope_sha256 ~ '^[0-9a-f]{64}$'),
  operation_id uuid not null references public.fiscal_operations(id) on delete restrict,
  primary key(tenant_id,environment,scope_sha256)
);
create table private.verified_fiscal_source_reservations (
  environment text not null,scope_sha256 text not null check(scope_sha256 ~ '^[0-9a-f]{64}$'),
  operation_id uuid not null references public.fiscal_operations(id) on delete restrict,
  primary key(environment,scope_sha256)
);
create index fiscal_source_operation on private.fiscal_source_reservations(operation_id);
create index verified_fiscal_source_operation on private.verified_fiscal_source_reservations(operation_id);
create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,operation_id uuid not null unique,
  environment text not null check(environment='homologation'),access_key text not null check(access_key ~ '^[0-9]{50}$'),
  xml_sha256 text not null check(xml_sha256 ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id,operation_id) references public.fiscal_operations(tenant_id,company_id,id) on delete restrict,
  unique(environment,access_key)
);
create table private.fiscal_document_contents (
  document_id uuid primary key references public.fiscal_documents(id) on delete restrict,xml text not null check(octet_length(xml)<=262144)
);
alter table public.fiscal_batches enable row level security;
alter table public.fiscal_batches force row level security;
alter table public.fiscal_operations enable row level security;
alter table public.fiscal_operations force row level security;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_documents force row level security;
revoke all on public.fiscal_batches,public.fiscal_operations,public.fiscal_documents from public,anon,authenticated,service_role;
grant select on public.fiscal_batches,public.fiscal_operations,public.fiscal_documents to authenticated;
create policy fiscal_batch_owner on public.fiscal_batches for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create policy fiscal_operation_owner on public.fiscal_operations for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create policy fiscal_document_owner on public.fiscal_documents for select to authenticated using(tenant_id=(select public.current_tenant_id()));

create function private.fiscal_operation_current(p_operation uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select c.cnpj=o.issuer_cnpj and p.configuration_sha256=o.profile_sha256 and
    p.configuration->>'simplesOption'=(case c.tax_regime when 'mei' then '2' else '3' end) and
    p.id=(select id from public.company_fiscal_profiles where company_id=c.id order by version desc limit 1) and
    (b.origin='standalone' or (b.review_id=(select id from public.report_reviews where import_id=r.import_id order by version desc limit 1) and
      exists(select 1 from public.review_confirmations where review_id=r.id and snapshot_sha256=r.snapshot_sha256)))
  from public.fiscal_operations o join public.companies c on c.id=o.company_id join public.fiscal_batches b on b.id=o.batch_id
    join public.company_fiscal_profiles p on p.id=o.profile_id left join public.report_reviews r on r.id=b.review_id where o.id=p_operation),false);
$$;
revoke all on function private.fiscal_operation_current(uuid) from public,anon,authenticated,service_role;

-- Only the two public server RPCs below call this helper, after deriving company ownership.
create function private.enqueue_fiscal(p_actor uuid,p_company uuid,p_review uuid,p_request uuid,p_snapshot jsonb,p_profile jsonb,p_profile_id uuid,p_profile_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.companies; batch public.fiscal_batches; existing public.fiscal_batches;
  group_data jsonb; scope text; operation uuid; issuer_series text; total_groups integer;
  payload_hash text; existing_operation uuid;
begin
  select c.* into company from public.companies c join public.tenants t on t.id=c.tenant_id
    where c.id=p_company and t.owner_user_id=p_actor for update of c;
  if company.id is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  payload_hash := encode(sha256(convert_to(jsonb_build_object('snapshot',p_snapshot,'profile',p_profile,'profileId',p_profile_id,'profileHash',p_profile_sha256)::text,'UTF8')),'hex');
  select * into existing from public.fiscal_batches where company_id=company.id and
    ((p_review is not null and review_id=p_review) or request_id=p_request);
  if existing.id is not null then
    if existing.snapshot_sha256<>payload_hash then raise exception 'Request content changed' using errcode='40001'; end if;
    return jsonb_build_object('id',existing.id,'duplicate',true);
  end if;
  if p_request is null or company.cnpj !~ '^[0-9]{14}$' or jsonb_typeof(p_snapshot->'groups') is distinct from 'array' or p_profile->>'issuerMunicipality' is null or
    not (p_profile->>'issuerMunicipality' ~ '^[1-9][0-9]{6}$') or p_profile->>'series' is null or not (p_profile->>'series' ~ '^[0-9]{1,5}$') or
    p_profile->>'simplesOption' is distinct from (case company.tax_regime when 'mei' then '2' else '3' end) then
    raise exception 'Invalid fiscal preparation' using errcode='22023';
  end if;
  total_groups:=jsonb_array_length(p_snapshot->'groups');issuer_series:=lpad(p_profile->>'series',5,'0');
  if total_groups not between 1 and 500 or issuer_series::integer not between 1 and 49999 or
    (p_snapshot->>'competenceDate')::date >= date '2027-01-01' then raise exception 'Fiscal preparation limit' using errcode='22023'; end if;
  -- Before A1 verification, deduplication is tenant-local and does not reveal or reserve another account's legal namespace.
  for group_data in select value from jsonb_array_elements(p_snapshot->'groups') loop
    if jsonb_typeof(group_data->'sourceClaims') is distinct from 'array' or jsonb_array_length(group_data->'sourceClaims')<1 then
      raise exception 'Source scope missing' using errcode='22023'; end if;
    for scope in select jsonb_array_elements_text(group_data->'sourceClaims') loop
      if scope !~ '^[0-9a-f]{64}$' then raise exception 'Invalid source scope' using errcode='22023'; end if;
      select operation_id into existing_operation from private.fiscal_source_reservations where tenant_id=company.tenant_id and environment='homologation' and scope_sha256=scope;
      if existing_operation is not null then
        if p_review is null then
          select b.* into existing from public.fiscal_batches b join public.fiscal_operations o on o.batch_id=b.id
            where o.id=existing_operation and b.company_id=company.id and b.snapshot_sha256=payload_hash and private.fiscal_operation_current(o.id);
          if existing.id is not null then return jsonb_build_object('id',existing.id,'duplicate',true); end if;
        end if;
        raise exception 'Source already reserved' using errcode='23505';
      end if;
    end loop;
  end loop;
  if not private.take_limit(company.tenant_id,'enqueue_fiscal',10) then raise exception 'Fiscal queue limit' using errcode='P0001'; end if;
  insert into public.fiscal_batches(tenant_id,company_id,origin,review_id,request_id,snapshot_sha256,created_by)
    values(company.tenant_id,company.id,case when p_review is null then 'standalone' else 'report' end,p_review,p_request,payload_hash,p_actor) returning * into batch;
  for group_data in select value from jsonb_array_elements(p_snapshot->'groups') loop
    insert into public.fiscal_operations(tenant_id,company_id,batch_id,environment,profile_id,profile_sha256,profile_snapshot,issuer_cnpj,recipient,intermediary,
      competence_date,commission_type,amount,foreign_amount,dps_series)
      values(company.tenant_id,company.id,batch.id,'homologation',p_profile_id,p_profile_sha256,p_profile,company.cnpj,group_data->'recipient',group_data->'intermediary',
        (p_snapshot->>'competenceDate')::date,p_snapshot->>'commissionType',(group_data->>'amount')::numeric,(group_data->>'foreignAmount')::numeric,issuer_series) returning id into operation;
    insert into private.fiscal_execution(operation_id) values(operation);
    for scope in select jsonb_array_elements_text(group_data->'sourceClaims') loop
      insert into private.fiscal_source_reservations values(company.tenant_id,'homologation',scope,operation);
    end loop;
    insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(company.tenant_id,company.id,p_actor,'fiscal.queued',operation);
  end loop;
  return jsonb_build_object('id',batch.id,'duplicate',false);
end $$;
revoke all on function private.enqueue_fiscal(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text) from public,anon,authenticated,service_role;

create function public.enqueue_report_fiscal(p_actor uuid,p_review uuid,p_sha256 text,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare review public.report_reviews; profile public.company_fiscal_profiles;
begin
  select r.* into review from public.report_reviews r join public.tenants t on t.id=r.tenant_id
    where r.id=p_review and t.owner_user_id=p_actor and r.snapshot_sha256=p_sha256;
  if review.id is null then raise exception 'Review unavailable' using errcode='42501'; end if;
  if not exists(select 1 from public.review_confirmations where review_id=review.id and snapshot_sha256=p_sha256) then
    raise exception 'Confirm review first' using errcode='55000'; end if;
  perform public.confirm_report_review(p_actor,p_review,p_sha256);
  select * into profile from public.company_fiscal_profiles where id=review.profile_id;
  return private.enqueue_fiscal(p_actor,review.company_id,review.id,p_request,review.snapshot,profile.configuration,profile.id,profile.configuration_sha256);
end $$;

create function public.enqueue_standalone_fiscal(p_actor uuid,p_company uuid,p_profile uuid,p_expected_profile_sha256 text,p_request uuid,p_data jsonb,p_configuration jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.companies; profile public.company_fiscal_profiles; scope text; snapshot jsonb;
begin
  select c.* into company from public.companies c join public.tenants t on t.id=c.tenant_id where c.id=p_company and t.owner_user_id=p_actor for update of c;
  if company.id is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  select * into profile from public.company_fiscal_profiles where company_id=company.id order by version desc limit 1;
  if profile.id is null or profile.id is distinct from p_profile or profile.configuration_sha256 is distinct from p_expected_profile_sha256 then
    raise exception 'Profile changed' using errcode='40001'; end if;
  if p_data is null or jsonb_typeof(p_data->'recipient') is distinct from 'object' or p_data->>'amount' is null or
    not (p_data->>'amount' ~ '^(0|[1-9][0-9]{0,14})\.[0-9]{2}$') or p_data->>'competenceDate' is null or
    not (p_data->>'competenceDate' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$') or p_data->>'commissionType' is null or
    length(p_data->>'commissionType') not between 1 and 120 or octet_length(p_data::text)>30000 then
    raise exception 'Invalid standalone data' using errcode='22023'; end if;
  if (p_data->>'amount')::numeric<=0 or (p_data->>'competenceDate')::date<profile.valid_from then raise exception 'Invalid standalone competence or amount' using errcode='22023'; end if;
  if p_data ? 'foreignAmount' and (jsonb_typeof(p_data->'foreignAmount') is distinct from 'string' or
    not (p_data->>'foreignAmount' ~ '^(0|[1-9][0-9]{0,14})\.[0-9]{2}$')) then raise exception 'Invalid foreign amount' using errcode='22023'; end if;
  if length(coalesce(p_data->>'reference',''))>200 then raise exception 'Payment reference limit' using errcode='22023'; end if;
  -- Payment identity does not change when someone edits an address, description or tax parameter.
  scope:=encode(sha256(convert_to(jsonb_build_object('issuer',company.cnpj,'kind','standalone','recipient',
    jsonb_build_array(p_data#>>'{recipient,kind}',p_data#>>'{recipient,document}',p_data#>>'{recipient,country}'),
    'payment',case when btrim(coalesce(p_data->>'reference',''))<>'' then jsonb_build_array('reference',btrim(p_data->>'reference')) else
      jsonb_build_array('unreferenced',p_data->>'competenceDate',p_data->>'amount','BRL') end)::text,'UTF8')),'hex');
  snapshot:=jsonb_build_object('competenceDate',p_data->>'competenceDate','commissionType',p_data->>'commissionType','reference',coalesce(p_data->>'reference',''),'groups',
    jsonb_build_array(jsonb_build_object('amount',p_data->>'amount','recipient',p_data->'recipient','intermediary',p_data->'intermediary',
      'foreignAmount',p_data->>'foreignAmount','sourceClaims',jsonb_build_array(scope))));
  return private.enqueue_fiscal(p_actor,company.id,null,p_request,snapshot,p_configuration,profile.id,profile.configuration_sha256);
end $$;

create function public.claim_fiscal_jobs(p_tenant uuid default null,p_limit integer default 1,p_reconcile_only boolean default false) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare item record; operation public.fiscal_operations; token uuid; emitted integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 3 then raise exception 'Claim limit' using errcode='22023'; end if;
  for item in select o.id,o.status from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where (p_tenant is null or o.tenant_id=p_tenant) and o.status in ('preparing','sending','reconciling') and e.lease_until<clock_timestamp()
    for update of o skip locked loop
    update public.fiscal_operations set status=case when item.status='preparing' then 'queued' else 'uncertain' end,
      reason='worker_interrupted',next_run_at=now(),updated_at=now() where id=item.id;
    update private.fiscal_execution set lease_token=null,lease_until=null where operation_id=item.id;
  end loop;
  for operation in select * from public.fiscal_operations where (p_tenant is null or tenant_id=p_tenant) and transmit_count=0 and
    status in ('queued','blocked') and next_run_at<=now() and not private.fiscal_operation_current(id) limit 500 for update skip locked loop
    update public.fiscal_operations set status='blocked',reason='configuration_changed',next_run_at=now()+interval '1 day',updated_at=now() where id=operation.id;
  end loop;
  for operation in select * from public.fiscal_operations where (p_tenant is null or tenant_id=p_tenant) and
    status in ('queued','blocked','uncertain') and (transmit_count=1 or private.fiscal_operation_current(id)) and
    (not p_reconcile_only or transmit_count=1) and next_run_at<=now() order by next_run_at,created_at limit p_limit for update skip locked loop
    exit when emitted>=p_limit;
    if operation.transmit_count=0 and not private.fiscal_operation_current(operation.id) then
      update public.fiscal_operations set status='blocked',reason='configuration_changed',next_run_at=now()+interval '1 day',updated_at=now() where id=operation.id;
      continue;
    end if;
    if (operation.transmit_count=0 and operation.prepare_attempts>=5) or (operation.transmit_count=1 and operation.reconcile_attempts>=12) then
      update public.fiscal_operations set status='intervention',reason=case when operation.transmit_count=0 then 'preparation_exhausted' else 'reconcile_exhausted' end,updated_at=now() where id=operation.id;
      continue;
    end if;
    token:=gen_random_uuid();
    update public.fiscal_operations set status=case when transmit_count=0 then 'preparing' else 'reconciling' end,
      prepare_attempts=prepare_attempts+case when transmit_count=0 then 1 else 0 end,
      reconcile_attempts=reconcile_attempts+case when transmit_count=1 then 1 else 0 end,updated_at=now() where id=operation.id returning * into operation;
    update private.fiscal_execution set lease_token=token,lease_until=clock_timestamp()+interval '2 minutes' where operation_id=operation.id;
    return next to_jsonb(operation)||jsonb_build_object('amount',operation.amount::text,'foreign_amount',operation.foreign_amount::text,'lease_token',token,'signed_dps_xml',(select signed_dps_xml from private.fiscal_execution where operation_id=operation.id),
      'holder_certificate_pem',(select holder_certificate_pem from private.fiscal_execution where operation_id=operation.id),
      'mode',case when operation.transmit_count=0 then 'prepare' else 'reconcile' end);
    emitted:=emitted+1;
  end loop;
end $$;

create function public.block_fiscal_dependencies(p_tenant uuid,p_company uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_reason not in ('transmission_disabled','contract_missing','certificate_missing') then raise exception 'Invalid dependency' using errcode='22023'; end if;
  update public.fiscal_operations set status='blocked',reason=p_reason,next_run_at=now()+interval '1 day',updated_at=now()
    where transmit_count=0 and status in ('queued','blocked') and (p_tenant is null or tenant_id=p_tenant) and (p_company is null or company_id=p_company);
end $$;

create function public.release_fiscal_preparation(p_operation uuid,p_token uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
  if p_reason not in ('transmission_disabled','contract_missing','certificate_missing','certificate_unavailable','invalid_xml','configuration_changed','preparation_failed','preparation_retry','source_duplicate') then raise exception 'Invalid reason' using errcode='22023'; end if;
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.status='preparing' and o.transmit_count=0 and e.lease_token=p_token and e.lease_until>clock_timestamp() for update of o;
  if operation.id is null then return false; end if;
  update public.fiscal_operations set status=case when p_reason in ('invalid_xml','preparation_failed','source_duplicate') then 'intervention' when p_reason='preparation_retry' then 'queued' else 'blocked' end,
    reason=p_reason,next_run_at=now()+case when p_reason='preparation_retry' then interval '30 seconds' else interval '1 day' end,updated_at=now(),
    prepare_attempts=case when p_reason in ('transmission_disabled','contract_missing','certificate_missing') then greatest(prepare_attempts-1,0) else prepare_attempts end where id=operation.id;
  update private.fiscal_execution set lease_token=null,lease_until=null where operation_id=operation.id;
  return true;
end $$;

create function public.begin_fiscal_send(p_operation uuid,p_token uuid,p_certificate uuid,p_signed_xml text,p_certificate_pem text) returns boolean
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.status='preparing' and o.transmit_count=0 and e.lease_token=p_token and e.lease_until>clock_timestamp() for update of o;
  if operation.id is null then return false; end if;
  perform 1 from public.companies where id=operation.company_id for update;
  if operation.dps_id is null or not private.fiscal_operation_current(operation.id) or not exists(select 1 from public.company_certificates where id=p_certificate and
    tenant_id=operation.tenant_id and company_id=operation.company_id and status='active' and subject_cnpj=operation.issuer_cnpj and valid_from<=now() and valid_until>now()) then return false; end if;
  if p_signed_xml is null or octet_length(p_signed_xml)>262144 or strpos(p_signed_xml,operation.dps_id)=0 or
    p_certificate_pem is null or octet_length(p_certificate_pem)>16000 or strpos(p_certificate_pem,'BEGIN CERTIFICATE')=0 then raise exception 'Invalid signed DPS' using errcode='22023'; end if;
  update private.fiscal_execution set signed_dps_xml=p_signed_xml,holder_certificate_pem=p_certificate_pem,dps_sha256=encode(sha256(convert_to(p_signed_xml,'UTF8')),'hex') where operation_id=operation.id;
  update public.fiscal_operations set status='sending',transmit_count=1,certificate_id=p_certificate,reason=null,updated_at=now() where id=operation.id;
  insert into public.audit_events(tenant_id,company_id,event,resource_id) values(operation.tenant_id,operation.company_id,'fiscal.dispatch_started',operation.id);
  return true;
end $$;

create function public.finish_fiscal_attempt(p_operation uuid,p_token uuid,p_outcome text,p_reason text default null,p_access_key text default null,p_xml text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations; document uuid;
begin
  if p_outcome not in ('authorized','rejected','uncertain','not_found','intervention') or
    (p_reason is not null and p_reason not in ('network_uncertain','provider_rejection','response_invalid','not_found','certificate_unavailable','reconcile_exhausted')) then
    raise exception 'Invalid fiscal outcome' using errcode='22023'; end if;
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id where o.id=p_operation and
    o.status in ('sending','reconciling') and o.transmit_count=1 and e.lease_token=p_token and e.lease_until>clock_timestamp() for update of o;
  if operation.id is null then return false; end if;
  if p_outcome='rejected' and operation.status<>'sending' then raise exception 'Reconciliation cannot infer rejection' using errcode='22023'; end if;
  if p_outcome='authorized' then
    if p_access_key is null or not (p_access_key ~ '^[0-9]{50}$') or p_xml is null or octet_length(p_xml)>262144 or
      strpos(p_xml,'NFS'||p_access_key)=0 or strpos(p_xml,operation.dps_id)=0 then raise exception 'Fiscal document proof missing' using errcode='22023'; end if;
    insert into public.fiscal_documents(tenant_id,company_id,operation_id,environment,access_key,xml_sha256)
      values(operation.tenant_id,operation.company_id,operation.id,operation.environment,p_access_key,encode(sha256(convert_to(p_xml,'UTF8')),'hex')) returning id into document;
    insert into private.fiscal_document_contents values(document,p_xml);
  end if;
  update public.fiscal_operations set status=case when p_outcome in ('uncertain','not_found') then
      case when reconcile_attempts>=12 then 'intervention' else 'uncertain' end else p_outcome end,
    reason=case when p_outcome in ('uncertain','not_found') and reconcile_attempts>=12 then 'reconcile_exhausted' else p_reason end,
    next_run_at=now()+make_interval(secs=>least(3600,30*(2^least(reconcile_attempts,7))::integer)),updated_at=now() where id=operation.id;
  update private.fiscal_execution set lease_token=null,lease_until=null where operation_id=operation.id;
  insert into public.audit_events(tenant_id,company_id,event,resource_id) values(operation.tenant_id,operation.company_id,'fiscal.'||p_outcome,operation.id);
  return true;
end $$;

create function public.manage_fiscal_operation(p_actor uuid,p_operation uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
  select o.* into operation from public.fiscal_operations o join public.tenants t on t.id=o.tenant_id where o.id=p_operation and t.owner_user_id=p_actor for update of o;
  if operation.id is null then raise exception 'Operation unavailable' using errcode='42501'; end if;
  if p_action not in ('resume','cancel') then raise exception 'Invalid action' using errcode='22023'; end if;
  if not private.take_limit(operation.tenant_id,'manage_fiscal',20) then return false; end if;
  if p_action='cancel' then
    if operation.transmit_count<>0 or operation.status not in ('queued','blocked','preparing','intervention') then return false; end if;
    update public.fiscal_operations set status='cancelled',reason=null,updated_at=now() where id=operation.id;
    delete from private.fiscal_source_reservations where operation_id=operation.id;
    delete from private.verified_fiscal_source_reservations where operation_id=operation.id;
  else
    if operation.status not in ('blocked','intervention','uncertain') then return false; end if;
    if operation.transmit_count=0 and not private.fiscal_operation_current(operation.id) then return false; end if;
    update public.fiscal_operations set status=case when transmit_count=0 then 'queued' else 'uncertain' end,
      prepare_attempts=case when transmit_count=0 then 0 else prepare_attempts end,reconcile_attempts=0,next_run_at=now(),reason=null,updated_at=now() where id=operation.id;
  end if;
  update private.fiscal_execution set lease_token=null,lease_until=null where operation_id=operation.id;
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(operation.tenant_id,operation.company_id,p_actor,'fiscal.'||p_action,operation.id);
  return true;
end $$;

create function public.fiscal_queue_ready(p_tenant uuid default null) returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from public.fiscal_operations where (p_tenant is null or tenant_id=p_tenant) and status in ('queued','blocked','uncertain') and next_run_at<=now()) or
    exists(select 1 from public.work_jobs where (p_tenant is null or tenant_id=p_tenant) and (status='pending' or status='leased' and lease_until<now()));
$$;
create function public.fiscal_contract(p_environment text) returns jsonb language sql stable security definer set search_path='' as $$
  select structural_contract from private.nfse_api_contracts where environment=p_environment;
$$;
create function public.fiscal_processing_certificate(p_operation uuid) returns uuid language sql stable security definer set search_path='' as $$
  select c.id from public.fiscal_operations o join public.company_certificates c on c.company_id=o.company_id and c.tenant_id=o.tenant_id
    where o.id=p_operation and c.subject_cnpj=o.issuer_cnpj and c.valid_from<=now() and c.valid_until>now() and
    (c.status='active' or (o.transmit_count=1 and c.id=o.certificate_id and c.status='replaced'))
    order by (c.status='active') desc,c.created_at desc limit 1;
$$;
create function public.reserve_fiscal_identity(p_operation uuid,p_token uuid,p_certificate uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations; scope text; municipality_code text; allocated numeric;
begin
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.status='preparing' and o.transmit_count=0 and e.lease_token=p_token and e.lease_until>clock_timestamp() for update of o;
  if operation.id is null or not private.fiscal_operation_current(operation.id) then return null; end if;
  if not exists(select 1 from public.company_certificates c where c.id=p_certificate and c.tenant_id=operation.tenant_id and
    c.company_id=operation.company_id and c.subject_cnpj=operation.issuer_cnpj and c.status='active' and c.valid_from<=now() and c.valid_until>now()) then return null; end if;
  if not exists(select 1 from public.fiscal_access_checks where certificate_id=p_certificate and company_id=operation.company_id and
    outcome='response_received' and http_status=200 and created_at>now()-interval '1 day') then return null; end if;
  -- Only a verified A1 holder can touch the cross-tenant namespace for this legal issuer.
  perform pg_advisory_xact_lock(hashtextextended('nfse:homologation:'||operation.issuer_cnpj,0));
  if operation.dps_id is not null then return jsonb_build_object('id',operation.dps_id,'number',operation.dps_number); end if;
  for scope in select scope_sha256 from private.fiscal_source_reservations where operation_id=operation.id order by scope_sha256 loop
    if exists(select 1 from private.verified_fiscal_source_reservations where environment=operation.environment and scope_sha256=scope and operation_id<>operation.id) then
      raise exception 'Verified source already reserved' using errcode='23505'; end if;
  end loop;
  municipality_code:=operation.profile_snapshot->>'issuerMunicipality';
  insert into private.dps_counters(issuer_cnpj,municipality,series,environment,next_number)
    values(operation.issuer_cnpj,municipality_code,operation.dps_series,operation.environment,1) on conflict do nothing;
  select next_number into allocated from private.dps_counters where issuer_cnpj=operation.issuer_cnpj and municipality=municipality_code and series=operation.dps_series and environment=operation.environment for update;
  if allocated>999999999999999 then raise exception 'DPS sequence exhausted' using errcode='22003'; end if;
  update private.dps_counters set next_number=allocated+1 where issuer_cnpj=operation.issuer_cnpj and municipality=municipality_code and series=operation.dps_series and environment=operation.environment;
  update public.fiscal_operations set dps_number=allocated::text,dps_id='DPS'||municipality_code||'2'||issuer_cnpj||dps_series||lpad(allocated::text,15,'0') where id=operation.id returning * into operation;
  insert into private.verified_fiscal_source_reservations(environment,scope_sha256,operation_id)
    select operation.environment,scope_sha256,operation.id from private.fiscal_source_reservations where operation_id=operation.id;
  return jsonb_build_object('id',operation.dps_id,'number',operation.dps_number);
end $$;
create function public.record_fiscal_transport(p_operation uuid,p_token uuid,p_certificate uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.status='preparing' and e.lease_token=p_token and e.lease_until>clock_timestamp();
  if operation.id is null or not exists(select 1 from public.company_certificates where id=p_certificate and tenant_id=operation.tenant_id and
    company_id=operation.company_id and subject_cnpj=operation.issuer_cnpj and status='active' and valid_from<=now() and valid_until>now()) then return false; end if;
  insert into public.fiscal_access_checks(tenant_id,company_id,certificate_id,environment,http_status,outcome)
    values(operation.tenant_id,operation.company_id,p_certificate,'homologation',200,'response_received');
  return true;
end $$;
create function public.resume_fiscal_batch(p_actor uuid,p_batch uuid) returns integer language plpgsql security definer set search_path='' as $$
declare batch public.fiscal_batches; affected integer;
begin
  select b.* into batch from public.fiscal_batches b join public.tenants t on t.id=b.tenant_id where b.id=p_batch and t.owner_user_id=p_actor;
  if batch.id is null then raise exception 'Batch unavailable' using errcode='42501'; end if;
  if not private.take_limit(batch.tenant_id,'resume_fiscal_batch',10) then return 0; end if;
  update public.fiscal_operations set status='queued',reason=null,next_run_at=now(),prepare_attempts=0,updated_at=now()
    where batch_id=batch.id and transmit_count=0 and status in ('queued','blocked') and private.fiscal_operation_current(id);
  get diagnostics affected=row_count;
  update public.fiscal_operations set next_run_at=now() where batch_id=batch.id and status='uncertain' and reconcile_attempts<12;
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(batch.tenant_id,batch.company_id,p_actor,'fiscal.batch_resumed',batch.id);
  return affected;
end $$;
create function public.fiscal_document_xml(p_actor uuid,p_document uuid) returns text language sql security definer set search_path='' as $$
  select c.xml from public.fiscal_documents d join private.fiscal_document_contents c on c.document_id=d.id
    join public.tenants t on t.id=d.tenant_id where d.id=p_document and t.owner_user_id=p_actor;
$$;
create function public.fiscal_status_totals() returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from(select status,count(*) n from public.fiscal_operations group by status) s;
$$;
create function public.list_fiscal_operations(p_batch uuid default null,p_limit integer default 50,p_offset integer default 0)
returns setof jsonb language sql stable set search_path='' as $$
  select to_jsonb(o)||jsonb_build_object('amount',o.amount::text,'foreign_amount',o.foreign_amount::text,
    'document',(select jsonb_build_object('id',d.id,'access_key',d.access_key) from public.fiscal_documents d where d.operation_id=o.id))
  from public.fiscal_operations o where (p_batch is null or batch_id=p_batch) order by created_at desc,id
    limit greatest(1,least(p_limit,500)) offset greatest(0,least(p_offset,50000));
$$;
revoke all on function public.list_fiscal_operations(uuid,integer,integer) from public,anon;
grant execute on function public.list_fiscal_operations(uuid,integer,integer) to authenticated;
revoke all on function public.enqueue_report_fiscal(uuid,uuid,text,uuid),public.enqueue_standalone_fiscal(uuid,uuid,uuid,text,uuid,jsonb,jsonb),
  public.claim_fiscal_jobs(uuid,integer,boolean),public.block_fiscal_dependencies(uuid,uuid,text),public.release_fiscal_preparation(uuid,uuid,text),
  public.begin_fiscal_send(uuid,uuid,uuid,text,text),public.finish_fiscal_attempt(uuid,uuid,text,text,text,text),public.manage_fiscal_operation(uuid,uuid,text),
  public.fiscal_processing_certificate(uuid),public.resume_fiscal_batch(uuid,uuid),public.reserve_fiscal_identity(uuid,uuid,uuid),public.record_fiscal_transport(uuid,uuid,uuid),
  public.fiscal_queue_ready(uuid),public.fiscal_contract(text),public.fiscal_document_xml(uuid,uuid),public.fiscal_status_totals() from public,anon,authenticated;
grant execute on function public.enqueue_report_fiscal(uuid,uuid,text,uuid),public.enqueue_standalone_fiscal(uuid,uuid,uuid,text,uuid,jsonb,jsonb),
  public.claim_fiscal_jobs(uuid,integer,boolean),public.block_fiscal_dependencies(uuid,uuid,text),public.release_fiscal_preparation(uuid,uuid,text),
  public.begin_fiscal_send(uuid,uuid,uuid,text,text),public.finish_fiscal_attempt(uuid,uuid,text,text,text,text),public.manage_fiscal_operation(uuid,uuid,text),
  public.fiscal_processing_certificate(uuid),public.resume_fiscal_batch(uuid,uuid),public.reserve_fiscal_identity(uuid,uuid,uuid),public.record_fiscal_transport(uuid,uuid,uuid),
  public.fiscal_queue_ready(uuid),public.fiscal_contract(text),public.fiscal_document_xml(uuid,uuid) to service_role;
grant execute on function public.fiscal_status_totals() to authenticated;
commit;
