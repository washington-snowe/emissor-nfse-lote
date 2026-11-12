import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { plans, planPrice, money, type Plan, type Cadence } from "@/lib/billing/catalog";
import { stripeConfig, stripeRequest, stripeGet } from "@/lib/billing/stripe-http";
import { checkoutRecovery } from "@/lib/billing/checkout-state";
import { stripeId, stripeUrl, objectId } from "@/lib/billing/stripe-contract";
export type BillingAccount = { tenant_id: string; livemode: boolean; customer_id: string | null; customer_request: string; customer_attempted_at: string | null; token: string; checkout_request: string | null; checkout_plan: string | null; checkout_cadence: Cadence | null; checkout_started_at: string | null; checkout_session: string | null; subscriptions: { id: string; plan_code: string; cadence: Cadence; status: string }[] };
export async function billingRpc(name: string, args: Record<string, unknown>) {
  const admin = createAdminClient(); if (!admin) throw new Error("Billing unavailable");
  const result = await admin.rpc(name, args); if (result.error) throw new Error("Billing operation unavailable"); return result.data;
}
async function customer(account: BillingAccount, email: string) {
  if (account.customer_id) return account.customer_id;
  const saved = await billingRpc("mark_stripe_customer_attempt", { p_tenant: account.tenant_id, p_live: account.livemode, p_token: account.token });
  if (saved !== true) throw new Error("Customer reconciliation required");
  const created = await stripeRequest("/customers", { email, "metadata[application]": "emissor-nfse", "metadata[tenant_id]": account.tenant_id }, "nfse:customer:"+account.customer_request);
  if (!stripeId(created.id,"cus")) throw new Error("Invalid customer");
  if (await billingRpc("bind_stripe_customer", { p_tenant: account.tenant_id, p_live: account.livemode, p_token: account.token, p_customer: created.id }) !== true) throw new Error("Customer lease expired");
  return created.id;
}
export async function ensurePrice(plan: Plan, cadence: Cadence) {
  const config = stripeConfig(); if (!config) throw new Error("Billing unavailable");
  const stored = await billingRpc("stripe_price", { p_live: config.live, p_plan: plan.code, p_cadence: cadence });
  if (stripeId(stored,"price")) return stored;
  const alternate = await billingRpc("stripe_price", { p_live: config.live, p_plan: plan.code, p_cadence: cadence === "monthly" ? "quarterly" : "monthly" });
  const previous = stripeId(alternate,"price") ? await stripeGet("/prices/"+alternate) : null;
  const existingProduct = objectId(previous?.product);
  const product = existingProduct ? { id: existingProduct } : await stripeRequest("/products", { name: `Emissor · ${plan.name}`, "metadata[application]": "emissor-nfse", "metadata[plan_code]": plan.code }, `nfse:product:v1:${plan.code}`);
  if (!stripeId(product.id,"prod")) throw new Error("Invalid product");
  const cents = planPrice(plan,cadence);
  const price = await stripeRequest("/prices", { product: product.id, currency: "brl", unit_amount: String(cents), "recurring[interval]": "month", "recurring[interval_count]": cadence === "monthly" ? "1" : "3", "metadata[application]": "emissor-nfse", "metadata[plan_code]": plan.code, "metadata[cadence]": cadence }, `nfse:price:v1:${plan.code}:${cadence}:${cents}`);
  if (!stripeId(price.id,"price")) throw new Error("Invalid price");
  await billingRpc("store_stripe_price", { p_live: config.live, p_plan: plan.code, p_cadence: cadence, p_price: price.id, p_cents: cents });
  return price.id;
}
async function portal(account: BillingAccount, origin: string, target?: { plan: Plan; cadence: Cadence }) {
  if (!account.customer_id) throw new Error("Customer unavailable");
  const parameters: Record<string,string> = { customer: account.customer_id, return_url: origin+"/painel/conta/assinatura" };
  const configuration: Record<string,string> = { "business_profile[headline]": "Gerencie sua assinatura do Emissor", "features[invoice_history][enabled]": "true", "features[payment_method_update][enabled]": "true", "features[subscription_cancel][enabled]": "true", "features[subscription_cancel][mode]": "at_period_end" };
  const active = account.subscriptions[0];
  if (target && active && ["active","trialing"].includes(active.status) && (target.plan.code !== active.plan_code || target.cadence !== active.cadence)) {
    const subscription = await stripeGet("/subscriptions/"+active.id);
    const metadata = subscription.metadata as Record<string,unknown> | undefined;
    const items = (subscription.items as { data?: { id: string; price: { id: string; product: string } }[] })?.data;
    if (objectId(subscription.customer)!==account.customer_id || metadata?.tenant_id!==account.tenant_id || metadata?.application!=="emissor-nfse" || items?.length!==1 || !stripeId(items[0].id,"si")) throw new Error("Subscription context mismatch");
    const priceId = await ensurePrice(target.plan,target.cadence), price = await stripeGet("/prices/"+priceId);
    const productId = objectId(price.product); if (!stripeId(productId,"prod")) throw new Error("Invalid product");
    Object.assign(configuration, { "features[subscription_update][enabled]": "true", "features[subscription_update][default_allowed_updates][0]": "price", "features[subscription_update][proration_behavior]": "create_prorations", "features[subscription_update][products][0][product]": productId, "features[subscription_update][products][0][prices][0]": priceId });
    Object.assign(parameters, { "flow_data[type]": "subscription_update_confirm", "flow_data[subscription_update_confirm][subscription]": active.id, "flow_data[subscription_update_confirm][items][0][id]": items[0].id, "flow_data[subscription_update_confirm][items][0][price]": priceId, "flow_data[subscription_update_confirm][items][0][quantity]": "1", "flow_data[after_completion][type]": "redirect", "flow_data[after_completion][redirect][return_url]": origin+"/painel/conta/assinatura" });
  }
  const hash = createHash("sha256").update(new URLSearchParams(configuration).toString()).digest("hex");
  const configured = await stripeRequest("/billing_portal/configurations", configuration, "nfse:portal-config:"+hash);
  if (!stripeId(configured.id,"bpc")) throw new Error("Invalid portal configuration");
  const result = await stripeRequest("/billing_portal/sessions", { ...parameters, configuration: configured.id });
  const url = stripeUrl(result.url,"portal"); if (!url) throw new Error("Invalid portal URL"); return url;
}
export async function billingDestination(input: { actor: string; email: string; origin: string; request: string; plan?: string; cadence?: string; manage?: boolean }) {
  const config = stripeConfig(); if (!config?.webhook) throw new Error("Billing unavailable");
  const account = await billingRpc("claim_billing_account", { p_actor: input.actor, p_live: config.live }) as BillingAccount;
  try {
    const plan = plans.find(plan => plan.code === input.plan), cadence = input.cadence;
    if (input.manage) return await portal(account,input.origin);
    if (!plan || !["monthly","quarterly"].includes(cadence ?? "")) throw new Error("Invalid plan");
    const chosenCadence = cadence as Cadence;
    if (account.subscriptions.length) return await portal(account,input.origin,{ plan, cadence: chosenCadence });
    const customerId = await customer(account,input.email);
    let reset = false;
    if (account.checkout_session) {
      const previous = await stripeGet("/checkout/sessions/"+account.checkout_session);
      if (objectId(previous.customer)!==customerId) throw new Error("Checkout context mismatch");
      let priorStatus: unknown;
      if (previous.status === "complete") {
        const id=objectId(previous.subscription); if (!stripeId(id,"sub")) throw new Error("Invalid previous subscription");
        const prior=await stripeGet("/subscriptions/"+id), metadata=prior.metadata as Record<string,unknown> | undefined;
        if (objectId(prior.customer)!==customerId || metadata?.application!=="emissor-nfse" || metadata?.tenant_id!==account.tenant_id) throw new Error("Previous subscription context mismatch");
        priorStatus=prior.status;
      }
      const recovery=checkoutRecovery(previous.status,account.checkout_plan===plan.code && account.checkout_cadence===cadence,priorStatus);
      if (recovery === "wait") throw new Error("Subscription synchronization pending");
      if (recovery === "reuse") { const url=stripeUrl(previous.url,"checkout"); if (!url) throw new Error(); return url; }
      if (recovery === "expire") await stripeRequest("/checkout/sessions/"+account.checkout_session+"/expire", {}, "nfse:expire:"+account.checkout_session);
      reset = true;
    }
    const intent = await billingRpc("prepare_stripe_checkout", { p_tenant: account.tenant_id, p_live: config.live, p_token: account.token, p_request: input.request, p_plan: plan.code, p_cadence: chosenCadence, p_reset: reset }) as BillingAccount;
    if (intent.checkout_plan!==plan.code || intent.checkout_cadence!==chosenCadence || !intent.checkout_started_at || Date.now()-Date.parse(intent.checkout_started_at)>23*3600_000) throw new Error("Checkout reconciliation required");
    const price = await ensurePrice(plan,chosenCadence);
    const session = await stripeRequest("/checkout/sessions", { mode: "subscription", customer: customerId,
      "line_items[0][price]": price, "line_items[0][quantity]": "1", "payment_method_types[0]": "card", client_reference_id: account.tenant_id,
      success_url: input.origin+"/painel/conta/assinatura?retorno=sucesso", cancel_url: input.origin+"/painel/conta/assinatura?retorno=cancelado",
      "subscription_data[metadata][application]": "emissor-nfse", "subscription_data[metadata][tenant_id]": account.tenant_id,
      "custom_text[submit][message]": `${plan.includedNotes} notas por mês. CNPJs sem limite. Excedentes: ${money(plan.overageCents)} por nota autorizada em produção, na próxima fatura. Homologação não consome a franquia.`,
    }, "nfse:checkout:"+intent.checkout_request);
    const url=stripeUrl(session.url,"checkout"); if (!stripeId(session.id,"cs") || !url) throw new Error("Invalid checkout");
    if (await billingRpc("save_stripe_checkout", { p_tenant: account.tenant_id, p_live: config.live, p_token: account.token, p_session: session.id }) !== true) throw new Error("Checkout lease expired");
    return url;
  } finally { await billingRpc("release_billing_account", { p_tenant: account.tenant_id, p_live: config.live, p_token: account.token }); }
}
