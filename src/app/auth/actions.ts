"use server";

import { cookies } from "next/headers";
import { REFERRAL_COOKIE, validReferralCode } from "@/lib/account";
import { completeReferral } from "@/lib/referral-attribution";
import { redirect } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/config";
import { validateCredentials, type AuthState } from "@/lib/auth-validation";

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
  } catch {
    return {
      error:
        "O serviço de acesso está indisponível. Tente novamente mais tarde.",
    };
  }
  redirect("/painel");
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
  if (!input.valid)
    return { fields: input.fields, error: "Confira os campos indicados." };
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
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error)
      return {
        error:
          "Não foi possível concluir o cadastro. Tente novamente mais tarde.",
      };
    if (data.session) await completeReferral();
    if (!data.session)
      return {
        success:
          "Se o cadastro estiver disponível para este e-mail, você receberá as instruções para confirmar o acesso.",
      };
  } catch {
    return {
      error:
        "O serviço de cadastro está indisponível. Tente novamente mais tarde.",
    };
  }
  redirect("/painel");
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
