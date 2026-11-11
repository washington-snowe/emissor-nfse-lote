import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspaceShell } from "@/components/workspace-shell";
import { FiscalProfileForm } from "@/components/fiscal-profile-form";
import { parseFiscalProfile } from "@/lib/nfse/profile";
import { saveFiscalProfile } from "./actions";

export const metadata: Metadata = { title: "Configuração fiscal" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function FiscalConfiguration({ params }: { params: Promise<{ id: string }> }) {
  const { client, context } = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const company = await client.from("companies").select("id,legal_name,cnpj,tax_regime,address").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) notFound();
  const current = await client.from("company_fiscal_profiles").select("version,configuration,valid_from,evidence_reference").eq("company_id", company.data.id).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle();
  const parsed = current.data ? parseFiscalProfile(current.data.configuration, company.data.cnpj, company.data.tax_regime) : null;
  const strong = (await client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel === "aal2";
  const available = Boolean(createAdminClient()) && !current.error;
  return <WorkspaceShell email={context.user.email} active="companies"><div className="dashboard-content company-page">
    <span className="eyebrow">Configuração fiscal</span><h1>Prepare sua empresa para emitir.</h1><p>{company.data.legal_name}</p>
    <Link className="text-link" href={`/painel/empresas/${company.data.id}`}>Voltar ao cadastro da empresa</Link>
    {!strong ? <section className="dashboard-welcome"><h2>Proteja sua conta primeiro.</h2><p>Para salvar parâmetros fiscais, ative o autenticador e confirme o acesso.</p><Link className="btn btn--primary" href="/painel/seguranca">Configurar segurança</Link></section> :
      !available ? <section className="dashboard-welcome"><h2>Configuração fiscal indisponível.</h2><p>Verifique a configuração privada do servidor, a migração de perfis fiscais e se o enquadramento da empresa foi alterado desde a última versão.</p></section> :
      <><p className="field-hint">{current.data && !parsed ? "A versão anterior não corresponde ao enquadramento atual. Revise os campos para criar uma nova versão." : "Confirme os dados aplicáveis com sua orientação fiscal."}</p><FiscalProfileForm key={company.data.id} version={current.data?.version ?? 0} initial={current.data && parsed ? { ...current.data, configuration: parsed } : undefined}
        municipality={typeof company.data.address?.municipality_code === "string" ? company.data.address.municipality_code : ""}
        regime={company.data.tax_regime} action={saveFiscalProfile.bind(null, company.data.id)} /></>}
  </div></WorkspaceShell>;
}
