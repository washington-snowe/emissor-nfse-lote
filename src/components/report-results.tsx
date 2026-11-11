import type { Ref } from "react";
import type { ParsedShopeeReport } from "@/lib/shopee-seller-csv";

function brl(amount: string) {
  const negative = amount.startsWith("-");
  const [integer, fraction = ""] = (negative ? amount.slice(1) : amount).split(".");
  return `${negative ? "−" : ""}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction.padEnd(2, "0")}`;
}

export function ReportResults({ preview, companyName, headingRef }: { preview: ParsedShopeeReport; companyName: string; headingRef?: Ref<HTMLHeadingElement> }) {
  const periods = [...new Set(preview.reportedSellers.map((seller) => seller.referencePeriod))];
  return (<section className="report-result" aria-labelledby="report-result-title">
        <div className="report-result-heading">
          <div>
            <span className="eyebrow">Prévia do arquivo</span>
            <h2 id="report-result-title" ref={headingRef} tabIndex={-1}>Comissões por vendedor.</h2>
            <p>Empresa escolhida: <strong>{companyName}</strong></p>
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
      </section>);
}
