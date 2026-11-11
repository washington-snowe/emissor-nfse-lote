begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.operation_limits (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  operation text not null,
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 100),
  primary key (tenant_id, operation)
);

create function private.take_limit(p_tenant uuid, p_operation text, p_max integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  insert into private.operation_limits as limits(tenant_id,operation,window_start,requests)
    values(p_tenant,p_operation,clock_timestamp(),1)
    on conflict(tenant_id,operation) do update set
      window_start=case when limits.window_start <= clock_timestamp()-interval '10 minutes' then clock_timestamp() else limits.window_start end,
      requests=case when limits.window_start <= clock_timestamp()-interval '10 minutes' then 1 else limits.requests+1 end
    where limits.window_start <= clock_timestamp()-interval '10 minutes' or limits.requests < p_max
    returning true into allowed;
  return coalesce(allowed,false);
end $$;
revoke all on function private.take_limit(uuid,text,integer) from public,anon,authenticated,service_role;

create table public.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id uuid,
  actor_id uuid references auth.users(id) on delete restrict,
  event text not null check (length(event) between 1 and 80),
  resource_id uuid,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id) references public.companies(tenant_id,id) on delete restrict
);

create table public.report_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id uuid not null,
  file_name text not null check (length(file_name) between 1 and 200),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer not null check (byte_length between 1 and 524288),
  platform text not null default 'shopee' check (platform='shopee'),
  adapter_id text not null default 'shopee-seller-monthly-csv',
  adapter_version text not null default '1',
  status text not null default 'received' check (status in ('received','parsed','invalid')),
  parsed_payload jsonb,
  row_count integer check (row_count between 1 and 10000),
  last_error_code text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key(tenant_id,company_id) references public.companies(tenant_id,id) on delete restrict,
  unique(tenant_id,company_id,id),
  unique(tenant_id,company_id,file_sha256),
  check ((status='parsed' and parsed_payload is not null and row_count is not null) or
    (status <> 'parsed' and parsed_payload is null and row_count is null))
);
create index report_imports_owner_created on public.report_imports(tenant_id,created_at desc);

-- Small source files stay private and transactional with their metadata and queue entry.
create table private.report_sources (
  import_id uuid primary key references public.report_imports(id) on delete restrict,
  content bytea not null check (octet_length(content) between 1 and 524288)
);

create table public.work_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  import_id uuid not null,
  kind text not null default 'parse_import' check (kind='parse_import'),
  status text not null default 'pending' check (status in ('pending','leased','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_id,company_id,import_id) references public.report_imports(tenant_id,company_id,id) on delete restrict,
  unique(import_id,kind)
);
create index work_jobs_available on public.work_jobs(status,created_at);

alter table public.report_imports enable row level security;
alter table public.report_imports force row level security;
alter table public.work_jobs enable row level security;
alter table public.work_jobs force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on public.report_imports,public.work_jobs,public.audit_events from public,anon,authenticated,service_role;
grant select on public.report_imports,public.audit_events to authenticated;
grant select(id,tenant_id,company_id,import_id,kind,status,attempts,last_error_code,created_at,updated_at) on public.work_jobs to authenticated;
create policy imports_owner on public.report_imports for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create policy jobs_owner on public.work_jobs for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create policy audit_owner on public.audit_events for select to authenticated using(tenant_id=(select public.current_tenant_id()));

-- Only a trusted server can register bytes; actor is always supplied from auth.getUser().
create function public.register_report(p_actor uuid,p_company uuid,p_file_name text,p_source_base64 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account uuid; source bytea; digest text; existing uuid; new_id uuid;
begin
  select c.tenant_id into account from public.companies c join public.tenants t on t.id=c.tenant_id
    where c.id=p_company and t.owner_user_id=p_actor;
  if account is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  if p_file_name is null or length(p_file_name) not between 1 and 200 or
    p_source_base64 is null or length(p_source_base64)>710000 then
    raise exception 'Invalid file' using errcode='22023';
  end if;
  source := decode(p_source_base64,'base64');
  if octet_length(source) not between 1 and 524288 then raise exception 'Invalid file size' using errcode='22023'; end if;
  digest := encode(sha256(source),'hex');
  perform pg_advisory_xact_lock(hashtextextended(account::text||p_company::text||digest,0));
  select id into existing from public.report_imports where tenant_id=account and company_id=p_company and file_sha256=digest;
  if existing is not null then return jsonb_build_object('id',existing,'duplicate',true); end if;
  if not private.take_limit(account,'register_report',10) then raise exception 'Rate limit' using errcode='P0001'; end if;
  insert into public.report_imports(tenant_id,company_id,file_name,file_sha256,byte_length,created_by)
    values(account,p_company,p_file_name,digest,octet_length(source),p_actor)
    on conflict(tenant_id,company_id,file_sha256) do nothing returning id into new_id;
  if new_id is null then
    select id into existing from public.report_imports where tenant_id=account and company_id=p_company and file_sha256=digest;
    return jsonb_build_object('id',existing,'duplicate',true);
  end if;
  insert into private.report_sources(import_id,content) values(new_id,source);
  insert into public.work_jobs(tenant_id,company_id,import_id) values(account,p_company,new_id);
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(account,p_company,p_actor,'report.registered',new_id);
  return jsonb_build_object('id',new_id,'duplicate',false);
end $$;

create function public.claim_report_jobs(p_tenant uuid default null,p_limit integer default 2)
returns table(job_id uuid,import_id uuid,tenant_id uuid,company_id uuid,lease_token uuid,source_base64 text,file_sha256 text)
language plpgsql security definer set search_path = '' as $$
begin
  update public.work_jobs j set status='failed',last_error_code='attempt_limit',updated_at=now()
    where j.attempts>=5 and (j.status='pending' or (j.status='leased' and j.lease_until<now()))
      and (p_tenant is null or j.tenant_id=p_tenant);
  return query
    with picked as (
      select j.id from public.work_jobs j where j.attempts<5 and
        (j.status='pending' or (j.status='leased' and j.lease_until<now())) and
        (p_tenant is null or j.tenant_id=p_tenant)
      order by j.created_at,j.id for update skip locked limit greatest(1,least(p_limit,5))
    ), leased as (
      update public.work_jobs j set status='leased',lease_token=gen_random_uuid(),
        lease_until=now()+interval '3 minutes',attempts=j.attempts+1,updated_at=now()
        from picked where j.id=picked.id returning j.*
    )
    select j.id,j.import_id,j.tenant_id,j.company_id,j.lease_token,encode(s.content,'base64'),r.file_sha256
      from leased j join private.report_sources s on s.import_id=j.import_id
      join public.report_imports r on r.id=j.import_id;
end $$;

create function public.finish_report_job(p_job uuid,p_token uuid,p_payload jsonb,p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.work_jobs; report public.report_imports; count_rows integer;
begin
  select * into job from public.work_jobs where id=p_job for update;
  if job.id is null or job.status<>'leased' or job.lease_token is distinct from p_token or job.lease_until<now() then return false; end if;
  select * into report from public.report_imports where id=job.import_id for update;
  if p_error is not null then
    if p_error not in ('file_size','invalid_encoding','invalid_csv','unsupported_layout','row_limit','empty_report',
      'invalid_field','invalid_amount','invalid_reference_period','invalid_contract','source_integrity') then
      raise exception 'Invalid error code' using errcode='22023';
    end if;
    update public.report_imports set status='invalid',last_error_code=p_error,processed_at=now() where id=report.id;
  else
    if p_payload is null or octet_length(p_payload::text)>4000000 or
      p_payload#>>'{review,source,fileSha256}' is distinct from report.file_sha256 or
      p_payload#>>'{review,source,adapterId}' is distinct from report.adapter_id or
      p_payload#>>'{review,source,adapterVersion}' is distinct from report.adapter_version or
      p_payload#>>'{review,fiscalStatus}' is distinct from 'not_evaluated' or
      jsonb_typeof(p_payload#>'{review,rows}') is distinct from 'array' or
      jsonb_typeof(p_payload->'reportedSellers') is distinct from 'array' then
      raise exception 'Invalid parsed result' using errcode='22023';
    end if;
    count_rows := jsonb_array_length(p_payload#>'{review,rows}');
    if count_rows not between 1 and 10000 or count_rows<>jsonb_array_length(p_payload->'reportedSellers') then
      raise exception 'Invalid row count' using errcode='22023';
    end if;
    update public.report_imports set status='parsed',parsed_payload=p_payload,row_count=count_rows,
      processed_at=now(),last_error_code=null where id=report.id;
  end if;
  update public.work_jobs set status='completed',lease_until=null,lease_token=null,updated_at=now(),last_error_code=p_error where id=job.id;
  insert into public.audit_events(tenant_id,company_id,event,resource_id)
    values(job.tenant_id,job.company_id,case when p_error is null then 'report.parsed' else 'report.invalid' end,report.id);
  return true;
end $$;

create function public.workflow_capabilities()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('imports',true,'vault',to_regclass('vault.decrypted_secrets') is not null);
$$;

create function public.retry_report_processing(p_actor uuid,p_import uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare report public.report_imports;
begin
  select r.* into report from public.report_imports r join public.tenants t on t.id=r.tenant_id
    where r.id=p_import and t.owner_user_id=p_actor for update of r;
  if report.id is null then raise exception 'Import unavailable' using errcode='42501'; end if;
  if report.status<>'received' then return false; end if;
  if not private.take_limit(report.tenant_id,'retry_report',10) then return false; end if;
  update public.work_jobs set status='pending',attempts=0,lease_token=null,lease_until=null,updated_at=now()
    where import_id=report.id and (status='failed' or (status='leased' and lease_until<now()));
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(report.tenant_id,report.company_id,p_actor,'report.retry_requested',report.id);
  return true;
end $$;

revoke all on function public.register_report(uuid,uuid,text,text),public.claim_report_jobs(uuid,integer),public.finish_report_job(uuid,uuid,jsonb,text),public.workflow_capabilities(),public.retry_report_processing(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.register_report(uuid,uuid,text,text),public.claim_report_jobs(uuid,integer),public.finish_report_job(uuid,uuid,jsonb,text),public.workflow_capabilities(),public.retry_report_processing(uuid,uuid)
  to service_role;

commit;
