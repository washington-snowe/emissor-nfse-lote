"use client";

import { useActionState, useState } from "react";
import { cadenceLabels, MINIMUM_USAGE_CHARGE_CENTS, plans, money, planPrice, upgradeEligible, type Cadence, type StoredCadence } from "@/lib/billing/catalog";
import { openBilling } from "@/app/painel/conta/assinatura/actions";
import { PlanCard, PlanIntervalToggle } from "@/components/plan-card";

function BillingButton({ plan, cadence, request, ready, manage = false, label }: {
  plan?: string; cadence?: Cadence; request: string; ready: boolean; manage?: boolean; label?: string;
}) {
  const [state, action, pending] = useActionState(openBilling.bind(null, manage), {});
  return <form action={action}>
    <input type="hidden" name="request_id" value={request} />
    {plan && <input type="hidden" name="plan" value={plan} />}
    {cadence && <input type="hidden" name="cadence" value={cadence} />}
    <button className="btn btn--secondary" disabled={!ready || pending}>
      {pending ? "Abrindo…" : label ?? (manage ? "Gerenciar na Stripe" : "Escolher plano")}
    </button>
    {state.error && <p className="field-error" role="alert">{state.error}</p>}
  </form>;
}

export function SubscriptionPlans({ ready, request, currentPlan, currentCadence, currentStatus }: {
  ready: boolean; request: string; currentPlan?: string; currentCadence?: StoredCadence; currentStatus?: string;
}) {
  const [annual, setAnnual] = useState(true);
  const cadence: Cadence = annual ? "annual" : "monthly";
  const current = plans.find(plan => plan.code === currentPlan);
  const sameCycle = !currentCadence || currentCadence === cadence;
  return <section className="account-section plans-section" aria-labelledby="plans-title">
    <div className="split-intro">
      <div><h2 id="plans-title">Escolher plano</h2><p>CNPJs sem limite. A franquia de notas é mensal.</p></div>
      <PlanIntervalToggle annual={annual} onChange={setAnnual} />
    </div>
    {currentCadence && !sameCycle && <p className="field-hint">Para subir de plano, selecione a frequência da assinatura atual ({cadenceLabels[currentCadence]}).</p>}
    <div className="billing-plan-grid">{plans.map(plan => {
      const selected = currentPlan === plan.code && sameCycle;
      const canUpgrade = currentStatus === "active" && current && sameCycle &&
        upgradeEligible({ cadence, unitCents: planPrice(current, cadence) }, plan, cadence);
      return <PlanCard key={plan.code} plan={plan} cadence={cadence} action={
        <BillingButton plan={plan.code} cadence={cadence} request={request}
          ready={ready && (!currentPlan || Boolean(canUpgrade))} label={selected ? "Plano atual" : currentPlan ? "Subir de plano" : undefined} />
      } />;
    })}</div>
    <details className="inline-disclosure">
      <summary>Como funcionam excedentes e mudanças de plano</summary>
      <p>Só as NFS-e autorizadas em produção contam. Cada excedente soma ao saldo na emissão. A cobrança é automática quando o saldo atinge {money(MINIMUM_USAGE_CHARGE_CENTS)}, o mínimo da Stripe.</p>
      <p>Ao subir de plano, a Stripe mostra a diferença proporcional ao tempo restante do ciclo antes de cobrar. A próxima renovação usa o valor integral do novo plano.</p>
    </details>
    {!ready && <p className="save-notice">A contratação está indisponível. Tente mais tarde.</p>}
  </section>;
}

export function ManageSubscription({ request, ready }: { request: string; ready: boolean }) {
  return <BillingButton manage request={request} ready={ready} />;
}
