import { MINIMUM_USAGE_CHARGE_CENTS } from "./catalog.ts";
import { objectId, stripeId } from "./stripe-contract.ts";
import type { UsageBatch } from "./usage.ts";

type Json = Record<string, unknown>;
type Gateway = {
  live: boolean;
  get(path: string, params?: Record<string, string>): Promise<Json>;
  post(path: string, params: Record<string, string>, key: string): Promise<Json>;
  mark(): Promise<boolean>;
  bind(id: string): Promise<boolean>;
  paymentDeclined(error: unknown): boolean;
  now(): number;
};

const record = (value: unknown) => value && typeof value === "object" ? value as Json : {};

export async function collectImmediateUsage(batch: UsageBatch, gateway: Gateway): Promise<string | null> {
  if (!Number.isSafeInteger(batch.amount_cents) || batch.amount_cents < MINIMUM_USAGE_CHARGE_CENTS ||
      !Number.isSafeInteger(batch.notes) || batch.notes < 1 || batch.notes > 500) throw new Error("Invalid overage");

  const metadata = { application: "emissor-nfse", nfse_batch: batch.id, nfse_subscription: batch.subscription_id };
  const metadataFields = Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`metadata[${key}]`, value]));
  const validate = (invoice: Json, invoiceId?: string) => {
    if (!stripeId(invoice.id, "in") || invoiceId && invoice.id !== invoiceId ||
        objectId(invoice.customer) !== batch.customer_id || invoice.currency !== "brl" ||
        invoice.livemode !== gateway.live || invoice.collection_method !== "charge_automatically" ||
        objectId(invoice.subscription) !== null ||
        Object.entries(metadata).some(([key, value]) => record(invoice.metadata)[key] !== value)) {
      throw new Error("Overage invoice context mismatch");
    }
    return invoice.id;
  };
  const expired = Boolean(batch.first_attempt_at && gateway.now() - Date.parse(batch.first_attempt_at) >= 23 * 3600_000);

  let invoice: Json | undefined;
  if (batch.stripe_invoice) {
    if (!stripeId(batch.stripe_invoice, "in")) throw new Error("Invalid invoice ID");
    invoice = await gateway.get("/invoices/" + batch.stripe_invoice);
    validate(invoice, batch.stripe_invoice);
  } else if (batch.first_attempt_at) {
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const list = await gateway.get("/invoices", { customer: batch.customer_id, limit: "100", ...(cursor ? { starting_after: cursor } : {}) });
      if (!Array.isArray(list.data) || typeof list.has_more !== "boolean") throw new Error("Unknown invoice listing");
      const matches = list.data.map(record).filter(value => record(value.metadata).nfse_batch === batch.id);
      if (matches.length > 1 || invoice && matches.length) throw new Error("Duplicate overage invoices");
      if (matches[0]) {
        validate(matches[0]);
        invoice = matches[0];
      }
      if (!list.has_more) break;
      const last = record(list.data.at(-1)).id;
      if (!stripeId(last, "in") || page === 4) throw new Error("Invoice pagination incomplete");
      cursor = last;
    }
  }

  const key = "nfse:overage:" + batch.id;
  if (!invoice) {
    if (expired) return null;
    const subscription = await gateway.get("/subscriptions/" + batch.subscription_id);
    if (subscription.id !== batch.subscription_id || objectId(subscription.customer) !== batch.customer_id ||
        subscription.livemode !== gateway.live || record(subscription.metadata).tenant_id !== batch.tenant_id ||
        record(subscription.metadata).application !== "emissor-nfse") throw new Error("Subscription mismatch");
    let method = objectId(subscription.default_payment_method);
    if (!stripeId(method, "pm")) {
      const customer = await gateway.get("/customers/" + batch.customer_id);
      if (customer.id !== batch.customer_id || customer.deleted === true || customer.livemode !== gateway.live)
        throw new Error("Payment customer mismatch");
      method = objectId(record(customer.invoice_settings).default_payment_method);
    }
    if (!stripeId(method, "pm")) throw new Error("Saved payment method unavailable");
    if (!await gateway.mark()) return null;
    invoice = await gateway.post("/invoices", {
      customer: batch.customer_id, currency: "brl", collection_method: "charge_automatically",
      auto_advance: "false", pending_invoice_items_behavior: "exclude", default_payment_method: method,
      description: `RexNotas · ${batch.notes} NFS-e excedentes`, ...metadataFields,
    }, key + ":invoice");
  }
  const id = validate(invoice, batch.stripe_invoice ?? undefined);
  if (!await gateway.bind(id)) return null;
  const path = "/invoices/" + id;

  const checkTotal = (value: Json) => {
    validate(value, id);
    const lines = record(value.lines);
    if (lines.has_more !== false || !Array.isArray(lines.data) || lines.data.length !== 1 ||
        record(lines.data[0]).amount !== batch.amount_cents || record(lines.data[0]).currency !== "brl" ||
        record(record(lines.data[0]).metadata).nfse_batch !== batch.id ||
        value.total !== batch.amount_cents) throw new Error("Unexpected overage invoice total");
  };
  if (invoice.status === "paid" || invoice.status === "open" && invoice.attempted === true) {
    checkTotal(invoice);
    return id;
  }
  if (expired) return null;
  if (invoice.status === "draft") {
    const lines = record(invoice.lines);
    if (lines.has_more === false && Array.isArray(lines.data) && lines.data.length === 0) {
      const item = await gateway.post("/invoiceitems", {
        customer: batch.customer_id, invoice: id, currency: "brl", amount: String(batch.amount_cents),
        description: `${batch.notes} NFS-e excedentes`, ...metadataFields,
      }, key + ":item");
      if (!stripeId(item.id,"ii") || objectId(item.invoice) !== id || item.amount !== batch.amount_cents || item.currency !== "brl")
        throw new Error("Overage item mismatch");
      invoice = await gateway.get(path);
    }
    checkTotal(invoice);
    if (invoice.status === "draft") invoice = await gateway.post(path + "/finalize", { auto_advance: "false" }, key + ":finalize");
  }
  checkTotal(invoice);
  if (invoice.status === "paid" || invoice.status === "open" && invoice.attempted === true) return id;
  if (invoice.status !== "open" || !Number.isSafeInteger(invoice.amount_due) ||
      Number(invoice.amount_due) < MINIMUM_USAGE_CHARGE_CENTS || Number(invoice.amount_due) > batch.amount_cents)
    throw new Error("Overage invoice not ready for collection");
  try {
    invoice = await gateway.post(path + "/pay", { off_session: "true" }, key + ":pay");
  } catch (error) {
    if (!gateway.paymentDeclined(error)) throw error;
    invoice = await gateway.get(path);
  }
  checkTotal(invoice);
  return invoice.status === "paid" || invoice.status === "open" && invoice.attempted === true ? id : null;
}
