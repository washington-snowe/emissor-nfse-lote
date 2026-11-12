import type { Metadata } from "next";
import Link from "next/link";
import { ReportPreview } from "@/components/report-preview";
import { WorkspaceShell } from "@/components/workspace";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceData } from "@/lib/workspace-data";
import { saveReport } from "./actions";

export const metadata: Metadata = { title: "Conferir relatório" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Imports({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { client, context } = await requireWorkspace();
  const { data, error } = await client.from("companies")
    .select("id,legal_name,cnpj").eq("tenant_id", context.tenantId).order("created_at");
  if (error) throw new Error("Companies unavailable.");
  const { empresa } = await searchParams;
  const { selected } = await getWorkspaceData(empresa);
  const admin = createAdminClient();
  const capabilities = admin ? await admin.rpc("workflow_capabilities") : null;
  return <WorkspaceShell email={context.user.email} active="imports" companyId={selected?.id}>
    <div className="dashboard-content report-page">
      <span className="eyebrow">Relatórios de comissões</span>
      <h1>Confira seu relatório da Shopee.</h1>
      <p>Escolha sua empresa e confira o CSV mensal por vendedor antes de preparar a emissão.</p>
      <Link href={selected ? `/painel/importacoes/historico?empresa=${selected.id}` : "/painel/importacoes/historico"} className="text-link">Ver importações salvas</Link>
      <ReportPreview key={selected?.id} initialCompanyId={selected?.id} companies={data} saveAction={capabilities?.data?.imports === true ? saveReport : undefined} />
      <Link href="/painel" className="text-link report-back">Voltar à visão geral</Link>
    </div>
  </WorkspaceShell>;
}
