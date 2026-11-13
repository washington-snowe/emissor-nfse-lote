import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspaceShell } from "@/components/workspace";
import { FiscalProfileForm } from "@/components/fiscal-profile-form";
import { MeiFiscalSetup } from "@/components/mei-fiscal-setup";
import { parseFiscalProfile } from "@/lib/nfse/profile";
import { todayInBrazil } from "@/lib/nfse/standalone";
import { saveFiscalProfile, saveFiscalSection, activateMeiAffiliateProfile } from "./actions";

export const metadata: Metadata = { title: "Configuração fiscal" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function FiscalConfiguration({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ secao?: string; modo?: string }> }) {
  const { client, context } = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const company = await client.from("companies").select("id,legal_name,cnpj,tax_regime,address").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) notFound();
  const current = await client.from("company_fiscal_profiles").select("version,configuration,valid_from,evidence_reference").eq("company_id", company.data.id).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle();
  const parsed = current.data ? parseFiscalProfile(current.data.configuration, company.data.cnpj, company.data.tax_regime) : null;
  const { secao, modo } = await searchParams;
  const section = parsed && secao === "servico" ? "service" : parsed && secao === "avancado" ? "advanced" : "all";
  const simplifiedMei = company.data.tax_regime === "mei" && modo !== "completo" && (!current.data || Boolean(parsed));
  const active = simplifiedMei ? secao === "avancado" ? "advanced" : "service" : section === "all" ? "companies" : section;
  const initial = current.data && parsed ? { ...current.data, configuration: parsed } : undefined;
  const fiscalUrl = `/painel/empresas/${id}/fiscal`;
  const fullQuery = modo === "completo" ? "&modo=completo" : "";
  const available = Boolean(createAdminClient()) && !current.error;
  return <WorkspaceShell email={context.user.email} active={active} companyId={company.data.id}><div className="dashboard-content company-page">
    <span className="eyebrow">Configuração fiscal</span><h1>{simplifiedMei ? "Seu MEI, sem complicação." : section === "service" ? "Serviço e tributação." : section === "advanced" ? "Configurações avançadas." : "Prepare sua empresa para emitir."}</h1><p>{company.data.legal_name}</p>
    <Link className="text-link" href={`/painel/empresas/${company.data.id}`}>Voltar ao cadastro da empresa</Link>
    <nav className="settings-tabs" aria-label="Configurações da empresa"><Link href={`/painel/empresas/${id}`}>Cadastro</Link><Link href={`${fiscalUrl}?secao=servico${fullQuery}`} aria-current={active === "service" ? "page" : undefined}>Serviço</Link><Link href={`${fiscalUrl}?secao=avancado${fullQuery}`} aria-current={active === "advanced" ? "page" : undefined}>Avançado</Link></nav>
    {!parsed && !simplifiedMei && <p className="save-notice">Na primeira configuração, confirme todos os parâmetros. Depois você poderá editar Serviço e Avançado separadamente.</p>}
    {company.data.tax_regime === "mei" && modo === "completo" && <Link className="text-link" href={fiscalUrl}>Voltar à configuração simplificada do MEI</Link>}
    {!available ? <section className="dashboard-welcome"><h2>Configuração fiscal indisponível.</h2><p>Verifique a configuração privada do servidor, a migração de perfis fiscais e se o enquadramento da empresa foi alterado desde a última versão.</p></section> :
      simplifiedMei && !initial && !/^[1-9]\d{6}$/.test(company.data.address?.municipality_code ?? "") ? <section className="dashboard-welcome"><h2>Complete o município da empresa.</h2><p>Vamos aproveitar esse dado do cadastro para preencher sua configuração MEI.</p><Link className="btn btn--primary" href={`/painel/empresas/${company.data.id}`}>Completar cadastro da empresa</Link></section> :
      simplifiedMei ? <MeiFiscalSetup key={company.data.id} companyId={company.data.id} today={todayInBrazil()} initial={initial}
        municipality={[company.data.address?.city, company.data.address?.state].filter(value => typeof value === "string" && value).join(" / ")}
        action={activateMeiAffiliateProfile.bind(null, company.data.id)} /> :
      <><p className="field-hint">{current.data && !parsed ? "A versão anterior não corresponde ao enquadramento atual. Revise os campos para criar uma nova versão." : "Confirme os dados aplicáveis com sua orientação fiscal."}</p><FiscalProfileForm key={`${company.data.id}:${section}`} section={section} version={current.data?.version ?? 0} initial={initial}
        municipality={typeof company.data.address?.municipality_code === "string" ? company.data.address.municipality_code : ""}
        regime={company.data.tax_regime} action={section === "all" ? saveFiscalProfile.bind(null, company.data.id) : saveFiscalSection.bind(null, company.data.id, section)} /></>}
  </div></WorkspaceShell>;
}
