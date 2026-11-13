import Link from "next/link";
import { FiscalControls } from "@/components/fiscal-controls";
import { fiscalStatusLabels, fiscalReasonLabels, formatFiscalBrl } from "@/lib/nfse/status";
import {InvoiceEmailControls} from "@/components/invoice-email-controls";

export type OperationDisplay = { id: string; batch_id: string; status: string; reason: string | null; amount: string;
  recipient: { legalName: string }; dps_id: string | null; transmit_count: number; competence_date: string; document?: { id: string; access_key: string } | null;
  email?:{id:string;status:string;reason:string|null;destination:string|null;provider:string|null;test_mode:boolean};};
const emailLabels:Record<string,string>={queued:"E-mail na fila",processing:"Enviando e-mail",accepted:"E-mail aceito pelo provedor",failed:"Falha de envio do e-mail",blocked:"E-mail precisa de atenção",uncertain:"Aceitação do e-mail não confirmada"};
const emailReasons:Record<string,string>={invalid_email:"O relatório não tem um e-mail válido para este vendedor.",ambiguous_recipient:"Esta nota reúne destinos diferentes. Confira o agrupamento antes de compartilhar o documento.",test_address_missing:"Configure o endereço de teste para conferir a entrega em homologação.",document_invalid:"O documento precisa de conferência antes de ser anexado.",quota_rejected:"A cota deste provedor foi recusada; a fila tentará o próximo configurado.",provider_quota:"As cotas dos provedores configurados estão esgotadas. A fila aguardará a liberação.",network_uncertain:"Confira o histórico no provedor antes de tentar reenviar; o e-mail pode ter sido aceito.",failed:"Confira o remetente verificado e a configuração do provedor."};
export function FiscalOperationList({ operations }: { operations: OperationDisplay[] }) {
  return <div className="fiscal-operation-list">{operations.map(operation => <article className="fiscal-operation" key={operation.id}>
    <div className="fiscal-operation-heading"><div><h2>{operation.recipient.legalName}</h2><p>Competência {operation.competence_date.split("-").reverse().join("/")}</p></div><strong className="mono">{formatFiscalBrl(operation.amount)}</strong></div>
    <span className="fiscal-status" data-status={operation.status}>{fiscalStatusLabels[operation.status] ?? "Estado indisponível"}</span>
    {operation.reason && <p>{fiscalReasonLabels[operation.reason] ?? "Confira a operação antes de prosseguir."}</p>}
    <details className="company-details"><summary>Identificação da operação</summary><p className="mono fiscal-identifier">{operation.dps_id ?? "A DPS será reservada após conferir o A1."}</p><Link className="text-link" href={`/painel/notas/lotes/${operation.batch_id}`}>Abrir lote</Link></details>
    {operation.document && operation.status === "authorized" && <Link className="btn btn--secondary" href={`/painel/notas/documentos/${operation.document.id}`}>Baixar XML de homologação</Link>}
    {operation.email&&<section className="invoice-email-status" aria-label="Entrega por e-mail"><strong>{emailLabels[operation.email.status]??"Entrega pendente"}</strong>{operation.email.test_mode&&<p>Teste de homologação · sem envio ao vendedor.</p>}{operation.email.destination&&<p className="field-hint">Destino previsto: {operation.email.destination}</p>}{operation.email.provider&&<p className="field-hint">Provedor: {operation.email.provider}</p>}{operation.email.status==="accepted"&&<p className="field-hint">Aceito para processamento; isso ainda não comprova chegada à caixa de entrada.</p>}{operation.email.reason&&<p>{emailReasons[operation.email.reason]??"Confira a entrega antes de prosseguir."}</p>}{["failed","blocked"].includes(operation.email.status)&&<InvoiceEmailControls deliveryId={operation.email.id} needsEmail={operation.email.reason==="invalid_email"}/>}</section>}
    <FiscalControls operationId={operation.id} status={operation.status} transmitCount={operation.transmit_count} />
  </article>)}</div>;
}
