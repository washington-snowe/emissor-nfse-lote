import { PageHeader } from "@/components/page-header";
import {InvoiceEmailControls} from "@/components/invoice-email-controls";
import {emailConfig} from "@/lib/email/config";
import {attachEmailStatuses} from "@/lib/email/display";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace";
import { FiscalOperationList, type OperationDisplay } from "@/components/fiscal-operation-list";
import { FiscalControls } from "@/components/fiscal-controls";
import { FiscalRefresh } from "@/components/fiscal-refresh";
export const metadata: Metadata = { title: "Lote de notas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function Batch({ params }: { params: Promise<{ id: string }> }) {
  const { client, context } = await requireWorkspace(); const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const batch = await client.from("fiscal_batches").select("id,origin,company_id,environment").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  if (batch.error || !batch.data) notFound();
  const list = await client.rpc("list_fiscal_operations", { p_batch: batch.data.id, p_limit: 500 });
  if (list.error) throw new Error("Fiscal batch unavailable");
  const operations = await attachEmailStatuses(client,context.tenantId,(list.data ?? []) as OperationDisplay[]);
  const diagnostics=await client.rpc("fiscal_diagnostics_ready");
  return <WorkspaceShell email={context.user.email} active="invoices" companyId={batch.data.company_id}><div className="dashboard-content company-page"><PageHeader title={batch.data.origin === "standalone" ? "Nota avulsa" : "Lote de notas"}
      description={`${operations.length} ${operations.length === 1 ? "nota" : "notas"} · ${batch.data.environment === "production" ? "Produção" : "Homologação"}`}
      back={{ href: `/painel/notas?empresa=${batch.data.company_id}`, label: "Notas" }} />
    {(diagnostics.error||diagnostics.data!==true)&&<p className="save-notice">Novas transmissões aguardam a atualização do registro técnico. Operações já enviadas continuam permitindo somente consulta.</p>}
    <div className="standalone-actions report-back"><FiscalControls batchId={batch.data.id} /><FiscalRefresh waiting={operations.some(operation => ["queued", "preparing", "sending", "uncertain", "reconciling"].includes(operation.status))} /></div>
    {emailConfig(process.env).enabled&&<InvoiceEmailControls batchId={batch.data.id} environment={batch.data.environment}/>}<FiscalOperationList operations={operations} />
  </div></WorkspaceShell>;
}
