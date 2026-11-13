import type { Metadata } from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import { ReportPreview } from "@/components/report-preview";
import { WorkspaceShell } from "@/components/workspace";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceData } from "@/lib/workspace-data";
import { saveReport } from "./actions";
import {ImportedReportReview} from "@/components/imported-report-review";

export const metadata: Metadata = { title: "Conferir relatório" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Imports({ searchParams }: { searchParams: Promise<{ empresa?: string;relatorio?:string }> }) {
  const { client, context } = await requireWorkspace();
  const { data, error } = await client.from("companies")
    .select("id,legal_name,cnpj").eq("tenant_id", context.tenantId).order("created_at");
  if (error) throw new Error("Companies unavailable.");
  const { empresa,relatorio } = await searchParams;
  let reportCompany:string|undefined;
  if(relatorio){if(!/^[0-9a-f-]{36}$/i.test(relatorio))notFound();const report=await client.from("report_imports").select("company_id").eq("id",relatorio).eq("tenant_id",context.tenantId).maybeSingle();if(report.error||!report.data)notFound();reportCompany=report.data.company_id;}
  const { selected } = await getWorkspaceData(reportCompany??empresa);
  const admin = createAdminClient();
  const capabilities = admin ? await admin.rpc("workflow_capabilities") : null;
  return <WorkspaceShell email={context.user.email} active="imports" companyId={selected?.id}>
    <div className="dashboard-content report-page">
      <span className="eyebrow">Relatórios de comissões</span>
      <h1>Confira seu relatório da Shopee.</h1>
      <p>Escolha o CSV, confira as notas previstas e confirme a revisão para iniciar seu lote em homologação.</p>
      <Link href={selected ? `/painel/importacoes/historico?empresa=${selected.id}` : "/painel/importacoes/historico"} className="text-link">Ver importações salvas</Link>
      {relatorio?<><Link className="text-link report-back" href={`/painel/importacoes?empresa=${selected?.id??""}`}>Importar outro relatório</Link><ImportedReportReview id={relatorio}/></>:<ReportPreview key={selected?.id} automaticUpload initialCompanyId={selected?.id} companies={data} saveAction={capabilities?.data?.imports === true ? saveReport : undefined} />}
      <Link href="/painel" className="text-link report-back">Voltar à visão geral</Link>
    </div>
  </WorkspaceShell>;
}
