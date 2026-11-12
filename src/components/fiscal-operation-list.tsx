import Link from "next/link";
import { FiscalControls } from "@/components/fiscal-controls";
import { fiscalStatusLabels, fiscalReasonLabels, formatFiscalBrl } from "@/lib/nfse/status";

export type OperationDisplay = { id: string; batch_id: string; status: string; reason: string | null; amount: string;
  recipient: { legalName: string }; dps_id: string | null; transmit_count: number; competence_date: string; document?: { id: string; access_key: string } | null };
export function FiscalOperationList({ operations }: { operations: OperationDisplay[] }) {
  return <div className="fiscal-operation-list">{operations.map(operation => <article className="fiscal-operation" key={operation.id}>
    <div className="fiscal-operation-heading"><div><h2>{operation.recipient.legalName}</h2><p>Competência {operation.competence_date.split("-").reverse().join("/")}</p></div><strong className="mono">{formatFiscalBrl(operation.amount)}</strong></div>
    <span className="fiscal-status" data-status={operation.status}>{fiscalStatusLabels[operation.status] ?? "Estado indisponível"}</span>
    {operation.reason && <p>{fiscalReasonLabels[operation.reason] ?? "Confira a operação antes de prosseguir."}</p>}
    <details className="company-details"><summary>Identificação da operação</summary><p className="mono fiscal-identifier">{operation.dps_id ?? "A DPS será reservada após conferir o A1."}</p><Link className="text-link" href={`/painel/notas/lotes/${operation.batch_id}`}>Abrir lote</Link></details>
    {operation.document && operation.status === "authorized" && <Link className="btn btn--secondary" href={`/painel/notas/documentos/${operation.document.id}`}>Baixar XML de homologação</Link>}
    <FiscalControls operationId={operation.id} status={operation.status} transmitCount={operation.transmit_count} />
  </article>)}</div>;
}
