// A completed historical checkout can be replaced only after Stripe confirms
// that its subscription ended. A stale local webhook snapshot is insufficient.
export function checkoutRecovery(status: unknown, sameSelection: boolean, subscriptionStatus?: unknown): "reuse" | "expire" | "reset" | "wait" {
  if (status === "open") return sameSelection ? "reuse" : "expire";
  if (status === "expired") return "reset";
  if (status === "complete" && (subscriptionStatus === "canceled" || subscriptionStatus === "incomplete_expired")) return "reset";
  return "wait";
}
