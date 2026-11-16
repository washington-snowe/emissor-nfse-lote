begin;
-- Diagnostic metadata only. No raw response, XML, certificate, credentials or taxpayer identity.
create function private.valid_fiscal_diagnostic(p_data jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare phase text; keys text[]; code jsonb; elapsed numeric;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>1500 then return false; end if;
  phase:=p_data->>'phase';
  if phase='intent' then return p_data='{"phase":"intent"}'::jsonb; end if;
  if phase='response' then keys:=array['phase','http','format','environment','codes','elapsedMs'];
  elsif phase='failure' then keys:=array['phase','transport','elapsedMs'];
  else return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_data) k) is distinct from (select array_agg(k order by k) from unnest(keys) k) then return false; end if;
  if jsonb_typeof(p_data->'elapsedMs')<>'number' then return false; end if;
  elapsed:=(p_data->>'elapsedMs')::numeric;
  if elapsed<>trunc(elapsed) or elapsed not between 0 and 60000 then return false; end if;
  if phase='failure' then return (p_data->>'transport') in ('invalid_destination','certificate_format','client_certificate','server_certificate','tls','dns','timeout','connection','response_limit','response'); end if;
  if jsonb_typeof(p_data->'http')<>'number' or (p_data->>'http')::numeric<>trunc((p_data->>'http')::numeric) or
    not ((p_data->>'http')::numeric=0 or (p_data->>'http')::numeric between 100 and 599) or
    jsonb_typeof(p_data->'format')<>'string' or jsonb_typeof(p_data->'environment')<>'string' or
    (p_data->>'format') not in ('empty','json_object','html','other') or
    (p_data->>'environment') not in ('number_0','number_1','number_2','missing','other') or
    jsonb_typeof(p_data->'codes')<>'array' then return false; end if;
  if jsonb_array_length(p_data->'codes')>10 then return false; end if;
  for code in select * from jsonb_array_elements(p_data->'codes') loop
    if jsonb_typeof(code)<>'string' or not (code#>>'{}' ~ '^E[0-9]{4}$') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function private.valid_fiscal_diagnostic(jsonb) from public,anon,authenticated,service_role;

create table private.fiscal_transport_diagnostics (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.fiscal_operations(id) on delete restrict,
  lease_token uuid not null,
  stage text not null check(stage in ('submit','dps_lookup','nfse_lookup')),
  details jsonb not null check(private.valid_fiscal_diagnostic(details) is true),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(operation_id,lease_token,stage)
);
revoke all on private.fiscal_transport_diagnostics from public,anon,authenticated,service_role;
revoke all on sequence private.fiscal_transport_diagnostics_id_seq from public,anon,authenticated,service_role;

-- Persist the intent and grant the sole POST in the same transaction as the existing guarded function.
create function public.begin_fiscal_send_traced(p_operation uuid,p_token uuid,p_certificate uuid,p_signed_xml text,p_certificate_pem text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if public.begin_fiscal_send(p_operation,p_token,p_certificate,p_signed_xml,p_certificate_pem) is distinct from true then return false; end if;
  insert into private.fiscal_transport_diagnostics(operation_id,lease_token,stage,details)
    values(p_operation,p_token,'submit','{"phase":"intent"}');
  return true;
end $$;
-- Old workers cannot bypass the diagnostic transaction.
revoke all on function public.begin_fiscal_send(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.begin_fiscal_send_traced(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_fiscal_send_traced(uuid,uuid,uuid,text,text) to service_role;

create function public.record_fiscal_transport_diagnostic(p_operation uuid,p_token uuid,p_stage text,p_data jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations; existing private.fiscal_transport_diagnostics;
begin
  if p_stage is null or p_stage not in ('submit','dps_lookup','nfse_lookup') or
    private.valid_fiscal_diagnostic(p_data) is distinct from true or p_data->>'phase' not in ('response','failure') then
    raise exception 'Invalid diagnostic metadata' using errcode='22023';
  end if;
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.transmit_count=1 and e.lease_token=p_token and e.lease_until>clock_timestamp()
      and o.status=case when p_stage='submit' then 'sending' else 'reconciling' end for update of o,e;
  if operation.id is null then return false; end if;
  select * into existing from private.fiscal_transport_diagnostics where operation_id=p_operation and lease_token=p_token and stage=p_stage for update;
  if existing.id is not null then
    if existing.details->>'phase'<>'intent' then return existing.details=p_data; end if;
    update private.fiscal_transport_diagnostics set details=p_data,updated_at=clock_timestamp() where id=existing.id;
  elsif p_stage='submit' then return false;
  else insert into private.fiscal_transport_diagnostics(operation_id,lease_token,stage,details) values(p_operation,p_token,p_stage,p_data);
  end if;
  return true;
end $$;
revoke all on function public.record_fiscal_transport_diagnostic(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_fiscal_transport_diagnostic(uuid,uuid,text,jsonb) to service_role;

-- Persist the HTTP observation and fiscal outcome together, before releasing the lease.
create function public.finish_fiscal_attempt_traced(p_operation uuid,p_token uuid,p_outcome text,p_reason text default null,p_access_key text default null,p_xml text default null,p_diagnostics jsonb default '[]'::jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item jsonb; finished boolean;
begin
  if p_diagnostics is null or jsonb_typeof(p_diagnostics)<>'array' or octet_length(p_diagnostics::text)>5000 then raise exception 'Invalid diagnostic bundle' using errcode='22023'; end if;
  if jsonb_array_length(p_diagnostics)>3 then raise exception 'Diagnostic bundle limit' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_diagnostics) loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2 or not (item ? 'stage' and item ? 'data') then raise exception 'Invalid diagnostic entry' using errcode='22023'; end if;
    if public.record_fiscal_transport_diagnostic(p_operation,p_token,item->>'stage',item->'data') is distinct from true then raise exception 'Diagnostic lease unavailable' using errcode='40001'; end if;
  end loop;
  finished:=public.finish_fiscal_attempt(p_operation,p_token,p_outcome,p_reason,p_access_key,p_xml);
  if finished is distinct from true and jsonb_array_length(p_diagnostics)>0 then raise exception 'Fiscal outcome lease unavailable' using errcode='40001'; end if;
  return finished;
end $$;
revoke all on function public.finish_fiscal_attempt(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.finish_fiscal_attempt_traced(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_fiscal_attempt_traced(uuid,uuid,text,text,text,text,jsonb) to service_role;

create function public.fiscal_transport_diagnostic_report(p_operation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=public.current_tenant_id(); result jsonb;
begin
  if not exists(select 1 from public.fiscal_operations where id=p_operation and tenant_id=tenant) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('stage',stage,'data',details,'created_at',created_at,'updated_at',updated_at)
    order by priority,created_at desc),'[]'::jsonb) into result from
    (select stage,details,created_at,updated_at,case when stage='submit' then 0 else 1 end priority
      from private.fiscal_transport_diagnostics where operation_id=p_operation
      order by case when stage='submit' then 0 else 1 end,created_at desc limit 21) rows;
  return result;
end $$;
revoke all on function public.fiscal_transport_diagnostic_report(uuid) from public,anon,service_role;
grant execute on function public.fiscal_transport_diagnostic_report(uuid) to authenticated;

create function public.fiscal_diagnostics_ready() returns boolean language sql stable security definer set search_path='' as $$ select true; $$;
revoke all on function public.fiscal_diagnostics_ready() from public,anon;
grant execute on function public.fiscal_diagnostics_ready() to authenticated,service_role;
commit;
