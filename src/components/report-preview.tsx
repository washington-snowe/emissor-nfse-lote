"use client";

import Link from "next/link";
import { ReportResults } from "@/components/report-results";
import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, LockKeyhole } from "lucide-react";
import { MAX_SHOPEE_CSV_BYTES, parseShopeeSellerCsv } from "@/lib/shopee-seller-csv";

type Company = { id: string; legal_name: string; cnpj: string };
type Preview = NonNullable<Awaited<ReturnType<typeof parseShopeeSellerCsv>>["data"]>;

const errorMessages = {
  file_size: "Escolha um CSV de até 512 KB que não esteja vazio.",
  invalid_encoding: "Este layout precisa estar em UTF-8. Exporte novamente o CSV da Shopee.",
  invalid_csv: "O CSV está incompleto ou contém uma estrutura inválida. Exporte o arquivo novamente.",
  unsupported_layout: "Este arquivo não corresponde ao relatório mensal por vendedor da Shopee suportado aqui.",
  row_limit: "Esta prévia aceita até 10.000 linhas. Use um relatório menor.",
  empty_report: "O arquivo tem cabeçalhos, mas não contém vendedores para conferir.",
  invalid_field: "Um campo do relatório tem formato ou tamanho não suportado.",
  invalid_amount: "Uma comissão tem formato monetário não reconhecido. Nenhum total parcial foi calculado.",
  invalid_reference_period: "Um mês de conclusão não foi reconhecido. Nenhuma competência fiscal foi presumida.",
  invalid_contract: "Não foi possível validar todos os dados do relatório. Nenhum total parcial foi calculado.",
};

export function ReportPreview({ companies, saveAction, initialCompanyId }: {
  companies: Company[]; initialCompanyId?: string;
  saveAction?: (form: FormData) => Promise<{ id?: string; duplicate?: boolean; error?: string }>;
}) {
  const [companyId, setCompanyId] = useState(companies.some(company => company.id === initialCompanyId) ? initialCompanyId! : companies.length === 1 ? companies[0].id : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; duplicate: boolean } | null>(null);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const selectedCompany = companies.find((company) => company.id === companyId);

  useEffect(() => {
    // Move focus only after React has mounted the result, without an animation.
    if (preview) resultHeading.current?.focus();
  }, [preview]);

  function reset() {
    generation.current++;
    setPreview(null);
    setError("");
    setPending(false);
    setSaved(null);
  }

  async function persist() {
    if (!saveAction || !file || !selectedCompany || saving) return;
    const current = generation.current;
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("company_id", selectedCompany.id);
      form.set("file", file);
      const result = await saveAction(form);
      if (generation.current !== current) return;
      if (result.id) setSaved({ id: result.id, duplicate: result.duplicate === true });
      else setError(result.error ?? "Não foi possível salvar o relatório.");
    } catch { if (generation.current === current) setError("Não foi possível confirmar o salvamento. Você pode tentar novamente."); }
    finally { setSaving(false); }
  }

  async function inspect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    if (!file || !selectedCompany) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Escolha o arquivo CSV do relatório mensal por vendedor.");
      return;
    }
    if (!file.size || file.size > MAX_SHOPEE_CSV_BYTES) {
      setError(errorMessages.file_size);
      return;
    }
    const current = generation.current;
    setPending(true);
    try {
      const result = await parseShopeeSellerCsv(new Uint8Array(await file.arrayBuffer()));
      if (generation.current !== current) return;
      if (result.error) {
        const detail = result.error.record ? ` Registro ${result.error.record}${result.error.field ? `, campo “${result.error.field}”` : ""}.` : "";
        setError(errorMessages[result.error.code] + detail);
      } else {
        setPreview(result.data);
      }
    } catch {
      if (generation.current === current)
        setError("Não foi possível ler o arquivo neste navegador. Tente novamente.");
    } finally {
      if (generation.current === current) setPending(false);
    }
  }

  if (!companies.length) return (
    <section className="dashboard-welcome">
      <FileSpreadsheet size={36} aria-hidden="true" />
      <h2>Primeiro, cadastre sua empresa.</h2>
      <p>O CNPJ emissor precisa ser escolhido separadamente dos vendedores do relatório.</p>
      <Link className="btn btn--primary" href="/painel/empresas/nova">Cadastrar empresa</Link>
    </section>
  );

  return (
    <>
      <form onSubmit={inspect} className="report-form" aria-busy={pending}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="report-company">Empresa emissora</label>
            <select id="report-company" required disabled={saving} value={companyId} onChange={(event) => { reset(); setCompanyId(event.target.value); }}>
              <option value="" disabled>Escolha sua empresa</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.legal_name} · {company.cnpj}</option>)}
            </select>
            <p className="field-hint">As lojas do CSV são vendedores informados, não o seu CNPJ emissor.</p>
          </div>
          <div className="field">
            <label htmlFor="report-file">Relatório mensal da Shopee</label>
            <input ref={fileInput} id="report-file" type="file" accept=".csv,text/csv" required disabled={saving} aria-describedby="report-file-hint report-error" onChange={(event) => { reset(); setFile(event.target.files?.[0] ?? null); }} />
            <p id="report-file-hint" className="field-hint">CSV mensal por vendedor · UTF-8 · até 512 KB e 10.000 linhas.</p>
          </div>
        </div>
        <div className="report-actions">
          <button className="btn btn--primary" type="submit" disabled={pending || saving || !selectedCompany || !file}>
            <FileSpreadsheet size={18} aria-hidden="true" /> {pending ? "Conferindo relatório…" : "Conferir relatório"}
          </button>
          {file && <button className="btn btn--secondary" type="button" disabled={saving} onClick={() => { reset(); setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>Limpar arquivo</button>}
          {preview && saveAction && !saved && <button className="btn btn--secondary" type="button" disabled={saving} onClick={persist}>{saving ? "Salvando importação…" : "Salvar importação"}</button>}
        </div>
        <p id="report-error" className="field-error" role="alert">{error}</p>
        <p className="report-privacy"><LockKeyhole size={16} aria-hidden="true" /> {saveAction ? "A conferência é local. Ao salvar a importação, o original será enviado e armazenado de forma privada na sua conta." : "O arquivo é lido neste navegador e não é enviado nem salvo. Use “Limpar arquivo” para descartar a prévia."}</p>
        {saved && <p className="save-notice" role="status">{saved.duplicate ? "Este arquivo já estava salvo nesta empresa." : "Importação salva. O processamento continua sem precisar manter esta página aberta."} <Link className="text-link" href={`/painel/importacoes/historico/${saved.id}`}>Abrir importação</Link></p>}
      </form>

      {preview && <ReportResults preview={preview} companyName={selectedCompany?.legal_name ?? ""} headingRef={resultHeading} />}
    </>
  );
}
