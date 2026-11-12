-- State-machine fixtures only: synthetic XML/certificate text is NOT fiscal authorization evidence.
-- Never execute this file against hosted Supabase.
create temporary table queue_assertions(name text primary key);
grant insert on queue_assertions to authenticated,anon,service_role;
create function pg_temp.queue_check(condition boolean,name text) returns void language plpgsql as $$
begin if condition is distinct from true then raise exception 'Fiscal queue assertion failed: %',name; end if;
 insert into pg_temp.queue_assertions values(name); end $$;
select set_config('test.fq_company',(select c.id::text from public.companies c join public.tenants t on t.id=c.tenant_id where t.owner_user_id='00000000-0000-4000-8000-000000000001' limit 1),false);
select set_config('test.fq_tenant',(select tenant_id::text from public.companies where id=current_setting('test.fq_company')::uuid),false);
select set_config('test.fq_profile',(select id::text from public.company_fiscal_profiles where company_id=current_setting('test.fq_company')::uuid order by version desc limit 1),false);
select set_config('test.fq_hash',(select configuration_sha256 from public.company_fiscal_profiles where id=current_setting('test.fq_profile')::uuid),false);
select set_config('test.fq_configuration',(select configuration::text from public.company_fiscal_profiles where id=current_setting('test.fq_profile')::uuid),false);
select set_config('test.fq_request',gen_random_uuid()::text,false);
select set_config('test.fq_data','{"amount":"999999999999999.99","competenceDate":"2026-10-31","commissionType":"Synthetic commission","reference":"synthetic payment A","recipient":{"kind":"cnpj","document":"11444777000161","country":"BR","legalName":"Synthetic recipient"}}',false);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
do $$ begin
 begin perform public.issue_standalone('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),gen_random_uuid(),current_setting('test.fq_data')::jsonb,current_setting('test.fq_configuration')::jsonb,true,0); raise exception 'Client called trusted enqueue';
 exception when insufficient_privilege then perform pg_temp.queue_check(true,'enqueue is server only'); end;
 begin perform * from public.claim_fiscal_jobs(); raise exception 'Client claimed fiscal work';
 exception when insufficient_privilege then perform pg_temp.queue_check(true,'claims unavailable to client'); end;
 begin update public.fiscal_operations set status='authorized'; raise exception 'Client forged authorization';
 exception when insufficient_privilege then perform pg_temp.queue_check(true,'client cannot transition fiscal state'); end;
 begin perform * from private.fiscal_execution; raise exception 'Private signed XML or token exposed';
 exception when insufficient_privilege then perform pg_temp.queue_check(true,'execution token and XML are private'); end;
 begin perform private.enqueue_fiscal(null,null,null,null,null,null,null,null); raise exception 'Private enqueue callable';
 exception when insufficient_privilege then perform pg_temp.queue_check(true,'internal enqueue helper not callable'); end;
end $$;
reset role;
set role service_role;
do $$ begin
 begin perform public.enqueue_standalone_fiscal('00000000-0000-4000-8000-000000000002',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),gen_random_uuid(),current_setting('test.fq_data')::jsonb,current_setting('test.fq_configuration')::jsonb); raise exception 'Foreign actor accepted';
 exception when insufficient_privilege then perform pg_temp.queue_check(true,'trusted enqueue checks actor ownership'); end;
 begin perform public.enqueue_standalone_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,repeat('f',64),gen_random_uuid(),current_setting('test.fq_data')::jsonb,current_setting('test.fq_configuration')::jsonb); raise exception 'Stale profile accepted';
 exception when serialization_failure then perform pg_temp.queue_check(true,'expected fiscal profile hash required'); end;
 begin perform public.enqueue_standalone_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),gen_random_uuid(),jsonb_set(current_setting('test.fq_data')::jsonb,'{amount}','"1.001"'),current_setting('test.fq_configuration')::jsonb); raise exception 'Money rounded by database';
 exception when invalid_parameter_value then perform pg_temp.queue_check(true,'database rejects excess precision rather than rounding'); end;
end $$;
select set_config('test.fq_batch',(public.issue_standalone('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),current_setting('test.fq_request')::uuid,current_setting('test.fq_data')::jsonb,current_setting('test.fq_configuration')::jsonb,true,0)->>'id'),false);
select pg_temp.queue_check((public.issue_standalone('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),current_setting('test.fq_request')::uuid,current_setting('test.fq_data')::jsonb,current_setting('test.fq_configuration')::jsonb,true,0)->>'id')=current_setting('test.fq_batch'),'same request is idempotent after template save');
select pg_temp.queue_check((public.enqueue_standalone_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),gen_random_uuid(),current_setting('test.fq_data')::jsonb,current_setting('test.fq_configuration')::jsonb)->>'id')=current_setting('test.fq_batch'),'identical standalone payment reuses existing operation');
do $$ begin
 begin perform public.enqueue_standalone_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),gen_random_uuid(),jsonb_set(current_setting('test.fq_data')::jsonb,'{amount}','"2.00"'),current_setting('test.fq_configuration')::jsonb); raise exception 'Same referenced payment changed value to bypass duplicate guard';
 exception when unique_violation then perform pg_temp.queue_check(true,'payment reference prevents duplicates after amount or tax edits'); end;
 begin perform public.enqueue_standalone_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),current_setting('test.fq_request')::uuid,jsonb_set(current_setting('test.fq_data')::jsonb,'{amount}','"2.00"'),current_setting('test.fq_configuration')::jsonb); raise exception 'Changed request content accepted';
 exception when serialization_failure then perform pg_temp.queue_check(true,'request id cannot be reused with changed content'); end;
end $$;
reset role;
select set_config('test.fq_operation',(select id::text from public.fiscal_operations where batch_id=current_setting('test.fq_batch')::uuid),false);
select pg_temp.queue_check((select count(*)=1 from public.fiscal_operations),'retries created one operation');
select pg_temp.queue_check((select count(*)=1 from public.standalone_templates),'unchanged retries create one template version');
select pg_temp.queue_check((select dps_number is null and dps_id is null from public.fiscal_operations where id=current_setting('test.fq_operation')::uuid),'unverified preparation cannot reserve issuer sequence');
select pg_temp.queue_check((select count(*)=0 from private.dps_counters),'no shared issuer metadata touched before certificate verification');
select pg_temp.queue_check((select count(*)=0 from private.verified_fiscal_source_reservations),'unverified tenant cannot reserve another account source namespace');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.queue_check((select j->>'amount'='999999999999999.99' from public.list_fiscal_operations() j),'display RPC preserves large decimals as strings');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.queue_check((select count(*)=0 from public.fiscal_operations),'other tenant cannot read queued operations');
select pg_temp.queue_check((select count(*)=0 from public.list_fiscal_operations()),'display RPC respects RLS');
select pg_temp.queue_check((select count(*)=0 from public.standalone_templates),'templates isolated by tenant');
reset role;

-- Prepare a current reviewed source and a changed reexport with the same monthly scope.
select set_config('test.fq_review_import',(select id::text from public.report_imports where tenant_id=current_setting('test.fq_tenant')::uuid and row_count=2 limit 1),false);
select set_config('test.fq_review_snapshot',jsonb_set(jsonb_set(jsonb_set(snapshot,'{profileId}',to_jsonb(current_setting('test.fq_profile'))),'{profileSha256}',to_jsonb(current_setting('test.fq_hash'))),'{profileVersion}',to_jsonb(3))::text,false)
 from public.report_reviews where import_id=current_setting('test.fq_review_import')::uuid order by version desc limit 1;
set role service_role;
select set_config('test.fq_review',public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.fq_review_import')::uuid,current_setting('test.fq_profile')::uuid,2,current_setting('test.fq_review_snapshot')::jsonb)->>'id',false);
reset role;
select set_config('test.fq_review_hash',(select snapshot_sha256 from public.report_reviews where id=current_setting('test.fq_review')::uuid),false);
set role service_role;
do $$ begin
 begin perform public.enqueue_report_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_review')::uuid,current_setting('test.fq_review_hash'),gen_random_uuid()); raise exception 'Unconfirmed report enqueued';
 exception when object_not_in_prerequisite_state then perform pg_temp.queue_check(true,'review must already be confirmed'); end;
end $$;
select public.confirm_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.fq_review')::uuid,current_setting('test.fq_review_hash'));
select set_config('test.fq_report_batch',public.enqueue_report_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_review')::uuid,current_setting('test.fq_review_hash'),gen_random_uuid())->>'id',false);
select set_config('test.fq_reexport',public.register_report('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,'changed-reexport.csv','Y2hhbmdlZC1yZWV4cG9ydA==')->>'id',false);
select set_config('test.fq_parse_job',job_id::text,false),set_config('test.fq_parse_token',lease_token::text,false),set_config('test.fq_reexport_hash',file_sha256,false)
 from public.claim_report_jobs(current_setting('test.fq_tenant')::uuid,5) where import_id=current_setting('test.fq_reexport')::uuid;
reset role;
select set_config('test.fq_parse_payload',jsonb_set(parsed_payload,'{review,source,fileSha256}',to_jsonb(current_setting('test.fq_reexport_hash')))::text,false)
 from public.report_imports where id=current_setting('test.fq_review_import')::uuid;
set role service_role;
select public.finish_report_job(current_setting('test.fq_parse_job')::uuid,current_setting('test.fq_parse_token')::uuid,current_setting('test.fq_parse_payload')::jsonb);
select set_config('test.fq_reexport_review',public.save_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.fq_reexport')::uuid,current_setting('test.fq_profile')::uuid,0,
 jsonb_set(jsonb_set(current_setting('test.fq_review_snapshot')::jsonb,'{importId}',to_jsonb(current_setting('test.fq_reexport'))),'{fileSha256}',to_jsonb(current_setting('test.fq_reexport_hash'))))->>'id',false);
reset role;
select set_config('test.fq_reexport_review_hash',(select snapshot_sha256 from public.report_reviews where id=current_setting('test.fq_reexport_review')::uuid),false);
set role service_role;
select public.confirm_report_review('00000000-0000-4000-8000-000000000001',current_setting('test.fq_reexport_review')::uuid,current_setting('test.fq_reexport_review_hash'));
do $$ begin
 begin perform public.enqueue_report_fiscal('00000000-0000-4000-8000-000000000001',current_setting('test.fq_reexport_review')::uuid,current_setting('test.fq_reexport_review_hash'),gen_random_uuid()); raise exception 'Reexport duplicated monthly scopes';
 exception when unique_violation then perform pg_temp.queue_check(true,'reexports cannot reserve an already queued monthly source'); end;
end $$;
select public.block_fiscal_dependencies(current_setting('test.fq_tenant')::uuid,null,'transmission_disabled');
select pg_temp.queue_check(public.manage_fiscal_operation('00000000-0000-4000-8000-000000000001',current_setting('test.fq_operation')::uuid,'resume'),'owner can resume blocked preparation');
select set_config('test.fq_job',j::text,false),set_config('test.fq_old_token',j->>'lease_token',false) from public.claim_fiscal_jobs(current_setting('test.fq_tenant')::uuid,1) j;
reset role;
select pg_temp.queue_check((select count(*)=3 from public.fiscal_operations),'source overlap rolls back whole batch');
select pg_temp.queue_check(current_setting('test.fq_job')::jsonb->>'amount'='999999999999999.99','worker receives money as string');
select set_config('test.fq_certificate',gen_random_uuid()::text,false);
insert into public.company_certificates(id,tenant_id,company_id,subject_cnpj,fingerprint,serial_number,valid_from,valid_until,created_by)
 select current_setting('test.fq_certificate')::uuid,tenant_id,id,cnpj,repeat('b',64),'synthetic queue certificate',now()-interval '1 day',now()+interval '1 day','00000000-0000-4000-8000-000000000001'
 from public.companies where id=current_setting('test.fq_company')::uuid;
update private.fiscal_execution set lease_until=now()-interval '1 second' where operation_id=current_setting('test.fq_operation')::uuid;
set role service_role;
select set_config('test.fq_token',j->>'lease_token',false) from public.claim_fiscal_jobs(current_setting('test.fq_tenant')::uuid,1) j;
select pg_temp.queue_check(current_setting('test.fq_token')<>current_setting('test.fq_old_token'),'expired preparation reclaimed with new fencing token');
select pg_temp.queue_check(public.reserve_fiscal_identity(current_setting('test.fq_operation')::uuid,current_setting('test.fq_token')::uuid,current_setting('test.fq_certificate')::uuid) is null,'local certificate metadata alone does not reserve legal issuer namespace');
select public.record_fiscal_transport(current_setting('test.fq_operation')::uuid,current_setting('test.fq_token')::uuid,current_setting('test.fq_certificate')::uuid);
select pg_temp.queue_check(public.reserve_fiscal_identity(current_setting('test.fq_operation')::uuid,current_setting('test.fq_old_token')::uuid,current_setting('test.fq_certificate')::uuid) is null,'stale worker cannot reserve identity');
select set_config('test.fq_dps_id',public.reserve_fiscal_identity(current_setting('test.fq_operation')::uuid,current_setting('test.fq_token')::uuid,current_setting('test.fq_certificate')::uuid)->>'id',false);
select pg_temp.queue_check(not public.begin_fiscal_send(current_setting('test.fq_operation')::uuid,current_setting('test.fq_old_token')::uuid,current_setting('test.fq_certificate')::uuid,'synthetic '||current_setting('test.fq_dps_id'),'BEGIN CERTIFICATE synthetic only'),'stale worker cannot start POST');
select pg_temp.queue_check(public.begin_fiscal_send(current_setting('test.fq_operation')::uuid,current_setting('test.fq_token')::uuid,current_setting('test.fq_certificate')::uuid,'synthetic '||current_setting('test.fq_dps_id'),'BEGIN CERTIFICATE synthetic only'),'dispatch is durably recorded before transport');
select pg_temp.queue_check(not public.begin_fiscal_send(current_setting('test.fq_operation')::uuid,current_setting('test.fq_token')::uuid,current_setting('test.fq_certificate')::uuid,'synthetic '||current_setting('test.fq_dps_id'),'BEGIN CERTIFICATE synthetic only'),'same DPS cannot start a second POST');
reset role;
select pg_temp.queue_check((select transmit_count=1 and status='sending' from public.fiscal_operations where id=current_setting('test.fq_operation')::uuid),'single transmission intent recorded');
update private.fiscal_execution set lease_until=now()-interval '1 second' where operation_id=current_setting('test.fq_operation')::uuid;
set role service_role;
select set_config('test.fq_reconcile_job',j::text,false),set_config('test.fq_reconcile_token',j->>'lease_token',false) from public.claim_fiscal_jobs(current_setting('test.fq_tenant')::uuid,1) j;
select pg_temp.queue_check(current_setting('test.fq_reconcile_job')::jsonb->>'mode'='reconcile','interrupted sending becomes reconciliation only');
select pg_temp.queue_check(not public.finish_fiscal_attempt(current_setting('test.fq_operation')::uuid,current_setting('test.fq_token')::uuid,'authorized',null,repeat('1',50),'synthetic'), 'stale completion cannot acknowledge a new lease');
select pg_temp.queue_check(public.finish_fiscal_attempt(current_setting('test.fq_operation')::uuid,current_setting('test.fq_reconcile_token')::uuid,'not_found','not_found'),'not found is recorded without permission to resend');
select pg_temp.queue_check(not public.manage_fiscal_operation('00000000-0000-4000-8000-000000000001',current_setting('test.fq_operation')::uuid,'cancel'),'once dispatch starts local cancellation is forbidden');
select pg_temp.queue_check(public.manage_fiscal_operation('00000000-0000-4000-8000-000000000001',current_setting('test.fq_operation')::uuid,'resume'),'manual recovery can request another consultation');
select set_config('test.fq_reconcile_token',j->>'lease_token',false) from public.claim_fiscal_jobs(current_setting('test.fq_tenant')::uuid,1) j;
do $$ begin
 begin perform public.finish_fiscal_attempt(current_setting('test.fq_operation')::uuid,current_setting('test.fq_reconcile_token')::uuid,'authorized',null,repeat('1',50),'<NFSe>unrelated</NFSe>'); raise exception 'Unrelated XML accepted';
 exception when invalid_parameter_value then perform pg_temp.queue_check(true,'document persistence requires operation and access-key binding'); end;
end $$;
select pg_temp.queue_check(public.finish_fiscal_attempt(current_setting('test.fq_operation')::uuid,current_setting('test.fq_reconcile_token')::uuid,'authorized',null,repeat('1',50),
 'SYNTHETIC DATABASE STATE TEST ONLY NFS'||repeat('1',50)||' '||current_setting('test.fq_dps_id')),'trusted server completion atomically stores document and status');
select pg_temp.queue_check(not public.finish_fiscal_attempt(current_setting('test.fq_operation')::uuid,current_setting('test.fq_reconcile_token')::uuid,'authorized',null,repeat('1',50),'duplicate'),'repeated completion creates no second document');
select pg_temp.queue_check(not public.manage_fiscal_operation('00000000-0000-4000-8000-000000000001',current_setting('test.fq_operation')::uuid,'resume'),'authorized operation cannot be resent');
reset role;
select set_config('test.fq_document',(select id::text from public.fiscal_documents where operation_id=current_setting('test.fq_operation')::uuid),false);
select pg_temp.queue_check((select count(*)=1 from public.fiscal_documents),'one immutable document per authorized operation');
select pg_temp.queue_check((select transmit_count=1 from public.fiscal_operations where id=current_setting('test.fq_operation')::uuid),'reconciliation never increments transmission count');
set role service_role;
select pg_temp.queue_check(public.fiscal_document_xml('00000000-0000-4000-8000-000000000001',current_setting('test.fq_document')::uuid) is not null,'owner document retrieval through trusted server');
select pg_temp.queue_check(public.fiscal_document_xml('00000000-0000-4000-8000-000000000002',current_setting('test.fq_document')::uuid) is null,'known document ID does not leak another tenant XML');
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.queue_check((public.fiscal_status_totals()->>'authorized')::integer=1,'dashboard aggregates real tenant status');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.queue_check((select count(*)=0 from public.fiscal_documents),'document metadata isolated');
reset role;
set role anon;
do $$ begin
 begin perform * from public.fiscal_operations; raise exception 'Anonymous queue read allowed';
 exception when insufficient_privilege then perform pg_temp.queue_check(true,'anonymous queue access denied'); end;
end $$;
reset role;
select set_config('test.fq_preferences_data',jsonb_set(jsonb_set(current_setting('test.fq_data')::jsonb,'{reference}','"Synthetic preference payment"'),'{amount}','"3.00"')::text,false);
select set_config('test.fq_preferences_configuration',jsonb_set(current_setting('test.fq_configuration')::jsonb,'{description}','"Updated synthetic affiliate service"')::text,false);
select set_config('test.fq_preferences_request',gen_random_uuid()::text,false);
set role service_role;
do $$ begin
 begin perform public.issue_standalone('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),current_setting('test.fq_preferences_request')::uuid,current_setting('test.fq_preferences_data')::jsonb,current_setting('test.fq_preferences_configuration')::jsonb,true,99); raise exception 'Stale template edit accepted';
 exception when serialization_failure then perform pg_temp.queue_check(true,'template conflict aborts queue transaction'); end;
end $$;
reset role;
select pg_temp.queue_check((select count(*)=3 from public.fiscal_operations),'template conflict leaves no partial financial operation');
set role service_role;
select pg_temp.queue_check((public.issue_standalone('00000000-0000-4000-8000-000000000001',current_setting('test.fq_company')::uuid,current_setting('test.fq_profile')::uuid,current_setting('test.fq_hash'),current_setting('test.fq_preferences_request')::uuid,current_setting('test.fq_preferences_data')::jsonb,current_setting('test.fq_preferences_configuration')::jsonb,true,1)->>'templateVersion')::integer=2,'edited affiliate defaults persist as a new template version');
select public.block_fiscal_dependencies(current_setting('test.fq_tenant')::uuid,null,'transmission_disabled');
reset role;
select pg_temp.queue_check((select not (defaults ? 'amount') and not (defaults ? 'competenceDate') from public.standalone_templates where company_id=current_setting('test.fq_company')::uuid order by version desc limit 1),'template never repeats an old per-note amount or competence');
select 'FISCAL_QUEUE_ASSERTIONS='||count(*) from queue_assertions;
