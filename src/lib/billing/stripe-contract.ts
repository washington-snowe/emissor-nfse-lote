import { createHmac, timingSafeEqual } from "node:crypto";
export const STRIPE_API_VERSION = "2025-02-24.acacia";
export function verifyStripeSignature(body: string, header: string | null, secret: string, now = Date.now()) {
  if (!header || header.length > 8192 || !secret.startsWith("whsec_") || body.length > 256*1024) return false;
  const fields = header.split(",").map(part => part.trim().split("="));
  const timestamps = fields.filter(([key]) => key === "t");
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0][1] ?? "")) return false;
  const timestamp = timestamps[0][1];
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp+"."+body).digest();
  return fields.some(([key,value]) => key === "v1" && /^[a-f0-9]{64}$/.test(value ?? "") && timingSafeEqual(expected, Buffer.from(value,"hex")));
}
export function stripeUrl(value: unknown, kind: "checkout" | "portal" | "invoice") {
  if (typeof value !== "string" || value.length > 4096) return null;
  try { const url = new URL(value), allowed = { checkout: ["checkout.stripe.com"], portal: ["billing.stripe.com"], invoice: ["invoice.stripe.com"] };
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowed[kind].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
export function stripeId(value: unknown, prefix: string): value is string { return typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9_]{1,250}$`).test(value); }
export function objectId(value: unknown) { return typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null; }
