begin;

create function public.valid_company_cnpj(value text) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare total integer; weight integer; digit integer; i integer; base text := value;
begin
  if value collate "C" !~ '^[A-Z0-9]{12}[0-9]{2}$' or value ~ '^([0-9])\1{13}$' then return false; end if;
  for digit_index in 1..2 loop
    total := 0; weight := 2;
    for i in reverse (11 + digit_index)..1 loop
      total := total + (ascii(substr(base, i, 1)) - 48) * weight;
      weight := case when weight = 9 then 2 else weight + 1 end;
    end loop;
    digit := case when total % 11 < 2 then 0 else 11 - total % 11 end;
    if substr(value, 12 + digit_index, 1) <> digit::text then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_company_cnpj(text) from public, anon;
grant execute on function public.valid_company_cnpj(text) to authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete restrict,
  cnpj varchar(14) not null check (public.valid_company_cnpj(cnpj)),
  legal_name varchar(200) not null check (length(trim(legal_name)) > 0),
  trade_name varchar(200) not null default '',
  tax_regime text not null check (tax_regime in ('mei', 'simples')),
  address jsonb not null default '{}' check (jsonb_typeof(address) = 'object' and octet_length(address::text) <= 2500),
  email varchar(254) not null default '', phone varchar(30) not null default '', secondary_phone varchar(30) not null default '',
  main_cnae varchar(7) not null default '' check (main_cnae = '' or main_cnae ~ '^[0-9]{7}$'),
  main_cnae_description varchar(300) not null default '',
  secondary_cnaes jsonb not null default '[]' check (jsonb_typeof(secondary_cnaes) = 'array' and jsonb_array_length(secondary_cnaes) <= 100 and octet_length(secondary_cnaes::text) <= 40000),
  legal_nature varchar(150) not null default '', company_size varchar(100) not null default '', registration_status varchar(100) not null default '',
  opened_on date,
  mei_option boolean, simples_option boolean,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, cnpj), unique (tenant_id, id)
);

alter table public.companies enable row level security;
alter table public.companies force row level security;
revoke all on public.companies from public, anon, authenticated;
grant select, insert, update on public.companies to authenticated;
create policy companies_select on public.companies for select to authenticated using (tenant_id = (select public.current_tenant_id()));
create policy companies_insert on public.companies for insert to authenticated with check (tenant_id = (select public.current_tenant_id()));
create policy companies_update on public.companies for update to authenticated using (tenant_id = (select public.current_tenant_id())) with check (tenant_id = (select public.current_tenant_id()));

create function public.protect_company_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.tenant_id <> old.tenant_id or new.cnpj <> old.cnpj or new.created_at <> old.created_at then
    raise exception 'Company identity cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.protect_company_identity() from public, anon, authenticated;
create trigger protect_company_identity before update on public.companies for each row execute function public.protect_company_identity();

create table public.cnpj_lookup_limits (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  window_started_at timestamptz not null, requests integer not null check (requests between 1 and 10)
);
alter table public.cnpj_lookup_limits enable row level security;
alter table public.cnpj_lookup_limits force row level security;
revoke all on public.cnpj_lookup_limits from public, anon, authenticated;

create function public.consume_cnpj_lookup() returns boolean
language plpgsql security definer set search_path = '' as $$
declare own_tenant uuid := public.ensure_tenant(); accepted boolean;
begin
  insert into public.cnpj_lookup_limits as limits (tenant_id, window_started_at, requests)
  values (own_tenant, now(), 1)
  on conflict (tenant_id) do update set
    window_started_at = case when limits.window_started_at <= now() - interval '10 minutes' then now() else limits.window_started_at end,
    requests = case when limits.window_started_at <= now() - interval '10 minutes' then 1 else limits.requests + 1 end
  where limits.requests < 10 or limits.window_started_at <= now() - interval '10 minutes'
  returning true into accepted;
  return coalesce(accepted, false);
end;
$$;
revoke all on function public.consume_cnpj_lookup() from public, anon;
grant execute on function public.consume_cnpj_lookup() to authenticated;

commit;
