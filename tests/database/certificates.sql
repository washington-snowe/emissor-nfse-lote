create temporary table certificate_assertions(name text primary key);
grant insert on certificate_assertions to authenticated,anon,service_role;
create function pg_temp.cert_check(condition boolean,name text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'Certificate assertion failed: %',name; end if;
 insert into pg_temp.certificate_assertions values(name);
end $$;
select set_config('test.cert_company',(select c.id::text from public.companies c join public.tenants t on t.id=c.tenant_id where t.owner_user_id='00000000-0000-4000-8000-000000000001' limit 1),false);
select set_config('test.cert_id',gen_random_uuid()::text,false);
insert into public.company_certificates(id,tenant_id,company_id,subject_cnpj,fingerprint,serial_number,valid_from,valid_until,created_by)
 select current_setting('test.cert_id')::uuid,tenant_id,id,cnpj,repeat('a',64),'test-only',now()-interval '1 day',now()+interval '1 day','00000000-0000-4000-8000-000000000001'
 from public.companies where id=current_setting('test.cert_company')::uuid;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
select pg_temp.cert_check((select count(*)=1 from public.company_certificates),'owner sees certificate metadata');
do $$ begin
 begin update public.company_certificates set status='active'; raise exception 'Client mutated certificate';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'client cannot change certificate state'); end;
 begin perform envelope from private.certificate_envelopes; raise exception 'Client read envelope';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'encrypted payload is not exposed directly'); end;
 begin perform public.certificate_material(current_setting('test.cert_company')::uuid,current_setting('test.cert_id')::uuid,'emit'); raise exception 'Client obtained decryption material';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'decryption RPC unavailable to authenticated user'); end;
 begin perform public.revoke_certificate('00000000-0000-4000-8000-000000000001',current_setting('test.cert_id')::uuid); raise exception 'Client called trusted revocation directly';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'revocation requires authenticated server boundary'); end;
 begin perform public.store_certificate('00000000-0000-4000-8000-000000000001',current_setting('test.cert_company')::uuid,gen_random_uuid(),'{}','{}',''); raise exception 'Client inserted trusted certificate';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'certificate upload RPC is server only'); end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',false);
select pg_temp.cert_check((select count(*)=0 from public.company_certificates where id=current_setting('test.cert_id')::uuid),'known foreign certificate ID is invisible');
select set_config('request.jwt.claims','{}',false);
select pg_temp.cert_check((select count(*)=0 from public.company_certificates),'cleared session has no certificates');
reset role;
set role service_role;
do $$ begin
 for i in 1..10 loop
  if not public.reserve_company_operation('00000000-0000-4000-8000-000000000001',current_setting('test.cert_company')::uuid,'inspect_certificate') then raise exception 'Early certificate quota denial'; end if;
 end loop;
 perform pg_temp.cert_check(not public.reserve_company_operation('00000000-0000-4000-8000-000000000001',current_setting('test.cert_company')::uuid,'inspect_certificate'),'expensive A1 inspection has durable per-account quota');
 begin perform public.reserve_company_operation('00000000-0000-4000-8000-000000000002',current_setting('test.cert_company')::uuid,'inspect_certificate'); raise exception 'Foreign quota accepted';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'quota reservation checks actor ownership'); end;
 begin perform public.reserve_company_operation('00000000-0000-4000-8000-000000000001',current_setting('test.cert_company')::uuid,'unrestricted'); raise exception 'Unknown operation accepted';
 exception when invalid_parameter_value then perform pg_temp.cert_check(true,'operation quota is allowlisted'); end;
end $$;
do $$ begin
 begin perform public.revoke_certificate('00000000-0000-4000-8000-000000000002',current_setting('test.cert_id')::uuid); raise exception 'Foreign actor revoked certificate';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'trusted revoke checks owner independently'); end;
 begin perform public.certificate_material(current_setting('test.cert_company')::uuid,current_setting('test.cert_id')::uuid,'emit'); raise exception 'Missing key material accepted';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'missing encrypted material fails closed'); end;
end $$;
select pg_temp.cert_check(public.revoke_certificate('00000000-0000-4000-8000-000000000001',current_setting('test.cert_id')::uuid),'owner can deactivate certificate through trusted server');
do $$ begin
 begin perform public.certificate_material(current_setting('test.cert_company')::uuid,current_setting('test.cert_id')::uuid,'emit'); raise exception 'Revoked certificate usable';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'revoked certificate cannot be used'); end;
end $$;
reset role;
-- This image lacks Vault. Do not mock encryption or claim its live integration was tested.
do $$ begin
 if to_regclass('vault.decrypted_secrets') is null then
  begin perform public.store_certificate('00000000-0000-4000-8000-000000000001',current_setting('test.cert_company')::uuid,gen_random_uuid(),'{}','{}',''); raise exception 'Missing manager accepted';
  exception when object_not_in_prerequisite_state then perform pg_temp.cert_check(true,'missing Vault blocks storage before accepting any key'); end;
 end if;
end $$;
set role anon;
do $$ begin
 begin perform * from public.company_certificates; raise exception 'Anonymous certificate read allowed';
 exception when insufficient_privilege then perform pg_temp.cert_check(true,'anonymous certificate access denied'); end;
end $$;
reset role;
select 'CERTIFICATE_ASSERTIONS='||count(*) from certificate_assertions;
