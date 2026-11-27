import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { getWorkspaceData } from "@/lib/workspace-data";
import { preloadWorkspaceShell, WorkspaceShell } from "@/components/workspace";
import { PageHeader } from "@/components/page-header";
import { workspaceDestination } from "@/lib/workspace-navigation";
import type { OperationDisplay } from "@/components/fiscal-operation-list";
import { formatFiscalBrl, operationStatus } from "@/lib/nfse/status";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

type Workspace = Awaited<ReturnType<typeof getWorkspaceData>>;
type RecentNote = Pick<OperationDisplay, "id" | "recipient" | "status" | "environment" | "amount">;

function loadOverview({ client, context }: Workspace, companyId: string) {
  return Promise.all([
    client.rpc("company_fiscal_totals", { p_company: companyId }),
    client.from("fiscal_operations").select("id,recipient,status,environment,amount::text")
      .eq("tenant_id", context.tenantId).eq("company_id", companyId)
      .order("created_at", { ascending: false }).order("id").limit(5),
  ]);
}

async function OverviewContent({ data, notes }: { data: ReturnType<typeof loadOverview>; notes: string }) {
  const [totals, latest] = await data;
  const count = (statuses: string[]) => statuses.reduce((sum, key) => sum + (totals.data?.[key] ?? 0), 0);
  const recent = (latest.data ?? []) as RecentNote[];
  return <>
    {!totals.error && <dl className="overview-totals" aria-label="Situação das notas da empresa">
      {[
        { label: "Autorizadas", value: count(["authorized"]) },
        { label: "Em andamento", value: count(["queued", "preparing", "sending", "reconciling"]) },
        { label: "Precisam de atenção", value: count(["blocked", "uncertain", "rejected", "intervention"]) },
      ].map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString("pt-BR")}</dd></div>)}
    </dl>}
    <section className="overview-recent" aria-labelledby="overview-recent-title">
      <div className="overview-recent-heading">
        <h2 id="overview-recent-title">Notas recentes</h2>
        <Link className="text-link" href={notes} prefetch={false}>Ver todas <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      {latest.error ? <p>As notas recentes estão temporariamente indisponíveis.</p> : recent.length ? <ul>
        {recent.map(note => <li key={note.id}>
          <div><strong>{note.recipient.legalName}</strong><span>{operationStatus(note)}</span></div>
          <strong>{formatFiscalBrl(String(note.amount))}</strong>
        </li>)}
      </ul> : <p>As notas da empresa aparecerão aqui depois da primeira preparação.</p>}
    </section>
  </>;
}

export default async function Dashboard({ searchParams }: {
  searchParams: Promise<{ status?: string; empresa?: string }>;
}) {
  const { status, empresa } = await searchParams;
  preloadWorkspaceShell();
  const workspace = await getWorkspaceData(empresa);
  const { selected } = workspace;
  const data = selected && loadOverview(workspace, selected.id);
  return <WorkspaceShell companyId={selected?.id}>
    <div className="dashboard-content">
      <PageHeader title="Início"
        description={selected?.legal_name ?? "Cadastre sua empresa para emitir suas primeiras notas."}
        actions={<Link className="btn btn--primary" prefetch={false}
          href={selected ? workspaceDestination("imports", selected.id) : "/painel/empresas/nova"}>
          {selected ? "Importar relatório" : "Cadastrar empresa"} <ArrowRight size={17} aria-hidden="true" />
        </Link>} />
      {status === "logout-error" && <p className="field-error" role="alert">Não foi possível encerrar a sessão. Tente novamente.</p>}
      {data && <Suspense fallback={<div className="workspace-loading-surface skeleton" role="status"><span className="sr-only">Carregando resumo…</span></div>}>
        <OverviewContent data={data} notes={workspaceDestination("invoices", selected?.id)} />
      </Suspense>}
    </div>
  </WorkspaceShell>;
}
