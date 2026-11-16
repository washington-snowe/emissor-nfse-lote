-- Disposable fixture only. No real XML, holder or A1.
create temporary table schema_assertions(name text primary key);
grant insert on schema_assertions to anon,authenticated,service_role;
create function pg_temp.schema_check(ok boolean,name text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'Schema diagnostic assertion: %',name; end if;
 insert into pg_temp.schema_assertions values(name);end $$;
select pg_temp.schema_check(private.valid_fiscal_diagnostic('{"phase":"intent"}'),'old intent accepted');
select pg_temp.schema_check(private.valid_fiscal_diagnostic('{"phase":"failure","transport":"timeout","elapsedMs":5}'),'old failure accepted');
select pg_temp.schema_check(private.valid_fiscal_diagnostic('{"phase":"response","http":400,"format":"json_object","environment":"number_2","codes":["E1235"],"elapsedMs":8,"xsdFields":["cTribNac","versao"],"dpsIdentity":"null","serverVersion":"SefinNacional_1.4.0"}'),'bounded schema evidence accepted');
do $$ declare base jsonb:='{"phase":"response","http":400,"format":"json_object","environment":"number_2","codes":["E1235"],"elapsedMs":8}'; bad jsonb; begin
 for bad in select * from unnest(array[
  base||'{"xsdFields":["PRIVATE_DATA"]}'::jsonb,
  base||'{"xsdFields":null}'::jsonb,
  base||jsonb_build_object('xsdFields',to_jsonb(array_fill('DPS'::text,array[11]))),
  base||'{"xsdFields":["DPS"],"codes":["E0710"]}'::jsonb,
  base||'{"dpsIdentity":"DPS_PRIVATE"}'::jsonb,
  base||'{"dpsIdentity":null}'::jsonb,
  base||'{"serverVersion":"PRIVATE_DATA"}'::jsonb,
  base||'{"serverVersion":"SefinNacional_1.4.0\nPRIVATE"}'::jsonb,
  base||'{"raw":"PRIVATE_DATA"}'::jsonb,
  '{"phase":"failure","transport":"timeout","elapsedMs":5,"xsdFields":[]}'::jsonb
 ]) loop perform pg_temp.schema_check(not private.valid_fiscal_diagnostic(bad),'invalid metadata '||md5(bad::text));end loop;
end $$;
create temporary table schema_before as select o.id,to_jsonb(o) as operation,to_jsonb(e) as execution
 from public.fiscal_operations o join private.fiscal_execution e on e.operation_id=o.id where o.id=current_setting('test.td_operation')::uuid;
set role authenticated;
do $$ begin
 begin perform public.fiscal_xml_snapshot_for_diagnostic('00000000-0000-4000-8000-000000000001',current_setting('test.td_operation')::uuid);raise exception 'client read private XML';
 exception when insufficient_privilege then perform pg_temp.schema_check(true,'authenticated cannot read snapshot directly');end;
end $$;
reset role;
set role anon;
do $$ begin
 begin perform public.fiscal_xml_snapshot_for_diagnostic('00000000-0000-4000-8000-000000000001',current_setting('test.td_operation')::uuid);raise exception 'anonymous snapshot';
 exception when insufficient_privilege then perform pg_temp.schema_check(true,'anonymous cannot read snapshot');end;
end $$;
reset role;
set role service_role;
select pg_temp.schema_check(public.fiscal_schema_diagnostics_ready(),'readiness installed');
select pg_temp.schema_check(public.fiscal_xml_snapshot_for_diagnostic('00000000-0000-4000-8000-000000000002',current_setting('test.td_operation')::uuid) is null,'foreign actor cannot read snapshot');
do $$ declare snapshot jsonb; i integer; begin
 for i in 1..11 loop
  snapshot:=public.fiscal_xml_snapshot_for_diagnostic('00000000-0000-4000-8000-000000000001',current_setting('test.td_operation')::uuid);
  if i<=10 then
   if snapshot is null or (select array_agg(k order by k) from jsonb_object_keys(snapshot) k) is distinct from array['certificatePem','id','sha256','xml'] then raise exception 'invalid snapshot fields'; end if;
  else perform pg_temp.schema_check(snapshot is null,'quota enforced without spending foreign actor request');end if;
 end loop;
 perform pg_temp.schema_check(true,'only original signed snapshot hash id and public certificate returned');
end $$;
reset role;
select pg_temp.schema_check((select b.operation=to_jsonb(o) and b.execution=to_jsonb(e) from schema_before b join public.fiscal_operations o on o.id=b.id join private.fiscal_execution e on e.operation_id=b.id),'snapshot analysis does not modify operation counter lease or XML');
select 'SCHEMA_ASSERTIONS='||count(*) from schema_assertions;
