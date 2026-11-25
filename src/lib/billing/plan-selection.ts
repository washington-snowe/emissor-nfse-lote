import { plans, type Cadence, type Plan } from "./catalog.ts";

export type PlanSelection = { plan: Plan; cadence: Cadence };

export const planSelectionCookie = "rex-plan-selection";

export function readPlanSelection(planCode: unknown, cadence: unknown): PlanSelection | undefined {
  const plan = plans.find(item => item.code === planCode);
  if (plan && (cadence === "monthly" || cadence === "annual")) return { plan, cadence };
}

export function planSelectionHref(path: string, selection: PlanSelection | undefined) {
  if (!selection) return path;
  const query = new URLSearchParams({ plano: selection.plan.code, ciclo: selection.cadence });
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}
