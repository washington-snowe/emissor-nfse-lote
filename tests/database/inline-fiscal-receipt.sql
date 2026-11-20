-- Disposable PostgreSQL fixture only. No real XML, certificate or HTTP.
begin;
create temporary table inline_assertions(name text primary key);
grant insert on inline_assertions to service_role;
create function pg_temp.inline_check(ok boolean,name text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Inline receipt assertion: %',name;end if;
 insert into pg_temp.inline_assertions values(name);end$$;
create temporary table inline_original as select dps_id,dps_number,transmit_count from public.fiscal_operations where id=current_setting('test.td_operation')::uuid;
update public.fiscal_operations set status='sending',environment='production' where id=current_setting('test.td_operation')::uuid;
update private.fiscal_execution set lease_token=current_setting('test.td_token')::uuid,lease_until=clock_timestamp()+interval '5 minutes' where operation_id=current_setting('test.td_operation')::uuid;
create function pg_temp.seed_inline(data jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 delete from private.fiscal_transport_diagnostics where operation_id=current_setting('test.td_operation')::uuid;
 insert into private.fiscal_transport_diagnostics(operation_id,lease_token,stage,details) values(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'submit',data);
end$$;
select pg_temp.seed_inline('{"phase":"intent"}');
set role service_role;
select pg_temp.inline_check(public.fiscal_inline_receipt_diagnostics_ready(),'readiness server only');
select pg_temp.inline_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'dps_lookup','{"phase":"failure","transport":"timeout","elapsedMs":10}'),'intent without response cannot attach lookup');
do $$declare response jsonb;begin
 for response in select '{"phase":"response","http":201,"format":"json_object","environment":"number_1","codes":[],"elapsedMs":1,"serverVersion":"SefinNacional_1.6.0"}'::jsonb||x from unnest(array[
  '{"http":200}'::jsonb,'{"http":400}'::jsonb,'{"environment":"number_2"}'::jsonb,'{"environment":"number_0"}'::jsonb,
  '{"serverVersion":"SefinNacional_1.5.0"}'::jsonb,'{"format":"html"}'::jsonb
 ]) x loop
  perform pg_temp.seed_inline(response);
  perform pg_temp.inline_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'dps_lookup','{"phase":"failure","transport":"timeout","elapsedMs":10}'),'wrong submit '||md5(response::text));
 end loop;
end$$;
reset role;
select pg_temp.seed_inline('{"phase":"response","http":201,"format":"json_object","environment":"number_1","codes":[],"elapsedMs":1,"serverVersion":"SefinNacional_1.6.0"}');
update public.fiscal_operations set environment='homologation' where id=current_setting('test.td_operation')::uuid;
set role service_role;
select pg_temp.inline_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'dps_lookup','{"phase":"failure","transport":"timeout","elapsedMs":10}'),'production exception never applies to homologation');
reset role;
update public.fiscal_operations set environment='production' where id=current_setting('test.td_operation')::uuid;
set role service_role;
select pg_temp.inline_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,gen_random_uuid(),'dps_lookup','{"phase":"failure","transport":"timeout","elapsedMs":10}'),'wrong lease fenced');
reset role;
update private.fiscal_execution set lease_until=clock_timestamp()-interval '1 second' where operation_id=current_setting('test.td_operation')::uuid;
set role service_role;
select pg_temp.inline_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'nfse_lookup','{"phase":"failure","transport":"timeout","elapsedMs":10}'),'expired lease fenced');
reset role;
update private.fiscal_execution set lease_until=clock_timestamp()+interval '5 minutes' where operation_id=current_setting('test.td_operation')::uuid;
select pg_temp.seed_inline('{"phase":"intent"}');
set role service_role;
do $$begin
 begin
  perform public.finish_fiscal_attempt_traced(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'uncertain','response_invalid',null,null,
   '[{"stage":"submit","data":{"phase":"response","http":201,"format":"json_object","environment":"number_1","codes":[],"elapsedMs":1,"serverVersion":"SefinNacional_1.6.0"}},{"stage":"dps_lookup","data":{"phase":"failure","transport":"timeout","elapsedMs":10}},{"stage":"nfse_lookup","data":{"phase":"response","raw":"NEVER STORE"}}]');
  raise exception 'Invalid bundle accepted';
 exception when invalid_parameter_value then perform pg_temp.inline_check(true,'invalid final entry rolls back whole bundle');end;
end$$;
reset role;
select pg_temp.inline_check((select count(*)=1 and bool_and(details->>'phase'='intent') from private.fiscal_transport_diagnostics where operation_id=current_setting('test.td_operation')::uuid),'no partial observations after rollback');
set role service_role;
select pg_temp.inline_check(public.finish_fiscal_attempt_traced(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'uncertain','response_invalid',null,null,
 '[{"stage":"submit","data":{"phase":"response","http":201,"format":"json_object","environment":"number_1","codes":[],"elapsedMs":1,"serverVersion":"SefinNacional_1.6.0"}},{"stage":"dps_lookup","data":{"phase":"response","http":200,"format":"json_object","environment":"number_1","codes":[],"elapsedMs":1}},{"stage":"nfse_lookup","data":{"phase":"response","http":200,"format":"json_object","environment":"number_1","codes":[],"elapsedMs":1}}]'),'three observations and outcome commit atomically');
reset role;
select pg_temp.inline_check((select count(*)=3 from private.fiscal_transport_diagnostics where operation_id=current_setting('test.td_operation')::uuid),'all three stages persisted');
select pg_temp.inline_check((select status='uncertain' and transmit_count=1 from public.fiscal_operations where id=current_setting('test.td_operation')::uuid),'metadata alone does not authorize or permit retransmission');
select pg_temp.inline_check((select row(o.dps_id,o.dps_number,o.transmit_count)=row(b.dps_id,b.dps_number,b.transmit_count) from public.fiscal_operations o cross join inline_original b where o.id=current_setting('test.td_operation')::uuid),'original identity and single transmission preserved');
select pg_temp.inline_check(not has_function_privilege('authenticated','public.fiscal_inline_receipt_diagnostics_ready()','execute') and not has_function_privilege('anon','public.fiscal_inline_receipt_diagnostics_ready()','execute'),'readiness not exposed to browser');
select 'INLINE_RECEIPT_ASSERTIONS='||count(*) from inline_assertions;
rollback;
