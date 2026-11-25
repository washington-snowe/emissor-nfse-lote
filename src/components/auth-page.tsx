import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { DimensionFrame } from "@/components/dimension-drawings";
import { cadenceLabels, money, planPrice } from "@/lib/billing/catalog";
import type { PlanSelection } from "@/lib/billing/plan-selection";

export function AuthPage({ signup, ready, confirmationError = false, referral, selection }: {
  signup: boolean; referral?: string; ready: boolean; confirmationError?: boolean; selection?: PlanSelection;
}) {
  return <div className="entry-layout">
    <header className="site-masthead"><div className="site-width site-masthead-inner">
      <Brand />
      <Link href="/" className="page-back"><ArrowLeft size={16} aria-hidden="true" />Voltar ao início</Link>
    </div></header>
    <main id="conteudo" className="site-width entry-grid">
      <section className="entry-panel" aria-labelledby="entry-title">
        <div>
          <h1 id="entry-title">{signup ? "Criar conta" : "Entrar no Rex"}</h1>
          {signup && <p>Use seu e-mail para criar a conta que vai emitir suas notas.</p>}
          {!signup && <p>Acesse seu painel de emissão.</p>}
        </div>
        {selection && <div className="entry-plan">
          <p><strong>{selection.plan.name}</strong> · {cadenceLabels[selection.cadence]}</p>
          <p>{money(planPrice(selection.plan, selection.cadence))} por {selection.cadence === "annual" ? "ano" : "mês"}. Você confirma a contratação na próxima etapa.</p>
          <Link className="text-link" href="/#planos">Alterar plano</Link>
        </div>}
        {confirmationError && <p className="field-error" role="alert">Não foi possível confirmar o acesso. Abra o link mais recente no navegador em que você fez o cadastro.</p>}
        {ready ? <AuthForm signup={signup} referral={referral} selection={selection} /> : <div role="status" className="save-notice">
          <strong>Acesso em preparação</strong><p>O cadastro e o login estão indisponíveis. Tente mais tarde.</p>
        </div>}
      </section>
      <aside className="entry-art">
        <div className="entry-art-visual">
          <DimensionFrame className="entry-art-frame" />
          <Image src="/brand/rex-mascote.png" width={360} height={360} alt="" unoptimized />
        </div>
        <div>
          <ShieldCheck size={22} aria-hidden="true" />
          <p>Do relatório às suas NFS-e, com revisão antes de emitir.</p>
          <Link href="/prototipo">Explorar o painel <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </aside>
    </main>
  </div>;
}
