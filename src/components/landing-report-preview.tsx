import Link from "next/link";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { money } from "@/lib/billing/catalog";
import { demoReport, demoReportTotal } from "@/lib/demo-report";

export function LandingReportPreview() {
  return <div className="landing-report-preview app-frame" aria-labelledby="preview-report-title" data-landing-reveal="panel">
    <div className="landing-report-header">
      <h3 id="preview-report-title">Revisão do lote</h3>
      <span>Demonstração</span>
    </div>
    <div className="landing-report-body">
      <div className="landing-report-summary">
        <p><FileSpreadsheet aria-hidden="true" size={18} /> Relatório mensal da Shopee</p>
        <dl>
          <div><dt>Notas previstas</dt><dd>{demoReport.amountsInCents.length}</dd></div>
          <div><dt>Competência</dt><dd>{demoReport.competence}</dd></div>
          <div><dt>Total das notas</dt><dd>{money(demoReportTotal)}</dd></div>
        </dl>
      </div>
      <div className="landing-report-detail">
        <p><span>Tomador</span><strong>{demoReport.recipient}</strong></p>
        <table>
          <thead><tr><th scope="col">Linha do CSV</th><th scope="col">Valor da nota</th></tr></thead>
          <tbody>{demoReport.amountsInCents.map((amount, index) => <tr key={index}>
            <td>{index + 2}</td><td>{money(amount)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <div className="landing-report-actions">
      <Link href="/prototipo?tela=revisar" className="btn btn--secondary">Testar uma revisão <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  </div>;
}
