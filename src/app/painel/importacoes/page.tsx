import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import { ReportPreview } from "@/components/report-preview";
import { preloadWorkspaceShell, WorkspaceShell } from "@/components/workspace";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceData } from "@/lib/workspace-data";
import { saveReport } from "./actions";
import {ImportedReportReview} from "@/components/imported-report-review";

export const metadata: Metadata = { title: "Conferir relatório" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Imports({ searchParams }: { searchParams: Promise<{ empresa?: string;relatorio?:string }> }) {
  const { empresa,relatorio } = await searchParams;
  preloadWorkspaceShell();
  const workspace = getWorkspaceData(relatorio ? undefined : empresa);
  const admin = relatorio ? null : createAdminClient();
  const capabilitiesRequest = admin ? admin.rpc("workflow_capabilities") : null;
  let reportCompany:string|undefined;
  if (relatorio) {
    if (!/^[0-9a-f-]{36}$/i.test(relatorio)) notFound();
    const { client, context } = await requireWorkspace();
    const report = await client.from("report_imports").select("company_id").eq("id", relatorio).eq("tenant_id", context.tenantId).maybeSingle();
    if (report.error || !report.data) notFound();
    reportCompany = report.data.company_id;
  }
  const [{ companies, selected: defaultCompany }, capabilities] = await Promise.all([workspace, capabilitiesRequest]);
  const selected = reportCompany ? (await getWorkspaceData(reportCompany)).selected : defaultCompany;
  return <WorkspaceShell active="imports" companyId={selected?.id}>
    <div className="dashboard-content report-page">
      <PageHeader title={relatorio ? "Revisão do relatório" : "Notas em lote"}
        description={relatorio ? "Confira os dados preparados a partir do CSV." : "Selecione o CSV mensal da Shopee para preparar as notas do lote."}
        actions={<Link href={relatorio ? `/painel/importacoes?empresa=${selected?.id ?? ""}` : selected ? `/painel/importacoes/historico?empresa=${selected.id}` : "/painel/importacoes/historico"} className="btn btn--secondary">
          {relatorio ? "Importar outro relatório" : "Importações salvas"}
        </Link>} />
      {relatorio ? <ImportedReportReview id={relatorio} /> :<ReportPreview key={selected?.id} automaticUpload initialCompanyId={selected?.id} companies={companies} saveAction={capabilities?.data?.imports === true ? saveReport : undefined} />}
    </div>
  </WorkspaceShell>;
}
