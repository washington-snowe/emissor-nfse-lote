begin;

-- NT008/2026 v1.02 replaces the suspended DANFSe API prerequisite with a
-- locally checked generator. No fiscal XML, A1, numbering or operation is changed.
alter table private.fiscal_production_readiness add column danfse_spec_sha256 text
 check(danfse_spec_sha256 is null or danfse_spec_sha256~'^[a-f0-9]{64}$');

create or replace function private.production_company_ready(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.fiscal_production_readiness r join public.companies c on c.id=r.company_id and c.tenant_id=r.tenant_id
 join public.company_certificates a on a.id=r.certificate_id and a.company_id=c.id and a.tenant_id=c.tenant_id
 join public.company_fiscal_profiles p on p.id=r.profile_id and p.company_id=c.id and p.tenant_id=c.tenant_id
 join private.nfse_api_contracts n on n.environment='production' and n.sha256=r.contract_sha256
 where c.id=p_company and c.tax_regime='mei' and a.status='active' and a.subject_cnpj=c.cnpj and a.valid_from<=now() and a.valid_until>now()
 and p.configuration_sha256=r.profile_sha256 and p.id=(select id from public.company_fiscal_profiles where company_id=c.id order by version desc limit 1)
 and r.danfse_spec_sha256='1265f403aedcdc5f08b3049dcc18a15c2bc155f51afccf3d12690fef2f4fb0ff');
$$;

create or replace function public.record_production_readiness(p_actor uuid,p_company uuid,p_certificate uuid,p_profile_hash text,p_contract_hash text,p_http integer) returns boolean language plpgsql security definer set search_path='' as $$
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
 certificate_id=excluded.certificate_id,profile_id=excluded.profile_id,profile_sha256=excluded.profile_sha256,contract_sha256=excluded.contract_sha256,checked_by=excluded.checked_by,checked_at=now(),danfse_spec_sha256=null;
 insert into public.fiscal_access_checks(tenant_id,company_id,certificate_id,environment,http_status,outcome) values(c.tenant_id,c.id,p_certificate,'production',p_http,'response_received');
 insert into public.audit_events(tenant_id,company_id,actor_id,event,resource_id) values(c.tenant_id,c.id,p_actor,'fiscal.production_access_verified',c.id);
 return true;
end $$;

create function public.record_production_readiness_with_local_danfse(p_actor uuid,p_company uuid,p_certificate uuid,p_profile_hash text,p_contract_hash text,p_http integer,p_spec_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_spec_hash is distinct from '1265f403aedcdc5f08b3049dcc18a15c2bc155f51afccf3d12690fef2f4fb0ff' then return false;end if;
 if public.record_production_readiness(p_actor,p_company,p_certificate,p_profile_hash,p_contract_hash,p_http) is distinct from true then return false;end if;
 update private.fiscal_production_readiness set danfse_spec_sha256=p_spec_hash where company_id=p_company and checked_by=p_actor;
 return private.production_company_ready(p_company);
end $$;

create or replace function public.production_report_status(p_company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ready',private.production_company_ready(c.id),'checkedAt',r.checked_at,
 'contractCaptured',exists(select 1 from private.nfse_api_contracts where environment='production'),
 'danfseCaptured',exists(select 1 from private.danfse_contracts where environment='production'),
 'danfseSource',case when r.danfse_spec_sha256='1265f403aedcdc5f08b3049dcc18a15c2bc155f51afccf3d12690fef2f4fb0ff' then 'local_nt008' else null end)
 from public.companies c left join private.fiscal_production_readiness r on r.company_id=c.id
 where c.id=p_company and c.tenant_id=(select public.current_tenant_id());
$$;

create or replace function public.danfse_document_source(p_actor uuid,p_document uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.fiscal_documents;o public.fiscal_operations;asset private.fiscal_danfse_contents;e private.fiscal_execution;document_xml text;cnpj text;
begin
 select x.* into d from public.fiscal_documents x join public.tenants t on t.id=x.tenant_id where x.id=p_document and t.owner_user_id=p_actor;
 if d.id is null then raise exception 'Document unavailable' using errcode='42501';end if;
 select * into o from public.fiscal_operations where id=d.operation_id and tenant_id=d.tenant_id and company_id=d.company_id;
 select xml into document_xml from private.fiscal_document_contents where document_id=d.id;
 if o.id is null or o.status<>'authorized' or document_xml is null or encode(sha256(convert_to(document_xml,'UTF8')),'hex') is distinct from d.xml_sha256 then return null;end if;
 select * into asset from private.fiscal_danfse_contents where document_id=d.id;
 if asset.document_id is null then
  if not private.take_limit(d.tenant_id,'danfse_read',500) then return null;end if;
  select * into e from private.fiscal_execution where operation_id=o.id;
  if e.signed_dps_xml is null or e.holder_certificate_pem is null or encode(sha256(convert_to(e.signed_dps_xml,'UTF8')),'hex') is distinct from e.dps_sha256 then return null;end if;
 end if;
 select c.cnpj into cnpj from public.companies c where c.id=d.company_id;
 return jsonb_build_object('tenantId',d.tenant_id,'companyId',d.company_id,'cnpj',cnpj,'certificateId',public.fiscal_processing_certificate(o.id),'environment',d.environment,'accessKey',d.access_key,
 'pdf',case when asset.document_id is not null then encode(asset.pdf,'base64') else null end,'sha256',asset.sha256,
 'xml',case when asset.document_id is null then document_xml else null end,'xmlSha256',d.xml_sha256,
 'original',case when asset.document_id is null then jsonb_build_object('xml',e.signed_dps_xml,'sha256',e.dps_sha256,'id',o.dps_id,'certificatePem',e.holder_certificate_pem) else null end,
 'generator','nt008-1.02-rex-v1');
end $$;

create function public.fiscal_local_danfse_ready() returns boolean language sql stable security definer set search_path='' as $$select true;$$;
revoke all on function private.production_company_ready(uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_production_readiness(uuid,uuid,uuid,text,text,integer),public.record_production_readiness_with_local_danfse(uuid,uuid,uuid,text,text,integer,text),public.danfse_document_source(uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_production_readiness(uuid,uuid,uuid,text,text,integer),public.record_production_readiness_with_local_danfse(uuid,uuid,uuid,text,text,integer,text),public.danfse_document_source(uuid,uuid) to service_role;
revoke all on function public.fiscal_local_danfse_ready() from public,anon;
grant execute on function public.fiscal_local_danfse_ready() to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
