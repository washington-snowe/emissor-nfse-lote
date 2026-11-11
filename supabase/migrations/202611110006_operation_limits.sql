begin;

create function public.reserve_company_operation(p_actor uuid,p_company uuid,p_operation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare account uuid;
begin
  select c.tenant_id into account from public.companies c join public.tenants t on t.id=c.tenant_id
    where c.id=p_company and t.owner_user_id=p_actor;
  if account is null then raise exception 'Company unavailable' using errcode='42501'; end if;
  if p_operation is null or p_operation not in ('inspect_certificate','fiscal_access_check','prepare_batch') then
    raise exception 'Unknown operation' using errcode='22023';
  end if;
  return private.take_limit(account,p_operation,10);
end $$;

revoke all on function public.reserve_company_operation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_company_operation(uuid,uuid,text) to service_role;

commit;
