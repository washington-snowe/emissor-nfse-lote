begin;
-- Changes only documentation provenance validation. Never enables emission or alters stored A1s.
create or replace function public.store_official_nfse_contract(p_environment text,p_url text,p_sha256 text,p_contract jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_environment is null or p_environment not in ('homologation','production') or p_url is null or
    jsonb_typeof(p_contract#>'{paths,/nfse}') is distinct from 'object' or
    p_url ~ '/\.{1,2}(/|$)' or
    (p_environment='homologation' and p_url !~ '^https://sefin\.producaorestrita\.nfse\.gov\.br/(API/)?SefinNacional/[A-Za-z0-9_./~-]+$') or
    (p_environment='production' and p_url !~ '^https://sefin\.nfse\.gov\.br/SefinNacional/[A-Za-z0-9_./~-]+$') then
    raise exception 'Invalid official contract' using errcode='22023';
  end if;
  insert into private.nfse_api_contracts(environment,source_url,sha256,structural_contract)
    values(p_environment,p_url,p_sha256,p_contract)
    on conflict(environment) do update set source_url=excluded.source_url,sha256=excluded.sha256,
      structural_contract=excluded.structural_contract,captured_at=now();
end $$;
revoke all on function public.store_official_nfse_contract(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_official_nfse_contract(text,text,text,jsonb) to service_role;
commit;
