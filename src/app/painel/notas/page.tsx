import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import {attachEmailStatuses} from "@/lib/email/display";
import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData } from "@/lib/workspace-data";
import { WorkspaceShell } from "@/components/workspace";
import { FiscalOperationList, type OperationDisplay } from "@/components/fiscal-operation-list";
import { FiscalRefresh } from "@/components/fiscal-refresh";
export const metadata: Metadata = { title: "Emissões" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function Invoices({ searchParams }: { searchParams: Promise<{ pagina?: string; empresa?: string }> }) {
  const { pagina, empresa } = await searchParams;
  const { client, context, selected } = await getWorkspaceData(empresa);
  const page = pagina && /^[1-9]\d{0,2}$/.test(pagina) ? Number(pagina) : 1;
  let [list, counts] = await Promise.all([client.rpc("list_company_fiscal_operations", { p_company: selected?.id ?? null, p_limit: 50, p_offset: (page - 1) * 50 }), client.rpc("company_fiscal_totals", { p_company: selected?.id ?? null })]);
  const legacy = list.error?.code === "PGRST202" || list.error?.code === "42883";
  if (legacy) [list, counts] = await Promise.all([client.rpc("list_fiscal_operations", { p_limit: 50, p_offset: (page - 1) * 50 }), client.rpc("fiscal_status_totals")]);
  const operations = await attachEmailStatuses(client,context.tenantId,(list.data ?? []) as OperationDisplay[]);
  const diagnostics=await client.rpc("fiscal_diagnostics_ready");
  return <WorkspaceShell email={context.user.email} active="invoices" companyId={selected?.id}><div className="dashboard-content company-page">
    <PageHeader title="Notas" description="Acompanhe o resultado de cada nota e baixe os documentos autorizados."
      actions={<Link className="btn btn--primary" href={selected ? `/painel/importacoes?empresa=${selected.id}` : "/painel/importacoes"}>Importar relatório</Link>} />
    {legacy && <p className="save-notice">O filtro por empresa está indisponível. Esta lista mostra as notas de todas as suas empresas.</p>}
    {(diagnostics.error||diagnostics.data!==true)&&<p className="save-notice">Novas transmissões aguardam a atualização do registro técnico. Operações já enviadas continuam permitindo somente consulta.</p>}
    {!counts.error && <dl className="report-totals invoice-metrics" aria-label="Situação das notas">
      {[
        { status: "queued", label: "Na fila" },
        { status: "blocked", label: "Aguardando configuração" },
        { status: "uncertain", label: "Resultado incerto" },
        { status: "authorized", label: "Autorizadas" },
      ].map(({ status, label }) => <div key={status}><dt>{label}</dt><dd>{counts.data?.[status] ?? 0}</dd></div>)}
    </dl>}
    <div className="list-toolbar">
      <h2>Histórico de emissões</h2>
      <div className="list-toolbar-actions">
        <FiscalRefresh waiting={operations.some(operation => ["queued", "preparing", "sending", "reconciling", "uncertain"].includes(operation.status))} />
        <Link className="btn btn--secondary" href="/painel/notas/email-teste">Testar e-mails</Link>
      </div>
    </div>
    {list.error ? <section className="dashboard-welcome"><h2>Emissões indisponíveis</h2><p>Atualize a página para tentar carregar as notas novamente.</p></section> :
      operations.length ? <FiscalOperationList operations={operations} /> : <EmptyState icon={<FileText size={24} aria-hidden="true" />} title={page > 1 ? "Sem resultados nesta página" : "Nenhuma emissão"}
      actions={<Link className="btn btn--secondary" href={selected ? `/painel/importacoes/historico?empresa=${selected.id}` : "/painel/importacoes/historico"}>Ver importações salvas</Link>}>
      Importe o relatório da Shopee para preparar um lote.
    </EmptyState>}
    <nav className="standalone-actions" aria-label="Páginas de emissões">{page > 1 && <Link className="btn btn--secondary" href={`/painel/notas?pagina=${page - 1}&empresa=${selected?.id ?? ""}`}>Página anterior</Link>}{operations.length === 50 && <Link className="btn btn--secondary" href={`/painel/notas?pagina=${page + 1}&empresa=${selected?.id ?? ""}`}>Próxima página</Link>}</nav>
  </div></WorkspaceShell>;
}
