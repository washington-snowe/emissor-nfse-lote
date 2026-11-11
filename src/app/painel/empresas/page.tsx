import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus, ArrowUpRight } from "lucide-react";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace-shell";

export const metadata: Metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";
export default async function Companies({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { client, context } = await requireWorkspace();
  const { data, error } = await client
    .from("companies")
    .select("id,cnpj,legal_name,trade_name,tax_regime,address")
    .eq("tenant_id", context.tenantId)
    .order("created_at");
  if (error) throw new Error("Companies unavailable.");
  const { salvo } = await searchParams;
  return (
    <WorkspaceShell email={context.user.email} active="companies">
      <div className="dashboard-content company-page">
        <div className="company-page-heading">
          <div>
            <span className="eyebrow">Seu espaço de trabalho</span>
            <h1>Suas empresas.</h1>
            <p>Dados e configurações independentes para cada CNPJ.</p>
          </div>
          <Link className="btn btn--primary" href="/painel/empresas/nova">
            <Plus size={18} aria-hidden="true" /> Cadastrar empresa
          </Link>
        </div>
        {salvo === "1" && (
          <p className="save-notice" role="status">
            Empresa salva. A configuração fiscal continua pendente.
          </p>
        )}
        {data.length ? (
          <div className="company-list">
            {data.map((company) => (
              <Link
                className="company-card card"
                href={`/painel/empresas/${company.id}`}
                key={company.id}
              >
                <span className="company-symbol">
                  <Building2 size={24} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <h2>{company.legal_name}</h2>
                  <p className="mono">{company.cnpj}</p>
                  <p>
                    {company.tax_regime === "mei" ? "MEI" : "Simples Nacional"}
                    {company.address?.city ? ` · ${company.address.city}` : ""}
                  </p>
                  <span className="small-status">
                    Configuração fiscal pendente
                  </span>
                </div>
                <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <section className="dashboard-welcome">
            <span className="welcome-icon">
              <Building2 size={36} strokeWidth={1.4} aria-hidden="true" />
            </span>
            <h2>Seu primeiro CNPJ começa aqui.</h2>
            <p>
              Buscamos os dados disponíveis para você revisar, sem preencher
              tudo do zero.
            </p>
            <Link href="/painel/empresas/nova" className="text-link">
              Cadastrar minha empresa{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </section>
        )}
        <Link href="/painel" className="text-link">
          Voltar à visão geral
        </Link>
      </div>
    </WorkspaceShell>
  );
}
