"use client";
import { useActionState } from "react";
import { uploadCertificate } from "@/app/painel/certificados/actions";
export function CertificateForm({ companies }: { companies: { id: string; legal_name: string; cnpj: string }[] }) {
  const [state, action, pending] = useActionState(uploadCertificate, {});
  return <form className="report-form" action={action} aria-busy={pending}>
    <h2>Cadastre seu certificado A1.</h2>
    <div className="form-grid">
      <div className="field"><label htmlFor="certificate-company">Empresa titular</label><select id="certificate-company" name="company_id" defaultValue={companies.length===1 ? companies[0].id : ""} required disabled={pending}><option disabled value="">Escolha a empresa</option>{companies.map(company => <option key={company.id} value={company.id}>{company.legal_name} · {company.cnpj}</option>)}</select></div>
      <div className="field"><label htmlFor="certificate-file">Arquivo A1 (.pfx ou .p12)</label><input id="certificate-file" type="file" name="file" accept=".pfx,.p12" required disabled={pending} /><p className="field-hint">Até 256 KB. O titular deve corresponder ao CNPJ escolhido.</p></div>
      <div className="field"><label htmlFor="certificate-password">Senha do certificado, se definida</label><input id="certificate-password" name="password" type="password" maxLength={128} autoComplete="off" disabled={pending} /></div>
    </div>
    <button className="btn btn--primary" type="submit" disabled={pending}>{pending ? "Conferindo e protegendo…" : "Proteger certificado"}</button>
    <p className="field-hint">Um novo cadastro substitui o certificado ativo para novas operações. Credenciamento e autorização de emissão são verificados separadamente.</p>
    <p className={state.error ? "field-error" : "form-success"} role="status">{state.error ?? state.success}</p>
  </form>;
}
