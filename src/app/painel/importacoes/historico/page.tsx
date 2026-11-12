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
  return <WorkspaceShell email={context.user.email} active="imports" companyId={selected?.id}><div className="dashboard-content">
    <span className="eyebrow">Relatórios de comissões</span><h1>Importações salvas.</h1>
    <p>Originais privados, dados para revisão e processamento rastreável.</p>
    <Link className="text-link" href={selected ? `/painel/importacoes?empresa=${selected.id}` : "/painel/importacoes"}>Conferir outro relatório</Link>
    {result.error ? <p className="save-notice">O histórico ainda está em configuração. A conferência local continua disponível.</p> : result.data.length ?
      <div className="company-list">{result.data.map((report) => <Link key={report.id} className="company-card card" href={`/painel/importacoes/historico/${report.id}`}><div>
        <h2>{report.file_name}</h2><p>{labels[report.status] ?? "Em revisão"}{report.row_count ? ` · ${report.row_count} linhas` : ""}</p>
        <p>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(report.created_at))}</p>
      </div></Link>)}</div> : <section className="dashboard-welcome"><h2>Seu histórico começa com um relatório.</h2><p>Confira um CSV e escolha salvar a importação para continuar a revisão depois.</p><Link href={selected ? `/painel/importacoes?empresa=${selected.id}` : "/painel/importacoes"} className="btn btn--primary">Conferir relatório</Link></section>}
  </div></WorkspaceShell>;
}
