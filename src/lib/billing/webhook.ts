import { objectId, stripeId, stripeUrl } from "./stripe-contract.ts";
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const integer = (value: unknown) => { if (!Number.isSafeInteger(value) || (value as number)<0) throw new Error("Invalid Stripe amount"); return value as number; };
const timestamp = (value: unknown) => { const seconds=integer(value); const date=new Date(seconds*1000); if (!Number.isFinite(date.getTime())) throw new Error("Invalid Stripe timestamp"); return date.toISOString(); };
export type StripeEvent = { id: string; type: string; livemode: boolean; data: { object: Json } };
export const supportedEvents = new Set(["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed","invoice.voided","invoice.marked_uncollectible","charge.refunded"]);
export function readStripeEvent(value: unknown): StripeEvent | null {
  const raw=record(value), data=record(raw.data), object=record(data.object);
  return stripeId(raw.id,"evt") && typeof raw.type==="string" && raw.type.length<=100 && typeof raw.livemode==="boolean" && stripeId(object.customer,"cus") ? raw as unknown as StripeEvent : null;
}
export type StripeSnapshot = { subscriptions: Json[]; invoices: Json[]; firstInvoice: string | null };
export async function stripeSnapshot(event: StripeEvent, context: { tenant_id: string; customer_id: string; prices: { price_id: string }[] }, get: (path: string, params?: Record<string,string>)=>Promise<Json>): Promise<StripeSnapshot> {
  const subscriptions=new Map<string,Json>(), invoices=new Map<string,Json>();
  async function subscription(id: unknown) {
    if (!stripeId(id,"sub")) throw new Error("Invalid subscription ID");
    if (subscriptions.has(id)) return subscriptions.get(id)!;
    const raw=await get("/subscriptions/"+id), metadata=record(raw.metadata), items=record(raw.items).data;
    if (objectId(raw.customer)!==context.customer_id || metadata.application!=="emissor-nfse" || metadata.tenant_id!==context.tenant_id || raw.livemode!==event.livemode || !Array.isArray(items) || items.length!==1) throw new Error("Subscription context mismatch");
    const price=record(record(items[0]).price), priceId=objectId(price);
    if (!context.prices.some(item=>item.price_id===priceId) || price.currency!=="brl" || record(items[0]).quantity!==1) throw new Error("Unknown subscription price");
    if (!["incomplete","incomplete_expired","trialing","active","past_due","canceled","unpaid","paused"].includes(String(raw.status)) || typeof raw.cancel_at_period_end!=="boolean") throw new Error("Unknown subscription state");
    const result={ id,customer_id: context.customer_id,tenant_id: context.tenant_id,price_id: priceId,status: raw.status,
      billing_anchor: timestamp(raw.billing_cycle_anchor ?? raw.current_period_start),period_start: timestamp(raw.current_period_start),period_end: timestamp(raw.current_period_end),created_at: timestamp(raw.created),cancel_at_period_end: raw.cancel_at_period_end };
    subscriptions.set(id,result); return result;
  }
  async function invoice(id: unknown, supplied?: Json) {
    if (!stripeId(id,"in")) throw new Error("Invalid invoice ID");
    if (invoices.has(id)) return invoices.get(id)!;
    const raw=supplied ?? await get("/invoices/"+id);
    const sub=objectId(raw.subscription);
    if (!sub || objectId(raw.customer)!==context.customer_id || raw.livemode!==event.livemode || raw.currency!=="brl") throw new Error("Invoice context mismatch");
    await subscription(sub);
    const paid=integer(raw.amount_paid); let cash=0,refunded=0;
    const chargeId=objectId(raw.charge);
    if (chargeId) {
      if (!stripeId(chargeId,"ch")) throw new Error("Invalid charge");
      const charge=await get("/charges/"+chargeId);
      if (objectId(charge.customer)!==context.customer_id || objectId(charge.invoice)!==id || charge.livemode!==event.livemode || charge.currency!=="brl") throw new Error("Charge context mismatch");
      if (charge.paid===true && charge.captured===true) cash=Math.min(paid,integer(charge.amount_captured));
      refunded=Math.min(cash,integer(charge.amount_refunded));
    }
    const paidAt=record(raw.status_transitions).paid_at;
    const result={ id,subscription_id: sub,status: String(raw.status),paid_cents: String(paid),cash_cents: String(cash),refunded_cents: String(refunded),paid_at: paidAt===null || paidAt===undefined ? null : timestamp(paidAt),created_at: timestamp(raw.created),hosted_url: stripeUrl(raw.hosted_invoice_url,"invoice") };
    invoices.set(id,result); return result;
  }
  const object=event.data.object;
  if (event.type.startsWith("customer.subscription.")) await subscription(object.id);
  else if (event.type.startsWith("invoice.")) await invoice(object.id);
  else if (event.type==="checkout.session.completed") {
    if (!stripeId(object.id,"cs")) throw new Error();
    const session=await get("/checkout/sessions/"+object.id);
    if (objectId(session.customer)!==context.customer_id || session.mode!=="subscription") throw new Error("Checkout context mismatch");
    await subscription(objectId(session.subscription));
  } else if (event.type==="charge.refunded") {
    if (!stripeId(object.id,"ch")) throw new Error();
    const charge=await get("/charges/"+object.id); if (objectId(charge.customer)!==context.customer_id) throw new Error("Charge context mismatch");
    await invoice(objectId(charge.invoice));
  }
  let first: Json | null=null, cursor: string | undefined;
  for(let page=0;page<5;page++) {
    const list=await get("/invoices",{ customer: context.customer_id,status:"paid",limit:"100",...(cursor ? { starting_after: cursor } : {}) });
    if (!Array.isArray(list.data) || typeof list.has_more!=="boolean") throw new Error("Invalid invoice listing");
    for(const value of list.data) {
      const raw=record(value); if (!objectId(raw.subscription) || integer(raw.amount_paid)===0 || !objectId(raw.charge)) continue;
      const paidAt=timestamp(record(raw.status_transitions).paid_at);
      if (!first || paidAt<timestamp(record(first.status_transitions).paid_at)) first=raw;
    }
    if (!list.has_more) break;
    const last=record(list.data.at(-1)); if (!stripeId(last.id,"in") || page===4) throw new Error("Invoice pagination incomplete"); cursor=last.id;
  }
  let firstInvoice: string | null=null;
  if (first) {
    const payment=await invoice(first.id,first);
    if (BigInt(String(payment.cash_cents))>0n) firstInvoice=String(payment.id);
  }
  if(subscriptions.size>3 || invoices.size>3) throw new Error("Billing snapshot limit");
  return { subscriptions:[...subscriptions.values()],invoices:[...invoices.values()],firstInvoice };
}
