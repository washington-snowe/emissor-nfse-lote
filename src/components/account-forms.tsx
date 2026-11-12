"use client";
import { startTransition, useActionState, useRef } from "react";
import { saveAccountProfile, updateLogin, claimReferral } from "@/app/painel/conta/actions";
import type { AccountState } from "@/lib/account";
function Result({ state }: { state: AccountState }) { return <>{state.error && <p className="field-error" role="alert">{state.error}</p>}{state.success && <p className="save-notice" role="status">{state.success}</p>}</>; }
export function AccountProfileForm({ name = "", phone = "", version = 0 }: { name?: string; phone?: string; version?: number }) {
  const [state, action, pending] = useActionState(saveAccountProfile, {});
  return <form className="account-form" onSubmit={event => { event.preventDefault(); const form=new FormData(event.currentTarget); startTransition(()=>action(form)); }}><input type="hidden" name="version" value={state.version ?? version} />
    <div className="field"><label htmlFor="profile-name">Nome</label><input id="profile-name" name="display_name" defaultValue={name} autoComplete="name" minLength={2} maxLength={100} required /></div>
    <div className="field"><label htmlFor="profile-phone">Telefone, se desejar</label><input id="profile-phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" maxLength={25} /></div>
    <Result state={state} /><button className="btn btn--primary" disabled={pending}>{pending ? "Salvando…" : "Salvar perfil"}</button></form>;
}
export function LoginChangeForm({ kind, email }: { kind: "email" | "password" | "sessions"; email?: string }) {
  const reference = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (previous: AccountState, form: FormData) => {
    try { return await updateLogin(previous, form); } finally { reference.current?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ""; }); }
  }, {});
  return <form ref={reference} className="account-form" action={action}><input type="hidden" name="kind" value={kind} />
    {kind === "email" && <div className="field"><label htmlFor="login-email">Novo e-mail</label><input id="login-email" name="value" type="email" autoComplete="email" defaultValue={email} maxLength={254} required /></div>}
    <div className="field"><label htmlFor={`${kind}-current`}>Senha atual</label><input id={`${kind}-current`} name="current_password" type="password" autoComplete="current-password" maxLength={128} required /></div>
    {kind === "password" && <><div className="field"><label htmlFor="login-password">Nova senha</label><input id="login-password" name="value" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div>
      <div className="field"><label htmlFor="login-confirm">Confirme a nova senha</label><input id="login-confirm" name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div></>}
    <Result state={state} /><button className="btn btn--secondary" disabled={pending}>{pending ? "Conferindo…" : kind === "email" ? "Alterar e-mail" : kind === "password" ? "Atualizar senha" : "Encerrar outras sessões"}</button></form>;
}
export function ReferralCodeForm() {
  const [state, action, pending] = useActionState(claimReferral, {});
  return <form className="account-form" action={action}><div className="field"><label htmlFor="referral-code">Código de quem indicou você</label><input id="referral-code" name="code" pattern="[a-f0-9]{20}" minLength={20} maxLength={20} required /></div><Result state={state} /><button className="btn btn--secondary" disabled={pending}>Vincular indicação</button></form>;
}
export function ReferralLink({ url }: { url: string }) {
  const [state, action, pending] = useActionState(async () => { try { await navigator.clipboard.writeText(url); return "Link copiado."; } catch { return "Selecione e copie o link no campo acima."; } }, "");
  return <form className="copy-link" action={action}><div className="field"><label htmlFor="referral-link">Seu link de indicação</label><input id="referral-link" value={url} readOnly onFocus={event => event.currentTarget.select()} /></div><button className="btn btn--secondary" disabled={pending}>Copiar link</button><p role="status">{state}</p></form>;
}
