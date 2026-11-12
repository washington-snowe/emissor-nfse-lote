import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace";
import { FiscalOperationList, type OperationDisplay } from "@/components/fiscal-operation-list";
import { FiscalControls } from "@/components/fiscal-controls";
import { FiscalRefresh } from "@/components/fiscal-refresh";
export const metadata: Metadata = { title: "Lote de homologação" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function Batch({ params }: { params: Promise<{ id: string }> }) {
  const { client, context } = await requireWorkspace(); const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const batch = await client.from("fiscal_batches").select("id,origin,company_id").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  if (batch.error || !batch.data) notFound();
  const list = await client.rpc("list_fiscal_operations", { p_batch: batch.data.id, p_limit: 500 });
  if (list.error) throw new Error("Fiscal batch unavailable");
  const operations = (list.data ?? []) as OperationDisplay[];
  return <WorkspaceShell email={context.user.email} active="invoices" companyId={batch.data.company_id}><div className="dashboard-content company-page"><span className="eyebrow">Homologação</span><h1>{batch.data.origin === "standalone" ? "Sua nota avulsa." : "Seu lote de notas."}</h1><p>{operations.length} {operations.length === 1 ? "operação preparada" : "operações preparadas"}. Acompanhe o resultado fiscal de cada uma.</p>
    <Link className="text-link" href={`/painel/notas?empresa=${batch.data.company_id}`}>Voltar às emissões</Link><div className="standalone-actions report-back"><FiscalControls batchId={batch.data.id} /><FiscalRefresh waiting={operations.some(operation => ["queued", "preparing", "sending", "uncertain", "reconciling"].includes(operation.status))} /></div>
    <FiscalOperationList operations={operations} />
  </div></WorkspaceShell>;
}
