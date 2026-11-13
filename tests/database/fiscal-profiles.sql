-- Synthetic DB fixtures only; never run in the hosted Supabase project.
create temporary table profile_assertions(name text primary key);
grant insert on profile_assertions to authenticated,anon,service_role;
create function pg_temp.profile_check(condition boolean,name text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'Fiscal profile assertion failed: %',name; end if;
 insert into pg_temp.profile_assertions values(name);
end $$;
select set_config('test.profile_company_a',(select c.id::text from public.companies c join public.tenants t on t.id=c.tenant_id where t.owner_user_id='00000000-0000-4000-8000-000000000001' limit 1),false);
select set_config('test.profile_config',jsonb_build_object('simplesOption',(select case tax_regime when 'mei' then '2' else '3' end from public.companies where id=current_setting('test.profile_company_a')::uuid),'issuerMunicipality','3550308','series','00001')::text,false);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
do $$ begin
 begin perform public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,0,current_setting('test.profile_config')::jsonb,'synthetic evidence','2026-01-01'); raise exception 'Client invoked trusted save';
 exception when insufficient_privilege then perform pg_temp.profile_check(true,'save RPC is server only'); end;
 begin insert into public.company_fiscal_profiles default values; raise exception 'Direct insert allowed';
 exception when insufficient_privilege then perform pg_temp.profile_check(true,'direct profile insert denied'); end;
 begin update public.company_fiscal_profiles set version=2; raise exception 'Direct mutation allowed';
 exception when insufficient_privilege then perform pg_temp.profile_check(true,'immutable profile updates denied'); end;
 begin delete from public.company_fiscal_profiles; raise exception 'Direct delete allowed';
 exception when insufficient_privilege then perform pg_temp.profile_check(true,'profile deletion denied'); end;
end $$;
reset role;
set role service_role;
do $$ begin
 begin perform public.save_fiscal_profile('00000000-0000-4000-8000-000000000002',current_setting('test.profile_company_a')::uuid,0,current_setting('test.profile_config')::jsonb,'synthetic evidence','2026-01-01'); raise exception 'Wrong actor accepted';
 exception when insufficient_privilege then perform pg_temp.profile_check(true,'server still enforces actor ownership'); end;
 begin perform public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,0,jsonb_set(current_setting('test.profile_config')::jsonb,'{simplesOption}','"1"'),'synthetic evidence','2026-01-01'); raise exception 'Normal regime accepted';
 exception when invalid_parameter_value then perform pg_temp.profile_check(true,'normal regime excluded'); end;
 begin perform public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,0,jsonb_set(current_setting('test.profile_config')::jsonb,'{series}','"50000"'),'synthetic evidence','2026-01-01'); raise exception 'Reserved series accepted';
 exception when invalid_parameter_value then perform pg_temp.profile_check(true,'own application series range enforced'); end;
end $$;
select set_config('test.profile_id',(public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,0,current_setting('test.profile_config')::jsonb,'synthetic evidence','2026-01-01')->>'id'),false);
select pg_temp.profile_check((public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,1,current_setting('test.profile_config')::jsonb,'synthetic evidence','2026-01-01')->>'id')=current_setting('test.profile_id'),'unchanged save is idempotent');
do $$ begin
 begin perform public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,0,current_setting('test.profile_config')::jsonb,'stale synthetic edit','2026-01-01'); raise exception 'Stale overwrite accepted';
 exception when serialization_failure then perform pg_temp.profile_check(true,'stale edit blocked by expected version'); end;
end $$;
select pg_temp.profile_check((public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,1,jsonb_set(current_setting('test.profile_config')::jsonb,'{series}','"00002"'),'updated synthetic evidence','2026-01-01')->>'version')::integer=2,'edit appends a new version');
reset role;
select pg_temp.profile_check((select count(*)=2 from public.company_fiscal_profiles),'both historical versions retained');
select pg_temp.profile_check((select configuration->>'series'='00001' from public.company_fiscal_profiles where id=current_setting('test.profile_id')::uuid),'original configuration unmodified');
select pg_temp.profile_check((select count(*)=2 from public.audit_events where event='fiscal_profile.saved'),'exactly one audit event per version');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.profile_check((select count(*)=2 from public.company_fiscal_profiles),'owner can read own profile versions');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.profile_check((select count(*)=0 from public.company_fiscal_profiles),'other tenant cannot read known profiles');
select set_config('request.jwt.claims','{}',false);
select pg_temp.profile_check((select count(*)=0 from public.company_fiscal_profiles),'missing identity reveals no profile');
reset role;
set role anon;
do $$ begin
 begin perform * from public.company_fiscal_profiles; raise exception 'Anonymous profile read allowed';
 exception when insufficient_privilege then perform pg_temp.profile_check(true,'anonymous profile access denied'); end;
end $$;
reset role;
-- Date-only correction must append a version, retain the original configuration/hash and fence stale saves.
begin;
select set_config('test.profile_prior',(select row_to_json(p)::text from public.company_fiscal_profiles p where company_id=current_setting('test.profile_company_a')::uuid order by version desc limit 1),true);
set role service_role;
select pg_temp.profile_check((public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,
  (current_setting('test.profile_prior')::jsonb->>'version')::integer,current_setting('test.profile_prior')::jsonb->'configuration','Synthetic date-only correction','2025-01-01')->>'version')::integer=3,'date correction appends another version');
do $$ begin
 begin perform public.save_fiscal_profile('00000000-0000-4000-8000-000000000001',current_setting('test.profile_company_a')::uuid,2,current_setting('test.profile_prior')::jsonb->'configuration','stale date correction','2024-01-01');raise exception 'Stale correction accepted';
 exception when serialization_failure then perform pg_temp.profile_check(true,'date correction still enforces expected version');end;
end $$;
reset role;
select pg_temp.profile_check((select configuration=(current_setting('test.profile_prior')::jsonb->'configuration') and configuration_sha256=current_setting('test.profile_prior')::jsonb->>'configuration_sha256' from public.company_fiscal_profiles where company_id=current_setting('test.profile_company_a')::uuid order by version desc limit 1),'date correction preserves parameters and configuration hash');
select pg_temp.profile_check((select valid_from=(current_setting('test.profile_prior')::jsonb->>'valid_from')::date from public.company_fiscal_profiles where id=(current_setting('test.profile_prior')::jsonb->>'id')::uuid),'earlier historical profile row remains unchanged');
select 'PROFILE_DATE_ASSERTIONS='||count(*) from profile_assertions where name like 'date correction%' or name like 'earlier historical%';
rollback;
select 'PROFILE_ASSERTIONS='||count(*) from profile_assertions;
