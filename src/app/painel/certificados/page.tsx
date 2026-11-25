import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { getWorkspaceData } from "@/lib/workspace-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspaceShell } from "@/components/workspace";
import { CertificateForm } from "@/components/certificate-form";
import { CertificateDeactivate } from "@/components/certificate-deactivate";
import { AutomaticCertificateStatus } from "@/components/automatic-certificate-status";
import type { VerificationDisplay } from "@/lib/certificate-verification-state";

export const metadata: Metadata = { title: "Certificados A1" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Certificates({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  const workspace = await getWorkspaceData(empresa);
  const { client, context, selected } = workspace;
  if (!selected) return <WorkspaceShell active="certificates"><div className="dashboard-content">
    <PageHeader title="Certificado A1" description="Cadastre a empresa que vai emitir suas notas." />
    <Link className="btn btn--primary" href="/painel/empresas/nova">Cadastrar empresa</Link>
  </div></WorkspaceShell>;
  const admin = createAdminClient();
  const [certificates, checks, capabilities] = await Promise.all([
    client.from("company_certificates").select("id,valid_until,status").eq("tenant_id", context.tenantId).eq("company_id", selected.id).order("created_at", { ascending: false }),
    client.from("certificate_verifications").select("certificate_id,status,result_code,http_status,updated_at,verified_at,next_attempt")
      .eq("tenant_id", context.tenantId).eq("company_id", selected.id),
    admin?.rpc("workflow_capabilities"),
  ]);
  // eslint-disable-next-line react-hooks/purity -- This dynamic server response takes a single request-time expiry snapshot.
  const renderTime = Date.now();
  const checkMap = new Map((checks.data ?? []).map(check => [check.certificate_id,check as VerificationDisplay]));
  after(async () => {
    const { ensureAutomaticFiscalSetup } = await import("@/lib/automatic-fiscal-setup");
    await ensureAutomaticFiscalSetup(selected.id, workspace).catch(() => undefined);
    if (!admin || checks.error) return;
    let start = false;
    for (const certificate of certificates.data ?? []) {
      if (certificate.status !== "active" || Date.parse(certificate.valid_until) <= renderTime) continue;
      const check = checkMap.get(certificate.id);
      if (!check) {
        const enqueued = await admin.rpc("enqueue_certificate_verification", { p_actor: context.user.id, p_certificate: certificate.id });
        start ||= !enqueued.error && enqueued.data === true;
      } else start ||= ["queued", "checking"].includes(check.status) || Boolean(check.next_attempt && Date.parse(check.next_attempt) <= renderTime);
    }
    if (start) {
      const { processCertificateChecks } = await import("@/lib/certificate-check-jobs");
      await processCertificateChecks(context.tenantId).catch(() => undefined);
    }
  });
  const hasActive = certificates.data?.some(certificate => certificate.status === "active" && Date.parse(certificate.valid_until) > renderTime);
  const upload = <CertificateForm key={selected.id} companies={[selected]} />;
  return <WorkspaceShell email={context.user.email} active="certificates" companyId={selected?.id}><div className="dashboard-content">
    <PageHeader title="Certificado A1" description={selected.legal_name} />
    <div className="company-list">{Boolean(certificates.data?.length) && <h2 className="list-title">Certificados da empresa</h2>}{certificates.data?.map(certificate => <article key={certificate.id} className="company-card certificate-card"><div>
      <p>Válido até {new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(certificate.valid_until))}</p>
      <span className="small-status">{certificate.status === "active" ? new Date(certificate.valid_until).getTime()<=renderTime ? "Vencido" : "Armazenado com proteção" : certificate.status === "replaced" ? "Substituído para novas operações" : "Desativado nesta conta"}</span>
    </div>{certificate.status === "active" && <div className="certificate-actions">{new Date(certificate.valid_until).getTime()>renderTime && <><AutomaticCertificateStatus verification={checkMap.get(certificate.id)} available={!checks.error}/></>}<CertificateDeactivate id={certificate.id} /></div>}</article>)}</div>
    {capabilities?.data?.vault !== true || capabilities?.data?.certificates !== true || certificates.error
      ? <p className="save-notice">O armazenamento protegido está temporariamente indisponível.</p>
      : hasActive ? <details className="inline-disclosure"><summary>Substituir certificado</summary>{upload}</details> : upload}
  </div></WorkspaceShell>;
}
