import { EmptyState, PageHeader } from "@/components/page-header";
import { ArrowUpRight, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData } from "@/lib/workspace-data";
import { WorkspaceShell } from "@/components/workspace";

export const metadata: Metadata = { title: "Importações salvas" };
export const dynamic = "force-dynamic";
const labels: Record<string, string> = { received: "Aguardando processamento", parsed: "Pronta para revisão", invalid: "Arquivo não reconhecido" };

export default async function ImportHistory({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  const { client, context, selected } = await getWorkspaceData(empresa);
  const result = await client.from("report_imports").select("id,file_name,status,row_count,created_at")
    .eq("tenant_id", context.tenantId).eq("company_id", selected?.id ?? "00000000-0000-4000-8000-000000000000").order("created_at", { ascending: false }).limit(100);
  const importUrl = selected ? `/painel/importacoes?empresa=${selected.id}` : "/painel/importacoes";
  return <WorkspaceShell email={context.user.email} active="history" companyId={selected?.id}><div className="dashboard-content">
    <PageHeader title="Importações salvas" description="Abra um relatório para consultar os dados ou retomar a revisão."
      actions={<Link className="btn btn--primary" href={importUrl}>Importar relatório</Link>} />
    {result.error ? <p className="save-notice">Não foi possível carregar o histórico. Você ainda pode conferir um CSV na página de importação.</p> : result.data.length ?
      <div className="company-list">{result.data.map((report) => <Link key={report.id} className="company-card card report-history-row" href={`/painel/importacoes/historico/${report.id}`}><span className="company-symbol"><FileSpreadsheet size={21} aria-hidden="true" /></span><div>
        <h2>{report.file_name}</h2><p>{labels[report.status] ?? "Em revisão"}{report.row_count ? ` · ${report.row_count} linhas` : ""}</p>
        <p>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(report.created_at))}</p>
      </div><ArrowUpRight size={18} aria-hidden="true" /></Link>)}</div> :
      <EmptyState icon={<FileSpreadsheet size={24} aria-hidden="true" />} title="Nenhum relatório salvo">Os CSVs importados por esta empresa aparecem aqui.</EmptyState>}
  </div></WorkspaceShell>;
}
