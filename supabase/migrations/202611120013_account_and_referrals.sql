begin;
create table public.account_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  display_name text not null check(length(display_name) between 2 and 100),
  phone text not null default '' check(length(phone)<=25),
  version integer not null check(version>0),updated_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
alter table public.account_profiles force row level security;
revoke all on public.account_profiles from public,anon,authenticated,service_role;
grant select on public.account_profiles to authenticated;
create policy account_profile_owner on public.account_profiles for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create function public.save_account_profile(p_name text,p_phone text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account uuid:=public.current_tenant_id(); saved public.account_profiles;
begin
  if account is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 100 or p_name~'[[:cntrl:]]' or p_phone is null or length(p_phone)>25 or p_phone!~'^[0-9+() .-]*$' then raise exception 'Invalid profile' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(account::text,23));
  if not private.take_limit(account,'save_profile',20) then raise exception 'Profile limit' using errcode='54000'; end if;
  select * into saved from public.account_profiles where tenant_id=account;
  if coalesce(saved.version,0) is distinct from p_expected_version then raise exception 'Profile changed' using errcode='40001'; end if;
  insert into public.account_profiles(tenant_id,display_name,phone,version) values(account,btrim(p_name),p_phone,p_expected_version+1)
    on conflict(tenant_id) do update set display_name=excluded.display_name,phone=excluded.phone,version=excluded.version,updated_at=now() returning * into saved;
  return jsonb_build_object('version',saved.version);
end $$;
revoke all on function public.save_account_profile(text,text,integer) from public,anon;
grant execute on function public.save_account_profile(text,text,integer) to authenticated;

create table private.referral_codes (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  code text not null unique check(code~'^[a-f0-9]{20}$'),created_at timestamptz not null default now()
);
create table private.referrals (
  referred_tenant uuid primary key references public.tenants(id) on delete restrict,
  referrer_tenant uuid not null references public.tenants(id) on delete restrict,
  created_at timestamptz not null default now(), check(referred_tenant<>referrer_tenant)
);
create index referrals_referrer_idx on private.referrals(referrer_tenant);
revoke all on private.referral_codes,private.referrals from public,anon,authenticated,service_role;
create function public.ensure_referral_code() returns text language plpgsql security definer set search_path='' as $$
declare account uuid:=public.current_tenant_id(); result text;
begin
  if account is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into private.referral_codes(tenant_id,code) values(account,substr(replace(gen_random_uuid()::text,'-',''),1,20)) on conflict(tenant_id) do nothing;
  select code into result from private.referral_codes where tenant_id=account;
  return result;
end $$;
create function public.claim_referral(p_code text) returns boolean language plpgsql security definer set search_path='' as $$
declare account uuid:=public.current_tenant_id(); referrer uuid; account_created timestamptz;
begin
  if account is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_code is null or p_code!~'^[a-f0-9]{20}$' then return false; end if;
  perform pg_advisory_xact_lock(913514721);
  if not private.take_limit(account,'claim_referral',10) then return false; end if;
  select created_at into account_created from public.tenants where id=account;
  if account_created<now()-interval '24 hours' or exists(select 1 from private.referrals where referred_tenant=account) then return false; end if;
  select tenant_id into referrer from private.referral_codes where code=p_code;
  if referrer is null or referrer=account then return false; end if;
  if exists(with recursive ancestors(id,depth) as (select referrer,1 union all
    select r.referrer_tenant,a.depth+1 from ancestors a join private.referrals r on r.referred_tenant=a.id where a.depth<64)
    select 1 from ancestors where id=account or depth=64) then return false; end if;
  insert into private.referrals(referred_tenant,referrer_tenant) values(account,referrer);
  return true;
end $$;
create function public.referral_summary() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('code',(select code from private.referral_codes where tenant_id=public.current_tenant_id()),
    'registrations',(select count(*) from private.referrals where referrer_tenant=public.current_tenant_id()),
    'attributed',exists(select 1 from private.referrals where referred_tenant=public.current_tenant_id()),
    'canAttribute',exists(select 1 from public.tenants where id=public.current_tenant_id() and created_at>=now()-interval '24 hours'));
$$;
revoke all on function public.ensure_referral_code(),public.claim_referral(text),public.referral_summary() from public,anon;
grant execute on function public.ensure_referral_code(),public.claim_referral(text),public.referral_summary() to authenticated;

create function public.list_company_fiscal_operations(p_company uuid,p_limit integer default 50,p_offset integer default 0)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(o)||jsonb_build_object('amount',o.amount::text,'foreign_amount',o.foreign_amount::text,
  'document',(select jsonb_build_object('id',d.id,'access_key',d.access_key) from public.fiscal_documents d where d.operation_id=o.id))
 from public.fiscal_operations o where company_id=p_company order by created_at desc,id
 limit greatest(1,least(p_limit,500)) offset greatest(0,least(p_offset,50000));
$$;
create function public.company_fiscal_totals(p_company uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from(select status,count(*) n from public.fiscal_operations where company_id=p_company group by status) s;
$$;
revoke all on function public.list_company_fiscal_operations(uuid,integer,integer),public.company_fiscal_totals(uuid) from public,anon;
grant execute on function public.list_company_fiscal_operations(uuid,integer,integer),public.company_fiscal_totals(uuid) to authenticated;
create function public.reserve_account_security_action() returns boolean language plpgsql security definer set search_path='' as $$
declare account uuid:=public.current_tenant_id();
begin
  if account is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return private.take_limit(account,'account_security_change',5);
end $$;
revoke all on function public.reserve_account_security_action() from public,anon;
grant execute on function public.reserve_account_security_action() to authenticated;
commit;
