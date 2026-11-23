"use client";
import { useActionState, useState } from "react";
import { cadenceLabels, MINIMUM_USAGE_CHARGE_CENTS, plans, money, overagePrice, planPrice, upgradeEligible, type Cadence, type StoredCadence } from "@/lib/billing/catalog";
import { openBilling } from "@/app/painel/conta/assinatura/actions";
function BillingButton({ plan, cadence, request, ready, manage=false, label }: { plan?: string;cadence?: Cadence;request:string;ready:boolean;manage?:boolean;label?:string }) {
  const [state, action, pending]=useActionState(openBilling.bind(null,manage),{});
  return <form action={action}><input type="hidden" name="request_id" value={request} />{plan && <input type="hidden" name="plan" value={plan} />}{cadence && <input type="hidden" name="cadence" value={cadence} />}
    <button className="btn btn--secondary" disabled={!ready || pending}>{pending ? "Abrindo…" : label ?? (manage ? "Gerenciar na Stripe" : "Escolher plano")}</button>{state.error && <p className="field-error" role="alert">{state.error}</p>}</form>;
}
export function SubscriptionPlans({ ready, request, currentPlan, currentCadence, currentStatus }: {ready:boolean;request:string;currentPlan?:string;currentCadence?:StoredCadence;currentStatus?:string}) {
  const [annual, setAnnual] = useState(true);
  const cadence: Cadence = annual ? "annual" : "monthly";
  const current = plans.find(plan => plan.code === currentPlan);
  const sameCycle = !currentCadence || currentCadence === cadence;
  return <section className="account-section"><h2>Escolha seu plano.</h2><p>Todos os planos incluem CNPJs sem limite. A franquia de notas é mensal.</p>
    <label className="billing-toggle"><input type="checkbox" role="switch" checked={annual} onChange={event => setAnnual(event.target.checked)} /> Anual (Economize 20%)</label>
    {currentCadence && !sameCycle && <p className="field-hint">Para subir de plano, selecione a frequência da assinatura atual ({cadenceLabels[currentCadence]}).</p>}
    <div className="billing-plan-grid">{plans.map(plan => {
      const selected = currentPlan === plan.code && sameCycle;
      const featured = plan.code === "afiliado-pro";
      const cyclePrice = planPrice(plan, cadence);
      const monthlyPrice = annual ? Math.round(cyclePrice / 12) : cyclePrice;
      const canUpgrade = currentStatus === "active" && current && sameCycle &&
        upgradeEligible({ cadence, unitCents: planPrice(current, cadence) }, plan, cadence);
      return <article key={plan.code} className={featured ? "billing-plan billing-plan--featured" : "billing-plan"}>
        <h3>{plan.name}</h3>
        {featured && <span className="billing-plan-badge">Mais Escolhido</span>}
        <p className="billing-plan-price"><strong>{money(monthlyPrice)}</strong><span>/mês</span></p>
        {annual && <p className="billing-plan-cycle">Cobrança anual de {money(cyclePrice)}</p>}
        <p>{plan.includedNotes.toLocaleString("pt-BR")} notas por mês</p>
        <p>{overagePrice(plan.overageUnits)} por nota excedente</p>
        <BillingButton plan={plan.code} cadence={cadence} request={request}
          ready={ready && (!currentPlan || Boolean(canUpgrade))} label={selected ? "Plano atual" : currentPlan ? "Subir de plano" : undefined} />
      </article>;
    })}</div>
    <p className="field-hint">Só as NFS-e autorizadas em produção contam. Cada excedente soma ao saldo na emissão. A cobrança é automática quando o saldo atinge {money(MINIMUM_USAGE_CHARGE_CENTS)}, o mínimo da Stripe.</p>
    <p className="field-hint">Ao subir de plano, a Stripe mostra e cobra a diferença proporcional ao tempo restante do ciclo atual. Na próxima renovação, cobra o valor integral do novo plano.</p>
    {!ready && <p className="save-notice">A contratação ficará disponível quando a conexão de pagamentos estiver configurada.</p>}
  </section>;
}
export function ManageSubscription({ request, ready }: {request:string;ready:boolean}) { return <BillingButton manage request={request} ready={ready} />; }
