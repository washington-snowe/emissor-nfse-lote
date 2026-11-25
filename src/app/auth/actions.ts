"use server";

import { cookies } from "next/headers";
import { REFERRAL_COOKIE, validReferralCode } from "@/lib/account";
import { completeReferral } from "@/lib/referral-attribution";
import { redirect } from "next/navigation";
import { clearRecoverySession, createSupabaseClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/config";
import { accountPhoneMetadata, rememberedEmailCookie, validateCredentials, validateEmail, validateNewPassword, validateSignupPhone, type AuthState } from "@/lib/auth-validation";
import { sessionCookieOptions } from "@/lib/supabase/session-cookies";
import { planSelectionCookie, planSelectionHref, readPlanSelection } from "@/lib/billing/plan-selection";

async function saveRememberedEmail(form: FormData, email: string) {
  const remember = form.get("remember_email") === "on";
  const store = await cookies();
  if (remember || store.has(rememberedEmailCookie)) {
    store.set(rememberedEmailCookie, remember ? email : "", {
      ...sessionCookieOptions,
      maxAge: remember ? 90 * 24 * 60 * 60 : 0,
    });
  }
}

export async function signIn(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = validateCredentials(form.get("email"), form.get("password"));
  if (!input.valid)
    return { fields: input.fields, error: "Confira os campos indicados." };
  try {
    const supabase = await createSupabaseClient();
    if (!supabase)
      return {
        error:
          "O acesso ainda não está disponível. Tente novamente mais tarde.",
      };
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error)
      return {
        error:
          "Não foi possível entrar. Confira e-mail e senha ou tente novamente mais tarde.",
      };
    await completeReferral();
    await saveRememberedEmail(form, input.email);
  } catch {
    return {
      error:
        "O serviço de acesso está indisponível. Tente novamente mais tarde.",
    };
  }
  const selection = readPlanSelection(form.get("plano"), form.get("ciclo"));
  redirect(selection ? planSelectionHref("/painel/conta/assinatura", selection) : "/painel");
}

export async function signUp(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = validateCredentials(
    form.get("email"),
    form.get("password"),
    true,
  );
  const phone = validateSignupPhone(form.get("phone"));
  if (!phone) input.fields.phone = "Informe um telefone válido com DDD.";
  if (!input.valid || !phone)
    return { fields: input.fields, error: "Confira os campos indicados." };
  const selection = readPlanSelection(form.get("plano"), form.get("ciclo"));
  try {
    const supabase = await createSupabaseClient();
    const origin = getSiteOrigin(process.env);
    if (!supabase || !origin)
      return {
        error:
          "O cadastro ainda não está disponível. Tente novamente mais tarde.",
      };
    const referral = form.get("referral");
    if (validReferralCode(referral)) {
      const store = await cookies();
      if (!validReferralCode(store.get(REFERRAL_COOKIE)?.value)) store.set(REFERRAL_COOKIE, referral, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 604800 });
    }
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: `${origin}/auth/callback`, data: { [accountPhoneMetadata]: phone } },
    });
    if (error)
      return {
        error:
          "Não foi possível concluir o cadastro. Tente novamente mais tarde.",
      };
    if (data.session) await completeReferral();
    await saveRememberedEmail(form, input.email);
    if (!data.session) {
      const store = await cookies();
      const value = selection ? new URLSearchParams({ plano: selection.plan.code, ciclo: selection.cadence }).toString() : "";
      store.set(planSelectionCookie, value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth/callback",
        maxAge: selection ? 86400 : 0,
      });
      return {
        success:
          "Se o cadastro estiver disponível para este e-mail, você receberá as instruções para confirmar o acesso.",
      };
    }
  } catch {
    return {
      error:
        "O serviço de cadastro está indisponível. Tente novamente mais tarde.",
    };
  }
  redirect(selection ? planSelectionHref("/painel/conta/assinatura", selection) : "/painel");
}

export async function requestPasswordRecovery(_previous: AuthState, form: FormData): Promise<AuthState> {
  const email = validateEmail(form.get("email"));
  if (!email) return { fields: { email: "Informe um e-mail válido." } };
  const unavailable = { error: "A recuperação está indisponível. Tente novamente em instantes." };
  try {
    const supabase = await createSupabaseClient("recovery");
    const origin = getSiteOrigin(process.env);
    if (!supabase || !origin) return unavailable;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/recuperar-senha/callback` });
    if (error && (!error.status || error.status >= 500)) return unavailable;
    return { success: "Se houver uma conta com esse e-mail, você receberá um link para redefinir sua senha. Abra o link neste mesmo navegador." };
  } catch {
    return unavailable;
  }
}

export async function resetPassword(_previous: AuthState, form: FormData): Promise<AuthState> {
  const password = form.get("password");
  if (typeof password !== "string" || !validateNewPassword(password)) return { fields: { password: "Use uma senha entre 12 e 128 caracteres." } };
  if (form.get("confirmation") !== password) return { fields: { confirmation: "As senhas precisam ser iguais." } };
  const expired = { error: "O acesso para redefinir a senha expirou. Solicite um novo link." };
  try {
    const supabase = await createSupabaseClient("recovery");
    if (!supabase) return expired;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return expired;
    const updated = await supabase.auth.updateUser({ password });
    if (updated.error?.code === "same_password") return { fields: { password: "Escolha uma senha diferente da atual." } };
    if (updated.error) return { error: "Não foi possível redefinir a senha. Tente novamente em instantes." };
    await supabase.auth.signOut().catch(() => {});
    await clearRecoverySession();
  } catch {
    return { error: "O serviço de acesso está indisponível. Tente novamente em instantes." };
  }
  redirect("/entrar?status=password-reset");
}

export async function signOut() {
  let failed = false;
  try {
    const supabase = await createSupabaseClient();
    const result = await supabase?.auth.signOut();
    failed = !!result?.error;
  } catch {
    failed = true;
  }
  redirect(failed ? "/painel?status=logout-error" : "/entrar");
}
