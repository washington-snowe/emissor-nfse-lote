"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/tenancy-server";

export async function enrollTotp(): Promise<{ factorId?: string; qr?: string; secret?: string; error?: string }> {
  const { client, context } = await requireWorkspace({ allowMfaSetup: true });
  const ready = await client.rpc("account_security_ready");
  if (ready.error || ready.data !== true) return { error: "A política de segurança da conta ainda está em configuração." };
  const verified = context.user.factors?.some(factor => factor.status === "verified");
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (verified && assurance.data?.currentLevel !== "aal2") return { error: "Confirme o acesso com seu autenticador antes de cadastrar outro fator." };
  if (context.user.factors?.some(factor => factor.status === "verified" && factor.factor_type === "totp"))
    return { error: "Você já possui um autenticador ativo." };
  for (const pending of context.user.factors?.filter(factor => factor.status === "unverified" && factor.factor_type === "totp") ?? [])
    await client.auth.mfa.unenroll({ factorId: pending.id });
  const result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Emissor", issuer: "Emissor" });
  if (result.error || !result.data) return { error: "Não foi possível cadastrar o autenticador. Tente novamente." };
  const prefix = "data:image/svg+xml;utf-8,";
  if (!result.data.totp.qr_code.startsWith(prefix)) return { error: "Não foi possível obter o QR code do autenticador." };
  return { factorId: result.data.id, qr: prefix + encodeURIComponent(result.data.totp.qr_code.slice(prefix.length)), secret: result.data.totp.secret };
}

export async function verifyTotp(factorId: string, code: string): Promise<{ error?: string; success?: boolean }> {
  const client = await createSupabaseClient();
  if (!client || factorId.length !== 36 || !/^[0-9a-f-]{36}$/i.test(factorId) || code.length !== 6 || !/^\d{6}$/.test(code)) return { error: "Informe os seis dígitos do autenticador." };
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) return { error: "Entre novamente na sua conta." };
  const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (result.error) return { error: "Código inválido ou expirado. Use o código atual do aplicativo." };
  revalidatePath("/painel/seguranca");
  return { success: true };
}

export async function challengeTotp(_state: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const result = await verifyTotp(String(form.get("factor_id") ?? ""), String(form.get("code") ?? ""));
  if (result.error) return result;
  redirect("/painel");
}

export async function disableTotp(factorId: string, code: string): Promise<{ error?: string; success?: boolean }> {
  const { client } = await requireWorkspace({ strong: true });
  const verified = await verifyTotp(factorId, code);
  if (verified.error) return verified;
  const result = await client.auth.mfa.unenroll({ factorId });
  if (result.error) return { error: "Não foi possível desativar o autenticador." };
  revalidatePath("/painel/seguranca");
  return { success: true };
}
