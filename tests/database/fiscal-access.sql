create temporary table fiscal_access_assertions(name text primary key);
grant insert on fiscal_access_assertions to authenticated,anon,service_role;
create function pg_temp.access_check(condition boolean,name text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'Fiscal metadata assertion failed: %',name; end if;
 insert into pg_temp.fiscal_access_assertions values(name);
end $$;
select set_config('test.access_cert',(select id::text from public.company_certificates where created_by='00000000-0000-4000-8000-000000000001' limit 1),false);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
do $$ begin
 begin perform public.store_official_nfse_contract('homologation','https://example.invalid',repeat('a',64),'{}'); raise exception 'User published contract';
 exception when insufficient_privilege then perform pg_temp.access_check(true,'contract writing is server only'); end;
 begin perform public.record_fiscal_access('00000000-0000-4000-8000-000000000001',current_setting('test.access_cert')::uuid,200,'response_received'); raise exception 'User forged access evidence';
 exception when insufficient_privilege then perform pg_temp.access_check(true,'access checks are server only'); end;
 begin perform * from private.nfse_api_contracts; raise exception 'Private document storage exposed';
 exception when insufficient_privilege then perform pg_temp.access_check(true,'raw contract storage private'); end;
end $$;
reset role;
set role service_role;
do $$ begin
 begin perform public.store_official_nfse_contract('homologation','https://example.invalid/schema',repeat('a',64),'{"paths":{"/nfse":{}}}'); raise exception 'Wrong official origin accepted';
 exception when invalid_parameter_value then perform pg_temp.access_check(true,'contract source environment pinned'); end;
 begin perform public.record_fiscal_access('00000000-0000-4000-8000-000000000002',current_setting('test.access_cert')::uuid,200,'response_received'); raise exception 'Wrong actor accepted';
 exception when insufficient_privilege then perform pg_temp.access_check(true,'access check actor ownership enforced'); end;
end $$;
-- Synthetic metadata only; never run this fixture in the hosted project.
select public.store_official_nfse_contract('homologation','https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/test-fixture',repeat('a',64),'{"paths":{"/nfse":{"post":{}}},"models":{}}');
select public.record_fiscal_access('00000000-0000-4000-8000-000000000001',current_setting('test.access_cert')::uuid,200,'response_received');
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.access_check((select count(*)=1 from public.fiscal_access_checks),'owner sees own connection check');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.access_check((select count(*)=0 from public.fiscal_access_checks),'other account cannot read connection check');
reset role;
set role anon;
select pg_temp.access_check(jsonb_array_length(public.nfse_contract_status())=1,'structural API documentation is explicit public metadata');
do $$ begin
 begin perform * from public.fiscal_access_checks; raise exception 'Anonymous fiscal check read allowed';
 exception when insufficient_privilege then perform pg_temp.access_check(true,'anonymous account connection data denied'); end;
end $$;
reset role;
delete from private.nfse_api_contracts;
select 'FISCAL_ACCESS_ASSERTIONS='||count(*) from fiscal_access_assertions;
