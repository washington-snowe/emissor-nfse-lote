"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { FiscalProfile } from "@/lib/nfse/dps";
import type { StandaloneDefaults } from "@/lib/nfse/standalone";
import type { FiscalActionState } from "@/app/painel/notas/actions";
import { PersonFields, personFromForm } from "@/components/report-review-form";

export function StandaloneInvoiceForm({ initial, competenceDate, requestId, templateVersion = 0, profileVersion, companyId, readiness, action }: {
  initial: StandaloneDefaults; competenceDate: string; requestId: string; templateVersion?: number; profileVersion: number; companyId: string; readiness: string;
  action: (form: FormData) => Promise<FiscalActionState>;
}) {
  const [result, setResult] = useState<FiscalActionState>({}), [nonce, setNonce] = useState(requestId);
  const [pending, start] = useTransition();
  const [country, setCountry] = useState(initial.recipient.country);
  const [middle, setMiddle] = useState(Boolean(initial.intermediary));
  const [middleCountry, setMiddleCountry] = useState(initial.intermediary?.country ?? "");
  const [taxation, setTaxation] = useState(initial.configuration.issTaxation);
  const [serviceCountry, setServiceCountry] = useState(initial.configuration.serviceCountry ?? "");
  const [withholding, setWithholding] = useState(initial.configuration.issWithholding);
  const [totalsMode, setTotalsMode] = useState(initial.configuration.totals.mode);
  const [preview, setPreview] = useState({ legalName: initial.recipient.legalName, document: initial.recipient.document, competence: competenceDate });
  const formRef = useRef<HTMLFormElement>(null), amountRef = useRef<HTMLInputElement>(null);
  const p = initial.configuration;
  const field = (name: string, label: string, value = "", required = false, maxLength = 60, type = "text") => <div className="field" key={name}>
    <label htmlFor={`single-${name}`}>{label}{required ? " *" : ""}</label><input id={`single-${name}`} name={name} type={type} defaultValue={value} required={required} maxLength={maxLength} />
  </div>;
  const select = (name: string, label: string, options: [string, string][], value = "") => <div className="field" key={name}><label htmlFor={`single-${name}`}>{label} *</label><select id={`single-${name}`} name={name} defaultValue={value} required>{options.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></div>;
  return <form ref={formRef} className="company-form fiscal-profile-form standalone-form" onChange={event => {
    const fields = new FormData(event.currentTarget);
    setPreview({ legalName: String(fields.get("single-recipient.legalName") ?? ""), document: String(fields.get("single-recipient.document") ?? ""), competence: String(fields.get("competenceDate") ?? "") });
  }} onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget), request = new FormData();
    const get = (name: string) => String(fields.get(name) ?? "").trim();
    const configuration: Record<string, unknown> = { ...p };
    for (const name of ["issuerMunicipality", "issuerRegistration", "series", "serviceMunicipality", "serviceCountry", "nationalTaxCode", "municipalTaxCode", "nbsCode", "description", "issTaxation", "issWithholding", "issRate", "specialRegime", "simplesAssessment", "immunityType", "exportResultCountry"]) {
      configuration[name] = get(name) || undefined;
    }
    configuration.simplesOption = p.simplesOption;
    configuration.totals = { mode: get("totals.mode"), percent: get("totals.percent"), federal: get("totals.federal"), state: get("totals.state"), municipal: get("totals.municipal") };
    request.set("request_id", nonce); request.set("template_version", String(result.templateVersion ?? templateVersion));
    if (fields.get("remember") === "on") request.set("remember", "on");
    request.set("payload", JSON.stringify({ amount: get("amount"), competenceDate: get("competenceDate"), reference: get("reference"),
      commissionType: get("commissionType"), recipient: personFromForm(fields, "single-recipient"),
      intermediary: middle ? personFromForm(fields, "single-intermediary") : undefined, foreignAmount: get("foreignAmount") || undefined, configuration }));
    start(async () => { try { setResult(await action(request)); } catch { setResult({ error: "Não foi possível confirmar. Repita esta mesma solicitação; o identificador protege contra dois envios." }); } });
  }}>
    <fieldset disabled={pending || Boolean(result.id)}>
      <legend>Valor da nota</legend>
      <div className="field standalone-amount"><label htmlFor="single-amount">Quanto você vai faturar? *</label><div className="standalone-amount-input"><span aria-hidden="true">R$</span><input ref={amountRef} id="single-amount" name="amount" inputMode="decimal" placeholder="0,00" required maxLength={30} autoComplete="off" /></div><p className="field-hint">Use vírgula para os centavos. Ex.: 1.250,50.</p></div>
      <div className="standalone-recipient"><span className="eyebrow">Tomador da nota</span><strong>{preview.legalName || "Informe o tomador"}</strong><span className="mono">{preview.document}</span><p>Competência: {preview.competence ? preview.competence.split("-").reverse().join("/") : "não informada"} · perfil base v{profileVersion}</p></div>
      <p className="save-notice">Homologação · {readiness}</p>
      <details className="company-details standalone-details"><summary>Alterar dados da nota</summary>
        <h3>Serviço e competência</h3><div className="form-grid">
          {field("competenceDate", "Data de competência", competenceDate, true, 10, "date")}
          {field("commissionType", "Tipo de comissão", initial.commissionType, true, 120)}
          {field("reference", "Referência do pagamento, se houver", "", false, 200)}
        </div><p className="field-hint">Confira a competência do serviço. Para outro pagamento com os mesmos dados e valor, informe uma referência própria.</p>
        <h3>Tomador</h3><PersonFields prefix="single-recipient" initial={initial.recipient} onCountryChange={setCountry} />
        <h3>Configuração fiscal</h3><div className="form-grid">
          {field("issuerMunicipality", "Município emissor · código IBGE", p.issuerMunicipality, true, 7)}
          {field("issuerRegistration", "Inscrição municipal", p.issuerRegistration, false, 15)}
          {field("series", "Série do aplicativo", p.series, true, 5)}
          {field("serviceMunicipality", "Município da prestação · código IBGE", p.serviceMunicipality, false, 7)}
          <div className="field"><label htmlFor="single-service-country">País da prestação · ISO de 2 letras</label><input id="single-service-country" name="serviceCountry" value={serviceCountry} onChange={e => setServiceCountry(e.target.value.toUpperCase())} maxLength={2} /></div>
          {field("nationalTaxCode", "Código de tributação nacional", p.nationalTaxCode, true, 6)}
          {field("municipalTaxCode", "Código de tributação municipal", p.municipalTaxCode, false, 20)}
          {field("nbsCode", "Código NBS, se aplicável", p.nbsCode, false, 9)}
          {select("specialRegime", "Regime especial", [["0", "Nenhum"], ["1", "Cooperativa"], ["2", "Estimativa"], ["3", "Microempresa municipal"], ["4", "Notário ou registrador"], ["5", "Profissional autônomo"], ["6", "Sociedade de profissionais"], ["9", "Outro"]], p.specialRegime)}
          {p.simplesOption === "3" && select("simplesAssessment", "Apuração pelo Simples", [["1", "Federais e ISS pelo Simples"], ["2", "ISS fora do Simples"], ["3", "Federais e ISS fora do Simples"]], p.simplesAssessment)}
          <div className="field"><label htmlFor="single-taxation">Tributação do ISS *</label><select id="single-taxation" name="issTaxation" value={taxation} onChange={e => setTaxation(e.target.value as FiscalProfile["issTaxation"])}><option value="1">Tributável</option><option value="2">Imunidade</option><option value="3">Exportação</option><option value="4">Não incidência</option></select></div>
          <div className="field"><label htmlFor="single-withholding">Retenção do ISS *</label><select id="single-withholding" name="issWithholding" value={withholding} onChange={e => { setWithholding(e.target.value as typeof withholding); if (e.target.value === "3") setMiddle(true); }}><option value="1">Não retido</option><option value="2">Pelo tomador</option><option value="3">Pelo intermediário</option></select></div>
          {field("issRate", "Alíquota do ISS, se exigida (%)", p.issRate, false, 4)}
          {taxation === "2" && select("immunityType", "Tipo de imunidade", [["0", "Não informado na origem"], ["1", "Entes públicos"], ["2", "Templos"], ["3", "Entidades do art. 150, VI, c"], ["4", "Livros e periódicos"], ["5", "Fonogramas e videofonogramas"]], p.immunityType)}
          {taxation === "3" && field("exportResultCountry", "País do resultado · ISO de 2 letras", p.exportResultCountry, true, 2)}
        </div><div className="field"><label htmlFor="single-description">Descrição do serviço *</label><textarea id="single-description" name="description" rows={4} defaultValue={p.description} required maxLength={2000} /></div>
        <div className="field"><label htmlFor="single-totals">Estimativa dos tributos *</label><select id="single-totals" name="totals.mode" value={totalsMode} onChange={e => setTotalsMode(e.target.value as typeof totalsMode)}>
          {p.simplesOption === "2" ? <option value="not_informed">Não informar · MEI</option> : <option value="simples_percent">Percentual do Simples</option>}<option value="percentages">Percentuais por esfera</option><option value="amounts">Valores por esfera</option>
        </select></div>
        {totalsMode === "simples_percent" && field("totals.percent", "Percentual aproximado do Simples (%)", p.totals.mode === "simples_percent" ? p.totals.percent : "", true, 5)}
        {["percentages", "amounts"].includes(totalsMode) && <div className="form-grid">{(["federal", "state", "municipal"] as const).map((name, index) => field(`totals.${name}`, ["Federal", "Estadual", "Municipal"][index], p.totals.mode === "percentages" || p.totals.mode === "amounts" ? p.totals[name] : "", true, 18))}</div>}
        <label className="fiscal-checkbox"><input type="checkbox" checked={middle} disabled={withholding === "3"} onChange={e => setMiddle(e.target.checked)} /> Há intermediário nesta operação</label>
        {middle && <PersonFields prefix="single-intermediary" initial={initial.intermediary} onCountryChange={setMiddleCountry} />}
        {(country !== "BR" || middle && middleCountry !== "BR" || serviceCountry || taxation === "3") && field("foreignAmount", "Valor por operação na moeda de comércio exterior", "", true, 30)}
        <p className="field-hint">Parâmetros adicionais de comércio exterior ficam no <Link className="text-link" href={`/painel/empresas/${companyId}/fiscal`}>perfil fiscal da empresa</Link>.</p>
        <label className="fiscal-checkbox"><input name="remember" type="checkbox" defaultChecked /> Usar estes dados nas próximas notas avulsas</label>
      </details>
    </fieldset>
    {result.error && <p className="form-error" role="alert">{result.error}</p>}
    {result.success && <p className="save-notice" role="status">{result.success}</p>}
    {result.id ? <div className="standalone-actions"><Link className="btn btn--primary" href={`/painel/notas/lotes/${result.id}`}>Acompanhar operação</Link><button className="btn btn--secondary" type="button" onClick={() => {
      setNonce(crypto.randomUUID()); setResult({ templateVersion: result.templateVersion }); if (amountRef.current) amountRef.current.value = ""; requestAnimationFrame(() => amountRef.current?.focus());
    }}>Preparar outra nota</button></div> : <button className="btn btn--primary" type="submit" disabled={pending}>{pending ? "Conferindo sua nota…" : "Preparar nota em homologação"}</button>}
    <p className="field-hint">A nota será acompanhada na fila. Estar preparada não significa autorização fiscal.</p>
  </form>;
}
