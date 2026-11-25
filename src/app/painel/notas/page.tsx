import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { attachEmailStatuses } from "@/lib/email/display";
import { getWorkspaceData } from "@/lib/workspace-data";
import { WorkspaceShell } from "@/components/workspace";
import { workspaceDestination } from "@/lib/workspace-navigation";
import { FiscalOperationList, type OperationDisplay } from "@/components/fiscal-operation-list";
import { FiscalRefresh } from "@/components/fiscal-refresh";

export const metadata: Metadata = { title: "Notas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pageSize = 50;

async function loadNotes({ client, context, selected }: Awaited<ReturnType<typeof getWorkspaceData>>, page: number) {
  const range = { p_limit: pageSize, p_offset: (page - 1) * pageSize };
  let list = await client.rpc("list_company_fiscal_operations", { p_company: selected?.id ?? null, ...range });
  const legacy = list.error?.code === "PGRST202" || list.error?.code === "42883";
  if (legacy) list = await client.rpc("list_fiscal_operations", range);
  const operations = await attachEmailStatuses(client, context.tenantId, (list.data ?? []) as OperationDisplay[]);
  return { error: list.error, legacy, operations };
}

async function NotesContent({ data, companyId, page }: { data: ReturnType<typeof loadNotes>; companyId?: string; page: number }) {
  const { error, legacy, operations } = await data;
  const url = (number: number) => "/painel/notas?" + new URLSearchParams({ pagina: String(number), ...(companyId && { empresa: companyId }) });
  return <>
    {legacy && <p className="save-notice">Esta lista mostra as notas de todas as suas empresas.</p>}
    <div className="list-toolbar">
      <h2>Histórico de emissões</h2>
      <FiscalRefresh waiting={operations.some(operation => ["queued", "preparing", "sending", "reconciling", "uncertain"].includes(operation.status))} />
    </div>
    {error ? <p className="save-notice" role="status">As notas estão temporariamente indisponíveis. Atualize o histórico para tentar novamente.</p> :
      operations.length ? <FiscalOperationList operations={operations} /> :
        <EmptyState icon={<FileText size={24} aria-hidden="true" />} title={page > 1 ? "Sem resultados nesta página" : "Nenhuma emissão"}>
          {page > 1 ? "Volte à página anterior para ver as notas." : "Importe o relatório da Shopee para preparar um lote."}
        </EmptyState>}
    {(page > 1 || operations.length === pageSize) && <nav className="standalone-actions" aria-label="Páginas de emissões">
      {page > 1 && <Link className="btn btn--secondary" href={url(page - 1)}>Página anterior</Link>}
      {operations.length === pageSize && <Link className="btn btn--secondary" href={url(page + 1)}>Próxima página</Link>}
    </nav>}
  </>;
}

export default async function Invoices({ searchParams }: { searchParams: Promise<{ pagina?: string; empresa?: string }> }) {
  const { pagina, empresa } = await searchParams;
  const workspace = await getWorkspaceData(empresa);
  const { selected } = workspace;
  const page = pagina && /^[1-9]\d{0,2}$/.test(pagina) ? Number(pagina) : 1;
  const data = loadNotes(workspace, page);
  return <WorkspaceShell active="invoices" companyId={selected?.id}><div className="dashboard-content company-page">
    <PageHeader title="Notas" description="Acompanhe as emissões e baixe os documentos autorizados."
      actions={<Link className="btn btn--primary" href={workspaceDestination("imports", selected?.id)} prefetch={false}>Importar relatório</Link>} />
    <Suspense fallback={<div className="workspace-loading-surface skeleton" role="status"><span className="sr-only">Carregando notas…</span></div>}>
      <NotesContent data={data} page={page} companyId={selected?.id} />
    </Suspense>
  </div></WorkspaceShell>;
}
