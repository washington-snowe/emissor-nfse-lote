"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { signIn, signUp } from "@/app/auth/actions";
import type { AuthState } from "@/lib/auth-validation";

export function AuthForm({ signup = false, referral }: { signup?: boolean; referral?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signup ? signUp : signIn,
    {},
  );
  useEffect(() => {
    const first = state.fields?.email
      ? "email"
      : state.fields?.password
        ? "password"
        : null;
    if (first) document.getElementById(first)?.focus();
  }, [state]);
  return (
    <form action={action} className="auth-form">
      {signup && referral && <input type="hidden" name="referral" value={referral} />}
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          aria-invalid={!!state.fields?.email}
          aria-describedby={state.fields?.email ? "email-error" : undefined}
        />
        {state.fields?.email && (
          <p id="email-error" className="field-error">
            {state.fields.email}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={signup ? 12 : undefined}
          maxLength={128}
          required
          aria-invalid={!!state.fields?.password}
          aria-describedby={
            signup ? "password-help password-error" : "password-error"
          }
        />
        {signup && (
          <p className="field-hint" id="password-help">
            Use pelo menos 12 caracteres.
          </p>
        )}
        <p id="password-error" className="field-error">
          {state.fields?.password}
        </p>
      </div>
      <button
        className="btn btn--primary auth-submit"
        type="submit"
        disabled={pending || !!state.success}
      >
        {pending ? (
          <>
            <LoaderCircle size={18} className="spinner" aria-hidden="true" />
            Aguarde…
          </>
        ) : (
          <>
            {signup ? "Criar minha conta" : "Acessar minha conta"}
            <ArrowRight size={18} aria-hidden="true" />
          </>
        )}
      </button>
      <p
        className={state.success ? "form-success" : "field-error"}
        role="status"
        aria-live="polite"
      >
        {state.error || state.success}
      </p>
      <p className="auth-switch">
        {signup ? "Já tem uma conta?" : "Primeiro acesso?"}{" "}
        <Link className="text-link" href={signup ? "/entrar" : "/criar-conta"}>
          {signup ? "Entrar na conta" : "Criar minha conta"}
        </Link>
      </p>
    </form>
  );
}
