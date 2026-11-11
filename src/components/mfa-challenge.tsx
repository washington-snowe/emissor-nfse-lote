"use client";
import { useActionState } from "react";
import { challengeTotp } from "@/app/painel/seguranca/actions";
export function MfaChallenge({ factorId }: { factorId: string }) {
  const [state, action, pending] = useActionState(challengeTotp, {});
  return <form action={action} className="auth-form">
    <input type="hidden" name="factor_id" value={factorId} />
    <div className="field"><label htmlFor="access-code">Código do autenticador</label><input id="access-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required aria-describedby="mfa-error" /></div>
    <button className="btn btn--primary" type="submit" disabled={pending}>{pending ? "Verificando…" : "Confirmar acesso"}</button>
    <p id="mfa-error" className="field-error" role="alert">{state.error}</p>
  </form>;
}
