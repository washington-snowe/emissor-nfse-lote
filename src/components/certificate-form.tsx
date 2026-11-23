"use client";

import { useActionState, useState } from "react";
import { uploadCertificate } from "@/app/painel/certificados/actions";
import { FileControl } from "@/components/file-control";
import { formatCompanyDocument } from "@/lib/workspace-navigation";

export function CertificateForm({ companies }: { companies: { id: string; legal_name: string; cnpj: string }[] }) {
  const [state, action, pending] = useActionState(uploadCertificate, {});
  const [file, setFile] = useState<File | null>(null);
  const company = companies.length === 1 ? companies[0] : null;
  return <form className="report-form certificate-upload" action={action} onSubmit={() => setFile(null)} aria-busy={pending}>
    <h2>Adicionar certificado</h2>
    {company ? <div className="field">
      <span className="field-title">Empresa titular</span>
      <div className="context-value"><strong>{company.legal_name}</strong><span className="mono">{formatCompanyDocument(company.cnpj)}</span></div>
      <input name="company_id" type="hidden" value={company.id} />
    </div> : <div className="field">
      <label htmlFor="certificate-company">Empresa titular</label>
      <select id="certificate-company" name="company_id" defaultValue="" required disabled={pending}>
        <option disabled value="">Escolha a empresa</option>
        {companies.map(item => <option key={item.id} value={item.id}>{item.legal_name} · {formatCompanyDocument(item.cnpj)}</option>)}
      </select>
    </div>}
    <div className="form-grid report-upload-grid">
      <div className="field">
        <label htmlFor="certificate-file">Arquivo A1 (.pfx ou .p12)</label>
        <FileControl file={file} prompt="Selecionar arquivo A1" detail="Formato .pfx ou .p12"
          input={{ id: "certificate-file", name: "file", accept: ".pfx,.p12", required: true, disabled: pending,
            "aria-describedby": "certificate-file-hint", onChange: event => setFile(event.target.files?.[0] ?? null) }} />
        <p className="field-hint" id="certificate-file-hint">Até 256 KB. O titular deve corresponder ao CNPJ da empresa.</p>
      </div>
      <div className="field">
        <label htmlFor="certificate-password">Senha do certificado, se definida</label>
        <input id="certificate-password" name="password" type="password" maxLength={128} autoComplete="off" disabled={pending} />
      </div>
    </div>
    <button className="btn btn--primary" type="submit" disabled={pending}>{pending ? "Conferindo e protegendo…" : "Proteger certificado"}</button>
    <p className="field-hint">Após salvar, o Rex verifica o acesso à SEFIN. O certificado novo será usado nas próximas operações.</p>
    <p className={state.error ? "field-error" : "form-success"} role="status">{state.error ?? state.success}</p>
    {state.notice && <p className="field-hint" role="status">{state.notice}</p>}
  </form>;
}
