begin;
create table public.invoice_email_batches (
 batch_id uuid primary key, tenant_id uuid not null, company_id uuid not null,
 requested_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(tenant_id,company_id,batch_id) references public.fiscal_batches(tenant_id,company_id,id)
);
create table public.invoice_email_deliveries (
 id uuid primary key default gen_random_uuid(), document_id uuid not null unique references public.fiscal_documents(id),
 tenant_id uuid not null, company_id uuid not null, operation_id uuid not null,
 status text not null default 'queued' check(status in ('queued','processing','accepted','failed','blocked','uncertain')),
 destination text, provider text check(provider in ('brevo','sendpulse','mailjet')), provider_id text,
 provider_cursor integer not null default 0 check(provider_cursor between 0 and 3),
 attempts integer not null default 0 check(attempts between 0 and 6), reason text,
 test_mode boolean not null default true, next_run_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(tenant_id,company_id,operation_id) references public.fiscal_operations(tenant_id,company_id,id),
 check(destination is null or length(destination) between 3 and 254),
 check(provider_id is null or length(provider_id) between 1 and 250)
);
create index invoice_email_ready on public.invoice_email_deliveries(status,next_run_at);
create index invoice_email_owner on public.invoice_email_deliveries(tenant_id,operation_id);
create table private.invoice_email_execution (
 delivery_id uuid primary key references public.invoice_email_deliveries(id), token uuid, lease_until timestamptz,
 started_at timestamptz, sender text, actual_destination text, payload_sha256 text
);
create table private.invoice_email_providers (
 provider text primary key check(provider in ('brevo','sendpulse','mailjet')),
 next_allowed_at timestamptz not null default now(), busy_until timestamptz not null default now(), paused_until timestamptz not null default now()
);
insert into private.invoice_email_providers(provider) values('brevo'),('sendpulse'),('mailjet');
create table private.invoice_email_attempts (
 id uuid primary key default gen_random_uuid(), delivery_id uuid not null references public.invoice_email_deliveries(id),
 provider text not null references private.invoice_email_providers(provider), started_at timestamptz not null default now()
);
create index invoice_email_provider_window on private.invoice_email_attempts(provider,started_at);
alter table public.invoice_email_batches enable row level security;
alter table public.invoice_email_batches force row level security;
alter table public.invoice_email_deliveries enable row level security;
alter table public.invoice_email_deliveries force row level security;
revoke all on public.invoice_email_batches,public.invoice_email_deliveries from public,anon,authenticated,service_role;
grant select on public.invoice_email_batches,public.invoice_email_deliveries to authenticated;
create policy invoice_email_batch_owner on public.invoice_email_batches for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create policy invoice_email_owner on public.invoice_email_deliveries for select to authenticated using(tenant_id=(select public.current_tenant_id()));
revoke all on private.invoice_email_execution,private.invoice_email_providers,private.invoice_email_attempts from public,anon,authenticated,service_role;

create function private.seed_invoice_emails(p_tenant uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.invoice_email_deliveries(document_id,tenant_id,company_id,operation_id)
 select d.id,d.tenant_id,d.company_id,o.id from public.fiscal_documents d
 join public.fiscal_operations o on o.id=d.operation_id and o.tenant_id=d.tenant_id and o.company_id=d.company_id
 join public.invoice_email_batches b on b.batch_id=o.batch_id and b.tenant_id=o.tenant_id
 where o.status='authorized' and (p_tenant is null or d.tenant_id=p_tenant)
 and not exists(select 1 from public.invoice_email_deliveries e where e.document_id=d.id)
 order by d.created_at limit 500 on conflict(document_id) do nothing;
 insert into private.invoice_email_execution(delivery_id) select e.id from public.invoice_email_deliveries e
 where (p_tenant is null or e.tenant_id=p_tenant) and not exists(select 1 from private.invoice_email_execution x where x.delivery_id=e.id)
 on conflict(delivery_id) do nothing;
end $$;
revoke all on function private.seed_invoice_emails(uuid) from public,anon,authenticated,service_role;
create function public.enable_invoice_email(p_actor uuid,p_batch uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare b public.fiscal_batches;
begin
 select f.* into b from public.fiscal_batches f join public.tenants t on t.id=f.tenant_id where f.id=p_batch and t.owner_user_id=p_actor;
 if b.id is null then raise exception 'Batch unavailable' using errcode='42501'; end if;
 insert into public.invoice_email_batches values(b.id,b.tenant_id,b.company_id,p_actor,now()) on conflict(batch_id) do nothing;
 perform private.seed_invoice_emails(b.tenant_id);
 insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(b.tenant_id,b.company_id,p_actor,'email.enabled',b.id);
 return true;
end $$;
create function public.claim_invoice_email(p_tenant uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries; claim uuid; result jsonb;
begin
 perform private.seed_invoice_emails(p_tenant);
 update public.invoice_email_deliveries e set status=case when x.started_at is null then 'queued' else 'uncertain' end,
 reason=case when x.started_at is null then null else 'network_uncertain' end,updated_at=now()
 from private.invoice_email_execution x where x.delivery_id=e.id and e.status='processing' and x.lease_until<=now() and (p_tenant is null or e.tenant_id=p_tenant);
 select e.* into j from public.invoice_email_deliveries e join public.fiscal_operations o on o.id=e.operation_id
 where e.status='queued' and e.next_run_at<=now() and e.attempts<6 and o.status='authorized' and (p_tenant is null or e.tenant_id=p_tenant)
 order by e.next_run_at,e.id for update of e skip locked limit 1;
 if j.id is null then return null; end if;
 claim:=gen_random_uuid();
 update public.invoice_email_deliveries set status='processing',reason=null,updated_at=now() where id=j.id;
 update private.invoice_email_execution set token=claim,lease_until=now()+interval '60 seconds',started_at=null where delivery_id=j.id;
 select jsonb_build_object('id',j.id,'token',claim,'tenantId',j.tenant_id,'destinationOverride',j.destination,
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
create function public.begin_invoice_email(p_delivery uuid,p_token uuid,p_providers text[],p_destination text,p_sender text,p_test boolean,p_payload_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries; p text; position integer; state private.invoice_email_providers; cap integer; used integer; wait_until timestamptz; earliest timestamptz; release_at timestamptz;
begin
 if p_destination is null or length(p_destination)>254 or p_destination !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$' or
 p_sender is null or length(p_sender)>254 or p_sender !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$' or
 p_payload_sha256 is null or p_payload_sha256 !~ '^[a-f0-9]{64}$' or p_test is distinct from true then
 -- The current fiscal database supports homologation only. Never send these documents to real sellers.
 raise exception 'Invalid email intent or environment' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(170017);
 select e.* into j from public.invoice_email_deliveries e join private.invoice_email_execution x on x.delivery_id=e.id
 join public.fiscal_operations o on o.id=e.operation_id where e.id=p_delivery and x.token=p_token and x.lease_until>now()
 and x.started_at is null and e.status='processing' and o.status='authorized' and e.attempts<6 for update of e;
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
  update public.invoice_email_deliveries set provider=p,provider_cursor=position,attempts=attempts+1,test_mode=true,updated_at=now() where id=j.id;
  update private.invoice_email_execution set started_at=now(),sender=p_sender,actual_destination=p_destination,payload_sha256=p_payload_sha256 where delivery_id=j.id;
  return jsonb_build_object('provider',p);
 end loop;
 update public.invoice_email_deliveries set status='queued',provider_cursor=0,next_run_at=greatest(now()+interval '1 second',coalesce(earliest,now()+interval '5 minutes')),reason='provider_quota',updated_at=now() where id=j.id;
 update private.invoice_email_execution set token=null,lease_until=null where delivery_id=j.id;
 return jsonb_build_object('waiting',true);
end $$;
create function public.finish_invoice_email(p_delivery uuid,p_token uuid,p_outcome text,p_provider_id text default null,p_destination text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries; started timestamptz;
begin
 if p_outcome is null or p_outcome not in ('accepted','quota_rejected','failed','network_uncertain','invalid_email','ambiguous_recipient','document_invalid','test_address_missing') or
 (p_outcome='accepted' and (p_provider_id is null or length(p_provider_id) not between 1 and 250)) then raise exception 'Invalid email outcome' using errcode='22023'; end if;
 select e.* into j from public.invoice_email_deliveries e join private.invoice_email_execution x on x.delivery_id=e.id
 where e.id=p_delivery and x.token=p_token and x.lease_until>now() and e.status='processing' for update of e;
 if j.id is null then return false; end if;
 select started_at into started from private.invoice_email_execution where delivery_id=j.id;
 if (p_outcome in ('accepted','quota_rejected','failed','network_uncertain')) and started is null then raise exception 'Email intent missing' using errcode='55000'; end if;
 if p_destination is not null and (length(p_destination)>254 or p_destination ~ '[[:cntrl:]]') then raise exception 'Invalid destination' using errcode='22023'; end if;
 update public.invoice_email_deliveries set status=case p_outcome when 'accepted' then 'accepted' when 'quota_rejected' then case when attempts<6 then 'queued' else 'failed' end
 when 'network_uncertain' then 'uncertain' when 'failed' then 'failed' else 'blocked' end,
 reason=case when p_outcome='accepted' then null else p_outcome end,provider_id=p_provider_id,destination=coalesce(destination,p_destination),next_run_at=now(),updated_at=now() where id=j.id;
 if started is not null then update private.invoice_email_providers set busy_until=now(),paused_until=case when p_outcome='quota_rejected' then now()+interval '24 hours' else paused_until end where provider=j.provider; end if;
 update private.invoice_email_execution set token=null,lease_until=null where delivery_id=j.id;
 insert into public.audit_events(tenant_id,company_id,event,resource_id) values(j.tenant_id,j.company_id,'email.'||p_outcome,j.id);
 return true;
end $$;
create function public.retry_invoice_email(p_actor uuid,p_delivery uuid,p_email text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.invoice_email_deliveries;
begin
 select e.* into j from public.invoice_email_deliveries e join public.tenants t on t.id=e.tenant_id where e.id=p_delivery and t.owner_user_id=p_actor for update of e;
 if j.id is null then raise exception 'Delivery unavailable' using errcode='42501'; end if;
 if j.status not in ('failed','blocked') or j.attempts>=6 or not private.take_limit(j.tenant_id,'retry_invoice_email',10) then return false; end if;
 if p_email is not null and (j.status<>'blocked' or j.reason<>'invalid_email' or length(p_email)>254 or p_email !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$') then raise exception 'Invalid email correction' using errcode='22023'; end if;
 update public.invoice_email_deliveries set status='queued',reason=null,provider_cursor=0,destination=coalesce(p_email,destination),next_run_at=now(),updated_at=now() where id=j.id;
 insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(j.tenant_id,j.company_id,p_actor,'email.retry_requested',j.id);
 return true;
end $$;
create function public.invoice_email_ready(p_tenant uuid default null) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.invoice_email_deliveries e where e.status='queued' and e.attempts<6 and e.next_run_at<=now() and (p_tenant is null or e.tenant_id=p_tenant))
 or exists(select 1 from public.fiscal_documents d join public.fiscal_operations o on o.id=d.operation_id join public.invoice_email_batches b on b.batch_id=o.batch_id
 where o.status='authorized' and (p_tenant is null or d.tenant_id=p_tenant) and not exists(select 1 from public.invoice_email_deliveries e where e.document_id=d.id));
$$;
revoke all on function public.enable_invoice_email(uuid,uuid),public.claim_invoice_email(uuid),public.begin_invoice_email(uuid,uuid,text[],text,text,boolean,text),
 public.finish_invoice_email(uuid,uuid,text,text,text),public.retry_invoice_email(uuid,uuid,text),public.invoice_email_ready(uuid) from public,anon,authenticated;
grant execute on function public.enable_invoice_email(uuid,uuid),public.claim_invoice_email(uuid),public.begin_invoice_email(uuid,uuid,text[],text,text,boolean,text),
 public.finish_invoice_email(uuid,uuid,text,text,text),public.retry_invoice_email(uuid,uuid,text),public.invoice_email_ready(uuid) to service_role;
commit;
