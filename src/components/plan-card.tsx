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

export function PlanCard({ plan, cadence, action, showBadge = true, recommended, variant }: {
  plan: Plan; cadence: Cadence; action: ReactNode; showBadge?: boolean; recommended?: boolean; variant?: "landing";
}) {
  const featured = recommended ?? plan.code === "afiliado-pro";
  const price = planPrice(plan, cadence);
  const annual = cadence === "annual";
  const landing = variant === "landing";
  const callToAction = <div className="plan-card-action">{action}</div>;
  return <article className={`billing-plan${featured ? " billing-plan--featured" : ""}`}
    data-recommended={recommended || undefined}>
    <div className="plan-card-heading">
      <h3>{plan.name}</h3>
      {featured && showBadge && <span className="billing-plan-badge">Mais Escolhido</span>}
    </div>
    <div className="plan-card-price">
      <p className="billing-plan-price"><strong>{money(annual ? Math.round(price / 12) : price)}</strong><span>/mês</span></p>
      {annual && <p className="billing-plan-cycle"><strong>{money(price)}</strong> cobrados por ano</p>}
      {landing && annual && <p className="landing-plan-savings"><span className="landing-discount-tag">Economize {money(plan.monthlyCents * 12 - price)} por ano</span></p>}
    </div>
    {landing && callToAction}
    <ul className="plan-features">
      <li><Check size={15} aria-hidden="true" />{plan.includedNotes.toLocaleString("pt-BR")} notas por mês</li>
      <li><Check size={15} aria-hidden="true" />{overagePrice(plan.overageUnits)} por nota excedente</li>
      {landing && <>
        <li><Check size={15} aria-hidden="true" />Envio automático por e-mail</li>
        <li><Check size={15} aria-hidden="true" />CNPJs ilimitados</li>
      </>}
    </ul>
    {!landing && callToAction}
  </article>;
}
