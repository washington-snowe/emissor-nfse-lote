import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { MfaSettings } from "@/components/mfa-settings";

export const metadata: Metadata = { title: "Segurança da conta" };
export const dynamic = "force-dynamic";
export default async function Security() {
  const { client, context } = await requireWorkspace({ allowMfaSetup: true });
  const ready = await client.rpc("account_security_ready");
  const verified = context.user.factors?.find(factor => factor.status === "verified" && factor.factor_type === "totp");
  return <WorkspaceShell email={context.user.email} active="security"><div className="dashboard-content">
    <span className="eyebrow">Sua conta</span><h1>Segurança do acesso.</h1><p>Proteja seus certificados e suas operações com um aplicativo autenticador.</p>
    {verified && <Link className="text-link" href="/verificar-acesso">Confirmar acesso com o autenticador</Link>}
    {ready.data === true ? <MfaSettings verifiedFactor={verified?.id} /> : <p className="save-notice">A segurança em duas etapas ainda está em configuração.</p>}
    <Link className="text-link report-back" href="/painel">Voltar à visão geral</Link>
  </div></WorkspaceShell>;
}
