import type { Metadata } from "next";
import { Suspense } from "react";
import { getWorkspaceData } from "@/lib/workspace-data";
import { WorkspaceShell } from "@/components/workspace";
import { DashboardHome, DashboardOverview } from "@/components/dashboard-home";
import { workspaceDestination } from "@/lib/workspace-navigation";
import { overviewMonth, overviewSampleSize, type OverviewNote } from "@/lib/dashboard-overview";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

type Workspace = Awaited<ReturnType<typeof getWorkspaceData>>;

function loadOverview({ client, context }: Workspace, companyId: string) {
  return Promise.all([
    client.rpc("company_fiscal_totals", { p_company: companyId }),
    client.from("fiscal_operations").select("id,recipient_name:recipient->>legalName,status,environment,competence_date,amount::text")
      .eq("tenant_id", context.tenantId).eq("company_id", companyId)
      .order("created_at", { ascending: false }).order("id").limit(overviewSampleSize),
  ]);
}

async function OverviewContent({ data, notesHref, month }: { data: ReturnType<typeof loadOverview>; notesHref: string; month: string }) {
  const [totals, latest] = await data;
  const notes = (latest.data ?? []).map(({ recipient_name, ...note }) => ({
    ...note, recipient: { legalName: recipient_name ?? "Tomador não informado" },
  })) as OverviewNote[];
  return <DashboardOverview totals={totals.data ?? {}} notes={notes}
    month={month} notesHref={notesHref} totalsUnavailable={Boolean(totals.error)} notesUnavailable={Boolean(latest.error)} />;
}

export default async function Dashboard({ searchParams }: {
  searchParams: Promise<{ status?: string; empresa?: string }>;
}) {
  const { status, empresa } = await searchParams;
  const workspace = await getWorkspaceData(empresa);
  const { selected } = workspace;
  const data = selected && loadOverview(workspace, selected.id);
  return <WorkspaceShell companyId={selected?.id}>
    <DashboardHome companyName={selected?.legal_name} hasCompany={Boolean(selected)}
      importHref={selected ? workspaceDestination("imports", selected.id) : "/painel/empresas/nova"}>
      {status === "logout-error" && <p className="field-error" role="alert">Não foi possível encerrar a sessão. Tente novamente.</p>}
      {data && <Suspense fallback={<div className="workspace-loading-surface skeleton" role="status"><span className="sr-only">Carregando resumo…</span></div>}>
        <OverviewContent data={data} month={overviewMonth()} notesHref={workspaceDestination("invoices", selected?.id)} />
      </Suspense>}
    </DashboardHome>
  </WorkspaceShell>;
}
