export const plans = [
  { code: "start-v2", name: "Start", monthlyCents: 1490, includedNotes: 150, overageUnits: 993 },
  { code: "afiliado-pro", name: "Afiliado Pro", monthlyCents: 3490, includedNotes: 600, overageUnits: 582 },
  { code: "escala", name: "Escala", monthlyCents: 6990, includedNotes: 2500, overageUnits: 280 },
  { code: "top-afiliado", name: "Top Afiliado", monthlyCents: 13990, includedNotes: 10000, overageUnits: 140 },
] as const;
export type Plan = typeof plans[number];
export type Cadence = "monthly" | "annual";
export type StoredCadence = Cadence | "quarterly";
export const cadenceLabels: Record<StoredCadence,string> = { monthly: "Mensal", annual: "Anual", quarterly: "Trimestral" };
// The tariff is stored in ten-thousandths of a real. Stripe charges in whole cents.
export const MINIMUM_USAGE_CHARGE_CENTS = 50;
export function planPrice(plan: Plan, cadence: Cadence) {
  return cadence === "monthly" ? plan.monthlyCents : Number(BigInt(plan.monthlyCents) * 12n * 80n / 100n);
}
export function estimateBestPlan(notesPerMonth: number, cadence: Cadence) {
  const months = cadence === "annual" ? 12n : 1n;
  const unitsPerMonthlyCent = 100n * months;
  const estimates = plans.map(plan => {
    const extraNotes = Math.max(0, notesPerMonth - plan.includedNotes);
    // Compare in ten-thousandths of a real across the full billing period.
    const periodUnits = 100n * BigInt(planPrice(plan, cadence))
      + months * BigInt(extraNotes) * BigInt(plan.overageUnits);
    return { plan, extraNotes, periodUnits };
  });
  const best = estimates.reduce((lowest, estimate) => estimate.periodUnits < lowest.periodUnits ? estimate : lowest);
  return {
    plan: best.plan,
    extraNotes: best.extraNotes,
    monthlyCents: (best.periodUnits + unitsPerMonthlyCent / 2n) / unitsPerMonthlyCent,
  };
}
export function overagePrice(units: number) {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error("Invalid overage tariff");
  return `R$ ${Math.floor(units / 10000)},${String(units % 10000).padStart(4, "0")}`;
}
export function upgradeEligible(current: { cadence: StoredCadence; unitCents: number }, target: Plan, cadence: Cadence) {
  return current.cadence === cadence && Number.isSafeInteger(current.unitCents) &&
    current.unitCents > 0 && planPrice(target, cadence) > current.unitCents;
}
export function money(cents: number | string | bigint) {
  const raw = BigInt(cents), sign = raw < 0n ? "−" : "", value = raw < 0n ? -raw : raw;
  return `${sign}R$ ${(value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(value % 100n).toString().padStart(2,"0")}`;
}
export function firstPaymentCommission(paidCents: number, refundedCents: number) {
  if (![paidCents, refundedCents].every(value => Number.isSafeInteger(value) && value >= 0) || refundedCents > paidCents) throw new Error("Invalid payment amounts");
  return Number((BigInt(paidCents-refundedCents)*20n+50n)/100n);
}
