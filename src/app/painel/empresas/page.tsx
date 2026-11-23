import { EmptyState, PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus, ArrowUpRight } from "lucide-react";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace";

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
  const profiles = await client.from("company_fiscal_profiles").select("company_id").eq("tenant_id", context.tenantId);
  const configured = new Set(profiles.data?.map(profile => profile.company_id) ?? []);
  const { salvo } = await searchParams;
  return (
    <WorkspaceShell email={context.user.email} active="companies">
      <div className="dashboard-content company-page">
        <PageHeader title="Empresas" description="Gerencie os cadastros e as configurações fiscais de cada CNPJ."
          actions={<Link className="btn btn--primary" href="/painel/empresas/nova"><Plus size={18} aria-hidden="true" /> Cadastrar empresa</Link>} />
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
                    {profiles.error ? "Dados cadastrados" : configured.has(company.id) ? "Perfil fiscal configurado" : "Configuração fiscal pendente"}
                  </span>
                </div>
                <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Building2 size={24} aria-hidden="true" />} title="Nenhuma empresa cadastrada">
            Informe um CNPJ para consultar os dados da sua empresa.
          </EmptyState>
        )}
      </div>
    </WorkspaceShell>
  );
}
