begin;
create table public.billing_plans(code text primary key,name text not null,monthly_cents integer not null check(monthly_cents>0),included_notes integer not null check(included_notes>0),overage_cents integer not null check(overage_cents>0));
insert into public.billing_plans values('start','Start',1990,150,30),('afiliado','Afiliado',3990,500,18),('afiliado-5x','Afiliado 5x',9990,2500,6),('afiliado-10x','Afiliado 10x',14990,5000,5),('afiliado-20x','Afiliado 20x',19990,10000,3);
create table private.billing_accounts (
 tenant_id uuid not null references public.tenants(id),livemode boolean not null,customer_id text unique,customer_request uuid not null default gen_random_uuid(),customer_attempted_at timestamptz,
 token uuid,lease_until timestamptz,created_at timestamptz not null default now(),
 checkout_request uuid,checkout_plan text references public.billing_plans(code),checkout_cadence text check(checkout_cadence in('monthly','quarterly')),
 checkout_started_at timestamptz,checkout_session text,primary key(tenant_id,livemode)
);
create table private.stripe_prices(price_id text primary key,livemode boolean not null,plan_code text not null references public.billing_plans(code),cadence text not null check(cadence in('monthly','quarterly')),unit_cents integer not null,created_at timestamptz not null default now());
create table public.account_subscriptions(
 id text primary key,tenant_id uuid not null references public.tenants(id),livemode boolean not null,
 plan_code text not null references public.billing_plans(code),cadence text not null check(cadence in('monthly','quarterly')),
 status text not null check(status in('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
 billing_anchor timestamptz,period_start timestamptz not null,period_end timestamptz not null,cancel_at_period_end boolean not null,
 created_at timestamptz not null,updated_at timestamptz not null default now(),check(period_end>=period_start)
);
create index account_subscriptions_owner_idx on public.account_subscriptions(tenant_id,livemode,created_at desc);
create table public.billing_payments(
 id text primary key,tenant_id uuid not null references public.tenants(id),subscription_id text not null references public.account_subscriptions(id),livemode boolean not null,
 status text not null,paid_cents bigint not null check(paid_cents between 0 and 9007199254740991),refunded_cents bigint not null check(refunded_cents between 0 and paid_cents),
 cash_cents bigint not null check(cash_cents between 0 and paid_cents),
 paid_at timestamptz,created_at timestamptz not null,hosted_url text,
 updated_at timestamptz not null default now()
);
create index billing_payments_owner_idx on public.billing_payments(tenant_id,livemode,created_at desc);
create table private.stripe_events(id text primary key,tenant_id uuid not null,livemode boolean not null,type text not null,sha256 text not null,token uuid,completed_at timestamptz,
 foreign key(tenant_id,livemode) references private.billing_accounts(tenant_id,livemode));
create table private.referral_commissions(
 referred_tenant uuid not null references public.tenants(id),livemode boolean not null,referrer_tenant uuid not null references public.tenants(id),
 first_invoice text not null references public.billing_payments(id),paid_at timestamptz not null,net_paid_cents bigint not null check(net_paid_cents>=0),commission_cents bigint not null check(commission_cents>=0),
 updated_at timestamptz not null default now(),primary key(referred_tenant,livemode)
);
revoke all on private.billing_accounts,private.stripe_prices,private.stripe_events,private.referral_commissions from public,anon,authenticated,service_role;
alter table public.billing_plans enable row level security;
alter table public.billing_plans force row level security;
alter table public.account_subscriptions enable row level security;
alter table public.account_subscriptions force row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_payments force row level security;
revoke all on public.billing_plans,public.account_subscriptions,public.billing_payments from public,anon,authenticated,service_role;
grant select on public.billing_plans,public.account_subscriptions,public.billing_payments to authenticated;
create policy plans_read on public.billing_plans for select to authenticated using(true);
create policy subscription_owner on public.account_subscriptions for select to authenticated using(tenant_id=(select public.current_tenant_id()));
create policy payment_owner on public.billing_payments for select to authenticated using(tenant_id=(select public.current_tenant_id()));

create function public.claim_billing_account(p_actor uuid,p_live boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare account uuid; data private.billing_accounts; claim_token uuid:=gen_random_uuid();
begin
 select id into account from public.tenants where owner_user_id=p_actor;
 if account is null then raise exception 'Account unavailable' using errcode='42501'; end if;
 if not private.take_limit(account,'billing_action',10) then raise exception 'Billing limit' using errcode='54000'; end if;
 insert into private.billing_accounts(tenant_id,livemode) values(account,p_live) on conflict do nothing;
 select * into data from private.billing_accounts where tenant_id=account and livemode=p_live for update;
 if data.lease_until>now() then raise exception 'Billing busy' using errcode='55P03'; end if;
 update private.billing_accounts set token=claim_token,lease_until=now()+interval '90 seconds' where tenant_id=account and livemode=p_live returning * into data;
 return to_jsonb(data)||jsonb_build_object('subscriptions',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb) from public.account_subscriptions s where s.tenant_id=account and s.livemode=p_live and s.status not in('canceled','incomplete_expired')));
end $$;
create function public.mark_stripe_customer_attempt(p_tenant uuid,p_live boolean,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update private.billing_accounts set customer_attempted_at=coalesce(customer_attempted_at,now()) where tenant_id=p_tenant and livemode=p_live and token=p_token and lease_until>now() and (customer_attempted_at is null or customer_attempted_at>now()-interval '23 hours'); return found;
end $$;
revoke all on function public.mark_stripe_customer_attempt(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.mark_stripe_customer_attempt(uuid,boolean,uuid) to service_role;
create function public.bind_stripe_customer(p_tenant uuid,p_live boolean,p_token uuid,p_customer text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_customer!~'^cus_[A-Za-z0-9]+$' then raise exception 'Invalid customer' using errcode='22023'; end if;
 update private.billing_accounts set customer_id=p_customer where tenant_id=p_tenant and livemode=p_live and token=p_token and lease_until>now() and (customer_id is null or customer_id=p_customer);
 return found;
end $$;
create function public.prepare_stripe_checkout(p_tenant uuid,p_live boolean,p_token uuid,p_request uuid,p_plan text,p_cadence text,p_reset boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare data private.billing_accounts;
begin
 select * into data from private.billing_accounts where tenant_id=p_tenant and livemode=p_live and token=p_token and lease_until>now() for update;
 if data.tenant_id is null then raise exception 'Billing lease expired' using errcode='40001'; end if;
 if p_cadence not in('monthly','quarterly') or not exists(select 1 from public.billing_plans where code=p_plan) then raise exception 'Invalid plan' using errcode='22023'; end if;
 if exists(select 1 from public.account_subscriptions where tenant_id=p_tenant and livemode=p_live and status not in('canceled','incomplete_expired')) then raise exception 'Existing subscription' using errcode='23505'; end if;
 if p_reset or data.checkout_request is null then
  update private.billing_accounts set checkout_request=case when p_reset then gen_random_uuid() else p_request end,checkout_plan=p_plan,checkout_cadence=p_cadence,checkout_started_at=now(),checkout_session=null where tenant_id=p_tenant and livemode=p_live returning * into data;
 end if;
 return to_jsonb(data);
end $$;
create function public.save_stripe_checkout(p_tenant uuid,p_live boolean,p_token uuid,p_session text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_session!~'^cs_[A-Za-z0-9_]+$' then raise exception 'Invalid checkout' using errcode='22023'; end if;
 update private.billing_accounts set checkout_session=p_session where tenant_id=p_tenant and livemode=p_live and token=p_token and lease_until>now(); return found;
end $$;
create function public.release_billing_account(p_tenant uuid,p_live boolean,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin update private.billing_accounts set token=null,lease_until=null where tenant_id=p_tenant and livemode=p_live and token=p_token; return found; end $$;
create function public.stripe_price(p_live boolean,p_plan text,p_cadence text) returns text language sql stable security definer set search_path='' as $$
 select p.price_id from private.stripe_prices p join public.billing_plans b on b.code=p.plan_code where p.livemode=p_live and p.plan_code=p_plan and p.cadence=p_cadence
 and p.unit_cents=case when p_cadence='monthly' then b.monthly_cents else (b.monthly_cents::bigint*3*67+50)/100 end order by p.created_at desc limit 1;
$$;
create function public.store_stripe_price(p_live boolean,p_plan text,p_cadence text,p_price text,p_cents integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_price!~'^price_[A-Za-z0-9]+$' or p_cadence not in('monthly','quarterly') or not exists(select 1 from public.billing_plans where code=p_plan and p_cents=case when p_cadence='monthly' then monthly_cents else (monthly_cents::bigint*3*67+50)/100 end) then raise exception 'Invalid price' using errcode='22023'; end if;
 insert into private.stripe_prices values(p_price,p_live,p_plan,p_cadence,p_cents,now()) on conflict(price_id) do nothing;
end $$;
create function public.claim_stripe_event(p_id text,p_type text,p_customer text,p_live boolean,p_sha text) returns jsonb language plpgsql security definer set search_path='' as $$
declare data private.billing_accounts; existing private.stripe_events; claim_token uuid:=gen_random_uuid();
begin
 if p_id!~'^evt_[A-Za-z0-9]+$' or length(p_type)>100 or p_sha!~'^[a-f0-9]{64}$' then raise exception 'Invalid event' using errcode='22023'; end if;
 select * into data from private.billing_accounts where customer_id=p_customer and livemode=p_live for update;
 if data.tenant_id is null then return jsonb_build_object('ignored',true); end if;
 select * into existing from private.stripe_events where id=p_id;
 if existing.completed_at is not null then return jsonb_build_object('duplicate',true); end if;
 if data.lease_until>now() then raise exception 'Billing busy' using errcode='55P03'; end if;
 update private.billing_accounts set token=claim_token,lease_until=now()+interval '90 seconds' where tenant_id=data.tenant_id and livemode=p_live;
 insert into private.stripe_events(id,tenant_id,livemode,type,sha256,token) values(p_id,data.tenant_id,p_live,p_type,p_sha,claim_token)
 on conflict(id) do update set token=excluded.token where private.stripe_events.tenant_id=excluded.tenant_id and private.stripe_events.livemode=excluded.livemode;
 if not found then raise exception 'Event context mismatch' using errcode='42501'; end if;
 return jsonb_build_object('tenant_id',data.tenant_id,'customer_id',data.customer_id,'token',claim_token,'prices',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from private.stripe_prices p where p.livemode=p_live));
end $$;
create function public.apply_stripe_event(p_id text,p_live boolean,p_token uuid,p_subscription jsonb,p_invoices jsonb,p_first_invoice text) returns boolean language plpgsql security definer set search_path='' as $$
declare event private.stripe_events; account private.billing_accounts; item jsonb; plan private.stripe_prices; first_payment public.billing_payments; referral private.referrals; subscription jsonb;
begin
 select * into event from private.stripe_events where id=p_id and livemode=p_live and token=p_token and completed_at is null for update;
 if event.id is null then return false; end if;
 select * into account from private.billing_accounts where tenant_id=event.tenant_id and livemode=p_live and token=p_token and lease_until>now() for update;
 if account.tenant_id is null then return false; end if;
 if p_subscription is not null then
  if jsonb_typeof(p_subscription)<>'array' or jsonb_array_length(p_subscription)>3 then raise exception 'Invalid subscription snapshot' using errcode='22023'; end if;
  for subscription in select * from jsonb_array_elements(p_subscription) loop
  select * into plan from private.stripe_prices where price_id=subscription->>'price_id' and livemode=p_live;
  if plan.price_id is null or subscription->>'customer_id' is distinct from account.customer_id or subscription->>'tenant_id' is distinct from account.tenant_id::text then raise exception 'Subscription context mismatch' using errcode='42501'; end if;
  insert into public.account_subscriptions(id,tenant_id,livemode,plan_code,cadence,status,billing_anchor,period_start,period_end,cancel_at_period_end,created_at)
   values(subscription->>'id',account.tenant_id,p_live,plan.plan_code,plan.cadence,subscription->>'status',coalesce((subscription->>'billing_anchor')::timestamptz,(subscription->>'period_start')::timestamptz),(subscription->>'period_start')::timestamptz,(subscription->>'period_end')::timestamptz,(subscription->>'cancel_at_period_end')::boolean,(subscription->>'created_at')::timestamptz)
   on conflict(id) do update set plan_code=excluded.plan_code,cadence=excluded.cadence,status=excluded.status,billing_anchor=excluded.billing_anchor,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now() where public.account_subscriptions.tenant_id=excluded.tenant_id and public.account_subscriptions.livemode=excluded.livemode;
  end loop;
 end if;
 if p_invoices is not null then
  if jsonb_typeof(p_invoices)<>'array' or jsonb_array_length(p_invoices)>3 then raise exception 'Invalid invoice snapshot' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_invoices) loop
   if not exists(select 1 from public.account_subscriptions where id=item->>'subscription_id' and tenant_id=account.tenant_id and livemode=p_live) then raise exception 'Invoice context mismatch' using errcode='42501'; end if;
   insert into public.billing_payments(id,tenant_id,subscription_id,livemode,status,paid_cents,refunded_cents,cash_cents,paid_at,created_at,hosted_url)
    values(item->>'id',account.tenant_id,item->>'subscription_id',p_live,item->>'status',(item->>'paid_cents')::bigint,(item->>'refunded_cents')::bigint,(item->>'cash_cents')::bigint,(item->>'paid_at')::timestamptz,(item->>'created_at')::timestamptz,item->>'hosted_url')
    on conflict(id) do update set status=excluded.status,paid_cents=excluded.paid_cents,refunded_cents=excluded.refunded_cents,cash_cents=excluded.cash_cents,paid_at=excluded.paid_at,hosted_url=excluded.hosted_url,updated_at=now() where public.billing_payments.tenant_id=excluded.tenant_id and public.billing_payments.livemode=excluded.livemode;
  end loop;
 end if;
 if p_first_invoice is not null then
  select * into first_payment from public.billing_payments where id=p_first_invoice and tenant_id=account.tenant_id and livemode=p_live and cash_cents>0 and paid_at is not null;
  if first_payment.id is null then raise exception 'First payment unavailable' using errcode='22023'; end if;
  select * into referral from private.referrals where referred_tenant=account.tenant_id and created_at<=first_payment.paid_at;
  if referral.referred_tenant is not null then
   insert into private.referral_commissions(referred_tenant,livemode,referrer_tenant,first_invoice,paid_at,net_paid_cents,commission_cents)
    values(account.tenant_id,p_live,referral.referrer_tenant,first_payment.id,first_payment.paid_at,greatest(0,first_payment.cash_cents-first_payment.refunded_cents),((greatest(0,first_payment.cash_cents-first_payment.refunded_cents))*20+50)/100)
    on conflict(referred_tenant,livemode) do update set first_invoice=excluded.first_invoice,paid_at=excluded.paid_at,net_paid_cents=excluded.net_paid_cents,commission_cents=excluded.commission_cents,updated_at=now()
      where excluded.paid_at<=private.referral_commissions.paid_at;
  end if;
 end if;
 update private.stripe_events set completed_at=now() where id=p_id;
 update private.billing_accounts set token=null,lease_until=null where tenant_id=account.tenant_id and livemode=p_live and token=p_token;
 return true;
end $$;
-- Billable usage is recorded atomically with a real production authorization.
-- Homologation never consumes a paid allowance or creates a charge.
create table private.billing_usage_batches(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),subscription_id text not null references public.account_subscriptions(id),
 amount_cents bigint not null check(amount_cents>0),notes integer not null check(notes>0),month_start timestamptz not null,month_end timestamptz not null,
 status text not null default 'pending' check(status in('pending','sending','uncertain','recorded','intervention')),token uuid,lease_until timestamptz,first_attempt_at timestamptz,
 next_run_at timestamptz not null default now(),stripe_item text unique,created_at timestamptz not null default now()
);
create table private.billing_usage(
 operation_id uuid primary key references public.fiscal_operations(id),tenant_id uuid not null references public.tenants(id),subscription_id text references public.account_subscriptions(id),
 authorized_at timestamptz not null,month_start timestamptz,month_end timestamptz,unit_cents integer not null default 0 check(unit_cents>=0),
 status text not null check(status in('included','pending','unconfigured','batched')),batch_id uuid references private.billing_usage_batches(id)
);
create index billing_usage_pending_idx on private.billing_usage(tenant_id,status,authorized_at);
revoke all on private.billing_usage,private.billing_usage_batches from public,anon,authenticated,service_role;
create function private.billing_month(p_start timestamptz,p_at timestamptz) returns tstzrange language plpgsql immutable set search_path='' as $$
declare first_at timestamptz; next_at timestamptz; i integer; month_index integer;
begin
 if p_start is null or p_at<p_start then return null; end if;
 month_index:=(extract(year from p_at at time zone 'UTC')-extract(year from p_start at time zone 'UTC'))::integer*12+(extract(month from p_at at time zone 'UTC')-extract(month from p_start at time zone 'UTC'))::integer;
 first_at:=((p_start at time zone 'UTC')+make_interval(months=>greatest(0,month_index-1))) at time zone 'UTC';
 for i in greatest(1,month_index)..month_index+2 loop
  next_at:=((p_start at time zone 'UTC')+make_interval(months=>i)) at time zone 'UTC';
  if p_at<next_at then return tstzrange(first_at,next_at,'[)'); end if;
  first_at:=next_at;
 end loop;
 return null;
end $$;
create function private.record_billable_authorization() returns trigger language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations; subscription public.account_subscriptions; plan public.billing_plans; month tstzrange; used bigint;
begin
 select * into operation from public.fiscal_operations where id=new.operation_id;
 if operation.environment<>'production' or new.environment<>'production' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(operation.tenant_id::text,44));
 select * into subscription from public.account_subscriptions where tenant_id=operation.tenant_id and livemode and status in('active','trialing') and period_start<=new.created_at and period_end>new.created_at order by created_at desc limit 1;
 if subscription.id is null then
  insert into private.billing_usage(operation_id,tenant_id,authorized_at,status) values(operation.id,operation.tenant_id,new.created_at,'unconfigured') on conflict do nothing;
  return new;
 end if;
 month:=private.billing_month(coalesce(subscription.billing_anchor,subscription.period_start),new.created_at);
 if month is null then
  insert into private.billing_usage(operation_id,tenant_id,authorized_at,status) values(operation.id,operation.tenant_id,new.created_at,'unconfigured') on conflict do nothing;
  return new;
 end if;
 select * into plan from public.billing_plans where code=subscription.plan_code;
 select count(*) into used from private.billing_usage where tenant_id=operation.tenant_id and authorized_at>=lower(month) and authorized_at<upper(month);
 insert into private.billing_usage(operation_id,tenant_id,subscription_id,authorized_at,month_start,month_end,unit_cents,status)
 values(operation.id,operation.tenant_id,subscription.id,new.created_at,lower(month),upper(month),case when used>=plan.included_notes then plan.overage_cents else 0 end,case when used>=plan.included_notes then 'pending' else 'included' end) on conflict do nothing;
 return new;
end $$;
create trigger fiscal_document_usage after insert on public.fiscal_documents for each row execute function private.record_billable_authorization();
revoke all on function private.record_billable_authorization(),private.billing_month(timestamptz,timestamptz) from public,anon,authenticated,service_role;
create function public.claim_billing_usage(p_tenant uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare batch private.billing_usage_batches; account private.billing_accounts; item private.billing_usage; lease uuid:=gen_random_uuid(); unit_count integer;
begin
 select * into batch from private.billing_usage_batches where (p_tenant is null or tenant_id=p_tenant) and status in('pending','sending','uncertain') and next_run_at<=now() and (lease_until is null or lease_until<now()) order by created_at limit 1 for update skip locked;
 if batch.id is null then
  select * into item from private.billing_usage where (p_tenant is null or tenant_id=p_tenant) and status='pending' order by authorized_at limit 1 for update skip locked;
  if item.operation_id is null then return null; end if;
  select * into account from private.billing_accounts where tenant_id=item.tenant_id and livemode and (lease_until is null or lease_until<now()) for update skip locked;
  if account.customer_id is null then return null; end if;
  insert into private.billing_usage_batches(tenant_id,subscription_id,amount_cents,notes,month_start,month_end) values(item.tenant_id,item.subscription_id,1,1,item.month_start,item.month_end) returning * into batch;
  update private.billing_usage set batch_id=batch.id,status='batched' where operation_id in(select operation_id from private.billing_usage where tenant_id=item.tenant_id and subscription_id=item.subscription_id and unit_cents=item.unit_cents and month_start=item.month_start and status='pending' order by authorized_at limit 500 for update skip locked);
  get diagnostics unit_count=row_count;
  update private.billing_usage_batches set notes=unit_count,amount_cents=unit_count::bigint*item.unit_cents where id=batch.id returning * into batch;
 else
  select * into account from private.billing_accounts where tenant_id=batch.tenant_id and livemode and (lease_until is null or lease_until<now()) for update skip locked;
  if account.customer_id is null then return null; end if;
 end if;
 update private.billing_accounts set token=lease,lease_until=now()+interval '90 seconds' where tenant_id=account.tenant_id and livemode;
 update private.billing_usage_batches set token=lease,lease_until=now()+interval '90 seconds',status='sending' where id=batch.id returning * into batch;
 return to_jsonb(batch)||jsonb_build_object('customer_id',account.customer_id);
end $$;
create function public.mark_billing_usage_attempt(p_batch uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update private.billing_usage_batches set first_attempt_at=coalesce(first_attempt_at,now()) where id=p_batch and token=p_token and lease_until>now() and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours'); return found;
end $$;
create function public.finish_billing_usage(p_batch uuid,p_token uuid,p_item text) returns boolean language plpgsql security definer set search_path='' as $$
declare batch private.billing_usage_batches;
begin
 select * into batch from private.billing_usage_batches where id=p_batch and token=p_token and lease_until>now() for update;
 if batch.id is null then return false; end if;
 if p_item is not null and p_item!~'^ii_[A-Za-z0-9]+$' then raise exception 'Invalid usage receipt' using errcode='22023'; end if;
 update private.billing_usage_batches set status=case when p_item is not null then 'recorded' when first_attempt_at<now()-interval '23 hours' then 'intervention' else 'uncertain' end,stripe_item=p_item,lease_until=null,token=null,next_run_at=now()+interval '5 minutes' where id=batch.id;
 update private.billing_accounts set token=null,lease_until=null where tenant_id=batch.tenant_id and livemode and token=p_token;
 return true;
end $$;
revoke all on function public.claim_billing_usage(uuid),public.mark_billing_usage_attempt(uuid,uuid),public.finish_billing_usage(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_billing_usage(uuid),public.mark_billing_usage_attempt(uuid,uuid),public.finish_billing_usage(uuid,uuid,text) to service_role;

create function public.billing_account_summary(p_live boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('subscriptions',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb) from public.account_subscriptions s where tenant_id=public.current_tenant_id() and livemode=p_live),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) from(select id,status,paid_cents::text,refunded_cents::text,paid_at,created_at,hosted_url from public.billing_payments where tenant_id=public.current_tenant_id() and livemode=p_live order by created_at desc limit 50)p),
 'billable_authorizations',(select count(*) from private.billing_usage where p_live and tenant_id=public.current_tenant_id() and authorized_at>=coalesce((select lower(private.billing_month(coalesce(billing_anchor,period_start),now())) from public.account_subscriptions where tenant_id=public.current_tenant_id() and livemode=p_live and status in('active','trialing') order by created_at desc limit 1),now())),
 'homologation_authorizations',(select count(*) from public.fiscal_operations where tenant_id=public.current_tenant_id() and environment='homologation' and status='authorized'),
 'commission_cents',coalesce((select sum(commission_cents)::text from private.referral_commissions where referrer_tenant=public.current_tenant_id() and livemode=p_live),'0'),
 'paid_referrals',(select count(*) from private.referral_commissions where referrer_tenant=public.current_tenant_id() and livemode=p_live and commission_cents>0));
$$;
revoke all on function public.claim_billing_account(uuid,boolean),public.bind_stripe_customer(uuid,boolean,uuid,text),public.prepare_stripe_checkout(uuid,boolean,uuid,uuid,text,text,boolean),public.save_stripe_checkout(uuid,boolean,uuid,text),public.release_billing_account(uuid,boolean,uuid),public.stripe_price(boolean,text,text),public.store_stripe_price(boolean,text,text,text,integer),public.claim_stripe_event(text,text,text,boolean,text),public.apply_stripe_event(text,boolean,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_billing_account(uuid,boolean),public.bind_stripe_customer(uuid,boolean,uuid,text),public.prepare_stripe_checkout(uuid,boolean,uuid,uuid,text,text,boolean),public.save_stripe_checkout(uuid,boolean,uuid,text),public.release_billing_account(uuid,boolean,uuid),public.stripe_price(boolean,text,text),public.store_stripe_price(boolean,text,text,text,integer),public.claim_stripe_event(text,text,text,boolean,text),public.apply_stripe_event(text,boolean,uuid,jsonb,jsonb,text) to service_role;
revoke all on function public.billing_account_summary(boolean) from public,anon;
grant execute on function public.billing_account_summary(boolean) to authenticated;
create function public.billing_usage_ready(p_tenant uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.billing_usage where (p_tenant is null or tenant_id=p_tenant) and status='pending') or exists(select 1 from private.billing_usage_batches where (p_tenant is null or tenant_id=p_tenant) and status in('pending','sending','uncertain') and next_run_at<=now() and (lease_until is null or lease_until<now()));
$$;
revoke all on function public.billing_usage_ready(uuid) from public,anon,authenticated;
grant execute on function public.billing_usage_ready(uuid) to service_role;
commit;
