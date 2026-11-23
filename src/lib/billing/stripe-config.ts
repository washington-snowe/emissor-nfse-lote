type Environment = Record<string, string | undefined>;

export function inspectStripeConfig(env: Environment) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  const webhook = env.STRIPE_WEBHOOK_SECRET?.trim();
  const mode = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/.exec(key ?? "")?.[1];
  return {
    enabled: env.STRIPE_BILLING_ENABLED === "true",
    key: mode ?? (key?.startsWith("pk_") ? "publishable" : key ? "invalid" : "missing"),
    modeMatches: Boolean(mode && env.STRIPE_BILLING_MODE === mode),
    webhook: /^whsec_[A-Za-z0-9_-]+$/.test(webhook ?? ""),
  };
}

export function readStripeConfig(env: Environment) {
  const status = inspectStripeConfig(env);
  if (!status.enabled || !status.modeMatches) return null;
  return {
    key: env.STRIPE_SECRET_KEY!.trim(),
    live: status.key === "live",
    webhook: status.webhook ? env.STRIPE_WEBHOOK_SECRET!.trim() : null,
  };
}
