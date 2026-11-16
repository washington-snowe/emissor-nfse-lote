begin;
create function private.valid_fiscal_diagnostic_v1(p_data jsonb) returns boolean
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
revoke all on function private.valid_fiscal_diagnostic_v1(jsonb) from public,anon,authenticated,service_role;
create or replace function private.valid_fiscal_diagnostic(p_data jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare field jsonb;
begin
 if private.valid_fiscal_diagnostic_v1(p_data-array['xsdFields','dpsIdentity','serverVersion']) is distinct from true or octet_length(p_data::text)>2000 then return false; end if;
 if (p_data ? 'xsdFields' or p_data ? 'dpsIdentity' or p_data ? 'serverVersion') and p_data->>'phase'<>'response' then return false; end if;
 if p_data ? 'dpsIdentity' and (jsonb_typeof(p_data->'dpsIdentity')<>'string' or p_data->>'dpsIdentity' not in ('missing','null','matching','mismatch','invalid')) then return false; end if;
 if p_data ? 'serverVersion' and (jsonb_typeof(p_data->'serverVersion')<>'string' or not (p_data->>'serverVersion' ~ '^SefinNacional_[0-9]{1,2}(\.[0-9]{1,6}){1,5}$')) then return false; end if;
 if p_data ? 'xsdFields' then
  if jsonb_typeof(p_data->'xsdFields')<>'array' or not (p_data->'codes' @> '["E1235"]'::jsonb) then return false; end if;
  if jsonb_array_length(p_data->'xsdFields')>10 then return false; end if;
  for field in select * from jsonb_array_elements(p_data->'xsdFields') loop
   if jsonb_typeof(field)<>'string' or not (field#>>'{}'=any(array['DPS','infDPS','Id','versao','tpAmb','dhEmi','verAplic','serie','nDPS','dCompet','tpEmit','cLocEmi','prest','CNPJ','CPF','IM','fone','email','regTrib','opSimpNac','regApTribSN','regEspTrib','toma','xNome','end','endNac','cMun','CEP','xLgr','nro','xCpl','xBairro','serv','locPrest','cLocPrestacao','cServ','cTribNac','cTribMun','xDescServ','cNBS','valores','vServPrest','vServ','trib','tribMun','tribISSQN','tpRetISSQN','totTrib','indTotTrib','Signature','SignedInfo','CanonicalizationMethod','SignatureMethod','Reference','Transforms','Transform','DigestMethod','DigestValue','SignatureValue','KeyInfo','X509Data','X509Certificate'])) then return false; end if;
  end loop;
 end if;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_fiscal_diagnostic(jsonb) from public,anon,authenticated,service_role;

-- Read the original snapshot for local, read-only inspection. No A1, private key or password.
create function public.fiscal_xml_snapshot_for_diagnostic(p_actor uuid,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations;
begin
 select o.* into operation from public.fiscal_operations o join public.tenants t on t.id=o.tenant_id
  where o.id=p_operation and t.owner_user_id=p_actor and o.environment='homologation' and o.transmit_count=1;
 if operation.id is null then return null; end if;
 if not private.take_limit(operation.tenant_id,'fiscal_xml_diagnostic',10) then return null; end if;
 return (select jsonb_build_object('xml',signed_dps_xml,'sha256',dps_sha256,'id',operation.dps_id,'certificatePem',holder_certificate_pem)
  from private.fiscal_execution where operation_id=operation.id and signed_dps_xml is not null);
end $$;
revoke all on function public.fiscal_xml_snapshot_for_diagnostic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_xml_snapshot_for_diagnostic(uuid,uuid) to service_role;
create function public.fiscal_schema_diagnostics_ready() returns boolean
language sql stable security definer set search_path='' as $$ select true $$;
revoke all on function public.fiscal_schema_diagnostics_ready() from public,anon,authenticated;
grant execute on function public.fiscal_schema_diagnostics_ready() to service_role;
commit;
