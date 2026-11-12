"use client";

import { startTransition, useActionState, useState } from "react";
import type { FiscalProfile } from "@/lib/nfse/dps";
import type { FiscalProfileState } from "@/app/painel/empresas/[id]/fiscal/actions";

type InitialProfile = { version: number; configuration: FiscalProfile; valid_from: string; evidence_reference: string };
export function FiscalProfileForm({ initial, version = 0, municipality, regime, action, section = "all" }: {
  section?: "all" | "service" | "advanced";
  initial?: InitialProfile; version?: number; municipality: string; regime: string;
  action: (state: FiscalProfileState, form: FormData) => Promise<FiscalProfileState>;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const p = initial?.configuration;
  const [totalsMode, setTotalsMode] = useState(p?.totals.mode ?? "");
  const [taxation, setTaxation] = useState(p?.issTaxation ?? "");
  const [hasForeignTrade, setHasForeignTrade] = useState(Boolean(p?.foreignTrade));
  const field = (name: string, label: string, value = "", required = false, maxLength = 60, type = "text") => <div className="field" key={name}>
    <label htmlFor={`fiscal-${name}`}>{label}{required ? " *" : ""}</label>
    <input id={`fiscal-${name}`} name={name} type={type} defaultValue={value} required={required} maxLength={maxLength} />
  </div>;
  const select = (name: string, label: string, options: [string, string][], value = "") => <div className="field" key={name}>
    <label htmlFor={`fiscal-${name}`}>{label} *</label>
    <select id={`fiscal-${name}`} name={name} defaultValue={value} required><option value="">Selecione</option>{options.map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select>
  </div>;
  return <form onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => submit(form));
  }} className="company-form fiscal-profile-form">
    <input type="hidden" name="version" value={state.version ?? initial?.version ?? version} />
    <fieldset disabled={pending}>
      <legend>Identificação e vigência</legend>
      <p>Enquadramento cadastrado: <strong>{regime === "mei" ? "MEI" : "ME / EPP do Simples Nacional"}</strong>. Cada alteração salva uma nova versão.</p>
      <div className="form-grid">
        {section !== "service" && <>{field("issuerMunicipality", "Município emissor · código IBGE", p?.issuerMunicipality ?? municipality, true, 7)}
        {field("issuerRegistration", "Inscrição municipal", p?.issuerRegistration, false, 15)}
        {field("series", "Série do aplicativo · 1 a 49999", p?.series, true, 5)}</>}
        {field("validFrom", "Válida a partir de", initial?.valid_from, true, 10, "date")}
        {section !== "service" && <>{select("specialRegime", "Regime especial", [["0", "Nenhum"], ["1", "Cooperativa"], ["2", "Estimativa"], ["3", "Microempresa municipal"], ["4", "Notário ou registrador"], ["5", "Profissional autônomo"], ["6", "Sociedade de profissionais"], ["9", "Outro"]], p?.specialRegime)}
        {regime === "simples" && select("simplesAssessment", "Apuração pelo Simples", [["1", "Tributos federais e ISS pelo Simples"], ["2", "Federais pelo Simples, ISS fora"], ["3", "Federais e ISS fora do Simples"]], p?.simplesAssessment)}</>}
      </div>
      {field("evidence", "Referência da orientação fiscal", initial?.evidence_reference, true, 500)}
      <p className="field-hint">Ex.: orientação do contador e data, ou referência da consulta municipal. Não inclua senha ou códigos de acesso.</p>
    </fieldset>
    {section !== "advanced" && <fieldset disabled={pending}>
      <legend>Serviço e tributação</legend>
      <p>Preencha o município da prestação ou o país, conforme a operação. O código de serviço deve ser confirmado com sua orientação fiscal.</p>
      <div className="form-grid">
        {field("serviceMunicipality", "Município da prestação · código IBGE", p?.serviceMunicipality, false, 7)}
        {field("serviceCountry", "País da prestação · ISO de 2 letras", p?.serviceCountry, false, 2)}
        {field("nationalTaxCode", "Código de tributação nacional · 6 dígitos", p?.nationalTaxCode, true, 6)}
        {field("municipalTaxCode", "Código de tributação municipal", p?.municipalTaxCode, false, 20)}
        {field("nbsCode", "Código NBS, se aplicável · 9 dígitos", p?.nbsCode, false, 9)}
        <div className="field"><label htmlFor="fiscal-issTaxation">Tributação do ISS *</label><select id="fiscal-issTaxation" name="issTaxation" required value={taxation} onChange={e => setTaxation(e.target.value as typeof taxation)}>
          <option value="">Selecione</option><option value="1">Operação tributável</option><option value="2">Imunidade</option><option value="3">Exportação de serviço</option><option value="4">Não incidência</option>
        </select></div>
        {select("issWithholding", "Retenção do ISS", [["1", "Não retido"], ["2", "Retido pelo tomador"], ["3", "Retido pelo intermediário"]], p?.issWithholding)}
        {field("issRate", "Alíquota do ISS, quando exigida (%)", p?.issRate, false, 4)}
        {taxation === "2" && select("immunityType", "Tipo de imunidade", [["0", "Não informado na origem"], ["1", "Recíproca · entes públicos"], ["2", "Templos"], ["3", "Partidos, sindicatos, educação ou assistência"], ["4", "Livros, jornais e periódicos"], ["5", "Fonogramas e videofonogramas"]], p?.immunityType)}
        {taxation === "3" && field("exportResultCountry", "País do resultado · ISO de 2 letras", p?.exportResultCountry, true, 2)}
      </div>
      <div className="field"><label htmlFor="fiscal-description">Descrição do serviço *</label><textarea id="fiscal-description" name="description" defaultValue={p?.description} required maxLength={2000} rows={4} /></div>
      <p className="field-hint">Use ponto para decimais. Tomador estrangeiro, por si só, não caracteriza exportação.</p>
    </fieldset>}
    {section !== "service" && <><fieldset disabled={pending}>
      <legend>Estimativa dos tributos</legend>
      <div className="field"><label htmlFor="fiscal-totals">Forma de informar *</label><select id="fiscal-totals" name="totals.mode" value={totalsMode} required onChange={e => setTotalsMode(e.target.value as typeof totalsMode)}>
        <option value="">Selecione</option>{regime === "mei" ? <option value="not_informed">Não informar estimativa · MEI</option> : <option value="simples_percent">Percentual aproximado do Simples</option>}<option value="percentages">Percentuais federal, estadual e municipal</option><option value="amounts">Valores federal, estadual e municipal</option>
      </select></div>
      {totalsMode === "simples_percent" && field("totals.percent", "Percentual aproximado do Simples (%)", p?.totals.mode === "simples_percent" ? p.totals.percent : "", true, 5)}
      {["percentages", "amounts"].includes(totalsMode) && <div className="form-grid">{(["federal", "state", "municipal"] as const).map((name, index) => field(`totals.${name}`, `${["Federal", "Estadual", "Municipal"][index]} (${totalsMode === "percentages" ? "%" : "R$"})`, p?.totals.mode === "percentages" || p?.totals.mode === "amounts" ? p.totals[name] : "", true, 18))}</div>}
    </fieldset>
    <fieldset disabled={pending}>
      <legend>Comércio exterior</legend>
      <label className="fiscal-checkbox"><input type="checkbox" name="foreignTrade" checked={hasForeignTrade} onChange={e => setHasForeignTrade(e.target.checked)} /> Há informações de comércio exterior nesta configuração</label>
      <p className="field-hint">Necessário para tomador/intermediário no exterior, prestação em outro país ou exportação. O valor na moeda informada será revisado por nota; não é repetido desta configuração.</p>
      {hasForeignTrade && <div className="form-grid">
        {select("foreignTrade.mode", "Modo de prestação", [["0", "Não informado na origem"], ["1", "Transfronteiriço"], ["2", "Consumo no Brasil"], ["3", "Presença comercial no exterior"], ["4", "Movimento temporário de pessoas físicas"]], p?.foreignTrade?.mode)}
        {select("foreignTrade.relationship", "Vínculo entre as partes", [["0", "Sem vínculo"], ["1", "Controlada"], ["2", "Controladora"], ["3", "Coligada"], ["4", "Matriz"], ["5", "Filial ou sucursal"], ["6", "Outro vínculo"], ["9", "Não informado na origem"]], p?.foreignTrade?.relationship)}
        {field("foreignTrade.currency", "Código da moeda · tabela do Anexo I", p?.foreignTrade?.currency, true, 3)}
        {field("foreignTrade.providerIncentive", "Apoio/fomento do prestador · código", p?.foreignTrade?.providerIncentive, true, 2)}
        {field("foreignTrade.recipientIncentive", "Apoio/fomento do tomador · código", p?.foreignTrade?.recipientIncentive, true, 2)}
        {select("foreignTrade.temporaryGoods", "Movimentação temporária de bens", [["0", "Não informado na origem"], ["1", "Não"], ["2", "Importação"], ["3", "Exportação"]], p?.foreignTrade?.temporaryGoods)}
        {select("foreignTrade.mdic", "Envio ao MDIC", [["0", "Não"], ["1", "Sim"]], p?.foreignTrade?.mdic)}
        {field("foreignTrade.importDeclaration", "Declaração de importação, se aplicável", p?.foreignTrade?.importDeclaration, false, 12)}
        {field("foreignTrade.exportRegistration", "Registro de exportação, se aplicável", p?.foreignTrade?.exportRegistration, false, 12)}
      </div>}
    </fieldset>
    </>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="save-notice" role="status">{state.success}</p>}
    <button className="btn btn--primary" type="submit" disabled={pending}>{pending ? "Conferindo e salvando…" : "Salvar configuração fiscal"}</button>
    <p className="field-hint">Salvar verifica o formato e registra a versão. Não transmite DPS nem comprova autorização fiscal.</p>
  </form>;
}
