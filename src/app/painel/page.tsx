import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace-shell";

export const metadata: Metadata = { title: "Meu espaço" };
export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { client, context } = await requireWorkspace();
  const result = await client
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", context.tenantId);
  if (result.error) throw new Error("Companies unavailable.");
  const count = result.count ?? 0;
  const totals = await client.rpc("fiscal_status_totals");
  const { status } = await searchParams;
  return (
    <WorkspaceShell email={context.user.email}>
      <div className="dashboard-content">
        <span className="eyebrow">Seu espaço de trabalho</span>
        <h1>Suas emissões, em um só lugar.</h1>
        <p>Prepare uma nota avulsa ou acompanhe a revisão e o processamento dos relatórios.</p>
        {!totals.error && <dl className="report-totals"><div><dt>Empresas cadastradas</dt><dd>{count}</dd></div><div><dt>Operações na fila</dt><dd>{["queued", "blocked", "preparing", "sending", "uncertain", "reconciling"].reduce((sum, key) => sum + (totals.data?.[key] ?? 0), 0)}</dd></div><div><dt>Autorizadas em homologação</dt><dd>{totals.data?.authorized ?? 0}</dd></div></dl>}
        {status === "logout-error" && (
          <p className="field-error" role="alert">
            Não foi possível encerrar a sessão. Tente sair novamente.
          </p>
        )}
        <section className="dashboard-welcome" aria-labelledby="next-steps">
          <span className="welcome-icon">
            <Building2 size={36} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <h2 id="next-steps">
            {count
              ? `${count} ${count === 1 ? "empresa cadastrada" : "empresas cadastradas"}.`
              : "O primeiro passo é sua empresa."}
          </h2>
          <p>
            {count
              ? "Use os dados da empresa e o perfil fiscal para preparar a próxima nota. O histórico mostra as pendências de cada operação."
              : "Digite o CNPJ e preenchemos os dados disponíveis para você revisar."}
          </p>
          <Link
            className="btn btn--primary"
            href={count ? "/painel/notas/nova" : "/painel/empresas/nova"}
          >
            {count ? "Preparar nota avulsa" : "Cadastrar minha empresa"}{" "}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <div className="dashboard-info">
          <div>
            <FileSpreadsheet size={24} aria-hidden="true" />
            <h2>Comissões e relatórios</h2>
            <p>
              Confira e salve o CSV mensal da Shopee. Revise tomadores, competência e valores antes de colocar um lote na fila.
            </p>
            <Link href="/painel/importacoes" className="text-link">Conferir relatório <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          <div>
            <ShieldCheck size={24} aria-hidden="true" />
            <h2>Emissão fiscal</h2>
            <p>
              Acompanhe preparações, pendências e consultas. A produção continua dependente de homologação validada.
            </p>
            <Link href="/painel/notas" className="text-link">Acompanhar emissões <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
