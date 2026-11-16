-- Disposable PostgreSQL only. Uses the concurrent dispatch fixture, never a real certificate or HTTP call.
create temporary table transport_assertions(name text primary key);
grant insert on transport_assertions to authenticated,anon,service_role;
create function pg_temp.transport_check(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'Transport diagnostic assertion: %',name; end if;
 insert into pg_temp.transport_assertions values(name); end $$;
set role service_role;
select pg_temp.transport_check(public.fiscal_diagnostics_ready(),'readiness installed');
do $$ begin
 begin perform public.begin_fiscal_send(null,null,null,null,null);raise exception 'legacy dispatch remains callable';exception when insufficient_privilege then perform pg_temp.transport_check(true,'legacy worker cannot bypass tracing');end;
 begin perform * from private.fiscal_transport_diagnostics;raise exception 'private traces exposed';exception when insufficient_privilege then perform pg_temp.transport_check(true,'service cannot read private traces directly');end;
end $$;
select pg_temp.transport_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,gen_random_uuid(),'submit','{"phase":"failure","transport":"timeout","elapsedMs":20}'),'stale lease fenced');
select pg_temp.transport_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'dps_lookup','{"phase":"failure","transport":"timeout","elapsedMs":20}'),'lookup metadata cannot be attached to sending');
do $$ declare bad jsonb; begin
 for bad in select * from unnest(array[
  '{"phase":"failure","transport":"SECRET","elapsedMs":1}'::jsonb,
  '{"phase":"failure","transport":"timeout","elapsedMs":1,"password":"NEVER STORE"}'::jsonb,
  '{"phase":"failure","transport":"timeout","elapsedMs":1.5}'::jsonb,
  '{"phase":"response","http":403,"format":null,"environment":"missing","codes":[],"elapsedMs":1}'::jsonb,
  '{"phase":"response","http":403,"format":"html","environment":"private","codes":[],"elapsedMs":1}'::jsonb,
  '{"phase":"response","http":403,"format":"html","environment":"missing","codes":["PRIVATE BODY"],"elapsedMs":1}'::jsonb,
  '{"phase":"response","http":999,"format":"html","environment":"missing","codes":[],"elapsedMs":1}'::jsonb
 ]) loop
  begin perform public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'submit',bad);raise exception 'invalid diagnostic accepted';
  exception when invalid_parameter_value then null;end;
 end loop;
 perform pg_temp.transport_check(true,'unknown keys strings null numeric bounds and codes rejected');
end $$;
select pg_temp.transport_check(public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'submit','{"phase":"response","http":403,"format":"json_object","environment":"number_2","codes":["E0710"],"elapsedMs":900}'),'same final metadata replay is idempotent');
select pg_temp.transport_check(not public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'submit','{"phase":"failure","transport":"timeout","elapsedMs":20}'),'final response cannot be overwritten');
reset role;
select pg_temp.transport_check((select status='sending' and transmit_count=1 from public.fiscal_operations where id=current_setting('test.td_operation')::uuid),'diagnostics do not authorize reject or retransmit');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.transport_check(jsonb_array_length(public.fiscal_transport_diagnostic_report(current_setting('test.td_operation')::uuid))=1,'owner sees trace through guarded RPC');
select pg_temp.transport_check(public.fiscal_transport_diagnostic_report(current_setting('test.td_operation')::uuid)#>>'{0,data,http}'='403','HTTP preserved for owner');
select pg_temp.transport_check(strpos(public.fiscal_transport_diagnostic_report(current_setting('test.td_operation')::uuid)::text,current_setting('test.td_token'))=0,'lease token omitted from report');
do $$ begin
 begin perform public.record_fiscal_transport_diagnostic(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'submit','{}');raise exception 'owner forged diagnostic';exception when insufficient_privilege then perform pg_temp.transport_check(true,'owner cannot forge diagnostic');end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.transport_check(public.fiscal_transport_diagnostic_report(current_setting('test.td_operation')::uuid) is null,'foreign tenant cannot see trace');
reset role;
set role anon;
do $$ begin
 begin perform public.fiscal_transport_diagnostic_report(current_setting('test.td_operation')::uuid);raise exception 'anonymous read';exception when insufficient_privilege then perform pg_temp.transport_check(true,'anonymous access denied');end;
end $$;
reset role;
-- A failed outcome transaction must not leave a partial lookup diagnostic.
update public.fiscal_operations set status='reconciling' where id=current_setting('test.td_operation')::uuid;
set role service_role;
do $$ begin
 begin perform public.finish_fiscal_attempt(null,null,'uncertain');raise exception 'legacy finish bypass';exception when insufficient_privilege then perform pg_temp.transport_check(true,'legacy worker cannot finish without traced wrapper');end;
 begin perform public.finish_fiscal_attempt_traced(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'invalid',null,null,null,
 '[{"stage":"dps_lookup","data":{"phase":"response","http":404,"format":"json_object","environment":"number_0","codes":["E2404"],"elapsedMs":40}}]');
 raise exception 'invalid outcome accepted';exception when invalid_parameter_value then perform pg_temp.transport_check(true,'invalid outcome rolls back diagnostic bundle');end;
end $$;
reset role;
select pg_temp.transport_check((select count(*)=0 from private.fiscal_transport_diagnostics where operation_id=current_setting('test.td_operation')::uuid and stage='dps_lookup'),'no partial diagnostic after failed outcome');
set role service_role;
select pg_temp.transport_check(public.finish_fiscal_attempt_traced(current_setting('test.td_operation')::uuid,current_setting('test.td_token')::uuid,'not_found','not_found',null,null,
 '[{"stage":"dps_lookup","data":{"phase":"response","http":404,"format":"json_object","environment":"number_0","codes":["E2404"],"elapsedMs":40}}]'),'lookup and outcome commit together');
reset role;
select pg_temp.transport_check((select status='uncertain' and transmit_count=1 from public.fiscal_operations where id=current_setting('test.td_operation')::uuid) and
 (select count(*)=1 from private.fiscal_transport_diagnostics where operation_id=current_setting('test.td_operation')::uuid and stage='dps_lookup'),'committed outcome has durable diagnostic without reemission');
select 'TRANSPORT_ASSERTIONS='||count(*) from transport_assertions;
