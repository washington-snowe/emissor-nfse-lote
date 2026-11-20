begin;
-- Accept GET observations in the same sending lease only after its persisted,
-- observed production SEFIN 1.6.0 POST201. No fiscal state, XML, counter or guard changes.
create or replace function public.record_fiscal_transport_diagnostic(p_operation uuid,p_token uuid,p_stage text,p_data jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations; existing private.fiscal_transport_diagnostics;
begin
  if p_stage is null or p_stage not in ('submit','dps_lookup','nfse_lookup') or
    private.valid_fiscal_diagnostic(p_data) is distinct from true or p_data->>'phase' not in ('response','failure') then
    raise exception 'Invalid diagnostic metadata' using errcode='22023';
  end if;
  select o.* into operation from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id
    where o.id=p_operation and o.transmit_count=1 and e.lease_token=p_token and e.lease_until>clock_timestamp()
      and ((p_stage='submit' and o.status='sending') or (p_stage<>'submit' and (o.status='reconciling' or
        (o.status='sending' and o.environment='production' and exists(
          select 1 from private.fiscal_transport_diagnostics d where d.operation_id=o.id and d.lease_token=p_token and d.stage='submit'
          and d.details->>'phase'='response' and d.details->>'http'='201' and d.details->>'format'='json_object'
          and d.details->>'environment'='number_1' and d.details->>'serverVersion'='SefinNacional_1.6.0'
        ))))) for update of o,e;
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

create function public.fiscal_inline_receipt_diagnostics_ready() returns boolean language sql stable security definer set search_path='' as $$select true;$$;
revoke all on function public.fiscal_inline_receipt_diagnostics_ready() from public,anon,authenticated;
grant execute on function public.fiscal_inline_receipt_diagnostics_ready() to service_role;
notify pgrst, 'reload schema';
commit;
