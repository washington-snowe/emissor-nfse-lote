import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace";
import { ReferralLink, ReferralCodeForm } from "@/components/account-forms";
import { requireWorkspace } from "@/lib/tenancy-server";
import { getSiteOrigin } from "@/lib/config";
import { stripeConfig } from "@/lib/billing/stripe-http";
import { money } from "@/lib/billing/catalog";
export const metadata:Metadata={title:"Indicações"};
export default async function Referrals() {
 const {client}=await requireWorkspace(), origin=getSiteOrigin(process.env), config=stripeConfig();
 const code=await client.rpc("ensure_referral_code");
 const [summary,billing]=await Promise.all([client.rpc("referral_summary"),client.rpc("billing_account_summary",{p_live:config?.live??false})]);
 return <WorkspaceShell active="referrals"><div className="dashboard-content company-page"><span className="eyebrow">Conta</span><h1>Indique o Emissor.</h1><p>Receba 20% de comissão sobre o primeiro pagamento de quem se cadastrar pelo seu link.</p>
 {code.error || summary.error || !origin ? <p className="save-notice">Seu link está aguardando a configuração do programa de indicações.</p> : <><ReferralLink url={`${origin}/criar-conta?ref=${code.data}`} />
 <dl className="report-totals"><div><dt>Contas indicadas</dt><dd>{summary.data?.registrations??0}</dd></div><div><dt>Indicações com comissão registrada</dt><dd>{billing.data?.paid_referrals??0}</dd></div><div><dt>Comissões registradas</dt><dd>{money(billing.data?.commission_cents??"0")}</dd></div></dl>
 <section className="account-section"><h2>Como a comissão funciona</h2><p>A indicação deve ser vinculada antes do primeiro pagamento. A comissão é calculada sobre o valor efetivamente pago, já com os descontos, e ajustada por estornos. Renovações não geram outra comissão.</p><p>As comissões ficam registradas para repasse. O pagamento dessas comissões ainda depende da configuração do processo de repasse.</p>{config && !config.live && <p className="field-hint">Os valores exibidos neste ambiente são de pagamentos de teste da Stripe.</p>}</section>
 {summary.data?.attributed ? <p className="save-notice">Sua conta já possui uma indicação vinculada.</p> : summary.data?.canAttribute && <section className="account-section"><h2>Você recebeu um código?</h2><p>Vincule-o nas primeiras 24 horas da conta, antes de contratar.</p><ReferralCodeForm /></section>}
 </>}
 </div></WorkspaceShell>;
}
