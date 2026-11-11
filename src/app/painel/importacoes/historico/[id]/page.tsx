import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePersistedReport } from "@/lib/persisted-report";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ReportResults } from "@/components/report-results";
import { QueueRefresh } from "@/components/queue-refresh";
import { retryImport } from "../../actions";

export const metadata: Metadata = { title: "Revisão da importação" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SavedReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, context } = await requireWorkspace();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await client.from("report_imports").select("*").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  if (result.error || !result.data) notFound();
  const report = result.data;
  const company = await client.from("companies").select("legal_name").eq("id", report.company_id).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) notFound();
  const parsed = report.status === "parsed" ? validatePersistedReport(report.parsed_payload, report.file_sha256) : null;
  return <WorkspaceShell email={context.user.email} active="imports"><div className="dashboard-content report-page">
    <span className="eyebrow">Importação salva</span><h1>Revise seu relatório.</h1><p>{report.file_name}</p>
    <Link className="text-link" href="/painel/importacoes/historico">Voltar às importações</Link>
    {parsed ? <ReportResults preview={parsed} companyName={company.data.legal_name} /> : <section className="dashboard-welcome">
      <h2>{report.status === "received" ? "Seu relatório está na fila." : "O arquivo precisa de atenção."}</h2>
      <p>{report.status === "received" ? "O original está salvo. O processamento pode continuar mesmo após você fechar esta página." : "Não foi possível reconhecer e validar o relatório inteiro. Confira o arquivo original e envie uma nova exportação; nenhum total parcial foi aprovado."}</p>
    </section>}
    <QueueRefresh waiting={report.status === "received"} retryAction={createAdminClient() ? retryImport.bind(null, id) : undefined} />
  </div></WorkspaceShell>;
}
