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
  const { status } = await searchParams;
  return (
    <WorkspaceShell email={context.user.email}>
      <div className="dashboard-content">
        <span className="eyebrow">Seu espaço de trabalho</span>
        <h1>Uma base para suas notas.</h1>
        <p>Organize suas empresas antes de preparar as primeiras comissões.</p>
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
              ? "Confira os dados cadastrais e mantenha cada CNPJ organizado. A configuração fiscal será feita em uma etapa própria."
              : "Digite o CNPJ e preenchemos os dados disponíveis para você revisar."}
          </p>
          <Link
            className="btn btn--primary"
            href={count ? "/painel/empresas" : "/painel/empresas/nova"}
          >
            {count ? "Ver minhas empresas" : "Cadastrar minha empresa"}{" "}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <div className="dashboard-info">
          <div>
            <FileSpreadsheet size={24} aria-hidden="true" />
            <h2>Comissões e relatórios</h2>
            <p>
              A importação será liberada após a validação dos layouts de cada
              plataforma.
            </p>
          </div>
          <div>
            <ShieldCheck size={24} aria-hidden="true" />
            <h2>Emissão fiscal</h2>
            <p>
              A integração precisa de homologação antes de transmitir documentos
              reais.
            </p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
