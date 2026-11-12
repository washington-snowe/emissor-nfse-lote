begin;

create table public.report_reviews (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, import_id uuid not null,
  profile_id uuid not null, version integer not null check(version > 0), snapshot jsonb not null,
  snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  foreign key(tenant_id,company_id,import_id) references public.report_imports(tenant_id,company_id,id) on delete restrict,
  foreign key(tenant_id,company_id,profile_id) references public.company_fiscal_profiles(tenant_id,company_id,id) on delete restrict,
  unique(tenant_id,company_id,id), unique(import_id,version),
  check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=4000000)
);
create table public.review_confirmations (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,review_id uuid not null unique,
  snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  confirmed_by uuid not null references auth.users(id) on delete restrict,confirmed_at timestamptz not null default now(),
  foreign key(tenant_id,company_id,review_id) references public.report_reviews(tenant_id,company_id,id) on delete restrict
);
alter table public.report_reviews enable row level security;
alter table public.report_reviews force row level security;
alter table public.review_confirmations enable row level security;
alter table public.review_confirmations force row level security;
revoke all on public.report_reviews,public.review_confirmations from public,anon,authenticated,service_role;
grant select on public.report_reviews,public.review_confirmations to authenticated;
create policy report_review_owner on public.report_reviews for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create policy review_confirmation_owner on public.review_confirmations for select to authenticated using(tenant_id=(select public.current_tenant_id()));

create function public.save_report_review(p_actor uuid,p_import uuid,p_profile uuid,p_expected_version integer,p_snapshot jsonb)
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
    p_snapshot->>'contractVersion' is distinct from '1' or p_snapshot->>'environment' is distinct from 'homologation' or
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

create function public.confirm_report_review(p_actor uuid,p_review uuid,p_expected_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare review public.report_reviews; report public.report_imports; company public.companies; latest_profile uuid;
  latest_review uuid; confirmation uuid;
begin
  select r.* into review from public.report_reviews r join public.tenants t on t.id=r.tenant_id
    where r.id=p_review and t.owner_user_id=p_actor and r.snapshot_sha256=p_expected_sha256;
  if review.id is null then raise exception 'Review unavailable' using errcode='42501'; end if;
  select * into company from public.companies where id=review.company_id and tenant_id=review.tenant_id for update;
  select * into report from public.report_imports where id=review.import_id and tenant_id=review.tenant_id for update;
  select id into latest_profile from public.company_fiscal_profiles where company_id=company.id and tenant_id=company.tenant_id order by version desc limit 1;
  select id into latest_review from public.report_reviews where import_id=report.id order by version desc limit 1;
  if latest_profile is distinct from review.profile_id or latest_review is distinct from review.id or report.status <> 'parsed' or
     report.file_sha256 is distinct from review.snapshot->>'fileSha256' or company.cnpj is distinct from review.snapshot->>'issuerCnpj' or
     (select configuration->>'simplesOption' from public.company_fiscal_profiles where id=latest_profile) is distinct from
      (case company.tax_regime when 'mei' then '2' else '3' end) then
    raise exception 'Review data changed' using errcode='40001';
  end if;
  select id into confirmation from public.review_confirmations where review_id=review.id;
  if confirmation is not null then return confirmation; end if;
  insert into public.review_confirmations(tenant_id,company_id,review_id,snapshot_sha256,confirmed_by)
    values(review.tenant_id,company.id,review.id,review.snapshot_sha256,p_actor) returning id into confirmation;
  insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id)
    values(review.tenant_id,company.id,p_actor,'report_review.confirmed',review.id);
  return confirmation;
end $$;
revoke all on function public.save_report_review(uuid,uuid,uuid,integer,jsonb),public.confirm_report_review(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_report_review(uuid,uuid,uuid,integer,jsonb),public.confirm_report_review(uuid,uuid,text) to service_role;
commit;
