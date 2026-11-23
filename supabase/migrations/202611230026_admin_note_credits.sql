begin;

create table private.rex_admin (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null check (email = lower(email))
);

create table private.note_credit_challenges (
  id uuid primary key,
  actor_id uuid not null references private.rex_admin(user_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  quantity integer not null check (quantity between 1 and 10000),
  reason text not null check (char_length(reason) between 3 and 240),
  verifier bytea check (verifier is null or octet_length(verifier) = 32),
  attempts integer not null default 0 check (attempts between 0 and 5),
  state text not null default 'sending' check (state in ('sending', 'sent', 'closed')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check ((state = 'closed') = (verifier is null))
);
create index note_credit_challenges_actor_time on private.note_credit_challenges(actor_id, created_at desc);

create table private.note_credit_grants (
  id uuid primary key,
  actor_id uuid not null,
  tenant_id uuid not null references public.tenants(id),
  quantity integer not null check (quantity between 1 and 10000),
  remaining integer not null check (remaining between 0 and quantity),
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index note_credit_grants_available on private.note_credit_grants(tenant_id, created_at, id) where remaining > 0;

create table private.note_credit_usage (
  operation_id uuid primary key references public.fiscal_operations(id),
  grant_id uuid not null references private.note_credit_grants(id),
  authorized_at timestamptz not null
);

alter table private.rex_admin enable row level security;
alter table private.note_credit_challenges enable row level security;
alter table private.note_credit_grants enable row level security;
alter table private.note_credit_usage enable row level security;
revoke all on private.rex_admin, private.note_credit_challenges, private.note_credit_grants, private.note_credit_usage
  from public, anon, authenticated, service_role;

create function private.is_rex_admin(p_actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.rex_admin a join auth.users u on u.id = a.user_id
    where a.user_id = p_actor and lower(u.email) = a.email and u.email_confirmed_at is not null
    and coalesce(u.banned_until, '-infinity') <= now()
  );
$$;
revoke all on function private.is_rex_admin(uuid) from public, anon, authenticated, service_role;

create function public.rex_admin_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_rex_admin(auth.uid());
$$;
revoke all on function public.rex_admin_access() from public, anon, authenticated;
grant execute on function public.rex_admin_access() to authenticated;

create function public.rex_admin_dashboard(p_actor uuid, p_search text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_rex_admin(p_actor) then raise exception 'Forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(matches)) from (
        select t.id, u.email,
          coalesce((select sum(g.remaining) from private.note_credit_grants g where g.tenant_id = t.id), 0) as remaining
        from public.tenants t join auth.users u on u.id = t.owner_user_id
        where u.email_confirmed_at is not null
          and position(lower(left(coalesce(p_search, ''), 254)) in lower(u.email)) > 0
        order by u.email, t.id limit 25
      ) matches
    ), '[]'::jsonb),
    'grants', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc, recent.id desc) from (
        select g.id, u.email, g.quantity, g.remaining, g.reason, g.created_at
        from private.note_credit_grants g join public.tenants t on t.id = g.tenant_id
        join auth.users u on u.id = t.owner_user_id
        order by g.created_at desc, g.id desc limit 30
      ) recent
    ), '[]'::jsonb),
    'accounts_total', (select count(*) from public.tenants),
    'granted', (select coalesce(sum(quantity), 0) from private.note_credit_grants),
    'available', (select coalesce(sum(remaining), 0) from private.note_credit_grants)
  ) into result;
  return result;
end;
$$;

create function public.rex_begin_note_credit(
  p_actor uuid, p_id uuid, p_tenant uuid, p_quantity integer, p_reason text, p_verifier text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  if not private.is_rex_admin(p_actor) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_id is null or p_verifier is null or p_verifier !~ '^[0-9a-f]{64}$'
     or p_quantity is null or p_quantity not between 1 and 10000
     or p_reason is null or char_length(btrim(p_reason)) not between 3 and 240 then
    raise exception 'Invalid credit request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text, 49));
  if exists (select 1 from private.note_credit_challenges where actor_id = p_actor and created_at > clock_timestamp() - interval '60 seconds')
    or (select count(*) from private.note_credit_challenges where actor_id = p_actor and created_at > clock_timestamp() - interval '1 hour') >= 5 then
    return null;
  end if;

  select u.email into recipient from public.tenants t join auth.users u on u.id = t.owner_user_id
    where t.id = p_tenant and u.email_confirmed_at is not null;
  if recipient is null then raise exception 'Invalid recipient' using errcode = '22023'; end if;

  update private.note_credit_challenges set state = 'closed', verifier = null
    where actor_id = p_actor and state <> 'closed';
  delete from private.note_credit_challenges
    where actor_id = p_actor and created_at < clock_timestamp() - interval '7 days';
  insert into private.note_credit_challenges(id, actor_id, tenant_id, quantity, reason, verifier, expires_at)
    values (p_id, p_actor, p_tenant, p_quantity, btrim(p_reason), decode(p_verifier, 'hex'), clock_timestamp() + interval '10 minutes');
  return jsonb_build_object('recipient', recipient, 'destination',
    (select email from private.rex_admin where user_id = p_actor));
end;
$$;

create function public.rex_finish_note_credit_delivery(p_actor uuid, p_id uuid, p_delivered boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_rex_admin(p_actor) then raise exception 'Forbidden' using errcode = '42501'; end if;
  update private.note_credit_challenges
    set state = case when p_delivered is true then 'sent' else 'closed' end,
        verifier = case when p_delivered is true then verifier end
    where id = p_id and actor_id = p_actor and state = 'sending' and expires_at > clock_timestamp();
  return found and p_delivered is true;
end;
$$;

create function public.rex_confirm_note_credit(p_actor uuid, p_id uuid, p_verifier text) returns text
language plpgsql security definer set search_path = '' as $$
declare challenge private.note_credit_challenges;
begin
  if not private.is_rex_admin(p_actor) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_verifier is null or p_verifier !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into challenge from private.note_credit_challenges where id = p_id and actor_id = p_actor for update;
  if not found or challenge.state <> 'sent' then return 'closed'; end if;

  if challenge.expires_at <= clock_timestamp() then
    update private.note_credit_challenges set state = 'closed', verifier = null where id = p_id;
    return 'closed';
  end if;

  if challenge.verifier <> decode(p_verifier, 'hex') then
    update private.note_credit_challenges set attempts = attempts + 1,
      state = case when attempts = 4 then 'closed' else state end,
      verifier = case when attempts < 4 then verifier end
      where id = p_id;
    return case when challenge.attempts = 4 then 'closed' else 'invalid' end;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(challenge.tenant_id::text, 44));
  insert into private.note_credit_grants(id, actor_id, tenant_id, quantity, remaining, reason)
    values (p_id, p_actor, challenge.tenant_id, challenge.quantity, challenge.quantity, challenge.reason);
  update private.note_credit_challenges set state = 'closed', verifier = null where id = p_id;
  return 'granted';
end;
$$;

revoke all on function public.rex_admin_dashboard(uuid, text),
  public.rex_begin_note_credit(uuid, uuid, uuid, integer, text, text),
  public.rex_finish_note_credit_delivery(uuid, uuid, boolean),
  public.rex_confirm_note_credit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rex_admin_dashboard(uuid, text),
  public.rex_begin_note_credit(uuid, uuid, uuid, integer, text, text),
  public.rex_finish_note_credit_delivery(uuid, uuid, boolean),
  public.rex_confirm_note_credit(uuid, uuid, text) to service_role;

create function public.rex_note_credit_balance() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(g.remaining), 0) from private.note_credit_grants g join public.tenants t on t.id = g.tenant_id
    where t.owner_user_id = auth.uid();
$$;
revoke all on function public.rex_note_credit_balance() from public, anon, authenticated;
grant execute on function public.rex_note_credit_balance() to authenticated;

alter table private.billing_usage drop constraint billing_usage_status_check;
alter table private.billing_usage add constraint billing_usage_status_check
  check (status in ('included', 'pending', 'unconfigured', 'batched', 'free_credit'));

create or replace function private.record_billable_authorization() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  operation public.fiscal_operations;
  subscription public.account_subscriptions;
  plan public.billing_plans;
  month tstzrange;
  used bigint;
  credit_id uuid;
begin
  select * into operation from public.fiscal_operations where id = new.operation_id;
  if operation.environment <> 'production' or new.environment <> 'production' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(operation.tenant_id::text, 44));
  if exists (select 1 from private.billing_usage where operation_id = operation.id) then return new; end if;

  select * into subscription from public.account_subscriptions
    where tenant_id = operation.tenant_id and livemode and status in ('active', 'trialing')
    and period_start <= new.created_at and period_end > new.created_at order by created_at desc limit 1;
  month := private.billing_month(coalesce(subscription.billing_anchor, subscription.period_start), new.created_at);
  if subscription.id is not null and month is not null then
    select * into plan from public.billing_plans where code = subscription.plan_code;
    select count(*) into used from private.billing_usage where tenant_id = operation.tenant_id and subscription_id is not null
      and authorized_at >= lower(month) and authorized_at < upper(month);
    if used < plan.included_notes then
      insert into private.billing_usage(operation_id, tenant_id, subscription_id, authorized_at, month_start, month_end, status)
        values (operation.id, operation.tenant_id, subscription.id, new.created_at, lower(month), upper(month), 'included');
      return new;
    end if;
  end if;

  select g.id into credit_id from private.note_credit_grants g
    where g.tenant_id = operation.tenant_id and g.remaining > 0 and g.created_at <= new.created_at
    order by g.created_at, g.id limit 1 for update;
  if credit_id is not null then
    update private.note_credit_grants set remaining = remaining - 1 where id = credit_id;
    insert into private.note_credit_usage(operation_id, grant_id, authorized_at) values (operation.id, credit_id, new.created_at);
    insert into private.billing_usage(operation_id, tenant_id, authorized_at, status)
      values (operation.id, operation.tenant_id, new.created_at, 'free_credit');
  elsif subscription.id is null or month is null then
    insert into private.billing_usage(operation_id, tenant_id, authorized_at, status)
      values (operation.id, operation.tenant_id, new.created_at, 'unconfigured');
  else
    insert into private.billing_usage(operation_id, tenant_id, subscription_id, authorized_at, month_start, month_end, unit_cents, unit_subcents, status)
      values (operation.id, operation.tenant_id, subscription.id, new.created_at, lower(month), upper(month),
        coalesce(plan.overage_cents, 0), coalesce(plan.overage_units, 0), 'pending');
  end if;
  return new;
end;
$$;

commit;
