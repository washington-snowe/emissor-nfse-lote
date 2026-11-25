import Link from "next/link";
import { cookies } from "next/headers";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { AuthForm, type AuthMode } from "@/components/auth-form";
import { cadenceLabels, money, planPrice } from "@/lib/billing/catalog";
import type { PlanSelection } from "@/lib/billing/plan-selection";
import { rememberedEmailCookie, validateEmail } from "@/lib/auth-validation";

const copy = {
  login: { title: "Entrar no Rex", description: "Acesse seu painel de emissão." },
  signup: { title: "Criar conta", description: "Use seu e-mail e telefone para criar sua conta." },
  recover: { title: "Recuperar senha", description: "Informe o e-mail que você usa para entrar no Rex." },
  reset: { title: "Redefinir senha", description: "Escolha uma nova senha para sua conta." },
};

export async function AuthPage({ mode, ready, status, referral, selection }: {
  mode: AuthMode; referral?: string; ready: boolean; status?: string; selection?: PlanSelection;
}) {
  const initialEmail = mode === "login" || mode === "signup"
    ? validateEmail((await cookies()).get(rememberedEmailCookie)?.value) ?? undefined
    : undefined;
  return <div className="entry-layout">
    <header className="site-masthead"><div className="site-width site-masthead-inner">
      <Brand />
      <Link href="/" className="page-back"><ArrowLeft size={16} aria-hidden="true" />Voltar ao início</Link>
    </div></header>
    <main id="conteudo" className="site-width entry-grid">
      <section className="entry-panel" aria-labelledby="entry-title">
        <div><h1 id="entry-title">{copy[mode].title}</h1><p>{copy[mode].description}</p></div>
        {selection && <div className="entry-plan">
          <p><strong>{selection.plan.name}</strong> · {cadenceLabels[selection.cadence]}</p>
          <p>{money(planPrice(selection.plan, selection.cadence))} por {selection.cadence === "annual" ? "ano" : "mês"}. Você confirma a contratação na próxima etapa.</p>
          <Link className="text-link" href="/#planos">Alterar plano</Link>
        </div>}
        {mode === "login" && status === "confirmation-error" && <p className="field-error" role="alert">Não foi possível confirmar o acesso. Abra o link mais recente no navegador em que você fez o cadastro.</p>}
        {mode === "login" && status === "password-reset" && <p className="form-success" role="status">Senha redefinida. Entre com a nova senha.</p>}
        {mode === "recover" && status === "link-invalido" && <p className="field-error" role="alert">O link é inválido ou expirou. Solicite outro e abra no mesmo navegador.</p>}
        {ready ? <AuthForm mode={mode} referral={referral} selection={selection} initialEmail={initialEmail} /> : <div role="status" className="save-notice">
          <strong>Acesso em preparação</strong><p>O serviço de acesso está indisponível. Tente mais tarde.</p>
        </div>}
      </section>
      <aside className="entry-art">
        <Image src="/brand/rex-mascote.png" width={360} height={360} sizes="310px" alt="" />
        <p>Do relatório às suas NFS-e, com revisão antes de emitir.</p>
      </aside>
    </main>
  </div>;
}
