"use client";

import { startTransition, useActionState, useState } from "react";
import type { FiscalPerson } from "@/lib/nfse/dps";
import type { ReviewCandidate, ReviewSnapshot, ReviewPreview } from "@/lib/nfse/review";
import type {QuickReviewInput} from "@/lib/nfse/quick-review";
import type { ReviewState } from "@/app/painel/importacoes/review-actions";

export function PersonFields({ prefix, initial = {}, foreignForAll = false, foreignAmount = "", currency, onCountryChange }: {
  prefix: string; initial?: Partial<FiscalPerson>; foreignForAll?: boolean; currency?: string;
  onCountryChange?: (country: string) => void;
  foreignAmount?: string;
}) {
  const [country, setCountry] = useState(initial.country ?? "");
  const [kind, setKind] = useState(initial.kind ?? "");
  const [address, setAddress] = useState(Boolean(initial.address));
  const foreign = country !== "" && country !== "BR";
  const field = (name: string, label: string, value = "", required = false, max = 60) => <div className="field" key={name}>
    <label htmlFor={`${prefix}-${name}`}>{label}{required ? " *" : ""}</label><input id={`${prefix}-${name}`} name={`${prefix}.${name}`} defaultValue={value} required={required} maxLength={max} />
  </div>;
  return <>
    <div className="form-grid">
      <div className="field"><label htmlFor={`${prefix}-kind`}>Identificação *</label><select id={`${prefix}-kind`} name={`${prefix}.kind`} value={kind} onChange={e => setKind(e.target.value as typeof kind)} required>
        <option value="">Selecione</option><option value="cnpj">CNPJ</option><option value="cpf">CPF</option><option value="foreign">Identificação fiscal estrangeira</option><option value="no_nif">Motivo da ausência de NIF</option>
      </select></div>
      {kind === "no_nif" ? <div className="field"><label htmlFor={`${prefix}-document`}>Motivo da ausência de NIF *</label><select id={`${prefix}-document`} name={`${prefix}.document`} defaultValue={initial.kind === "no_nif" ? initial.document : ""} required>
        <option value="">Selecione</option><option value="0">Não informado na origem</option><option value="1">Dispensado do NIF</option><option value="2">NIF não exigido</option>
      </select></div> : field("document", kind === "cnpj" ? "CNPJ" : kind === "cpf" ? "CPF" : "Identificação fiscal estrangeira", initial.kind === "no_nif" ? "" : initial.document, true, 40)}
      {field("legalName", "Nome ou razão social", initial.legalName, true, 300)}
      <div className="field"><label htmlFor={`${prefix}-country`}>País · ISO de 2 letras *</label><input id={`${prefix}-country`} name={`${prefix}.country`} value={country} onChange={e => { const value = e.target.value.toUpperCase(); setCountry(value); onCountryChange?.(value); }} required maxLength={2} /></div>
      {field("email", "E-mail, se disponível", initial.email, false, 80)}
    </div>
    {country === "BR" && <label className="fiscal-checkbox"><input type="checkbox" checked={address} onChange={e => setAddress(e.target.checked)} /> Informar endereço nacional</label>}
    {(foreign || address) && <div className="form-grid">
      {field("address.postalCode", foreign ? "Código postal" : "CEP · 8 dígitos", initial.address?.postalCode, true, foreign ? 11 : 8)}
      {foreign ? <>{field("address.city", "Cidade", initial.address?.city, true)}{field("address.province", "Estado, província ou região", initial.address?.province, true)}</> : field("address.municipalityCode", "Município · código IBGE", initial.address?.municipalityCode, true, 7)}
      {field("address.street", "Logradouro", initial.address?.street, true, 255)}
      {field("address.number", "Número", initial.address?.number, true)}
      {field("address.district", "Bairro ou distrito", initial.address?.district, true)}
      {field("address.complement", "Complemento", initial.address?.complement, false, 156)}
    </div>}
    {(foreign || foreignForAll) && prefix.startsWith("row-") && <>
      <p className="field-hint">Confira os parâmetros de comércio exterior do perfil fiscal. O valor abaixo é próprio desta linha.</p>
      {field("foreignAmount", `Valor na moeda informada${currency ? ` · código ${currency}` : ""}`, foreignAmount, true, 18)}
    </>}
  </>;
}

export function personFromForm(form: FormData, prefix: string) {
  const get = (field: string) => String(form.get(`${prefix}.${field}`) ?? "").trim();
  const address = get("address.street") || get("address.postalCode");
  return { kind: get("kind"), document: get("document"), country: get("country"), legalName: get("legalName"), email: get("email"),
    ...(address ? { address: { country: get("country"), ...Object.fromEntries(["postalCode", "municipalityCode", "city", "province", "street", "number", "district", "complement"].map(name => [name, get(`address.${name}`)])) } } : {}) };
}

export function ReportReviewForm({ candidates, version = 0, initial, defaults,previewOnly=false,onEdit, foreignForAll, currency, needsIntermediary, action }: {
  candidates: ReviewCandidate[]; version?: number; foreignForAll: boolean; currency?: string; needsIntermediary: boolean;
  initial?: ReviewSnapshot|ReviewPreview;defaults?:QuickReviewInput;previewOnly?:boolean;onEdit?:()=>void;
  action: (previous: ReviewState, form: FormData) => Promise<ReviewState>;
}) {
  const [choice, setChoice] = useState(initial?.recipientChoice ?? defaults?.recipientChoice ?? "");
  const common = initial?.recipientChoice === "single_recipient" ? initial.groups[0].recipient : defaults?.commonRecipient;
  const middle = initial?.groups[0].intermediary??defaults?.intermediary;
  const [commonCountry, setCommonCountry] = useState(common?.country ?? ""), [intermediaryCountry, setIntermediaryCountry] = useState(middle?.country ?? "");
  const [intermediary, setIntermediary] = useState(needsIntermediary || Boolean(middle));
  const [state, submit, pending] = useActionState(action, {});
  return <form className="company-form fiscal-profile-form" onChangeCapture={onEdit} onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const request = new FormData();
    request.set("version", String(state.version ?? version));
    request.set("review", JSON.stringify({ competenceDate: fields.get("competenceDate"), commissionType: fields.get("commissionType"),
      evidenceReference: fields.get("evidenceReference"), recipientChoice: choice, grouping: fields.get("grouping"),
      confirmRecipientRole: !previewOnly&&fields.get("confirmRecipientRole") === "on", commonRecipient: choice === "single_recipient" ? personFromForm(fields, "common") : undefined,
      intermediary: intermediary ? personFromForm(fields, "intermediary") : undefined,
      recipients: candidates.map(candidate => ({ row: candidate.row, person: choice === "reported_sellers" ? personFromForm(fields, `row-${candidate.row}`) : undefined,
        foreignAmount: fields.get(`row-${candidate.row}.foreignAmount`) || undefined })) }));
    startTransition(() => submit(request));
  }}>
    <fieldset disabled={pending}>
      <legend>{previewOnly?"Altere os dados que precisar":"Prepare a revisão fiscal"}</legend>
      <p>{previewOnly?"Atualize a prévia após alterar os dados. A confirmação do lote fica no resumo desta página.":"Os vendedores são candidatos a tomador. Confirme a relação de prestação conforme sua orientação fiscal antes de usar seus dados."}</p>
      <div className="form-grid">
        <div className="field"><label htmlFor="review-competence">Data de competência *</label><input id="review-competence" name="competenceDate" type="date" defaultValue={initial?.competenceDate??defaults?.competenceDate} required /><p className="field-hint">O mês de conclusão do CSV não define essa data.</p></div>
        <div className="field"><label htmlFor="review-type">Tipo de comissão *</label><input id="review-type" name="commissionType" defaultValue={initial?.commissionType??defaults?.commissionType} maxLength={120} required /></div>
        <div className="field"><label htmlFor="review-recipient">Quem é o tomador? *</label><select id="review-recipient" value={choice} onChange={e => setChoice(e.target.value)} required>
          <option value="">Escolha conforme a orientação fiscal</option><option value="reported_sellers">Os vendedores informados no relatório</option><option value="single_recipient">Uma mesma pessoa ou empresa informada por mim</option>
        </select></div>
        <div className="field"><label htmlFor="review-grouping">Como preparar a prévia? *</label><select id="review-grouping" name="grouping" defaultValue={initial?.grouping ?? defaults?.grouping ?? ""} required>
          <option value="">Selecione</option><option value="per_row">Uma nota prevista por linha do CSV</option><option value="same_recipient">Consolidar dados idênticos do mesmo tomador</option>
        </select></div>
      </div>
      <div className="field"><label htmlFor="review-evidence">Referência da orientação sobre tomador e competência *</label><input id="review-evidence" name="evidenceReference" defaultValue={initial?.evidenceReference??defaults?.evidenceReference} required minLength={3} maxLength={500} /></div>
      {choice === "single_recipient" && <section><h3>Tomador informado</h3><PersonFields prefix="common" initial={common} onCountryChange={setCommonCountry} /></section>}
      {choice === "reported_sellers" && <div className="review-candidates">{candidates.map(candidate => <details className="company-details" key={candidate.row}>
        <summary>Linha {candidate.row} · {candidate.storeName}{candidate.person.country && candidate.person.country !== "BR" ? " · exterior: completar endereço" : ""}</summary>
        <p className="field-hint">Mês de conclusão informado: {candidate.referencePeriod}. Revise os dados abaixo.</p>
        <PersonFields prefix={`row-${candidate.row}`} initial={candidate.person} foreignAmount={candidate.foreignAmount} foreignForAll={foreignForAll || Boolean(intermediary && intermediaryCountry && intermediaryCountry !== "BR")} currency={currency} />
      </details>)}</div>}
      {choice === "single_recipient" && (foreignForAll || commonCountry && commonCountry !== "BR" || intermediary && intermediaryCountry && intermediaryCountry !== "BR") && <section><h3>Valores de comércio exterior por linha</h3><p>Confira cada valor na moeda do perfil fiscal{currency ? ` · código ${currency}` : ""}.</p><div className="form-grid">{candidates.map(candidate => <div className="field" key={candidate.row}><label htmlFor={`foreign-value-${candidate.row}`}>Linha {candidate.row} · valor na moeda informada *</label><input id={`foreign-value-${candidate.row}`} name={`row-${candidate.row}.foreignAmount`} defaultValue={candidate.foreignAmount} required maxLength={18} /></div>)}</div></section>}
      <label className="fiscal-checkbox"><input type="checkbox" checked={intermediary} disabled={needsIntermediary} onChange={e => setIntermediary(e.target.checked)} /> Há intermediário identificado nesta operação</label>
      {intermediary && <section><h3>Intermediário</h3><PersonFields prefix="intermediary" initial={middle} onCountryChange={setIntermediaryCountry} /></section>}
      {!previewOnly&&<label className="fiscal-checkbox review-role-confirmation"><input type="checkbox" name="confirmRecipientRole" required /> Confirmo que os tomadores, a competência e o agrupamento escolhidos correspondem às operações deste relatório.</label>}
    </fieldset>
    {state.error && <div className="form-error" role="alert"><p>{state.error}</p>{state.issues?.length ? <ul>{state.issues.slice(0, 30).map((issue, index) => <li key={index}>{issue.row ? `Linha ${issue.row}: ` : ""}{issue.code === "invalid_fiscal_row" ? "confira documento, endereço e campos fiscais/comércio exterior." : issue.code === "duplicate_source" ? "loja e mês repetidos; revise o relatório de origem." : issue.code === "unsupported_amount" ? "valor ou moeda incompatível; não há descarte ou arredondamento automático." : "confira os campos obrigatórios e a identificação de origem."}</li>)}</ul> : null}</div>}
    {state.success && <p className="save-notice" role="status">{state.success}</p>}
    <button className="btn btn--primary" type="submit" disabled={pending || !choice}>{pending ? "Conferindo a revisão…" : previewOnly?"Atualizar prévia":"Preparar prévia das notas"}</button>
    <p className="field-hint">{previewOnly?"Atualizar a prévia não confirma a revisão nem envia notas.":"Preparar salva a revisão e valida o formato. A prévia será exclusivamente de homologação; nenhuma nota será transmitida."}</p>
  </form>;
}
