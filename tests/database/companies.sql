create temporary table passed_assertions(name text primary key);
grant insert on passed_assertions to anon, authenticated;
create function pg_temp.check_that(condition boolean, name text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'Assertion failed: %',name; end if;
 insert into pg_temp.passed_assertions values(name);
end $$;

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.check_that(public.valid_company_cnpj('11222333000181'),'numeric CNPJ validation');
select pg_temp.check_that(public.valid_company_cnpj('12ABC34501DE35'),'alphanumeric CNPJ validation');
select pg_temp.check_that(not public.valid_company_cnpj('11222333000182'),'invalid CNPJ rejected');
select pg_temp.check_that(not public.valid_company_cnpj('00000000000000'),'repeated digits rejected');
insert into public.companies(cnpj,legal_name,tax_regime) values('11222333000181','Empresa de teste A','mei');
select set_config('test.company_a',(select id::text from public.companies limit 1),false);
select set_config('test.tenant_a',public.current_tenant_id()::text,false);
select pg_temp.check_that((select count(*)=1 from public.companies),'owner reads own company');
update public.companies set trade_name='Nome ajustado' where id=current_setting('test.company_a')::uuid;
select pg_temp.check_that((select trade_name='Nome ajustado' from public.companies limit 1),'owner edits own company');
do $$ begin
 begin
  insert into public.companies(cnpj,legal_name,tax_regime) values('11222333000181','Duplicada','mei');
  raise exception 'Duplicate accepted';
 exception when unique_violation then perform pg_temp.check_that(true,'duplicate blocked within tenant'); end;
 begin
  insert into public.companies(cnpj,legal_name,tax_regime) values('11222333000182','Inválida','mei');
  raise exception 'Invalid CNPJ accepted';
 exception when check_violation then perform pg_temp.check_that(true,'database validates CNPJ independently'); end;
 begin
  insert into public.companies(cnpj,legal_name,tax_regime) values('12ABC34501DE35','Regime normal','normal');
  raise exception 'Unsupported regime accepted';
 exception when check_violation then perform pg_temp.check_that(true,'normal regime blocked'); end;
 begin
  update public.companies set cnpj='12ABC34501DE35';
  raise exception 'CNPJ identity changed';
 exception when insufficient_privilege then perform pg_temp.check_that(true,'company CNPJ is immutable'); end;
end $$;

do $$ begin
 for i in 1..10 loop
  if not public.consume_cnpj_lookup() then raise exception 'Quota rejected an allowed request'; end if;
 end loop;
 perform pg_temp.check_that(not public.consume_cnpj_lookup(),'durable quota rejects excess');
 begin
  update public.cnpj_lookup_limits set requests=1;
  raise exception 'Quota reset accepted';
 exception when insufficient_privilege then perform pg_temp.check_that(true,'client cannot reset quota'); end;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.check_that((select count(*)=0 from public.companies),'second tenant cannot see first company');
do $$ declare changed integer; begin
 update public.companies set legal_name='Ataque' where id=current_setting('test.company_a')::uuid;
 get diagnostics changed=row_count;
 perform pg_temp.check_that(changed=0,'foreign company cannot be updated by known ID');
 begin
  insert into public.companies(tenant_id,cnpj,legal_name,tax_regime) values(current_setting('test.tenant_a')::uuid,'12ABC34501DE35','Tenant forjado','mei');
  raise exception 'Forged tenant insert accepted';
 exception when insufficient_privilege then perform pg_temp.check_that(true,'foreign tenant insert blocked'); end;
end $$;
insert into public.companies(cnpj,legal_name,tax_regime) values('11222333000181','Empresa de teste B','simples');
select pg_temp.check_that((select count(*)=1 from public.companies),'same CNPJ can belong to different accounts without leaking existence');
select pg_temp.check_that(public.consume_cnpj_lookup(),'second tenant has independent quota');
do $$ begin
 begin
  update public.companies set tenant_id=current_setting('test.tenant_a')::uuid;
  raise exception 'Tenant transfer accepted';
 exception when insufficient_privilege then perform pg_temp.check_that(true,'company tenant cannot be transferred'); end;
 begin
  delete from public.companies;
  raise exception 'Physical deletion accepted';
 exception when insufficient_privilege then perform pg_temp.check_that(true,'physical deletion blocked'); end;
end $$;
select set_config('request.jwt.claims','{}',false);
select pg_temp.check_that((select count(*)=0 from public.companies),'missing identity reads no companies');
reset role;
set role anon;
do $$ begin
 begin
  perform * from public.companies;
  raise exception 'Anonymous company read accepted';
 exception when insufficient_privilege then perform pg_temp.check_that(true,'anonymous company read blocked'); end;
 begin
  perform public.consume_cnpj_lookup();
  raise exception 'Anonymous lookup quota accepted';
 exception when insufficient_privilege then perform pg_temp.check_that(true,'anonymous provider use blocked'); end;
end $$;
reset role;
select 'COMPANY_ASSERTIONS='||count(*) from passed_assertions;
