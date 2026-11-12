import type { ReviewSnapshot } from "@/lib/nfse/review";
import { ReviewConfirmation } from "@/components/review-confirmation";
import { FiscalControls } from "@/components/fiscal-controls";

export function SavedReportReview({ id, version, sha256, snapshot, confirmed, current }: {
  id: string; version: number; sha256: string; snapshot: ReviewSnapshot; confirmed: boolean; current: boolean;
}) {
  const brl = (value: string) => `R$ ${value.replace(/\.(\d{2})$/, ",$1").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  return <section id="fiscal-review-preview" className="report-result" aria-labelledby="fiscal-review-heading">
    <span className="eyebrow">Revisão {version} · homologação</span><h2 id="fiscal-review-heading">Prévia das notas previstas.</h2>
    <dl className="report-totals"><div><dt>Notas previstas</dt><dd>{snapshot.groups.length}</dd></div><div><dt>Data de competência</dt><dd>{snapshot.competenceDate.split("-").reverse().join("/")}</dd></div><div><dt>Total preservado</dt><dd>{brl(snapshot.total)}</dd></div></dl>
    <p>Tipo de comissão: {snapshot.commissionType}. Configuração fiscal: versão {snapshot.profileVersion}.</p>
    <p className="field-hint">Referência da revisão: {snapshot.evidenceReference}</p>
    <div className="report-table-scroll" role="region" aria-label="Notas previstas na revisão" tabIndex={0}><table className="report-table"><caption className="sr-only">Prévia fiscal sem transmissão</caption><thead><tr><th scope="col">Linhas de origem</th><th scope="col">Tomador revisado</th><th scope="col">País</th><th scope="col">Valor</th></tr></thead><tbody>{snapshot.groups.map((group, index) => <tr key={index}>
      <td className="mono">{group.sourceRows.join(", ")}</td><td><strong>{group.recipient.legalName}</strong><span className="report-cell-note mono">{group.recipient.document}</span></td><td>{group.recipient.country}</td><td className="report-money mono">{brl(group.amount)}</td>
    </tr>)}</tbody></table></div>
    {!current ? <p className="save-notice" role="status">A configuração fiscal mudou. Prepare uma nova revisão antes de confirmar ou prosseguir.</p> : confirmed ? <><p className="save-notice" role="status">Esta revisão está confirmada para homologação. Consulte o histórico para verificar se já existe um lote.</p><FiscalControls reviewId={id} sha256={sha256} /></> : <ReviewConfirmation id={id} sha256={sha256} />}
  </section>;
}
