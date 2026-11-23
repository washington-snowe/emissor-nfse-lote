begin;

-- Preserve subscriptions and invoices associated with the previous catalog.
alter table public.billing_plans
  add column for_sale boolean not null default false,
  add column overage_units integer check (overage_units > 0),
  alter column overage_cents drop not null,
  add constraint billing_plan_tariff check (num_nonnulls(overage_cents,overage_units)=1);

insert into public.billing_plans(code,name,monthly_cents,included_notes,overage_units,for_sale) values
 ('start-v2','Start',1490,150,993,true),
 ('afiliado-pro','Afiliado Pro',3490,600,582,true),
 ('escala','Escala',6990,2500,280,true),
 ('top-afiliado','Top Afiliado',13990,10000,140,true);

alter table public.account_subscriptions drop constraint account_subscriptions_cadence_check;
alter table public.account_subscriptions add constraint account_subscriptions_cadence_check check(cadence in ('monthly','quarterly','annual'));
alter table private.billing_accounts drop constraint billing_accounts_checkout_cadence_check;
alter table private.billing_accounts add constraint billing_accounts_checkout_cadence_check check(checkout_cadence in ('monthly','quarterly','annual'));
alter table private.stripe_prices drop constraint stripe_prices_cadence_check;
alter table private.stripe_prices add constraint stripe_prices_cadence_check check(cadence in ('monthly','quarterly','annual'));

create function private.catalog_amount(p_plan public.billing_plans,p_cadence text) returns bigint
language sql immutable set search_path='' as $$
 select case
   when p_cadence='monthly' then p_plan.monthly_cents
   when p_cadence='annual' and p_plan.for_sale then p_plan.monthly_cents::bigint*12*80/100
   when p_cadence='quarterly' and not p_plan.for_sale then (p_plan.monthly_cents::bigint*3*67+50)/100
 end
$$;
revoke all on function private.catalog_amount(public.billing_plans,text) from public,anon,authenticated,service_role;

create or replace function public.stripe_price(p_live boolean,p_plan text,p_cadence text) returns text
language sql stable security definer set search_path='' as $$
 select p.price_id from private.stripe_prices p join public.billing_plans b on b.code=p.plan_code
 where p.livemode=p_live and p.plan_code=p_plan and p.cadence=p_cadence
   and p.unit_cents=private.catalog_amount(b,p_cadence)
 order by p.created_at desc limit 1
$$;

create or replace function public.store_stripe_price(p_live boolean,p_plan text,p_cadence text,p_price text,p_cents integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_price is null or p_price!~'^price_[A-Za-z0-9]+$' or not exists(
   select 1 from public.billing_plans b where b.code=p_plan and p_cents=private.catalog_amount(b,p_cadence)
 ) then raise exception 'Invalid price' using errcode='22023';end if;
 insert into private.stripe_prices values(p_price,p_live,p_plan,p_cadence,p_cents,now()) on conflict(price_id) do nothing;
 if not exists(select 1 from private.stripe_prices where price_id=p_price and livemode=p_live and plan_code=p_plan and cadence=p_cadence and unit_cents=p_cents)
 then raise exception 'Conflicting Stripe price' using errcode='23505';end if;
end $$;

create or replace function public.prepare_stripe_checkout(p_tenant uuid,p_live boolean,p_token uuid,p_request uuid,p_plan text,p_cadence text,p_reset boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare data private.billing_accounts;
begin
 select * into data from private.billing_accounts where tenant_id=p_tenant and livemode=p_live and token=p_token and lease_until>now() for update;
 if data.tenant_id is null then raise exception 'Billing lease expired' using errcode='40001';end if;
 if p_cadence is null or p_cadence not in ('monthly','annual') or not exists(select 1 from public.billing_plans where code=p_plan and for_sale)
 then raise exception 'Invalid plan' using errcode='22023';end if;
 if exists(select 1 from public.account_subscriptions where tenant_id=p_tenant and livemode=p_live and status not in ('canceled','incomplete_expired'))
 then raise exception 'Existing subscription' using errcode='23505';end if;
 if p_reset or data.checkout_request is null then
  update private.billing_accounts set checkout_request=case when p_reset then gen_random_uuid() else p_request end,
   checkout_plan=p_plan,checkout_cadence=p_cadence,checkout_started_at=now(),checkout_session=null
  where tenant_id=p_tenant and livemode=p_live returning * into data;
 end if;
 return to_jsonb(data);
end $$;

alter table private.billing_usage add column unit_subcents integer not null default 0 check (unit_subcents>=0);
alter table private.billing_usage_batches
 add column method text not null default 'renewal' check (method in ('renewal','immediate')),
 add column remainder_subcents integer not null default 0 check (remainder_subcents between 0 and 99),
 add column stripe_invoice text unique check (stripe_invoice ~ '^in_[A-Za-z0-9]+$'),
 add constraint immediate_usage_minimum check (method <> 'immediate' or amount_cents >= 50);

create or replace function private.record_billable_authorization() returns trigger
language plpgsql security definer set search_path='' as $$
declare operation public.fiscal_operations; subscription public.account_subscriptions; plan public.billing_plans; month tstzrange; used bigint;
begin
 select * into operation from public.fiscal_operations where id=new.operation_id;
 if operation.environment<>'production' or new.environment<>'production' then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(operation.tenant_id::text,44));
 select * into subscription from public.account_subscriptions where tenant_id=operation.tenant_id and livemode and status in ('active','trialing')
   and period_start<=new.created_at and period_end>new.created_at order by created_at desc limit 1;
 month:=private.billing_month(coalesce(subscription.billing_anchor,subscription.period_start),new.created_at);
 if subscription.id is null or month is null then
   insert into private.billing_usage(operation_id,tenant_id,authorized_at,status)
   values(operation.id,operation.tenant_id,new.created_at,'unconfigured') on conflict do nothing;
   return new;
 end if;
 select * into plan from public.billing_plans where code=subscription.plan_code;
 select count(*) into used from private.billing_usage where tenant_id=operation.tenant_id and subscription_id is not null
   and authorized_at>=lower(month) and authorized_at<upper(month);
 insert into private.billing_usage(operation_id,tenant_id,subscription_id,authorized_at,month_start,month_end,unit_cents,unit_subcents,status)
 values(operation.id,operation.tenant_id,subscription.id,new.created_at,lower(month),upper(month),
   case when used>=plan.included_notes then coalesce(plan.overage_cents,0) else 0 end,
   case when used>=plan.included_notes then coalesce(plan.overage_units,0) else 0 end,
   case when used>=plan.included_notes then 'pending' else 'included' end) on conflict do nothing;
 return new;
end $$;

-- A new invoice can only be created if the exact accumulated tariff reaches 0.50 BRL.
-- Fractions of a cent are carried forward. Do not collect another batch after an unresolved old intent.
create function private.billable_usage_accounts(p_tenant uuid) returns table(tenant_id uuid,subscription_id text,first_at timestamptz)
language sql stable set search_path='' as $$
 select u.tenant_id,u.subscription_id,min(u.authorized_at)
 from private.billing_usage u join private.billing_accounts a on a.tenant_id=u.tenant_id and a.livemode and a.customer_id is not null
   and (a.lease_until is null or a.lease_until<now())
 where u.status='pending' and (p_tenant is null or u.tenant_id=p_tenant)
 and not exists(select 1 from private.billing_usage_batches b where b.subscription_id=u.subscription_id and b.method='immediate' and b.status<>'recorded')
 group by u.tenant_id,u.subscription_id
 having sum(u.unit_cents)>0 or sum(u.unit_subcents)+coalesce((
   select b.remainder_subcents from private.billing_usage_batches b
   where b.subscription_id=u.subscription_id and b.method='immediate' and b.status='recorded'
   order by b.created_at desc,b.id desc limit 1),0)>=5000
$$;
revoke all on function private.billable_usage_accounts(uuid) from public,anon,authenticated,service_role;

create or replace function public.claim_billing_usage(p_tenant uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare batch private.billing_usage_batches; account private.billing_accounts; item private.billing_usage;
  candidate record; candidate_tenant uuid; lease uuid:=gen_random_uuid(); selected uuid[]; units bigint; notes integer;
  from_at timestamptz; until_at timestamptz; cents bigint; remainder integer:=0; billing_method text;
begin
 select b.* into batch from private.billing_usage_batches b join private.billing_accounts a
   on a.tenant_id=b.tenant_id and a.livemode and a.customer_id is not null and (a.lease_until is null or a.lease_until<now())
 where (p_tenant is null or b.tenant_id=p_tenant) and b.status in ('pending','sending','uncertain')
   and b.next_run_at<=now() and (b.lease_until is null or b.lease_until<now())
 order by b.created_at limit 1 for update of b skip locked;
 if batch.id is null then
  select * into candidate from private.billable_usage_accounts(p_tenant) order by first_at limit 1;
  if candidate.tenant_id is null then return null;end if;
  candidate_tenant:=candidate.tenant_id;
 end if;
 select * into account from private.billing_accounts where tenant_id=coalesce(batch.tenant_id,candidate_tenant) and livemode
   and (lease_until is null or lease_until<now()) for update skip locked;
 if account.customer_id is null then return null;end if;
 if batch.id is null then
  select * into item from private.billing_usage where tenant_id=account.tenant_id and subscription_id=candidate.subscription_id
    and status='pending' order by authorized_at,operation_id limit 1 for update skip locked;
  if item.operation_id is null then return null;end if;
  if item.unit_subcents>0 then
   if exists(select 1 from private.billing_usage_batches where subscription_id=item.subscription_id and method='immediate' and status<>'recorded')
   then return null;end if;
   select b.remainder_subcents into remainder from private.billing_usage_batches b
    where b.subscription_id=item.subscription_id and b.method='immediate' and b.status='recorded'
    order by b.created_at desc,b.id desc limit 1;
   select array_agg(o.operation_id),sum(o.unit_subcents),min(o.month_start),max(o.month_end)
    into selected,units,from_at,until_at from (
      select operation_id,unit_subcents,month_start,month_end from private.billing_usage
      where tenant_id=item.tenant_id and subscription_id=item.subscription_id and status='pending' and unit_subcents>0
      order by authorized_at,operation_id limit 500 for update skip locked
    ) o;
   units:=coalesce(units,0)+coalesce(remainder,0);
   if units<5000 then return null;end if;
   cents:=units/100;remainder:=units%100;billing_method:='immediate';
  else
   select array_agg(o.operation_id),sum(o.unit_cents) into selected,cents from (
     select operation_id,unit_cents from private.billing_usage where tenant_id=item.tenant_id and subscription_id=item.subscription_id
       and status='pending' and unit_cents=item.unit_cents and month_start=item.month_start
     order by authorized_at,operation_id limit 500 for update skip locked
   ) o;
   from_at:=item.month_start;until_at:=item.month_end;billing_method:='renewal';
  end if;
  notes:=cardinality(selected);
  if coalesce(notes,0)=0 or coalesce(cents,0)<=0 then return null;end if;
  insert into private.billing_usage_batches(tenant_id,subscription_id,amount_cents,notes,month_start,month_end,method,remainder_subcents,created_at)
  values(item.tenant_id,item.subscription_id,cents,notes,from_at,until_at,billing_method,remainder,clock_timestamp()) returning * into batch;
  update private.billing_usage set batch_id=batch.id,status='batched' where operation_id=any(selected);
 end if;
 update private.billing_accounts set token=lease,lease_until=now()+interval '90 seconds' where tenant_id=account.tenant_id and livemode;
 update private.billing_usage_batches set token=lease,lease_until=now()+interval '90 seconds',status='sending' where id=batch.id returning * into batch;
 return to_jsonb(batch)||jsonb_build_object('customer_id',account.customer_id);
end $$;

create function public.bind_billing_usage_invoice(p_batch uuid,p_token uuid,p_invoice text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_invoice is null or p_invoice!~'^in_[A-Za-z0-9]+$' then return false;end if;
 update private.billing_usage_batches set stripe_invoice=p_invoice
 where id=p_batch and token=p_token and lease_until>now() and status='sending' and method='immediate'
   and first_attempt_at is not null and (stripe_invoice is null or stripe_invoice=p_invoice);
 return found;
end $$;
revoke all on function public.bind_billing_usage_invoice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.bind_billing_usage_invoice(uuid,uuid,text) to service_role;

create function public.billing_usage_invoice_context(p_tenant uuid,p_live boolean,p_customer text,p_batch uuid,p_invoice text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('subscriptionId',b.subscription_id,'amountCents',b.amount_cents)
 from private.billing_usage_batches b join private.billing_accounts a on a.tenant_id=b.tenant_id and a.livemode
 where p_live and a.tenant_id=p_tenant and a.customer_id=p_customer and b.id=p_batch and b.stripe_invoice=p_invoice
   and b.method='immediate' and b.first_attempt_at is not null
$$;
revoke all on function public.billing_usage_invoice_context(uuid,boolean,text,uuid,text) from public,anon,authenticated;
grant execute on function public.billing_usage_invoice_context(uuid,boolean,text,uuid,text) to service_role;

create or replace function public.finish_billing_usage(p_batch uuid,p_token uuid,p_item text) returns boolean
language plpgsql security definer set search_path='' as $$
declare batch private.billing_usage_batches;
begin
 select * into batch from private.billing_usage_batches where id=p_batch and token=p_token and lease_until>now() for update;
 if batch.id is null then return false;end if;
 if p_item is not null and (
   (batch.method='renewal' and p_item!~'^ii_[A-Za-z0-9]+$') or
   (batch.method='immediate' and p_item is distinct from batch.stripe_invoice)
 ) then raise exception 'Invalid usage receipt' using errcode='22023';end if;
 update private.billing_usage_batches set
   status=case when p_item is not null then 'recorded' when first_attempt_at<now()-interval '23 hours' then 'intervention' else 'uncertain' end,
   stripe_item=case when method='renewal' then p_item else null end,lease_until=null,token=null,next_run_at=now()+interval '5 minutes' where id=batch.id;
 update private.billing_accounts set token=null,lease_until=null where tenant_id=batch.tenant_id and livemode and token=p_token;
 return true;
end $$;

create or replace function public.billing_usage_ready(p_tenant uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.billable_usage_accounts(p_tenant)) or exists(
  select 1 from private.billing_usage_batches where (p_tenant is null or tenant_id=p_tenant)
    and status in ('pending','sending','uncertain') and next_run_at<=now() and (lease_until is null or lease_until<now())
 )
$$;

-- The private schema contains only application tables. The SECURITY DEFINER owners
-- retain access to the tables behind guarded RPCs. Browser roles have no policies.
do $rls$
declare relation record;
begin
 for relation in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='private' and c.relkind in ('r','p')
 loop
   execute format('alter table private.%I enable row level security',relation.relname);
 end loop;
end $rls$;

notify pgrst, 'reload schema';
commit;
