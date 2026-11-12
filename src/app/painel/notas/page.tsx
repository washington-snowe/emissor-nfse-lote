import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { FiscalOperationList, type OperationDisplay } from "@/components/fiscal-operation-list";
import { FiscalRefresh } from "@/components/fiscal-refresh";
import { fiscalStatusLabels } from "@/lib/nfse/status";
export const metadata: Metadata = { title: "Emissões" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function Invoices({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { client, context } = await requireWorkspace();
  const { pagina } = await searchParams;
  const page = pagina && /^[1-9]\d{0,2}$/.test(pagina) ? Number(pagina) : 1;
  const [list, counts] = await Promise.all([client.rpc("list_fiscal_operations", { p_limit: 50, p_offset: (page - 1) * 50 }), client.rpc("fiscal_status_totals")]);
  const operations = (list.data ?? []) as OperationDisplay[];
  return <WorkspaceShell email={context.user.email} active="invoices"><div className="dashboard-content company-page">
    <div className="company-page-heading"><div><span className="eyebrow">Homologação</span><h1>Acompanhe suas emissões.</h1><p>Preparação, envio e consulta têm estados próprios. Uma resposta incerta nunca libera novo envio automático.</p></div><Link className="btn btn--primary" href="/painel/notas/nova">Preparar nota avulsa</Link></div>
    {!counts.error && <dl className="report-totals">{["queued", "blocked", "uncertain", "authorized"].map(status => <div key={status}><dt>{fiscalStatusLabels[status]}</dt><dd>{counts.data?.[status] ?? 0}</dd></div>)}</dl>}
    <FiscalRefresh waiting={operations.some(operation => ["queued", "preparing", "sending", "reconciling", "uncertain"].includes(operation.status))} />
    {list.error ? <section className="dashboard-welcome"><h2>Estrutura de emissão ainda pendente.</h2><p>Confira as migrações da fila fiscal. Suas empresas e relatórios continuam preservados.</p></section> :
      operations.length ? <FiscalOperationList operations={operations} /> : <section className="dashboard-welcome"><h2>Nenhuma operação nesta página.</h2><p>Prepare uma nota avulsa ou coloque uma revisão confirmada na fila.</p><Link className="text-link" href="/painel/importacoes/historico">Ver relatórios salvos</Link></section>}
    <nav className="standalone-actions" aria-label="Páginas de emissões">{page > 1 && <Link className="btn btn--secondary" href={`/painel/notas?pagina=${page - 1}`}>Página anterior</Link>}{operations.length === 50 && <Link className="btn btn--secondary" href={`/painel/notas?pagina=${page + 1}`}>Próxima página</Link>}</nav>
  </div></WorkspaceShell>;
}
