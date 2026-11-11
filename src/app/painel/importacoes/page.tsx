import type { Metadata } from "next";
import Link from "next/link";
import { ReportPreview } from "@/components/report-preview";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireWorkspace } from "@/lib/tenancy-server";

export const metadata: Metadata = { title: "Conferir relatório" };
export const dynamic = "force-dynamic";

export default async function Imports() {
  const { client, context } = await requireWorkspace();
  const { data, error } = await client.from("companies")
    .select("id,legal_name,cnpj").eq("tenant_id", context.tenantId).order("created_at");
  if (error) throw new Error("Companies unavailable.");
  return <WorkspaceShell email={context.user.email} active="imports">
    <div className="dashboard-content report-page">
      <span className="eyebrow">Relatórios de comissões</span>
      <h1>Confira seu relatório da Shopee.</h1>
      <p>Escolha sua empresa e confira o CSV mensal por vendedor antes de preparar a emissão.</p>
      <ReportPreview companies={data} />
      <Link href="/painel" className="text-link report-back">Voltar à visão geral</Link>
    </div>
  </WorkspaceShell>;
}
