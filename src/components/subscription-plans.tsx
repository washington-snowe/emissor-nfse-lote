"use client";
import { useActionState, useState } from "react";
import { plans, money, planPrice, type Cadence } from "@/lib/billing/catalog";
import { openBilling } from "@/app/painel/conta/assinatura/actions";
function BillingButton({ plan, cadence, request, ready, manage=false }: { plan?: string;cadence?: Cadence;request:string;ready:boolean;manage?:boolean }) {
  const [state, action, pending]=useActionState(openBilling.bind(null,manage),{});
  return <form action={action}><input type="hidden" name="request_id" value={request} />{plan && <input type="hidden" name="plan" value={plan} />}{cadence && <input type="hidden" name="cadence" value={cadence} />}
    <button className="btn btn--secondary" disabled={!ready || pending}>{pending ? "Abrindo…" : manage ? "Gerenciar na Stripe" : "Escolher plano"}</button>{state.error && <p className="field-error" role="alert">{state.error}</p>}</form>;
}
export function SubscriptionPlans({ ready, request, currentPlan, currentCadence }: {ready:boolean;request:string;currentPlan?:string;currentCadence?:Cadence}) {
  const [cadence,setCadence]=useState<Cadence>(currentCadence??"monthly");
  return <section className="account-section"><h2>Escolha seu plano.</h2><p>Todos os planos incluem CNPJs sem limite. A franquia de notas é mensal.</p>
    <fieldset className="billing-cadence"><legend>Frequência de pagamento</legend><label><input type="radio" name="cadence-choice" checked={cadence==="monthly"} onChange={()=>setCadence("monthly")} /> Mensal</label><label><input type="radio" name="cadence-choice" checked={cadence==="quarterly"} onChange={()=>setCadence("quarterly")} /> Trimestral <span>33% de desconto</span></label></fieldset>
    <div className="plan-table-wrap"><table className="plan-table"><caption className="sr-only">Preços e franquias dos planos</caption><thead><tr><th>Plano</th><th>Notas por mês</th><th>Nota excedente</th><th>{cadence==="monthly" ? "Por mês" : "A cada 3 meses"}</th><th><span className="sr-only">Contratar</span></th></tr></thead><tbody>{plans.map(plan=><tr key={plan.code}>
      <th scope="row">{plan.name}{currentPlan===plan.code && currentCadence===cadence && <span className="small-status">Plano atual</span>}</th><td data-label="Notas por mês">{plan.includedNotes.toLocaleString("pt-BR")}</td><td data-label="Nota excedente">{money(plan.overageCents)}</td><td data-label={cadence === "monthly" ? "Por mês" : "A cada 3 meses"} className="mono">{money(planPrice(plan,cadence))}</td><td><BillingButton plan={plan.code} cadence={cadence} request={request} ready={ready} /></td>
    </tr>)}</tbody></table></div>
    <p className="field-hint">Somente NFS-e autorizada em produção consome a franquia. Excedentes entram na próxima fatura. A Stripe mostra o total e eventuais ajustes proporcionais antes de você confirmar uma alteração de plano.</p>
    {!ready && <p className="save-notice">A contratação ficará disponível quando a conexão de pagamentos estiver configurada.</p>}
  </section>;
}
export function ManageSubscription({ request, ready }: {request:string;ready:boolean}) { return <BillingButton manage request={request} ready={ready} />; }
