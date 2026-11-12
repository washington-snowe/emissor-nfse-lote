"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenancy-server";
import { getSiteOrigin } from "@/lib/config";
import { accountProfileInput, loginChangeInput, validReferralCode, type AccountState } from "@/lib/account";
export async function saveAccountProfile(_state: AccountState, form: FormData): Promise<AccountState> {
  const { client } = await requireWorkspace();
  const input = accountProfileInput(form), version = form.get("version");
  if (!input || typeof version !== "string" || !/^(0|[1-9]\d{0,8})$/.test(version)) return { error: "Confira o nome e o telefone informado." };
  const result = await client.rpc("save_account_profile", { p_name: input.name, p_phone: input.phone, p_expected_version: Number(version) });
  if (result.error) return { error: result.error.code === "40001" ? "O perfil mudou em outra sessão. Atualize antes de salvar." : "Não foi possível salvar seu perfil. Tente novamente em instantes." };
  revalidatePath("/painel", "layout");
  return { success: "Perfil atualizado.", version: result.data.version };
}
export async function updateLogin(_state: AccountState, form: FormData): Promise<AccountState> {
  const { client, context } = await requireWorkspace();
  const input = loginChangeInput(form), email = context.user.email, origin = getSiteOrigin(process.env);
  if (!input || !email || !origin) return { error: "Confira a senha atual e os novos dados. A nova senha precisa ter de 12 a 128 caracteres e ser confirmada." };
  const quota = await client.rpc("reserve_account_security_action");
  if (quota.error || quota.data !== true) return { error: "Aguarde alguns minutos antes de tentar novamente." };
  const verified = await client.auth.signInWithPassword({ email, password: input.current });
  if (verified.error || verified.data.user?.id !== context.user.id) return { error: "Não foi possível confirmar sua senha atual." };
  if (input.kind === "sessions") {
    const result = await client.auth.signOut({ scope: "others" });
    return result.error ? { error: "Não foi possível encerrar as outras sessões." } : { success: "Outros dispositivos precisarão entrar novamente quando a sessão for renovada." };
  }
  if (input.kind === "email" && input.value.toLowerCase() === email.toLowerCase()) return { error: "Informe um e-mail diferente do atual." };
  const result = input.kind === "email" ? await client.auth.updateUser({ email: input.value }, { emailRedirectTo: `${origin}/auth/callback` }) : await client.auth.updateUser({ password: input.value });
  if (result.error) return { error: "Não foi possível atualizar o acesso. Confira os dados e tente novamente em instantes." };
  revalidatePath("/painel", "layout");
  return { success: input.kind === "email" ? "Solicitação enviada. Conclua as confirmações recebidas por e-mail para efetivar a alteração." : "Senha atualizada." };
}
export async function claimReferral(_state: AccountState, form: FormData): Promise<AccountState> {
  const { client } = await requireWorkspace(); const code = form.get("code");
  if (!validReferralCode(code)) return { error: "Informe um código de indicação válido." };
  const result = await client.rpc("claim_referral", { p_code: code });
  if (result.error || result.data !== true) return { error: "Não foi possível vincular o código. O vínculo é único e deve ocorrer nas primeiras 24 horas da conta." };
  revalidatePath("/painel/conta/indicacoes"); return { success: "Indicação vinculada à sua conta." };
}
