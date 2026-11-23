"use client";

import { useActionState } from "react";
import { ArrowRight, CircleCheck, KeyRound, Mail } from "lucide-react";
import { releaseNoteCredits, type ReleaseState } from "./actions";

const initial: ReleaseState = { stage: "request" };

export type CreditAccount = { id: string; email: string; remaining: number };

export function ReleaseCreditForm({ accounts }: { accounts: CreditAccount[] }) {
  const [state, submit, pending] = useActionState(releaseNoteCredits, initial);
  const confirming = state.stage === "confirm";
  return (
    <form action={submit} className="rex-admin-form" aria-busy={pending}>
      {state.stage === "done" && <div className="rex-admin-result" role="status">
        <CircleCheck size={20} aria-hidden="true" />
        <div><strong>Créditos liberados.</strong><span>O saldo da conta foi atualizado.</span></div>
      </div>}
      {confirming ? <>
        <input type="hidden" name="challenge" value={state.id} />
        <div className="rex-admin-result">
          <Mail size={20} aria-hidden="true" />
          <div><strong>Confira seu e-mail</strong><span>Confirme {state.quantity.toLocaleString("pt-BR")} crédito(s) para {state.recipient}.</span></div>
        </div>
        <label className="field">
          <span>Código de confirmação</span>
          <input key={state.id} className="rex-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus />
        </label>
        <p className="field-help">O código vale por 10 minutos e pode ser usado uma vez.</p>
      </> : <>
        <label className="field">
          <span>Conta</span>
          <select aria-label="Conta" name="tenant" defaultValue="" required disabled={!accounts.length}>
            <option value="" disabled>Selecione uma conta</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.email} · {account.remaining.toLocaleString("pt-BR")} créditos</option>)}
          </select>
        </label>
        <div className="rex-admin-fields">
          <label className="field"><span>Quantidade de notas</span><input name="quantity" type="number" min={1} max={10000} step={1} placeholder="Ex. 50" required /></label>
          <label className="field"><span>Motivo</span><input name="reason" minLength={3} maxLength={240} placeholder="Ex. Crédito de boas-vindas" required /></label>
        </div>
      </>}
      {state.stage !== "done" && state.error && <p role="alert" className="field-error">{state.error}</p>}
      <div className="rex-admin-form-actions">
        <button type="submit" className="btn btn--primary" disabled={pending || (!confirming && !accounts.length)}>
          {pending ? (confirming ? "Confirmando…" : "Enviando código…") : confirming ? "Confirmar liberação" : "Enviar código por e-mail"}
          {confirming ? <KeyRound size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
        </button>
        {confirming && <a className="text-link" href="#liberar-creditos" onClick={(event) => {
          event.preventDefault();
          window.location.reload();
        }}>Voltar</a>}
      </div>
    </form>
  );
}
