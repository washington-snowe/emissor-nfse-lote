import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { FiscalControls } from "@/components/fiscal-controls";
import { operationStatus, fiscalReasonLabels, formatFiscalBrl } from "@/lib/nfse/status";
import {InvoiceEmailControls} from "@/components/invoice-email-controls";

export type OperationDisplay = { id: string; batch_id: string; status: string; reason: string | null; amount: string;environment?:'homologation'|'production';
  recipient: { legalName: string }; dps_id: string | null; transmit_count: number; competence_date: string; document?: { id: string; access_key: string } | null;
  email?:{id:string;status:string;reason:string|null;destination:string|null;provider:string|null;test_mode:boolean};};
const emailLabels:Record<string,string>={queued:"E-mail na fila",processing:"Enviando e-mail",accepted:"E-mail aceito pelo provedor",failed:"Falha de envio do e-mail",blocked:"E-mail precisa de atenção",uncertain:"Aceitação do e-mail não confirmada"};
const emailReasons:Record<string,string>={danfse_unavailable:'O DANFS-e ainda não pôde ser gerado. A nota está preservada; tente preparar a entrega novamente.',invalid_email:"O relatório não tem um e-mail válido para este vendedor.",ambiguous_recipient:"Esta nota reúne destinos diferentes. Confira o agrupamento antes de compartilhar o documento.",test_address_missing:"Configure o endereço de teste para conferir a entrega em homologação.",document_invalid:"O documento precisa de conferência antes de ser anexado.",quota_rejected:"A cota deste provedor foi recusada; a fila tentará o próximo configurado.",provider_quota:"As cotas dos provedores configurados estão esgotadas. A fila aguardará a liberação.",network_uncertain:"Confira o histórico no provedor antes de tentar reenviar; o e-mail pode ter sido aceito.",failed:"Confira o remetente verificado e a configuração do provedor."};
export function FiscalOperationList({ operations }: { operations: OperationDisplay[] }) {
  return <div className="fiscal-operation-list">
    <div className="invoice-list-head" aria-hidden="true"><span>Tomador</span><span>Competência</span><span>Situação</span><span>Valor</span></div>
    {operations.map(operation => <details className="fiscal-operation invoice-list-row" key={operation.id}>
    <summary className="invoice-list-summary">
      <strong>{operation.recipient.legalName}</strong>
      <span className="invoice-competence"><span className="sr-only">Competência </span>{operation.competence_date.split("-").reverse().join("/")}</span>
      <span className="fiscal-status" data-status={operation.status}>{operationStatus(operation)}</span>
      <strong className="invoice-amount">{formatFiscalBrl(operation.amount)}<ChevronDown size={15} aria-hidden="true" /></strong>
    </summary>
    <div className="invoice-list-details">
    {operation.reason && <p>{fiscalReasonLabels[operation.reason] ?? "Confira a operação antes de prosseguir."}</p>}
    <Link className="text-link" href={`/painel/notas/lotes/${operation.batch_id}`}>Abrir lote</Link>
    {operation.document && operation.status === "authorized" && <div className="standalone-actions"><Link className="btn btn--secondary" prefetch={false} href={`/painel/notas/documentos/${operation.document.id}`}>{operation.environment==='production'?'Baixar XML':'Baixar XML de homologação'}</Link><Link className="btn btn--secondary" prefetch={false} href={`/painel/notas/documentos/${operation.document.id}/danfse`}>Baixar DANFS-e</Link></div>}
    {operation.email&&<section className="invoice-email-status" aria-label="Entrega por e-mail"><strong>{emailLabels[operation.email.status]??"Entrega pendente"}</strong>{operation.email.test_mode&&<p>Teste de homologação · sem envio ao vendedor.</p>}{operation.email.destination&&<p className="field-hint">Destino previsto: {operation.email.destination}</p>}{operation.email.status==="accepted"&&<p className="field-hint">Aceito para processamento; isso ainda não comprova chegada à caixa de entrada.</p>}{operation.email.reason&&<p>{emailReasons[operation.email.reason]??"Confira a entrega antes de prosseguir."}</p>}{["failed","blocked"].includes(operation.email.status)&&<InvoiceEmailControls deliveryId={operation.email.id} needsEmail={operation.email.reason==="invalid_email"}/>}</section>}
    <FiscalControls key={`${operation.id}:${operation.status}:${operation.transmit_count}`} operationId={operation.id} status={operation.status} transmitCount={operation.transmit_count} />
  </div></details>)}</div>;
}
