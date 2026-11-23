import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CircleCheck, Clock3, FileSpreadsheet, History, TriangleAlert, Upload } from "lucide-react";
import { getWorkspaceData } from "@/lib/workspace-data";
import { WorkspaceShell } from "@/components/workspace";
import { PageHeader } from "@/components/page-header";
import { workspaceDestination } from "@/lib/workspace-navigation";

export const metadata: Metadata = { title: "Visão geral" };
export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: {
  searchParams: Promise<{ status?: string; empresa?: string }>;
}) {
  const { status, empresa } = await searchParams;
  const { client, selected } = await getWorkspaceData(empresa);
  const totals = selected ? await client.rpc("company_fiscal_totals", { p_company: selected.id }) : null;
  const count = (statuses: string[]) => statuses.reduce((sum, key) => sum + (totals?.data?.[key] ?? 0), 0);
  const notes = workspaceDestination("invoices", selected?.id);
  const imp = workspaceDestination("imports", selected?.id);
  const history = workspaceDestination("history", selected?.id);
  return <WorkspaceShell companyId={selected?.id}>
    <div className="dashboard-content">
      <PageHeader title="Visão geral" description="Acompanhe a emissão de notas da empresa selecionada." />
      {status === "logout-error" && <p className="field-error" role="alert">Não foi possível encerrar a sessão. Tente novamente.</p>}
      {totals?.error && <p className="save-notice" role="status">Os totais da empresa estão indisponíveis. Abra Notas para consultar as emissões.</p>}
      {selected && totals && !totals.error && <dl className="overview-metrics" aria-label="Situação das notas da empresa">
        {[
          { label: "Autorizadas", value: count(["authorized"]), Icon: CircleCheck },
          { label: "Em andamento", value: count(["queued", "preparing", "sending", "reconciling"]), Icon: Clock3 },
          { label: "Precisam de atenção", value: count(["blocked", "uncertain", "rejected", "intervention"]), Icon: TriangleAlert },
        ].map(({ label, value, Icon }) => <div key={label}><dt><Icon size={18} aria-hidden="true" />{label}</dt><dd>{value.toLocaleString("pt-BR")}</dd></div>)}
      </dl>}
      <section className="overview-next" aria-labelledby="overview-next-title">
        {selected ? <div className="overview-next-icon"><FileSpreadsheet size={28} aria-hidden="true" /></div> : <div className="overview-next-icon"><Building2 size={28} aria-hidden="true" /></div>}
        <div>
          <h2 id="overview-next-title">{selected ? "Novo lote de notas" : "Cadastre sua empresa"}</h2>
          <p>{selected ? "Selecione o CSV mensal da Shopee e confira os dados do lote antes de emitir." : "Informe o CNPJ para consultar os dados cadastrais da empresa que vai emitir."}</p>
        </div>
        <Link className="btn btn--primary" href={selected ? imp : "/painel/empresas/nova"}>
          {selected ? <><Upload size={17} aria-hidden="true" /> Importar relatório</> : <>Cadastrar empresa <ArrowRight size={17} aria-hidden="true" /></>}
        </Link>
      </section>
      <div className="overview-shortcuts">
        <Link href={notes} className="overview-shortcut"><CircleCheck size={22} aria-hidden="true" /><span><strong>Notas</strong><span>Consulte resultados e baixe documentos.</span></span><ArrowRight size={17} aria-hidden="true" /></Link>
        <Link href={history} className="overview-shortcut"><History size={22} aria-hidden="true" /><span><strong>Importações salvas</strong><span>Veja os relatórios enviados e retome a revisão.</span></span><ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </div>
  </WorkspaceShell>;
}
