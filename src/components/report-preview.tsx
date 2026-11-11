"use client";

import Link from "next/link";
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

function brl(amount: string) {
  const negative = amount.startsWith("-");
  const [integer, fraction = ""] = (negative ? amount.slice(1) : amount).split(".");
  return `${negative ? "−" : ""}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction.padEnd(2, "0")}`;
}

export function ReportPreview({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState(companies.length === 1 ? companies[0].id : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
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

  const periods = preview ? [...new Set(preview.reportedSellers.map((seller) => seller.referencePeriod))] : [];
  return (
    <>
      <form onSubmit={inspect} className="report-form" aria-busy={pending}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="report-company">Empresa emissora</label>
            <select id="report-company" required value={companyId} onChange={(event) => { reset(); setCompanyId(event.target.value); }}>
              <option value="" disabled>Escolha sua empresa</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.legal_name} · {company.cnpj}</option>)}
            </select>
            <p className="field-hint">As lojas do CSV são vendedores informados, não o seu CNPJ emissor.</p>
          </div>
          <div className="field">
            <label htmlFor="report-file">Relatório mensal da Shopee</label>
            <input ref={fileInput} id="report-file" type="file" accept=".csv,text/csv" required aria-describedby="report-file-hint report-error" onChange={(event) => { reset(); setFile(event.target.files?.[0] ?? null); }} />
            <p id="report-file-hint" className="field-hint">CSV mensal por vendedor · UTF-8 · até 512 KB e 10.000 linhas.</p>
          </div>
        </div>
        <div className="report-actions">
          <button className="btn btn--primary" type="submit" disabled={pending || !selectedCompany || !file}>
            <FileSpreadsheet size={18} aria-hidden="true" /> {pending ? "Conferindo relatório…" : "Conferir relatório"}
          </button>
          {file && <button className="btn btn--secondary" type="button" onClick={() => { reset(); setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>Limpar arquivo</button>}
        </div>
        <p id="report-error" className="field-error" role="alert">{error}</p>
        <p className="report-privacy"><LockKeyhole size={16} aria-hidden="true" /> O arquivo é lido neste navegador e não é enviado nem salvo. Use “Limpar arquivo” para descartar a prévia.</p>
      </form>

      {preview && <section className="report-result" aria-labelledby="report-result-title">
        <div className="report-result-heading">
          <div>
            <span className="eyebrow">Prévia do arquivo</span>
            <h2 id="report-result-title" ref={resultHeading} tabIndex={-1}>Comissões por vendedor.</h2>
            <p>Empresa escolhida: <strong>{selectedCompany?.legal_name}</strong></p>
          </div>
          <span className="small-status">Nenhuma nota emitida</span>
        </div>
        <dl className="report-totals">
          <div><dt>Linhas de vendedores</dt><dd>{preview.review.rows.length}</dd></div>
          <div><dt>Mês de conclusão</dt><dd>{periods.map((period) => `${period.slice(5)}/${period.slice(0, 4)}`).join(", ")}</dd></div>
          <div><dt>Total informado nas linhas</dt><dd>{brl(preview.review.totals[0].amount)}</dd></div>
        </dl>
        <div className="report-review-note">
          <strong>A conferência fiscal continua pendente.</strong>
          <p>O mês de conclusão não define automaticamente a competência fiscal. Este layout não informa o tipo de comissão nem identifica operações individuais. Os vendedores, inclusive os estrangeiros, precisam de validação como tomadores antes de qualquer agrupamento ou emissão.</p>
        </div>
        <p className="field-hint">No celular, deslize a tabela para conferir todas as colunas.</p>
        <div className="report-table-scroll" role="region" aria-label="Linhas do relatório por vendedor" tabIndex={0}>
          <table className="report-table">
            <caption className="sr-only">Dados informados no CSV, sem agrupamento fiscal</caption>
            <thead><tr><th scope="col">Registro</th><th scope="col">Vendedor informado</th><th scope="col">Identificação informada</th><th scope="col">País</th><th scope="col">Comissão</th></tr></thead>
            <tbody>{preview.reportedSellers.map((seller, index) => <tr key={seller.location.row}>
              <td className="mono">{seller.location.row}</td>
              <td><strong>{seller.storeName ?? seller.legalName ?? "Nome não informado"}</strong><span className="report-cell-note">ID da loja: {seller.storeId ?? "não informado"}</span>
                <details className="report-seller-details"><summary>Ver dados informados</summary><dl>
                  <dt>Razão social</dt><dd>{seller.legalName ?? "Não informada"}</dd>
                  <dt>Endereço</dt><dd>{seller.address ?? "Não informado"}</dd>
                  <dt>Inscrição estadual</dt><dd>{seller.stateRegistration ?? "Não informada"}</dd>
                  <dt>E-mail</dt><dd>{seller.email ?? "Não informado"}</dd>
                </dl></details>
              </td>
              <td className="report-tax-ids">{seller.cnpj && <span>CNPJ <span className="mono">{seller.cnpj}</span></span>}{seller.cpf && <span>CPF <span className="mono">{seller.cpf}</span></span>}{seller.foreignTaxId && <span>ID estrangeira <span className="mono">{seller.foreignTaxId}</span></span>}{!seller.cnpj && !seller.cpf && !seller.foreignTaxId && "Não informada"}</td>
              <td>{seller.country ?? "Não informado"}</td>
              <td className="report-money mono">{brl(preview.review.rows[index].amount)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
    </>
  );
}
