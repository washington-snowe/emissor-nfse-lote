import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { money, overagePrice, planPrice, type Cadence, type Plan } from "@/lib/billing/catalog";

export function PlanIntervalToggle({ annual, onChange }: { annual: boolean; onChange: (annual: boolean) => void }) {
  return <label className="plan-interval">
    <input type="checkbox" role="switch" aria-label="Anual (Economize 20%)" checked={annual} onChange={event => onChange(event.target.checked)} />
    <span className="plan-interval-track" aria-hidden="true" />
    <span>Anual <small>Economize 20%</small></span>
  </label>;
}

export function PlanCard({ plan, cadence, action, showBadge = true, estimate }: {
  plan: Plan; cadence: Cadence; action: ReactNode; showBadge?: boolean; estimate?: string;
}) {
  const featured = plan.code === "afiliado-pro";
  const price = planPrice(plan, cadence);
  const annual = cadence === "annual";
  return <article className={`billing-plan${featured ? " billing-plan--featured" : ""}`}>
    <div className="plan-card-heading">
      <h3>{plan.name}</h3>
      {featured && showBadge && <span className="billing-plan-badge">Mais Escolhido</span>}
    </div>
    <p className="billing-plan-price"><strong>{money(annual ? Math.round(price / 12) : price)}</strong><span>/mês</span></p>
    {annual ? <p className="billing-plan-cycle">Cobrança anual de {money(price)}</p> : <p className="plan-monthly-caption">Cobrança mensal</p>}
    <ul className="plan-features">
      <li><Check size={15} aria-hidden="true" />{plan.includedNotes.toLocaleString("pt-BR")} notas por mês</li>
      <li><Check size={15} aria-hidden="true" />{overagePrice(plan.overageUnits)} por nota excedente</li>
    </ul>
    {estimate && <p className="plan-card-estimate">{estimate}</p>}
    <div className="plan-card-action">{action}</div>
  </article>;
}
