import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace";
import { LoginChangeForm } from "@/components/account-forms";
import { requireWorkspace } from "@/lib/tenancy-server";
export const maxDuration=60;
export const metadata: Metadata = { title: "Login e sessões" };
export const dynamic = "force-dynamic";

export default async function LoginSettings() {
  const { context } = await requireWorkspace();
  return <WorkspaceShell active="login"><div className="dashboard-content company-page"><PageHeader title="Login e sessões" description={<>E-mail atual <strong>{context.user.email}</strong></>} />
    <section className="account-section"><h2>Alterar e-mail</h2><p>Confirme sua senha e conclua a verificação recebida por e-mail.</p><LoginChangeForm kind="email" email={context.user.email} /></section>
    <section className="account-section"><h2>Alterar senha</h2><p>Use uma senha de 12 a 128 caracteres.</p><LoginChangeForm kind="password" /></section>
    <section className="account-section"><h2>Outros dispositivos</h2><p>Encerre as outras sessões sem sair deste navegador.</p><LoginChangeForm kind="sessions" /></section>
  </div></WorkspaceShell>;
}
