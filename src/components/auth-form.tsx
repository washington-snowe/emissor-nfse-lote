"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { requestPasswordRecovery, resetPassword, signIn, signUp } from "@/app/auth/actions";
import type { AuthState } from "@/lib/auth-validation";
import { planSelectionHref, type PlanSelection } from "@/lib/billing/plan-selection";

const actions = {
  login: { submit: signIn, label: "Entrar", loading: "Entrando no Rex…" },
  signup: { submit: signUp, label: "Criar conta", loading: "Criando sua conta…" },
  recover: { submit: requestPasswordRecovery, label: "Enviar link de recuperação", loading: "Solicitando link de recuperação…" },
  reset: { submit: resetPassword, label: "Salvar nova senha", loading: "Salvando a nova senha…" },
};

export type AuthMode = keyof typeof actions;

export function AuthForm({ mode, referral, selection, initialEmail }: { mode: AuthMode; referral?: string; selection?: PlanSelection; initialEmail?: string }) {
  const { submit, label, loading } = actions[mode];
  const [state, action, pending] = useActionState<AuthState, FormData>(submit, {});
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState("");
  const [visible, setVisible] = useState(false);
  const newPassword = mode === "signup" || mode === "reset";

  useEffect(() => {
    const first = Object.keys(state.fields ?? {})[0];
    if (first) document.getElementById(first)?.focus();
  }, [state]);

  return <form action={action} className="auth-form" onSubmit={() => setVisible(false)}>
    {mode === "signup" && referral && <input type="hidden" name="referral" value={referral} />}
    {selection && <>
      <input type="hidden" name="plano" value={selection.plan.code} />
      <input type="hidden" name="ciclo" value={selection.cadence} />
    </>}
    <fieldset className="auth-fields" disabled={pending} aria-busy={pending}>
      {mode !== "reset" && <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" value={email} onChange={event => setEmail(event.target.value)}
          placeholder="email@exemplo.com" autoComplete="email" maxLength={254} required
          aria-invalid={!!state.fields?.email} aria-describedby={state.fields?.email ? "email-error" : undefined} />
        {state.fields?.email && <p id="email-error" className="field-error">{state.fields.email}</p>}
      </div>}
      {mode === "signup" && <div className="field">
        <label htmlFor="phone">Telefone com DDD</label>
        <input id="phone" name="phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)}
          placeholder="(11) 99999-9999" autoComplete="tel" maxLength={25} required
          aria-invalid={!!state.fields?.phone} aria-describedby={state.fields?.phone ? "phone-error" : undefined} />
        {state.fields?.phone && <p id="phone-error" className="field-error">{state.fields.phone}</p>}
      </div>}
      {mode !== "recover" && <div className="field">
        <label htmlFor="password">{mode === "reset" ? "Nova senha" : "Senha"}</label>
        <div className="password-input">
          <input id="password" name="password" type={visible ? "text" : "password"}
            placeholder={newPassword ? "Pelo menos 12 caracteres" : "Sua senha"}
            autoComplete={newPassword ? "new-password" : "current-password"} minLength={newPassword ? 12 : undefined}
            maxLength={128} required aria-invalid={!!state.fields?.password}
            aria-describedby={state.fields?.password ? "password-error" : undefined} />
          <button type="button" className="icon-button motion-icon-swap" data-swapped={visible} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVisible(!visible)}>
            <Eye size={18} aria-hidden="true" /><EyeOff size={18} aria-hidden="true" />
          </button>
        </div>
        {state.fields?.password && <p id="password-error" className="field-error">{state.fields.password}</p>}
      </div>}
      {mode === "reset" && <div className="field">
        <label htmlFor="confirmation">Confirme a nova senha</label>
        <input id="confirmation" name="confirmation" type="password" placeholder="Repita a nova senha" autoComplete="new-password"
          minLength={12} maxLength={128} required aria-invalid={!!state.fields?.confirmation}
          aria-describedby={state.fields?.confirmation ? "confirmation-error" : undefined} />
        {state.fields?.confirmation && <p id="confirmation-error" className="field-error">{state.fields.confirmation}</p>}
      </div>}
    </fieldset>
    {(mode === "login" || mode === "signup") && <div className="auth-options">
      <label><input type="checkbox" name="remember_email" defaultChecked={!!initialEmail} /> Lembrar meu e-mail</label>
      {mode === "login" && <Link className="text-link" href="/recuperar-senha">Esqueci minha senha</Link>}
    </div>}
    <button className="btn btn--primary auth-submit" type="submit" disabled={pending || !!state.success} aria-busy={pending} aria-label={label}>
      <span className="auth-submit-content" aria-hidden="true">{label}<ArrowRight size={18} /></span>
      <span className="auth-submit-loader" aria-hidden="true"><span className="skeleton auth-submit-skeleton" /></span>
    </button>
    <p key={state.error || state.success || "pending"} className={pending ? "sr-only" : state.success ? "form-success motion-feedback" : "field-error motion-feedback"} role="status">
      {pending ? loading : state.error || state.success}
    </p>
    <p className="auth-switch">
      {mode === "login" ? "Primeiro acesso? " : mode === "signup" ? "Já tem uma conta? " : ""}
      <Link className="text-link" href={planSelectionHref(mode === "login" ? "/criar-conta" : "/entrar", selection)}>
        {mode === "login" ? "Criar minha conta" : mode === "signup" ? "Entrar na conta" : "Voltar para entrar"}
      </Link>
    </p>
  </form>;
}
