import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { FiscalRefresh } from "@/components/fiscal-refresh";
import { WorkspaceShell } from "@/components/workspace";
import { SubscriptionPlans, ManageSubscription } from "@/components/subscription-plans";
import { requireWorkspace } from "@/lib/tenancy-server";
import { stripeConfig } from "@/lib/billing/stripe-http";
import { createAdminClient } from "@/lib/supabase/admin";
import { plans, money, type Cadence } from "@/lib/billing/catalog";
import { stripeUrl } from "@/lib/billing/stripe-contract";
export const metadata:Metadata={title:"Assinatura"};
export const maxDuration=60;
const labels:Record<string,string>={active:"Ativa",trialing:"Período de avaliação",past_due:"Pagamento pendente",canceled:"Cancelada",unpaid:"Pagamento não concluído",incomplete:"Aguardando pagamento",incomplete_expired:"Pagamento expirado",paused:"Pausada"};
type Subscription={id:string;plan_code:string;cadence:Cadence;status:string;period_end:string;cancel_at_period_end:boolean};
type Payment={id:string;status:string;paid_cents:string;refunded_cents:string;created_at:string;hosted_url:string|null};
export default async function SubscriptionPage({searchParams}:{searchParams:Promise<{retorno?:string}>}) {
 const {client}=await requireWorkspace(), config=stripeConfig(), {retorno}=await searchParams;
 const summary=await client.rpc("billing_account_summary",{p_live:config?.live??false});
 const data=summary.data as {subscriptions?:Subscription[];payments?:Payment[];homologation_authorizations?:number;billable_authorizations?:number;overage_notes?:number}|null;
 const current=data?.subscriptions?.find(item=>!["canceled","incomplete_expired"].includes(item.status))??data?.subscriptions?.[0];
 const plan=plans.find(item=>item.code===current?.plan_code), ready=Boolean(config?.webhook && createAdminClient() && !summary.error);
 const date=(value:string)=>new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(value));
 return <WorkspaceShell active="subscription"><div className="dashboard-content company-page"><span className="eyebrow">Conta</span><h1>Sua assinatura.</h1><p>Plano, consumo e pagamentos em um só lugar.</p>
 {config && !config.live && <p className="save-notice">Pagamentos em modo de teste da Stripe. Nenhuma cobrança real é feita neste modo.</p>}
 {retorno==="sucesso" && <p className="save-notice">Pagamento enviado para confirmação. O status abaixo será atualizado após a confirmação da Stripe.</p>}
 {retorno==="cancelado" && <p className="save-notice">Você voltou do checkout. Confira o status da assinatura antes de iniciar outra contratação.</p>}
 <FiscalRefresh waiting={retorno === "sucesso" && (!current || current.status === "incomplete" || !data?.payments?.some(payment => payment.status === "paid"))} />
 {summary.error ? <p className="save-notice">O histórico de assinaturas está aguardando configuração.</p> : <section className="account-section"><h2>{plan?.name??"Sem assinatura contratada"}</h2>{current && <><p>{labels[current.status]??"Em atualização"} · {current.cadence==="monthly" ? "Mensal" : "Trimestral"}</p><p>{current.cancel_at_period_end ? "Cancelamento agendado para" : "Fim do período atual"}: {date(current.period_end)}</p><ManageSubscription request={randomUUID()} ready={ready} /></>}
 <dl className="report-totals"><div><dt>Notas faturáveis no mês da assinatura</dt><dd>{data?.billable_authorizations??0}{plan ? ` / ${plan.includedNotes.toLocaleString("pt-BR")}`:""}</dd></div><div><dt>Autorizações em homologação · não faturadas</dt><dd>{data?.homologation_authorizations??0}</dd></div></dl></section>}
 <SubscriptionPlans ready={ready} request={randomUUID()} currentPlan={current?.plan_code} currentCadence={current?.cadence}/>
 <section className="account-section"><h2>Histórico de pagamentos</h2>{data?.payments?.length ? <div className="company-list">{data.payments.map(payment=><article className="company-card" key={payment.id}><div><h3>{money(payment.paid_cents)}</h3><p>{date(payment.created_at)} · {payment.status==="paid" ? "Pago" : payment.status==="open" ? "Em aberto" : payment.status==="void" ? "Anulado" : "Em atualização"}</p>{BigInt(payment.refunded_cents)>0n && <p>Estornado: {money(payment.refunded_cents)}</p>}</div>{stripeUrl(payment.hosted_url,"invoice") && <a className="text-link" href={payment.hosted_url!} target="_blank" rel="noopener noreferrer">Ver fatura na Stripe</a>}</article>)}</div>:<p>Nenhum pagamento registrado.</p>}</section>
 </div></WorkspaceShell>;
}
