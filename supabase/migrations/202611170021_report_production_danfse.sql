begin;
-- New production is report-only and requires its own access proof and explicit batch consent.
-- Existing operations, signed originals, certificates, source reservations and counters stay intact.
alter table public.fiscal_batches drop constraint fiscal_batches_environment_check;
alter table public.fiscal_batches add constraint fiscal_batches_environment_check check(environment in ('homologation','production'));
alter table public.fiscal_operations drop constraint fiscal_operations_environment_check;
alter table public.fiscal_operations add constraint fiscal_operations_environment_check check(environment in ('homologation','production'));
alter table public.fiscal_documents drop constraint fiscal_documents_environment_check;
alter table public.fiscal_documents add constraint fiscal_documents_environment_check check(environment in ('homologation','production'));
alter table public.fiscal_access_checks drop constraint fiscal_access_checks_environment_check;
alter table public.fiscal_access_checks add constraint fiscal_access_checks_environment_check check(environment in ('homologation','production'));
alter table public.fiscal_batches drop constraint fiscal_batches_review_id_key;
create unique index fiscal_batches_environment_review on public.fiscal_batches(environment,review_id) where review_id is not null;

create table private.fiscal_production_readiness (
 company_id uuid primary key references public.companies(id),tenant_id uuid not null references public.tenants(id),
 certificate_id uuid not null references public.company_certificates(id),profile_id uuid not null references public.company_fiscal_profiles(id),
 profile_sha256 text not null check(profile_sha256~'^[a-f0-9]{64}$'),contract_sha256 text not null check(contract_sha256~'^[a-f0-9]{64}$'),
 checked_at timestamptz not null default now(),checked_by uuid not null references auth.users(id)
);
create table private.production_batch_approvals (
 batch_id uuid primary key references public.fiscal_batches(id),tenant_id uuid not null references public.tenants(id),
 review_sha256 text not null check(review_sha256~'^[a-f0-9]{64}$'),confirmed_by uuid not null references auth.users(id),
 email_confirmed boolean not null check(email_confirmed),confirmed_at timestamptz not null default now()
);
create table private.danfse_contracts (
 environment text primary key check(environment in ('homologation','production')),source_url text not null,
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),structural_contract jsonb not null,captured_at timestamptz not null default now()
);
create table private.fiscal_danfse_contents (
 document_id uuid primary key references public.fiscal_documents(id),pdf bytea not null check(octet_length(pdf) between 100 and 2000000),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),source_contract_sha256 text not null check(source_contract_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
revoke all on private.fiscal_production_readiness,private.production_batch_approvals,private.danfse_contracts,private.fiscal_danfse_contents from public,anon,authenticated,service_role;
alter table private.invoice_email_execution add column document_attempts integer not null default 0 check(document_attempts between 0 and 12);

create function private.production_company_ready(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.fiscal_production_readiness r join public.companies c on c.id=r.company_id and c.tenant_id=r.tenant_id
 join public.company_certificates a on a.id=r.certificate_id and a.company_id=c.id and a.tenant_id=c.tenant_id
 join public.company_fiscal_profiles p on p.id=r.profile_id and p.company_id=c.id and p.tenant_id=c.tenant_id
 join private.nfse_api_contracts n on n.environment='production' and n.sha256=r.contract_sha256
 where c.id=p_company and c.tax_regime='mei' and a.status='active' and a.subject_cnpj=c.cnpj and a.valid_from<=now() and a.valid_until>now()
 and p.configuration_sha256=r.profile_sha256 and p.id=(select id from public.company_fiscal_profiles where company_id=c.id order by version desc limit 1)
 and exists(select 1 from private.danfse_contracts where environment='production'));
$$;
revoke all on function private.production_company_ready(uuid) from public,anon,authenticated,service_role;

create function public.production_report_status(p_company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ready',private.production_company_ready(c.id),'checkedAt',r.checked_at,
 'contractCaptured',exists(select 1 from private.nfse_api_contracts where environment='production'),
 'danfseCaptured',exists(select 1 from private.danfse_contracts where environment='production'))
 from public.companies c left join private.fiscal_production_readiness r on r.company_id=c.id
 where c.id=p_company and c.tenant_id=(select public.current_tenant_id());
$$;
create function public.reserve_production_check(p_actor uuid,p_company uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.companies;p public.company_fiscal_profiles;a public.company_certificates;
begin
 select x.* into c from public.companies x join public.tenants t on t.id=x.tenant_id where x.id=p_company and t.owner_user_id=p_actor;
 if c.id is null then raise exception 'Company unavailable' using errcode='42501';end if;
 if c.tax_regime<>'mei' or not private.take_limit(c.tenant_id,'production_check',5) then return null;end if;
 select * into p from public.company_fiscal_profiles where company_id=c.id order by version desc limit 1;
 select * into a from public.company_certificates where company_id=c.id and tenant_id=c.tenant_id and status='active' and subject_cnpj=c.cnpj and valid_from<=now() and valid_until>now() order by created_at desc limit 1;
 if p.id is null or a.id is null then return null;end if;
 return jsonb_build_object('tenantId',c.tenant_id,'companyId',c.id,'cnpj',c.cnpj,'certificateId',a.id,'profileId',p.id,'profileHash',p.configuration_sha256,'profile',p.configuration);
end $$;
create function public.record_production_readiness(p_actor uuid,p_company uuid,p_certificate uuid,p_profile_hash text,p_contract_hash text,p_http integer) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.companies;p public.company_fiscal_profiles;
begin
 select x.* into c from public.companies x join public.tenants t on t.id=x.tenant_id where x.id=p_company and t.owner_user_id=p_actor for update of x;
 if c.id is null then raise exception 'Company unavailable' using errcode='42501';end if;
 select * into p from public.company_fiscal_profiles where company_id=c.id order by version desc limit 1;
 if c.tax_regime<>'mei' or p.id is null or p_profile_hash is null or p_contract_hash is null or p_http is null or p_http not in (200,404) or p.configuration_sha256 is distinct from p_profile_hash or
 not exists(select 1 from private.nfse_api_contracts where environment='production' and sha256=p_contract_hash) or
 not exists(select 1 from public.company_certificates where id=p_certificate and company_id=c.id and tenant_id=c.tenant_id and status='active' and subject_cnpj=c.cnpj and valid_from<=now() and valid_until>now()) then return false;end if;
 insert into private.fiscal_production_readiness(company_id,tenant_id,certificate_id,profile_id,profile_sha256,contract_sha256,checked_by)
 values(c.id,c.tenant_id,p_certificate,p.id,p_profile_hash,p_contract_hash,p_actor) on conflict(company_id) do update set
 certificate_id=excluded.certificate_id,profile_id=excluded.profile_id,profile_sha256=excluded.profile_sha256,contract_sha256=excluded.contract_sha256,checked_by=excluded.checked_by,checked_at=now();
 insert into public.fiscal_access_checks(tenant_id,company_id,certificate_id,environment,http_status,outcome) values(c.tenant_id,c.id,p_certificate,'production',p_http,'response_received');
 insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(c.tenant_id,c.id,p_actor,'fiscal.production_access_verified',c.id);
 return true;
end $$;

create function public.danfse_contract(p_environment text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sha256',sha256,'contract',structural_contract) from private.danfse_contracts where environment=p_environment;
$$;
create function public.fiscal_contract_record(p_environment text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sha256',sha256,'contract',structural_contract) from private.nfse_api_contracts where environment=p_environment;
$$;
create function public.store_official_danfse_contract(p_environment text,p_url text,p_sha256 text,p_contract jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_environment is null or p_environment not in ('homologation','production') or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or
 jsonb_typeof(p_contract#>array['paths','/{chaveAcesso}','get']) is distinct from 'object' or p_url is null or p_url~'/\.{1,2}(/|$)' or
 (p_environment='production' and p_url!~'^https://adn\.nfse\.gov\.br/danfse/[A-Za-z0-9_./~-]+$') or
 (p_environment='homologation' and p_url!~'^https://adn\.producaorestrita\.nfse\.gov\.br/danfse/[A-Za-z0-9_./~-]+$') then raise exception 'Invalid DANFSe source' using errcode='22023';end if;
 insert into private.danfse_contracts(environment,source_url,sha256,structural_contract) values(p_environment,p_url,p_sha256,p_contract)
 on conflict(environment) do update set source_url=excluded.source_url,sha256=excluded.sha256,structural_contract=excluded.structural_contract,captured_at=now();
end $$;
create function public.danfse_document_source(p_actor uuid,p_document uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.fiscal_documents;o public.fiscal_operations;asset private.fiscal_danfse_contents;certificate uuid;cnpj text;
begin
 select x.* into d from public.fiscal_documents x join public.tenants t on t.id=x.tenant_id where x.id=p_document and t.owner_user_id=p_actor;
 if d.id is null then raise exception 'Document unavailable' using errcode='42501';end if;
 select * into o from public.fiscal_operations where id=d.operation_id and tenant_id=d.tenant_id and company_id=d.company_id;
 if o.status<>'authorized' or not exists(select 1 from private.fiscal_document_contents where document_id=d.id and encode(sha256(convert_to(xml,'UTF8')),'hex')=d.xml_sha256) then return null;end if;
 select * into asset from private.fiscal_danfse_contents where document_id=d.id;
 if asset.document_id is null and not private.take_limit(d.tenant_id,'danfse_read',500) then return null;end if;
 certificate:=public.fiscal_processing_certificate(o.id);select c.cnpj into cnpj from public.companies c where c.id=d.company_id;
 return jsonb_build_object('tenantId',d.tenant_id,'companyId',d.company_id,'cnpj',cnpj,'certificateId',certificate,'environment',d.environment,'accessKey',d.access_key,
 'pdf',case when asset.document_id is not null then encode(asset.pdf,'base64') else null end,'sha256',asset.sha256);
end $$;
create function public.store_fiscal_danfse(p_actor uuid,p_document uuid,p_environment text,p_access_key text,p_pdf text,p_contract_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.fiscal_documents;bytes bytea;hash text;prior text;
begin
 select x.* into d from public.fiscal_documents x join public.tenants t on t.id=x.tenant_id join public.fiscal_operations o on o.id=x.operation_id
 where x.id=p_document and t.owner_user_id=p_actor and o.status='authorized' and x.environment=p_environment and x.access_key=p_access_key for update of x;
 if d.id is null then raise exception 'Document unavailable' using errcode='42501';end if;
 if p_pdf is null or length(p_pdf)>2700000 or not exists(select 1 from private.danfse_contracts where environment=d.environment and sha256=p_contract_hash) then return false;end if;
 bytes:=decode(p_pdf,'base64');if octet_length(bytes) not between 100 and 2000000 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') then return false;end if;
 hash:=encode(sha256(bytes),'hex');select sha256 into prior from private.fiscal_danfse_contents where document_id=d.id;
 if prior is not null then return prior=hash;end if;
 insert into private.fiscal_danfse_contents values(d.id,bytes,hash,p_contract_hash,now());
 insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(d.tenant_id,d.company_id,p_actor,'fiscal.danfse_stored',d.id);
 return true;
end $$;

-- Environment-aware fiscal and email functions are appended below, keeping historical wrappers homologation-only.

-- Generated environment-aware variants retain the original guards and monetary/source logic.


create function private.enqueue_fiscal_environment(p_actor uuid,p_company uuid,p_review uuid,p_request uuid,p_snapshot jsonb,p_profile jsonb,p_profile_id uuid,p_profile_sha256 text,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.companies; batch public.fiscal_batches; existing public.fiscal_batches;
  group_data jsonb; scope text; operation uuid; issuer_series text; total_groups integer;
  payload_hash text; existing_operation uuid;
begin
  if p_environment is null or p_environment not in ('homologation','production') or (p_environment='production' and p_review is null) or (p_review is not null and p_snapshot->>'environment' is distinct from p_environment) then raise exception 'Invalid fiscal environment' using errcode='22023';end if;
  select c.* into company from public.companies c join public.tenants t on t.id=c.tenant_id
    where c.id=p_company and t.owner_user_id=p_actor for update of c;
  if company.id is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  payload_hash := encode(sha256(convert_to(jsonb_build_object('snapshot',p_snapshot,'profile',p_profile,'profileId',p_profile_id,'profileHash',p_profile_sha256)::text,'UTF8')),'hex');
  select * into existing from public.fiscal_batches where company_id=company.id and environment=p_environment and
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
      select operation_id into existing_operation from private.fiscal_source_reservations where tenant_id=company.tenant_id and environment=p_environment and scope_sha256=scope;
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
  insert into public.fiscal_batches(tenant_id,company_id,origin,environment,review_id,request_id,snapshot_sha256,created_by)
    values(company.tenant_id,company.id,case when p_review is null then 'standalone' else 'report' end,p_environment,p_review,p_request,payload_hash,p_actor) returning * into batch;
  for group_data in select value from jsonb_array_elements(p_snapshot->'groups') loop
    insert into public.fiscal_operations(tenant_id,company_id,batch_id,environment,profile_id,profile_sha256,profile_snapshot,issuer_cnpj,recipient,intermediary,
      competence_date,commission_type,amount,foreign_amount,dps_series)
      values(company.tenant_id,company.id,batch.id,p_environment,p_profile_id,p_profile_sha256,p_profile,company.cnpj,group_data->'recipient',group_data->'intermediary',
        (p_snapshot->>'competenceDate')::date,p_snapshot->>'commissionType',(group_data->>'amount')::numeric,(group_data->>'foreignAmount')::numeric,issuer_series) returning id into operation;
    insert into private.fiscal_execution(operation_id) values(operation);
    for scope in select jsonb_array_elements_text(group_data->'sourceClaims') loop
      insert into private.fiscal_source_reservations values(company.tenant_id,p_environment,scope,operation);
    end loop;
    insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(company.tenant_id,company.id,p_actor,'fiscal.queued',operation);
  end loop;
  return jsonb_build_object('id',batch.id,'duplicate',false);
end $$;


create or replace function private.enqueue_fiscal(p_actor uuid,p_company uuid,p_review uuid,p_request uuid,p_snapshot jsonb,p_profile jsonb,p_profile_id uuid,p_profile_sha256 text)
returns jsonb language sql security definer set search_path='' as $$
 select private.enqueue_fiscal_environment(p_actor,p_company,p_review,p_request,p_snapshot,p_profile,p_profile_id,p_profile_sha256,'homologation');
$$;
create function public.enqueue_report_fiscal_production(p_actor uuid,p_review uuid,p_sha256 text,p_request uuid,p_delivery_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.report_reviews;p public.company_fiscal_profiles;result jsonb;c public.companies;
begin
 select x.* into r from public.report_reviews x join public.tenants t on t.id=x.tenant_id where x.id=p_review and t.owner_user_id=p_actor and x.snapshot_sha256=p_sha256;
 if r.id is null then raise exception 'Review unavailable' using errcode='42501';end if;
 select * into c from public.companies where id=r.company_id for update;
 if c.tax_regime<>'mei' or r.snapshot->>'environment' is distinct from 'production' or p_delivery_confirmed is distinct from true or not private.production_company_ready(c.id) then raise exception 'Production prerequisites missing' using errcode='55000';end if;
 perform public.confirm_report_review(p_actor,p_review,p_sha256);
 select * into p from public.company_fiscal_profiles where id=r.profile_id;
 if p.id<>(select id from public.company_fiscal_profiles where company_id=c.id order by version desc limit 1) then raise exception 'Profile changed' using errcode='40001';end if;
 result:=private.enqueue_fiscal_environment(p_actor,c.id,r.id,p_request,r.snapshot,p.configuration,p.id,p.configuration_sha256,'production');
 insert into private.production_batch_approvals(batch_id,tenant_id,review_sha256,confirmed_by,email_confirmed)
 values((result->>'id')::uuid,c.tenant_id,p_sha256,p_actor,true) on conflict(batch_id) do nothing;
 if not exists(select 1 from private.production_batch_approvals where batch_id=(result->>'id')::uuid and tenant_id=c.tenant_id and review_sha256=p_sha256 and confirmed_by=p_actor and email_confirmed) then raise exception 'Production confirmation changed' using errcode='40001';end if;
 -- Enrollment and real fiscal consent commit together, before any cron worker can claim the batch.
 perform public.enable_invoice_email(p_actor,(result->>'id')::uuid);
 insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(c.tenant_id,c.id,p_actor,'fiscal.production_report_confirmed',(result->>'id')::uuid);
 return result;
end $$;


create or replace function private.fiscal_operation_current(p_operation uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select (o.environment='homologation' or (o.environment='production' and b.origin='report' and private.production_company_ready(c.id) and exists(select 1 from private.production_batch_approvals a where a.batch_id=b.id and a.tenant_id=o.tenant_id and a.review_sha256=r.snapshot_sha256 and a.email_confirmed))) and c.cnpj=o.issuer_cnpj and p.configuration_sha256=o.profile_sha256 and
    p.configuration->>'simplesOption'=(case c.tax_regime when 'mei' then '2' else '3' end) and
    p.id=(select id from public.company_fiscal_profiles where company_id=c.id order by version desc limit 1) and
    (b.origin='standalone' or (b.review_id=(select id from public.report_reviews where import_id=r.import_id order by version desc limit 1) and
      exists(select 1 from public.review_confirmations where review_id=r.id and snapshot_sha256=r.snapshot_sha256)))
  from public.fiscal_operations o join public.companies c on c.id=o.company_id join public.fiscal_batches b on b.id=o.batch_id
    join public.company_fiscal_profiles p on p.id=o.profile_id left join public.report_reviews r on r.id=b.review_id where o.id=p_operation),false);
$$;

create function private.claim_fiscal_environment(p_tenant uuid,p_limit integer,p_reconcile_only boolean,p_environment text) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare item record; operation public.fiscal_operations; token uuid; emitted integer:=0;
begin
  if p_environment is null or p_environment not in ('homologation','production') then raise exception 'Invalid environment' using errcode='22023';end if;
  if p_limit is null or p_limit not between 1 and 3 then raise exception 'Claim limit' using errcode='22023'; end if;
  for item in select o.id,o.status from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where (p_tenant is null or o.tenant_id=p_tenant) and o.environment=p_environment and o.status in ('preparing','sending','reconciling') and e.lease_until<clock_timestamp()
    for update of o skip locked loop
    update public.fiscal_operations set status=case when item.status='preparing' then 'queued' else 'uncertain' end,
      reason='worker_interrupted',next_run_at=now(),updated_at=now() where id=item.id;
    update private.fiscal_execution set lease_token=null,lease_until=null where operation_id=item.id;
  end loop;
  for operation in select * from public.fiscal_operations where (p_tenant is null or tenant_id=p_tenant) and environment=p_environment and transmit_count=0 and
    status in ('queued','blocked') and next_run_at<=now() and not private.fiscal_operation_current(id) limit 500 for update skip locked loop
    update public.fiscal_operations set status='blocked',reason='configuration_changed',next_run_at=now()+interval '1 day',updated_at=now() where id=operation.id;
  end loop;
  for operation in select * from public.fiscal_operations where (p_tenant is null or tenant_id=p_tenant) and environment=p_environment and
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


create or replace function public.claim_fiscal_jobs(p_tenant uuid default null,p_limit integer default 1,p_reconcile_only boolean default false) returns setof jsonb language sql security definer set search_path='' as $$
 select * from private.claim_fiscal_environment(p_tenant,p_limit,p_reconcile_only,'homologation');
$$;
create function public.claim_fiscal_jobs_for_environment(p_environment text,p_tenant uuid default null,p_limit integer default 1,p_reconcile_only boolean default false) returns setof jsonb language sql security definer set search_path='' as $$
 select * from private.claim_fiscal_environment(p_tenant,p_limit,p_reconcile_only,p_environment);
$$;


create function public.block_fiscal_environment_dependencies(p_environment text,p_tenant uuid,p_company uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_environment is null or p_environment not in ('homologation','production') then raise exception 'Invalid environment' using errcode='22023';end if;
  if p_reason not in ('transmission_disabled','contract_missing','certificate_missing') then raise exception 'Invalid dependency' using errcode='22023'; end if;
  update public.fiscal_operations set status='blocked',reason=p_reason,next_run_at=now()+interval '1 day',updated_at=now()
    where environment=p_environment and transmit_count=0 and status in ('queued','blocked') and (p_tenant is null or tenant_id=p_tenant) and (p_company is null or company_id=p_company);
end $$;


create or replace function public.block_fiscal_dependencies(p_tenant uuid,p_company uuid,p_reason text) returns void language sql security definer set search_path='' as $$
 select public.block_fiscal_environment_dependencies('homologation',p_tenant,p_company,p_reason);
$$;


create or replace function public.release_fiscal_preparation(p_operation uuid,p_token uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
  if p_reason not in ('transmission_disabled','contract_missing','certificate_missing','certificate_unavailable','invalid_xml','configuration_changed','preparation_failed','preparation_retry','source_duplicate','identity_in_use','production_not_ready') then raise exception 'Invalid reason' using errcode='22023'; end if;
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.status='preparing' and o.transmit_count=0 and e.lease_token=p_token and e.lease_until>clock_timestamp() for update of o;
  if operation.id is null then return false; end if;
  update public.fiscal_operations set status=case when p_reason in ('invalid_xml','preparation_failed','source_duplicate','identity_in_use') then 'intervention' when p_reason='preparation_retry' then 'queued' else 'blocked' end,
    reason=p_reason,next_run_at=now()+case when p_reason='preparation_retry' then interval '30 seconds' else interval '1 day' end,updated_at=now(),
    prepare_attempts=case when p_reason in ('transmission_disabled','contract_missing','certificate_missing') then greatest(prepare_attempts-1,0) else prepare_attempts end where id=operation.id;
  update private.fiscal_execution set lease_token=null,lease_until=null where operation_id=operation.id;
  return true;
end $$;

create or replace function public.reserve_fiscal_identity(p_operation uuid,p_token uuid,p_certificate uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations; scope text; municipality_code text; allocated numeric;
begin
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.status='preparing' and o.transmit_count=0 and e.lease_token=p_token and e.lease_until>clock_timestamp() for update of o;
  if operation.id is null or not private.fiscal_operation_current(operation.id) then return null; end if;
  if not exists(select 1 from public.company_certificates c where c.id=p_certificate and c.tenant_id=operation.tenant_id and
    c.company_id=operation.company_id and c.subject_cnpj=operation.issuer_cnpj and c.status='active' and c.valid_from<=now() and c.valid_until>now()) then return null; end if;
  if not exists(select 1 from public.fiscal_access_checks where certificate_id=p_certificate and company_id=operation.company_id and
    environment=operation.environment and outcome='response_received' and http_status in (200,404) and created_at>now()-interval '1 day') then return null; end if;
  -- Only a verified A1 holder can touch the cross-tenant namespace for this legal issuer.
  perform pg_advisory_xact_lock(hashtextextended('nfse:'||operation.environment||':'||operation.issuer_cnpj,0));
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

create function public.record_fiscal_environment_transport(p_operation uuid,p_token uuid,p_certificate uuid,p_http integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
  if p_http is null or p_http not in (200,404) then return false;end if;
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.status='preparing' and e.lease_token=p_token and e.lease_until>clock_timestamp();
  if operation.id is null or not exists(select 1 from public.company_certificates where id=p_certificate and tenant_id=operation.tenant_id and
    company_id=operation.company_id and subject_cnpj=operation.issuer_cnpj and status='active' and valid_from<=now() and valid_until>now()) then return false; end if;
  insert into public.fiscal_access_checks(tenant_id,company_id,certificate_id,environment,http_status,outcome)
    values(operation.tenant_id,operation.company_id,p_certificate,operation.environment,p_http,'response_received');
  return true;
end $$;


create or replace function public.record_fiscal_transport(p_operation uuid,p_token uuid,p_certificate uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.fiscal_operations where id=p_operation and environment='homologation') then return false;end if;
 return public.record_fiscal_environment_transport(p_operation,p_token,p_certificate,200);
end $$;


create function private.claim_invoice_email_environment(p_environment text,p_tenant uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries; claim uuid; result jsonb;
begin
 if p_environment is null or p_environment not in ('homologation','production') then raise exception 'Invalid email environment' using errcode='22023';end if;
 perform private.seed_invoice_emails(p_tenant);
 update public.invoice_email_deliveries e set status=case when x.started_at is null then 'queued' else 'uncertain' end,
 reason=case when x.started_at is null then null else 'network_uncertain' end,updated_at=now()
 from private.invoice_email_execution x where x.delivery_id=e.id and e.status='processing' and x.lease_until<=now() and (p_tenant is null or e.tenant_id=p_tenant);
 select e.* into j from public.invoice_email_deliveries e join public.fiscal_operations o on o.id=e.operation_id
 where e.status='queued' and e.next_run_at<=now() and e.attempts<6 and o.status='authorized' and o.environment=p_environment and (p_tenant is null or e.tenant_id=p_tenant)
 order by e.next_run_at,e.id for update of e skip locked limit 1;
 if j.id is null then return null; end if;
 claim:=gen_random_uuid();
 update public.invoice_email_deliveries set status='processing',reason=null,updated_at=now() where id=j.id;
 update private.invoice_email_execution set token=claim,lease_until=now()+interval '60 seconds',started_at=null where delivery_id=j.id;
 select jsonb_build_object('id',j.id,'token',claim,'documentId',j.document_id,'companyId',j.company_id,'operationId',j.operation_id,'actorId',(select owner_user_id from public.tenants where id=j.tenant_id),'tenantId',j.tenant_id,'destinationOverride',j.destination,
 'environment',d.environment,'accessKey',d.access_key,'xmlSha256',d.xml_sha256,'xml',x.xml,
 'issuer',c.legal_name,'issuerCnpj',c.cnpj,'recipient',o.recipient,'competence',o.competence_date,'amount',o.amount::text,
 'origin',b.origin,'reportHash',r.file_sha256,'report',r.parsed_payload,
 'group',(select g from jsonb_array_elements(rr.snapshot->'groups') g
 where array(select jsonb_array_elements_text(g->'sourceClaims') order by 1)=
 array(select s.scope_sha256 from private.fiscal_source_reservations s where s.operation_id=o.id order by 1) limit 1)) into result
 from public.fiscal_documents d join private.fiscal_document_contents x on x.document_id=d.id
 join public.fiscal_operations o on o.id=d.operation_id join public.companies c on c.id=o.company_id
 join public.fiscal_batches b on b.id=o.batch_id left join public.report_reviews rr on rr.id=b.review_id
 left join public.report_imports r on r.id=rr.import_id where d.id=j.document_id and d.tenant_id=j.tenant_id;
 return result;
end $$;


create or replace function public.claim_invoice_email(p_tenant uuid default null) returns jsonb language sql security definer set search_path='' as $$
 select private.claim_invoice_email_environment('homologation',p_tenant);
$$;
create function public.claim_invoice_email_for_environment(p_environment text,p_tenant uuid default null) returns jsonb language sql security definer set search_path='' as $$
 select private.claim_invoice_email_environment(p_environment,p_tenant);
$$;


create or replace function private.begin_invoice_email_before_provider_tests(p_delivery uuid,p_token uuid,p_providers text[],p_destination text,p_sender text,p_test boolean,p_payload_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries; p text; position integer; state private.invoice_email_providers; cap integer; used integer; wait_until timestamptz; earliest timestamptz; release_at timestamptz;
begin
 if p_destination is null or length(p_destination)>254 or p_destination !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$' or
 p_sender is null or length(p_sender)>254 or p_sender !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$' or
 p_payload_sha256 is null or p_payload_sha256 !~ '^[a-f0-9]{64}$' or p_test is null then
 -- Every intent must match its persisted document environment.
 raise exception 'Invalid email intent or environment' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(170017);
 if exists(select 1 from public.invoice_email_deliveries e join private.invoice_email_execution x on x.delivery_id=e.id join public.fiscal_operations o on o.id=e.operation_id
 where e.id=p_delivery and x.token=p_token and x.lease_until>now() and x.started_at is null and e.status='processing' and p_test is distinct from (o.environment='homologation')) then
 raise exception 'Email environment mismatch' using errcode='22023';end if;
 select e.* into j from public.invoice_email_deliveries e join private.invoice_email_execution x on x.delivery_id=e.id
 join public.fiscal_operations o on o.id=e.operation_id where e.id=p_delivery and x.token=p_token and x.lease_until>now()
 and x.started_at is null and e.status='processing' and o.status='authorized' and p_test=(o.environment='homologation') and (o.environment='homologation' or exists(select 1 from private.production_batch_approvals a where a.batch_id=o.batch_id and a.tenant_id=o.tenant_id and a.email_confirmed)) and e.attempts<6 for update of e;
 if j.id is null then return null; end if;
 if exists(select 1 from private.invoice_email_execution x join public.invoice_email_deliveries e on e.id=x.delivery_id where e.id<>j.id and e.status='processing' and x.started_at is not null and x.lease_until>now()) then
  update public.invoice_email_deliveries set status='queued',next_run_at=now()+interval '2 seconds' where id=j.id;
  update private.invoice_email_execution set token=null,lease_until=null where delivery_id=j.id;
  return jsonb_build_object('waiting',true);
 end if;
 for p,position in select v,n::integer from unnest(array['brevo','sendpulse','mailjet']) with ordinality a(v,n) loop
  if position<=j.provider_cursor or not(p=any(coalesce(p_providers,array[]::text[]))) then continue; end if;
  select * into state from private.invoice_email_providers where provider=p for update;
  if state.paused_until>now() then earliest:=least(coalesce(earliest,state.paused_until),state.paused_until); continue; end if;
  cap:=case p when 'brevo' then 300 when 'sendpulse' then 400 else 200 end;
  -- A rolling 24h cap is stricter than a calendar-day cap, across ALL tenants sharing credentials.
  select count(*) into used from private.invoice_email_attempts where provider=p and started_at>now()-interval '24 hours';
  if used>=cap then
   select min(started_at)+interval '24 hours' into release_at from private.invoice_email_attempts where provider=p and started_at>now()-interval '24 hours';
   earliest:=least(coalesce(earliest,release_at),release_at);continue;end if;
  wait_until:=greatest(state.next_allowed_at,state.busy_until);
  if wait_until>now() then
   update public.invoice_email_deliveries set status='queued',next_run_at=wait_until,updated_at=now() where id=j.id;
   update private.invoice_email_execution set token=null,lease_until=null where delivery_id=j.id;
   return jsonb_build_object('waiting',true);
  end if;
  insert into private.invoice_email_attempts(delivery_id,provider) values(j.id,p);
  update private.invoice_email_providers set next_allowed_at=now()+make_interval(secs=>case p when 'sendpulse' then 75 else 1 end),busy_until=now()+interval '60 seconds' where provider=p;
  update public.invoice_email_deliveries set provider=p,provider_cursor=position,attempts=attempts+1,test_mode=p_test,updated_at=now() where id=j.id;
  update private.invoice_email_execution set started_at=now(),sender=p_sender,actual_destination=p_destination,payload_sha256=p_payload_sha256 where delivery_id=j.id;
  return jsonb_build_object('provider',p);
 end loop;
 update public.invoice_email_deliveries set status='queued',provider_cursor=0,next_run_at=greatest(now()+interval '1 second',coalesce(earliest,now()+interval '5 minutes')),reason='provider_quota',updated_at=now() where id=j.id;
 update private.invoice_email_execution set token=null,lease_until=null where delivery_id=j.id;
 return jsonb_build_object('waiting',true);
end $$;

create or replace function public.retry_invoice_email(p_actor uuid,p_delivery uuid,p_email text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries;
begin
 select e.* into j from public.invoice_email_deliveries e join public.tenants t on t.id=e.tenant_id where e.id=p_delivery and t.owner_user_id=p_actor for update of e;
 if j.id is null then raise exception 'Delivery unavailable' using errcode='42501'; end if;
 if j.status not in ('failed','blocked') or j.attempts>=6 or not private.take_limit(j.tenant_id,'retry_invoice_email',10) then return false; end if;
 if p_email is not null and (j.status<>'blocked' or j.reason<>'invalid_email' or length(p_email)>254 or p_email !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$') then raise exception 'Invalid email correction' using errcode='22023'; end if;
 update public.invoice_email_deliveries set status='queued',reason=null,provider_cursor=0,destination=coalesce(p_email,destination),next_run_at=now(),updated_at=now() where id=j.id;
 update private.invoice_email_execution set document_attempts=0 where delivery_id=j.id;
 insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(j.tenant_id,j.company_id,p_actor,'email.retry_requested',j.id);
 return true;
end $$;


create function public.release_invoice_document_preparation(p_delivery uuid,p_token uuid,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries;tries integer;
begin
 if p_reason is null or p_reason not in ('danfse_unavailable','preparation_retry') then raise exception 'Invalid preparation reason' using errcode='22023';end if;
 select e.* into j from public.invoice_email_deliveries e join private.invoice_email_execution x on x.delivery_id=e.id
 where e.id=p_delivery and e.status='processing' and x.token=p_token and x.lease_until>now() and x.started_at is null for update of e;
 if j.id is null then return false;end if;
 update private.invoice_email_execution set token=null,lease_until=null,document_attempts=least(12,document_attempts+case when p_reason='danfse_unavailable' then 1 else 0 end) where delivery_id=j.id returning document_attempts into tries;
 update public.invoice_email_deliveries set status=case when tries>=12 then 'blocked' else 'queued' end,reason=case when p_reason='danfse_unavailable' then p_reason else null end,next_run_at=now()+interval '30 seconds',updated_at=now() where id=j.id;
 return true;
end $$;
create function public.fiscal_production_schema_ready() returns boolean language sql stable security definer set search_path='' as $$ select true; $$;
revoke all on function private.enqueue_fiscal_environment(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text,text),private.enqueue_fiscal(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text),
 private.claim_fiscal_environment(uuid,integer,boolean,text),private.claim_invoice_email_environment(text,uuid),private.begin_invoice_email_before_provider_tests(uuid,uuid,text[],text,text,boolean,text) from public,anon,authenticated,service_role;
revoke all on function public.production_report_status(uuid),public.reserve_production_check(uuid,uuid),public.record_production_readiness(uuid,uuid,uuid,text,text,integer),
 public.danfse_contract(text),public.fiscal_contract_record(text),public.store_official_danfse_contract(text,text,text,jsonb),public.danfse_document_source(uuid,uuid),public.store_fiscal_danfse(uuid,uuid,text,text,text,text),
 public.enqueue_report_fiscal_production(uuid,uuid,text,uuid,boolean),public.claim_fiscal_jobs_for_environment(text,uuid,integer,boolean),public.block_fiscal_environment_dependencies(text,uuid,uuid,text),
 public.record_fiscal_environment_transport(uuid,uuid,uuid,integer),public.claim_invoice_email_for_environment(text,uuid),public.release_invoice_document_preparation(uuid,uuid,text),public.fiscal_production_schema_ready() from public,anon,authenticated;
 grant execute on function public.production_report_status(uuid),public.fiscal_production_schema_ready() to authenticated;
 grant execute on function public.reserve_production_check(uuid,uuid),public.record_production_readiness(uuid,uuid,uuid,text,text,integer),public.danfse_contract(text),public.fiscal_contract_record(text),public.store_official_danfse_contract(text,text,text,jsonb),
 public.danfse_document_source(uuid,uuid),public.store_fiscal_danfse(uuid,uuid,text,text,text,text),public.enqueue_report_fiscal_production(uuid,uuid,text,uuid,boolean),
 public.claim_fiscal_jobs_for_environment(text,uuid,integer,boolean),public.block_fiscal_environment_dependencies(text,uuid,uuid,text),public.record_fiscal_environment_transport(uuid,uuid,uuid,integer),
 public.claim_invoice_email_for_environment(text,uuid),public.release_invoice_document_preparation(uuid,uuid,text),public.fiscal_production_schema_ready() to service_role;
create or replace function private.seed_invoice_emails(p_tenant uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.invoice_email_deliveries(document_id,tenant_id,company_id,operation_id,test_mode)
 select d.id,d.tenant_id,d.company_id,o.id,(d.environment='homologation') from public.fiscal_documents d
 join public.fiscal_operations o on o.id=d.operation_id and o.tenant_id=d.tenant_id and o.company_id=d.company_id
 join public.invoice_email_batches b on b.batch_id=o.batch_id and b.tenant_id=o.tenant_id
 where o.status='authorized' and (p_tenant is null or d.tenant_id=p_tenant)
 and not exists(select 1 from public.invoice_email_deliveries e where e.document_id=d.id)
 order by d.created_at limit 500 on conflict(document_id) do nothing;
 insert into private.invoice_email_execution(delivery_id) select e.id from public.invoice_email_deliveries e
 where (p_tenant is null or e.tenant_id=p_tenant) and not exists(select 1 from private.invoice_email_execution x where x.delivery_id=e.id)
 on conflict(delivery_id) do nothing;
end $$;
create or replace function public.save_report_review(p_actor uuid,p_import uuid,p_profile uuid,p_expected_version integer,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare report public.report_imports; company public.companies; profile public.company_fiscal_profiles;
  previous public.report_reviews; saved public.report_reviews; snapshot_hash text;
  rows_total integer; rows_distinct integer; claims_total integer; claims_distinct integer; monetary numeric;
begin
  select r.* into report from public.report_imports r join public.tenants t on t.id=r.tenant_id
    where r.id=p_import and t.owner_user_id=p_actor;
  if report.id is null then raise exception 'Import unavailable' using errcode='42501'; end if;
  select * into company from public.companies where id=report.company_id and tenant_id=report.tenant_id for update;
  select * into report from public.report_imports where id=report.id for update;
  select * into profile from public.company_fiscal_profiles where company_id=company.id and tenant_id=report.tenant_id order by version desc limit 1;
  if profile.id is null or profile.id is distinct from p_profile or report.status <> 'parsed' then
    raise exception 'Current fiscal data unavailable' using errcode='40001';
  end if;
  if profile.configuration->>'simplesOption' is distinct from (case company.tax_regime when 'mei' then '2' else '3' end) then
    raise exception 'Company regime changed' using errcode='40001';
  end if;
  select * into previous from public.report_reviews where import_id=report.id order by version desc limit 1;
  if p_expected_version is null or p_expected_version <> coalesce(previous.version,0) then
    raise exception 'Review changed' using errcode='40001';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object' or
    p_snapshot->>'contractVersion' is distinct from '1' or (p_snapshot->>'environment' is null or p_snapshot->>'environment' not in ('homologation','production')) or
    p_snapshot->>'companyId' is distinct from company.id::text or p_snapshot->>'issuerCnpj' is distinct from company.cnpj or
    p_snapshot->>'importId' is distinct from report.id::text or p_snapshot->>'fileSha256' is distinct from report.file_sha256 or
    p_snapshot->>'profileId' is distinct from profile.id::text or p_snapshot->>'profileSha256' is distinct from profile.configuration_sha256 or
    p_snapshot->>'profileVersion' is distinct from profile.version::text or p_snapshot->'sourceRows' is distinct from to_jsonb(report.row_count) or
    p_snapshot->>'currency' is distinct from 'BRL' or p_snapshot->'recipientRoleConfirmed' is distinct from 'true'::jsonb or
    jsonb_typeof(p_snapshot->'groups') is distinct from 'array' then
    raise exception 'Invalid review binding' using errcode='22023';
  end if;
  if p_snapshot->>'competenceDate' is null or not (p_snapshot->>'competenceDate' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$') or
    p_snapshot->>'recipientChoice' is null or p_snapshot->>'recipientChoice' not in ('reported_sellers','single_recipient') or
    p_snapshot->>'grouping' is null or p_snapshot->>'grouping' not in ('per_row','same_recipient') or
    p_snapshot->>'commissionType' is null or length(p_snapshot->>'commissionType') not between 1 and 120 or
    p_snapshot->>'evidenceReference' is null or length(p_snapshot->>'evidenceReference') not between 3 and 500 then
    raise exception 'Review confirmation missing' using errcode='22023';
  end if;
  if (p_snapshot->>'competenceDate')::date < profile.valid_from or (p_snapshot->>'competenceDate')::date >= date '2027-01-01' then
    raise exception 'Fiscal profile outside competence' using errcode='22023';
  end if;
  if jsonb_array_length(p_snapshot->'groups') not between 1 and 500 or report.row_count not between 1 and 500 then
    raise exception 'Review limit' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g where
    jsonb_typeof(g->'sourceRows') is distinct from 'array' or jsonb_typeof(g->'sourceClaims') is distinct from 'array' or jsonb_typeof(g->'allocations') is distinct from 'array' or
    jsonb_typeof(g->'recipient') is distinct from 'object' or jsonb_typeof(g->'amount') is distinct from 'string' or
    not (g->>'amount' ~ '^(0|[1-9][0-9]{0,14})\.[0-9]{2}$')) then
    raise exception 'Invalid review group' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g where
    jsonb_array_length(g->'sourceRows') < 1 or jsonb_array_length(g->'sourceRows') <> jsonb_array_length(g->'sourceClaims') or
    jsonb_array_length(g->'sourceRows') <> jsonb_array_length(g->'allocations') or (g->>'amount')::numeric <= 0) then
    raise exception 'Invalid review group' using errcode='22023';
  end if;
  select count(*),count(distinct r.value) into rows_total,rows_distinct from jsonb_array_elements(p_snapshot->'groups') g
    cross join lateral jsonb_array_elements(g->'sourceRows') r;
  select count(*),count(distinct c.value) into claims_total,claims_distinct from jsonb_array_elements(p_snapshot->'groups') g
    cross join lateral jsonb_array_elements(g->'sourceClaims') c;
  if rows_total <> report.row_count or rows_distinct <> report.row_count or claims_total <> report.row_count or claims_distinct <> report.row_count or
    exists(select r.value from jsonb_array_elements(p_snapshot->'groups') g cross join lateral jsonb_array_elements(g->'sourceRows') r
      except select r#>'{location,row}' from jsonb_array_elements(report.parsed_payload#>'{review,rows}') r) or
    exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g cross join lateral jsonb_array_elements(g->'sourceClaims') c
      where jsonb_typeof(c.value) <> 'string' or not (c.value#>>'{}' ~ '^[0-9a-f]{64}$')) then
    raise exception 'Review coverage mismatch' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(report.parsed_payload#>'{review,rows}') r where
    r->>'currency' is distinct from 'BRL' or jsonb_typeof(r->'amount') is distinct from 'string' or
    not (r->>'amount' ~ '^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$')) then
    raise exception 'Unsupported source amount' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(report.parsed_payload#>'{review,rows}') r where (r->>'amount')::numeric <= 0) or
    exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g where (g->>'amount')::numeric <>
      (select sum((r->>'amount')::numeric) from jsonb_array_elements(report.parsed_payload#>'{review,rows}') r
        where r#>'{location,row}' in (select value from jsonb_array_elements(g->'sourceRows')))) then
    raise exception 'Review does not preserve source amounts' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g cross join lateral jsonb_array_elements(g->'allocations') a where
    not (a->'row' in(select value from jsonb_array_elements(g->'sourceRows'))) or jsonb_typeof(a->'amount') is distinct from 'string' or
    not (a->>'amount' ~ '^(0|[1-9][0-9]{0,14})\.[0-9]{2}$') or
    (a ? 'foreignAmount' and (jsonb_typeof(a->'foreignAmount') is distinct from 'string' or not (a->>'foreignAmount' ~ '^(0|[1-9][0-9]{0,14})\.[0-9]{2}$'))) or
    (g ? 'foreignAmount') is distinct from (a ? 'foreignAmount')) or
    exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g where
      (select count(distinct a->'row') from jsonb_array_elements(g->'allocations') a) <> jsonb_array_length(g->'sourceRows') or
      (g ? 'foreignAmount' and (jsonb_typeof(g->'foreignAmount') is distinct from 'string' or not (g->>'foreignAmount' ~ '^(0|[1-9][0-9]{0,14})\.[0-9]{2}$')))) then
    raise exception 'Invalid review allocations' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g cross join lateral jsonb_array_elements(g->'allocations') a where
    (a->>'amount')::numeric <> (select (r->>'amount')::numeric from jsonb_array_elements(report.parsed_payload#>'{review,rows}') r where r#>'{location,row}'=a->'row') or
    (a ? 'foreignAmount' and (a->>'foreignAmount')::numeric <= 0)) or
    exists(select 1 from jsonb_array_elements(p_snapshot->'groups') g where g ? 'foreignAmount' and (g->>'foreignAmount')::numeric <>
      (select sum((a->>'foreignAmount')::numeric) from jsonb_array_elements(g->'allocations') a)) then
    raise exception 'Review allocation mismatch' using errcode='22023';
  end if;
  select sum((g->>'amount')::numeric) into monetary from jsonb_array_elements(p_snapshot->'groups') g;
  if p_snapshot->>'total' is null or not (p_snapshot->>'total' ~ '^(0|[1-9][0-9]{0,17})\.[0-9]{2}$') or (p_snapshot->>'total')::numeric <> monetary then
    raise exception 'Review total mismatch' using errcode='22023';
  end if;
  snapshot_hash := encode(sha256(convert_to(p_snapshot::text,'UTF8')),'hex');
  if previous.snapshot_sha256=snapshot_hash then
    return jsonb_build_object('id',previous.id,'version',previous.version,'sha256',snapshot_hash,'unchanged',true);
  end if;
  if not private.take_limit(report.tenant_id,'prepare_review',10) then raise exception 'Review operation limit' using errcode='P0001'; end if;
  insert into public.report_reviews(tenant_id,company_id,import_id,profile_id,version,snapshot,snapshot_sha256,created_by)
    values(report.tenant_id,company.id,report.id,profile.id,coalesce(previous.version,0)+1,p_snapshot,snapshot_hash,p_actor) returning * into saved;
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(report.tenant_id,company.id,p_actor,'report_review.prepared',saved.id);
  return jsonb_build_object('id',saved.id,'version',saved.version,'sha256',snapshot_hash,'unchanged',false);
end $$;
-- Local inspection of original production snapshots follows the same owner/quota policy as homologation.
create or replace function public.fiscal_xml_snapshot_for_diagnostic(p_actor uuid,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
 select o.* into operation from public.fiscal_operations o join public.tenants t on t.id=o.tenant_id
 where o.id=p_operation and t.owner_user_id=p_actor and o.environment in ('homologation','production') and o.transmit_count=1;
 if operation.id is null then return null;end if;
 if not private.take_limit(operation.tenant_id,'fiscal_xml_diagnostic',10) then return null;end if;
 return (select jsonb_build_object('xml',signed_dps_xml,'sha256',dps_sha256,'id',operation.dps_id,'certificatePem',holder_certificate_pem)
 from private.fiscal_execution where operation_id=operation.id and signed_dps_xml is not null);
end $$;
commit;
