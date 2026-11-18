-- SYNTHETIC STATE ONLY. Called exclusively by the disposable PostgreSQL runner.
select set_config('test.prod.actor','00000000-0000-4000-8000-000000000001',false);
select set_config('test.prod.company',c.id::text,false),set_config('test.prod.tenant',c.tenant_id::text,false)
 from public.companies c join public.tenants t on t.id=c.tenant_id where t.owner_user_id=current_setting('test.prod.actor')::uuid and c.tax_regime='mei' limit 1;
select set_config('test.prod.profile',id::text,false),set_config('test.prod.profile_hash',configuration_sha256,false)
 from public.company_fiscal_profiles where company_id=current_setting('test.prod.company')::uuid order by version desc limit 1;
select set_config('test.prod.certificate',id::text,false) from public.company_certificates
 where company_id=current_setting('test.prod.company')::uuid and status='active' order by created_at desc limit 1;
set role service_role;
select set_config('test.prod.import',public.register_report(current_setting('test.prod.actor')::uuid,current_setting('test.prod.company')::uuid,'synthetic-production.csv','c3ludGhldGljLXByb2R1Y3Rpb24tcmVwb3J0')->>'id',false);
select public.finish_report_job(job_id,lease_token,jsonb_build_object('review',jsonb_build_object('source',jsonb_build_object('fileSha256',file_sha256,'adapterId','shopee-seller-monthly-csv','adapterVersion','1'),
 'fiscalStatus','not_evaluated','rows','[{"location":{"row":2},"currency":"BRL","amount":"1.10"},{"location":{"row":3},"currency":"BRL","amount":"2.20"}]'::jsonb),'reportedSellers','[{},{}]'::jsonb))
 from public.claim_report_jobs(current_setting('test.prod.tenant')::uuid,5) where import_id=current_setting('test.prod.import')::uuid;
reset role;
select set_config('test.prod.snapshot',jsonb_build_object('contractVersion',1,'environment','production','companyId',c.id,'issuerCnpj',c.cnpj,
 'importId',r.id,'fileSha256',r.file_sha256,'profileId',p.id,'profileSha256',p.configuration_sha256,'profileVersion',p.version,
 'competenceDate','2026-10-31','commissionType','Synthetic commission','evidenceReference','Synthetic production review','recipientRoleConfirmed',true,
 'recipientChoice','single_recipient','grouping','per_row','sourceRows',2,'currency','BRL','total','3.30','groups',jsonb_build_array(
 jsonb_build_object('sourceRows','[2]'::jsonb,'sourceClaims',jsonb_build_array(repeat('a',64)),'allocations','[{"row":2,"amount":"1.10"}]'::jsonb,'amount','1.10','recipient','{"kind":"cnpj","document":"11222333000181","country":"BR","legalName":"Synthetic recipient"}'::jsonb),
 jsonb_build_object('sourceRows','[3]'::jsonb,'sourceClaims',jsonb_build_array(repeat('b',64)),'allocations','[{"row":3,"amount":"2.20"}]'::jsonb,'amount','2.20','recipient','{"kind":"cnpj","document":"11222333000181","country":"BR","legalName":"Synthetic recipient"}'::jsonb)))::text,false)
 from public.report_imports r join public.companies c on c.id=r.company_id join public.company_fiscal_profiles p on p.id=current_setting('test.prod.profile')::uuid where r.id=current_setting('test.prod.import')::uuid;
set role service_role;
select set_config('test.prod.review',public.save_report_review(current_setting('test.prod.actor')::uuid,current_setting('test.prod.import')::uuid,current_setting('test.prod.profile')::uuid,0,current_setting('test.prod.snapshot')::jsonb)->>'id',false);
select public.store_official_nfse_contract('production','https://sefin.nfse.gov.br/SefinNacional/swagger/docs/v1',repeat('c',64),'{"paths":{"/nfse":{"post":{}}}}');
select public.store_official_danfse_contract('production','https://adn.nfse.gov.br/danfse/swagger/v1/swagger.json',repeat('d',64),'{"paths":{"/{chaveAcesso}":{"get":{}}}}');
select public.record_production_readiness_with_local_danfse(current_setting('test.prod.actor')::uuid,current_setting('test.prod.company')::uuid,current_setting('test.prod.certificate')::uuid,current_setting('test.prod.profile_hash'),repeat('c',64),404,'1265f403aedcdc5f08b3049dcc18a15c2bc155f51afccf3d12690fef2f4fb0ff');
reset role;
select set_config('test.prod.review_hash',snapshot_sha256,false) from public.report_reviews where id=current_setting('test.prod.review')::uuid;
