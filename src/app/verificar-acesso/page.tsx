import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
import { MfaChallenge } from "@/components/mfa-challenge";
import { signOut } from "@/app/auth/actions";
export const metadata: Metadata = { title: "Verificar acesso" };
export const dynamic = "force-dynamic";
export default async function VerifyAccess() {
  const client = await createSupabaseClient();
  if (!client) redirect("/entrar");
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) redirect("/entrar");
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.data?.currentLevel === "aal2") redirect("/painel");
  const factor = user.data.user.factors?.find(factor => factor.status === "verified" && factor.factor_type === "totp");
  return <main id="conteudo" className="error-page"><Brand /><div className="auth-card">
    <h1>Confirme seu acesso.</h1><p>Use o código atual do seu aplicativo autenticador.</p>
    {factor ? <MfaChallenge factorId={factor.id} /> : <p className="field-error">Nenhum autenticador compatível está disponível para esta sessão.</p>}
    <form action={signOut}><button type="submit" className="btn btn--secondary report-back">Sair da conta</button></form>
  </div></main>;
}
