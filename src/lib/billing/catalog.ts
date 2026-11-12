export const plans = [
  { code: "start", name: "Start", monthlyCents: 1990, includedNotes: 150, overageCents: 30 },
  { code: "afiliado", name: "Afiliado", monthlyCents: 3990, includedNotes: 500, overageCents: 18 },
  { code: "afiliado-5x", name: "Afiliado 5x", monthlyCents: 9990, includedNotes: 2500, overageCents: 6 },
  { code: "afiliado-10x", name: "Afiliado 10x", monthlyCents: 14990, includedNotes: 5000, overageCents: 5 },
  { code: "afiliado-20x", name: "Afiliado 20x", monthlyCents: 19990, includedNotes: 10000, overageCents: 3 },
] as const;
export type Plan = typeof plans[number];
export type Cadence = "monthly" | "quarterly";
export function planPrice(plan: Plan, cadence: Cadence) {
  return cadence === "monthly" ? plan.monthlyCents : Number((BigInt(plan.monthlyCents) * 3n * 67n + 50n) / 100n);
}
export function money(cents: number | string) {
  const raw = BigInt(cents), sign = raw < 0n ? "−" : "", value = raw < 0n ? -raw : raw;
  return `${sign}R$ ${(value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(value % 100n).toString().padStart(2,"0")}`;
}
export function firstPaymentCommission(paidCents: number, refundedCents: number) {
  if (![paidCents, refundedCents].every(value => Number.isSafeInteger(value) && value >= 0) || refundedCents > paidCents) throw new Error("Invalid payment amounts");
  return Number((BigInt(paidCents-refundedCents)*20n+50n)/100n);
}
