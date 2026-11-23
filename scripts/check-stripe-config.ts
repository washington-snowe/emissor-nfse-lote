import nextEnv from "@next/env";
import { inspectStripeConfig } from "../src/lib/billing/stripe-config.ts";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const stripe = inspectStripeConfig(process.env);
if (stripe.enabled) {
  console.info("Stripe billing configuration:", JSON.stringify(stripe));
}
