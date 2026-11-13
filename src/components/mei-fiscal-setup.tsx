"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { Check, Settings2 } from "lucide-react";
import type { FiscalProfile } from "@/lib/nfse/dps";
import type { FiscalProfileState } from "@/app/painel/empresas/[id]/fiscal/actions";

export function MeiFiscalSetup({ companyId, municipality, today, initial, action }: {
  companyId: string; municipality: string; today: string;
  initial?: { configuration: FiscalProfile; valid_from: string; version: number };
  action: (state: FiscalProfileState, form: FormData) => Promise<FiscalProfileState>;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const [confirmed, setConfirmed] = useState(false);
  const saved = Boolean(initial || state.version);
  const completeHref = `/painel/empresas/${companyId}/fiscal?modo=completo`;
  return <section className="mei-setup">
    <div className="mei-setup-heading"><span className="mei-setup-icon" aria-hidden="true"><Check size={24} /></span><div><h2>{saved ? "Sua configuração MEI está salva." : "Seu MEI, com o essencial preenchido."}</h2><p>{saved ? "Vamos reutilizar os dados salvos nas próximas notas. Você pode personalizá-los quando precisar." : "Use o modelo de promoção de vendas para afiliados. Não é preciso digitar códigos nem preencher a configuração avançada."}</p></div></div>
    {initial ? <dl className="mei-setup-summary"><div><dt>Serviço salvo</dt><dd>{initial.configuration.description}</dd></div><div><dt>Vigência da configuração</dt><dd>{initial.valid_from.split("-").reverse().join("/")}</dd></div></dl> : <>
      <dl className="mei-setup-summary"><div><dt>Atividade</dt><dd>Promoção de vendas como afiliado</dd></div><div><dt>Local da prestação</dt><dd>{municipality || "Município do cadastro da empresa"}</dd></div><div><dt>Tributação MEI</dt><dd>ISS sem retenção e sem alíquota na nota</dd></div></dl>
      {!saved && <form onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => submit(form));
      }} className="mei-setup-form">
        <input type="hidden" name="version" value="0" />
        <fieldset disabled={pending}>
          <legend className="sr-only">Confirmação da configuração MEI</legend>
          <label className="fiscal-checkbox"><input name="confirmActivity" type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Minha atividade é promoção de vendas como afiliado e o serviço é prestado no município da minha empresa, no Brasil.</label>
          <details className="mei-setup-details"><summary>Vou emitir comissões de um período anterior</summary><div className="field"><label htmlFor="mei-valid-from">Usar esta configuração a partir de</label><input id="mei-valid-from" name="validFrom" type="date" defaultValue={today} max={today} /><p className="field-hint">A data inicial deve cobrir a competência das notas que você pretende preparar. O enquadramento MEI em cada competência será verificado pela SEFIN.</p></div></details>
          <button className="btn btn--primary" disabled={pending || !confirmed} type="submit">{pending ? "Salvando configuração…" : "Usar configuração MEI"}</button>
        </fieldset>
      </form>}
    </>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="save-notice" role="status">{state.success}</p>}
    {saved && <Link className="btn btn--primary" href={`/painel/notas/nova?empresa=${companyId}`}>Preparar nota avulsa</Link>}
    <div className="mei-setup-footer"><Link className="text-link" href={completeHref}><Settings2 size={16} aria-hidden="true" /> Personalizar serviço e configurações</Link><p className="field-hint">Salvar configura a empresa. O certificado e cada operação ainda precisam da validação fiscal; nenhuma nota é enviada nesta etapa.</p></div>
  </section>;
}
