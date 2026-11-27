import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspaceShell } from "@/components/workspace";
import { FiscalProfileForm } from "@/components/fiscal-profile-form";
import { AutomaticAffiliateSummary } from "@/components/automatic-affiliate-summary";
import { parseFiscalProfile } from "@/lib/nfse/profile";
import { ensureAutomaticFiscalSetup } from "@/lib/automatic-fiscal-setup";
import { saveFiscalProfile, saveFiscalSection } from "./actions";

export const metadata: Metadata = { title: "Configuração fiscal" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function FiscalConfiguration({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ secao?: string; modo?: string }> }) {
  const { client, context } = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const company = await client.from("companies").select("id,legal_name,cnpj,tax_regime,address").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) notFound();
  const { secao, modo } = await searchParams;
  const automatic = modo !== "completo";
  const setup = automatic ? await ensureAutomaticFiscalSetup(company.data.id).catch(() => ({reason:"storage_pending"})) : undefined;
  const current = await client.from("company_fiscal_profiles").select("version,configuration,valid_from,evidence_reference").eq("company_id", company.data.id).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle();
  const parsed = current.data ? parseFiscalProfile(current.data.configuration, company.data.cnpj, company.data.tax_regime) : null;
  const section = parsed && secao === "servico" ? "service" : parsed && secao === "avancado" ? "advanced" : "all";
  const active = automatic ? secao === "avancado" ? "advanced" : "service" : section === "all" ? "companies" : section;
  const initial = current.data && parsed ? { ...current.data, configuration: parsed } : undefined;
  const fiscalUrl = `/painel/empresas/${id}/fiscal`;
  const available = Boolean(createAdminClient()) && !current.error;
  return <WorkspaceShell email={context.user.email} active={active} companyId={company.data.id}><div className="dashboard-content company-page">
    <PageHeader title={active === "advanced" ? "Configuração avançada" : active === "service" ? "Serviço e tributação" : "Configuração fiscal"} description={company.data.legal_name}
      back={{ href: `/painel/empresas/${company.data.id}`, label: "Cadastro da empresa" }}
      actions={!automatic && <Link className="btn btn--secondary" href={fiscalUrl}>Configuração automática</Link>} />
    {!parsed && !automatic && <p className="save-notice">Personalize os parâmetros aplicáveis à sua operação. Depois você poderá editar Serviço e Avançado separadamente.</p>}
    {!available ? <section className="dashboard-welcome"><h2>Configuração fiscal indisponível</h2><p>Não foi possível carregar os dados fiscais. Tente novamente em instantes.</p></section> :
      automatic ? <AutomaticAffiliateSummary companyId={company.data.id} regime={company.data.tax_regime} initial={initial} reason={setup?.reason}
        municipality={[company.data.address?.city, company.data.address?.state].filter(value => typeof value === "string" && value).join(" / ")}
        /> :
      <><p className="field-hint">{current.data && !parsed ? "A versão anterior não corresponde ao enquadramento atual. Revise os campos para criar uma nova versão." : "Confirme os dados aplicáveis com sua orientação fiscal."}</p><FiscalProfileForm key={`${company.data.id}:${section}`} section={section} version={current.data?.version ?? 0} initial={initial}
        municipality={typeof company.data.address?.municipality_code === "string" ? company.data.address.municipality_code : ""}
        regime={company.data.tax_regime} action={section === "all" ? saveFiscalProfile.bind(null, company.data.id) : saveFiscalSection.bind(null, company.data.id, section)} /></>}
  </div></WorkspaceShell>;
}
