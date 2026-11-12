import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData } from "@/lib/workspace-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspaceShell } from "@/components/workspace";
import { CertificateForm } from "@/components/certificate-form";
import { CertificateDeactivate } from "@/components/certificate-deactivate";
import { CertificateProbe } from "@/components/certificate-probe";

export const metadata: Metadata = { title: "Certificados A1" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Certificates({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  const { client, context, selected } = await getWorkspaceData(empresa);
  const [companies, certificates] = await Promise.all([
    client.from("companies").select("id,legal_name,cnpj").eq("tenant_id", context.tenantId).order("created_at"),
    client.from("company_certificates").select("id,company_id,subject_cnpj,valid_until,status").eq("tenant_id", context.tenantId).eq("company_id", selected?.id ?? "00000000-0000-4000-8000-000000000000").order("created_at",{ascending:false}),
  ]);
  if (companies.error) throw new Error("Companies unavailable.");
  const admin = createAdminClient();
  const capabilities = admin ? await admin.rpc("workflow_capabilities") : null;
  // eslint-disable-next-line react-hooks/purity -- This dynamic server response takes a single request-time expiry snapshot.
  const renderTime = Date.now();
  return <WorkspaceShell email={context.user.email} active="certificates" companyId={selected?.id}><div className="dashboard-content">
    <span className="eyebrow">Identidade fiscal</span><h1>Seus certificados A1.</h1><p>Certificados independentes para cada CNPJ, com armazenamento protegido.</p>
    {capabilities?.data?.vault !== true || capabilities?.data?.certificates !== true || certificates.error ? <p className="save-notice">O armazenamento protegido ainda está em configuração. O upload de A1 permanece indisponível.</p> :
      companies.data.length ? <CertificateForm key={selected?.id} companies={companies.data.filter(company => company.id === selected?.id)} /> : <Link className="text-link" href="/painel/empresas/nova">Cadastrar empresa antes do certificado</Link>}
    <div className="company-list">{certificates.data?.map(certificate => <article key={certificate.id} className="company-card certificate-card"><div>
      <h2>{companies.data.find(company => company.id===certificate.company_id)?.legal_name ?? "Empresa"}</h2>
      <p className="mono">{certificate.subject_cnpj}</p><p>Validade: {new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(certificate.valid_until))}</p>
      <span className="small-status">{certificate.status === "active" ? new Date(certificate.valid_until).getTime()<=renderTime ? "Vencido" : "Armazenado · acesso fiscal pendente" : certificate.status === "replaced" ? "Substituído para novas operações" : "Desativado nesta conta"}</span>
    </div>{certificate.status === "active" && <div className="certificate-actions">{capabilities?.data?.fiscal_access === true && <CertificateProbe id={certificate.id} />}<CertificateDeactivate id={certificate.id} /></div>}</article>)}</div>
    <Link className="text-link" href="/painel">Voltar à visão geral</Link>
  </div></WorkspaceShell>;
}
