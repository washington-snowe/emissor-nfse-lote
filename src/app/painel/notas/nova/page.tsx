import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import shopee from "../../../../../integrations/marketplaces/shopee-recipient.json";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFiscalProfile } from "@/lib/nfse/profile";
import { cleanFiscalPerson } from "@/lib/nfse/review";
import { todayInBrazil, type StandaloneDefaults } from "@/lib/nfse/standalone";
import { WorkspaceShell } from "@/components/workspace";
import { StandaloneInvoiceForm } from "@/components/standalone-invoice-form";
import { getWorkspaceData } from "@/lib/workspace-data";
import { issueStandalone } from "../actions";
import { ensureAutomaticFiscalSetup } from "@/lib/automatic-fiscal-setup";

export const metadata: Metadata = { title: "Nota avulsa" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { client, context } = await requireWorkspace();
  const companies = await client.from("companies").select("id,cnpj,legal_name,tax_regime").eq("tenant_id", context.tenantId).order("created_at");
  if (companies.error) throw new Error("Companies unavailable");
  const { empresa } = await searchParams;
  const { selected } = await getWorkspaceData();
  const company = empresa ? companies.data.find(item => item.id === empresa) : companies.data.find(item => item.id === selected?.id) ?? companies.data[0];
  if (empresa && !company) notFound();
  if (company) await ensureAutomaticFiscalSetup(company.id).catch(() => undefined);
  const [current, template, certificate] = company ? await Promise.all([
    client.from("company_fiscal_profiles").select("id,version,configuration,configuration_sha256").eq("company_id", company.id).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle(),
    client.from("standalone_templates").select("version,profile_id,defaults").eq("company_id", company.id).eq("tenant_id", context.tenantId).eq("provider", "shopee").order("version", { ascending: false }).limit(1).maybeSingle(),
    client.from("company_certificates").select("id").eq("company_id", company.id).eq("tenant_id", context.tenantId).eq("status", "active").gt("valid_until", new Date().toISOString()).limit(1).maybeSingle(),
  ]) : [null, null, null];
  const profile = company && current?.data ? parseFiscalProfile(current.data.configuration, company.cnpj, company.tax_regime) : null;
  let initial: StandaloneDefaults | null = profile ? { configuration: profile, recipient: cleanFiscalPerson(shopee.recipient), commissionType: "Comissões de afiliado Shopee" } : null;
  if (initial && company && template?.data && current?.data && template.data.profile_id === current.data.id) {
    const defaults = template.data.defaults;
    const savedProfile = parseFiscalProfile(defaults.configuration, company.cnpj, company.tax_regime);
    if (savedProfile && defaults.recipient && typeof defaults.commissionType === "string") initial = { configuration: savedProfile,
      recipient: cleanFiscalPerson(defaults.recipient), intermediary: defaults.intermediary ? cleanFiscalPerson(defaults.intermediary) : undefined, commissionType: defaults.commissionType };
  }
  const readiness = !certificate?.data ? "aguardando certificado A1; você já pode preparar a nota." : process.env.NFSE_HOMOLOGATION_ENABLED !== "true" ?
    "transmissão ainda desativada; a preparação ficará salva." : "o envio depende do contrato oficial e das validações da operação.";
  return <WorkspaceShell email={context.user.email} active="standalone" companyId={company?.id}><div className="dashboard-content company-page">
    <span className="eyebrow">Emissão individual</span><h1>Sua nota de afiliado, sem começar do zero.</h1><p>O tomador Shopee e os dados do seu perfil vêm preenchidos. Informe o valor e altere o que precisar.</p>
    <Link className="text-link" href={company ? `/painel/notas?empresa=${company.id}` : "/painel/notas"}>Ver minhas emissões</Link>
    {!company ? <section className="dashboard-welcome"><h2>Cadastre a empresa emissora.</h2><Link className="btn btn--primary" href="/painel/empresas/nova">Cadastrar empresa</Link></section> : <>
      {!initial || !current?.data ? <section className="dashboard-welcome"><h2>{company.tax_regime === "mei" ? "Configure seu MEI em poucos cliques." : "Confirme o perfil fiscal uma vez."}</h2><p>{company.tax_regime === "mei" ? "O modelo para promoção de vendas como afiliado já vem preenchido. Basta confirmar a atividade e o local da prestação uma vez." : "Os códigos e parâmetros serão reaproveitados nas próximas notas."}</p><Link className="btn btn--primary" href={`/painel/empresas/${company.id}/fiscal`}>Configurar dados fiscais</Link></section> :
          template?.error || !createAdminClient() ? <section className="dashboard-welcome"><h2>Preparação aguardando configuração.</h2><p>Confira as migrações de emissão e as variáveis privadas do servidor.</p></section> :
            <StandaloneInvoiceForm key={`${company.id}:${current.data.id}`} initial={initial} companyId={company.id} profileVersion={current.data.version} requestId={randomUUID()}
              competenceDate={todayInBrazil()} templateVersion={template?.data?.version ?? 0} readiness={readiness}
              action={issueStandalone.bind(null, company.id, current.data.id, current.data.configuration_sha256)} />}
    </>}
  </div></WorkspaceShell>;
}
