import "server-only";
import { limitedText } from "@/lib/limited-body";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-contract";
import { readStripeConfig } from "@/lib/billing/stripe-config";
export class StripeRequestError extends Error {
  constructor(readonly status: number) { super("Billing provider unavailable"); }
}
export function stripeConfig() {
  return readStripeConfig(process.env);
}
export async function stripeRequest(path: string, parameters?: Record<string,string>, idempotency?: string) {
  const config = stripeConfig();
  if (!config || !/^\/(customers|products|prices|checkout\/sessions|billing_portal\/(sessions|configurations)|subscriptions|invoices|charges|invoiceitems)(\/[A-Za-z0-9_]+)*(\/expire)?$/.test(path)) throw new Error("Billing unavailable");
  const response = await fetch("https://api.stripe.com/v1"+path, { method: parameters ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${config.key}`, "Stripe-Version": STRIPE_API_VERSION, ...(parameters ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idempotency ? { "Idempotency-Key": idempotency } : {}) },
    body: parameters ? new URLSearchParams(parameters) : undefined });
  const body = await limitedText(response.body,1024*1024);
  if (!response.ok || body.length > 1024*1024) throw new StripeRequestError(response.status);
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid billing response");
  return value as Record<string, unknown>;
}
export async function stripeGet(path: string, parameters?: Record<string,string>) {
  // Query parameters never choose a destination or receive credentials outside the pinned Stripe host.
  if (!parameters || !Object.keys(parameters).length) return stripeRequest(path);
  const config = stripeConfig();
  if (!config || !/^\/(prices|invoices|subscriptions|charges|invoiceitems|checkout\/sessions)(\/[A-Za-z0-9_]+)?$/.test(path)) throw new Error("Billing unavailable");
  const response = await fetch("https://api.stripe.com/v1"+path+"?"+new URLSearchParams(parameters), { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${config.key}`, "Stripe-Version": STRIPE_API_VERSION } });
  const body = await limitedText(response.body,1024*1024);
  if (!response.ok || body.length > 1024*1024) throw new Error("Billing provider unavailable");
  return JSON.parse(body) as Record<string, unknown>;
}
