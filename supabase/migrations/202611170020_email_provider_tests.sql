begin;
-- Independent, explicit provider tests. No fiscal document or seller enrollment is created.
create table private.email_provider_tests (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 requested_by uuid not null references auth.users(id), request_id uuid not null,
 provider text not null references private.invoice_email_providers(provider), destination text not null,
 status text not null default 'queued' check(status in ('queued','processing','accepted','failed','uncertain')),
 reason text check(reason in ('provider_quota','interval','quota_rejected','failed','network_uncertain')),
 token uuid, lease_until timestamptz, started_at timestamptz, sender text, payload_sha256 text, provider_id text,
 next_run_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,request_id,provider),
 check(length(destination) between 3 and 254 and destination !~ '[[:cntrl:]]'),
 check(provider_id is null or (length(provider_id) between 1 and 250 and provider_id !~ '[[:cntrl:]]'))
);
revoke all on private.email_provider_tests from public,anon,authenticated,service_role;
create index email_provider_tests_ready on private.email_provider_tests(status,next_run_at);
alter table private.invoice_email_attempts alter column delivery_id drop not null;
alter table private.invoice_email_attempts add column provider_test_id uuid references private.email_provider_tests(id);
alter table private.invoice_email_attempts add constraint email_attempt_target check(num_nonnulls(delivery_id,provider_test_id)=1);
create unique index email_provider_test_single_intent on private.invoice_email_attempts(provider_test_id) where provider_test_id is not null;

create function public.request_email_provider_tests(p_actor uuid,p_request uuid,p_destination text) returns boolean
language plpgsql security definer set search_path='' as $$
declare tenant uuid; prior integer;
begin
 select id into tenant from public.tenants where owner_user_id=p_actor;
 if tenant is null then raise exception 'Owner unavailable' using errcode='42501'; end if;
 if p_request is null or p_destination is null or length(p_destination)>254 or p_destination ~ '[[:cntrl:]]' or
 p_destination !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$' then
 raise exception 'Invalid test request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('email-provider-test:'||tenant::text,170020));
 select count(*) into prior from private.email_provider_tests where tenant_id=tenant and request_id=p_request;
 if prior>0 then
  if prior<>3 or exists(select 1 from private.email_provider_tests where tenant_id=tenant and request_id=p_request and destination<>p_destination) then
   raise exception 'Test request changed' using errcode='22023'; end if;
  return true;
 end if;
 if exists(select 1 from private.email_provider_tests where tenant_id=tenant and created_at>now()-interval '24 hours') then return false; end if;
 insert into private.email_provider_tests(tenant_id,requested_by,request_id,provider,destination)
 select tenant,p_actor,p_request,p,p_destination from unnest(array['brevo','sendpulse','mailjet']) p;
 insert into public.audit_events(tenant_id,actor_id,event,resource_id) values(tenant,p_actor,'email.provider_tests_requested',p_request);
 return true;
end $$;

create function public.email_provider_test_report() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_to_json(j) order by j.created_at desc,j.provider),'[]'::jsonb) from (
  select id,request_id,provider,destination,status,reason,next_run_at,created_at from private.email_provider_tests
  where tenant_id=(select public.current_tenant_id()) order by created_at desc,provider limit 9
 ) j;
$$;

create function public.email_provider_tests_ready(p_tenant uuid default null) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from private.email_provider_tests where (p_tenant is null or tenant_id=p_tenant)
 and ((status='queued' and next_run_at<=now()) or (status='processing' and lease_until<=now())));
$$;

create function public.claim_email_provider_test(p_tenant uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.email_provider_tests; claim uuid;
begin
 perform pg_advisory_xact_lock(170017);
 update private.email_provider_tests set status=case when started_at is null then 'queued' else 'uncertain' end,
 reason=case when started_at is null then null else 'network_uncertain' end,token=null,lease_until=null,updated_at=now()
 where status='processing' and lease_until<=now() and (p_tenant is null or tenant_id=p_tenant);
 select t.* into j from private.email_provider_tests t where t.status='queued' and t.next_run_at<=now()
 and (p_tenant is null or t.tenant_id=p_tenant)
 and not exists(select 1 from private.email_provider_tests previous where previous.tenant_id=t.tenant_id and previous.request_id=t.request_id
 and previous.status in ('queued','processing') and array_position(array['brevo','sendpulse','mailjet'],previous.provider)<array_position(array['brevo','sendpulse','mailjet'],t.provider))
 order by t.created_at,array_position(array['brevo','sendpulse','mailjet'],t.provider),t.id for update of t skip locked limit 1;
 if j.id is null then return null; end if;
 claim:=gen_random_uuid();
 update private.email_provider_tests set status='processing',token=claim,lease_until=now()+interval '60 seconds',updated_at=now() where id=j.id;
 return jsonb_build_object('id',j.id,'token',claim,'provider',j.provider,'destination',j.destination);
end $$;

create function public.begin_email_provider_test(p_id uuid,p_token uuid,p_sender text,p_payload_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.email_provider_tests; state private.invoice_email_providers; used integer; cap integer; available_at timestamptz; quota_at timestamptz;
begin
 if p_sender is null or length(p_sender)>254 or p_sender ~ '[[:cntrl:]]' or p_sender !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$'
 or p_payload_sha256 is null or p_payload_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid test intent' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(170017);
 select * into j from private.email_provider_tests where id=p_id and token=p_token and status='processing' and lease_until>now() and started_at is null for update;
 if j.id is null then return null; end if;
 if exists(select 1 from private.invoice_email_execution x join public.invoice_email_deliveries e on e.id=x.delivery_id
 where e.status='processing' and x.started_at is not null and x.lease_until>now()) or
 exists(select 1 from private.email_provider_tests where id<>j.id and status='processing' and started_at is not null and lease_until>now()) then
  update private.email_provider_tests set status='queued',token=null,lease_until=null,next_run_at=now()+interval '2 seconds',updated_at=now() where id=j.id;
  return jsonb_build_object('waiting',true);
 end if;
 select * into state from private.invoice_email_providers where provider=j.provider for update;
 cap:=case j.provider when 'brevo' then 300 when 'sendpulse' then 400 else 200 end;
 select count(*) into used from private.invoice_email_attempts where provider=j.provider and started_at>now()-interval '24 hours';
 if used>=cap then select min(started_at)+interval '24 hours' into quota_at from private.invoice_email_attempts where provider=j.provider and started_at>now()-interval '24 hours'; end if;
 available_at:=greatest(state.next_allowed_at,state.busy_until,state.paused_until,coalesce(quota_at,now()));
 if available_at>now() then
  update private.email_provider_tests set status='queued',token=null,lease_until=null,next_run_at=available_at,
  reason=case when quota_at is not null or state.paused_until>now() then 'provider_quota' else 'interval' end,updated_at=now() where id=j.id;
  return jsonb_build_object('waiting',true);
 end if;
 insert into private.invoice_email_attempts(provider_test_id,provider) values(j.id,j.provider);
 update private.invoice_email_providers set next_allowed_at=now()+make_interval(secs=>case j.provider when 'sendpulse' then 75 else 1 end),busy_until=now()+interval '60 seconds' where provider=j.provider;
 update private.email_provider_tests set started_at=now(),sender=p_sender,payload_sha256=p_payload_sha256,reason=null,updated_at=now() where id=j.id;
 return jsonb_build_object('provider',j.provider);
end $$;

create function public.finish_email_provider_test(p_id uuid,p_token uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.email_provider_tests;
begin
 if p_outcome is null or p_outcome not in ('accepted','quota_rejected','failed','network_uncertain') or
 (p_outcome='accepted' and (p_provider_id is null or length(p_provider_id) not between 1 and 250 or p_provider_id ~ '[[:cntrl:]]')) then
 raise exception 'Invalid test outcome' using errcode='22023'; end if;
 select * into j from private.email_provider_tests where id=p_id and token=p_token and status='processing' and lease_until>now() and started_at is not null for update;
 if j.id is null then return false; end if;
 update private.email_provider_tests set status=case p_outcome when 'accepted' then 'accepted' when 'network_uncertain' then 'uncertain' else 'failed' end,
 reason=case when p_outcome='accepted' then null else p_outcome end,provider_id=p_provider_id,token=null,lease_until=null,updated_at=now() where id=j.id;
 update private.invoice_email_providers set busy_until=now(),paused_until=case when p_outcome='quota_rejected' then now()+interval '24 hours' else paused_until end where provider=j.provider;
 insert into public.audit_events(tenant_id,actor_id,event,resource_id) values(j.tenant_id,j.requested_by,'email.provider_test_'||p_outcome,j.id);
 return true;
end $$;

-- Keep v17 guards and routing; extend its global exclusion to the independent tests.
alter function public.begin_invoice_email(uuid,uuid,text[],text,text,boolean,text) rename to begin_invoice_email_before_provider_tests;
alter function public.begin_invoice_email_before_provider_tests(uuid,uuid,text[],text,text,boolean,text) set schema private;
revoke all on function private.begin_invoice_email_before_provider_tests(uuid,uuid,text[],text,text,boolean,text) from public,anon,authenticated,service_role;
create function public.begin_invoice_email(p_delivery uuid,p_token uuid,p_providers text[],p_destination text,p_sender text,p_test boolean,p_payload_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(170017);
 if exists(select 1 from private.email_provider_tests where status='processing' and started_at is not null and lease_until>now()) then
  update public.invoice_email_deliveries e set status='queued',next_run_at=now()+interval '2 seconds',updated_at=now()
  from private.invoice_email_execution x where e.id=p_delivery and x.delivery_id=e.id and x.token=p_token and x.lease_until>now() and x.started_at is null and e.status='processing';
  if found then update private.invoice_email_execution set token=null,lease_until=null where delivery_id=p_delivery and token=p_token;return jsonb_build_object('waiting',true); end if;
 end if;
 return private.begin_invoice_email_before_provider_tests(p_delivery,p_token,p_providers,p_destination,p_sender,p_test,p_payload_sha256);
end $$;

revoke all on function public.request_email_provider_tests(uuid,uuid,text),public.email_provider_test_report(),public.email_provider_tests_ready(uuid),
 public.claim_email_provider_test(uuid),public.begin_email_provider_test(uuid,uuid,text,text),public.finish_email_provider_test(uuid,uuid,text,text),
 public.begin_invoice_email(uuid,uuid,text[],text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.email_provider_test_report() to authenticated;
grant execute on function public.request_email_provider_tests(uuid,uuid,text),public.email_provider_tests_ready(uuid),public.claim_email_provider_test(uuid),
 public.begin_email_provider_test(uuid,uuid,text,text),public.finish_email_provider_test(uuid,uuid,text,text),
 public.begin_invoice_email(uuid,uuid,text[],text,text,boolean,text) to service_role;
commit;
