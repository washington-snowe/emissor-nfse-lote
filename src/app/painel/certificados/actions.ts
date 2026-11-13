"use server";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inspectA1, MAX_A1_BYTES, sealCertificate } from "@/lib/certificates";
import { loadCertificateMaterial } from "@/lib/certificate-material";
import { checkHomologationAccess } from "@/lib/nfse/access-check";
import { discoverOfficialContract, type ContractDiscoveryStep } from "@/lib/nfse/contract";
import { fiscalProbeReport } from "@/lib/nfse/probe-report";
import { fiscalProbeFeedback, type FiscalContractStatus } from "@/lib/nfse/probe-feedback";
import { supportedNfseContract } from "@/lib/nfse/api-contract";
import { ensureAutomaticFiscalSetup } from "@/lib/automatic-fiscal-setup";
import { processCertificateChecks } from "@/lib/certificate-check-jobs";

export type CertificateState = { error?: string; success?: string; notice?: string; details?: string; profileHref?: string };
const errors: Record<string, string> = {
  file_or_password: "Não foi possível abrir o A1. Confira o arquivo e a senha.",
  processing_timeout: "O arquivo excedeu o limite seguro de processamento. Confira o certificado e tente novamente.",
  expired: "O certificado está vencido.", not_yet_valid: "O certificado ainda não está no período de validade.",
  holder_mismatch: "O titular do certificado não corresponde ao CNPJ da empresa escolhida.",
  missing_holder_cnpj: "O certificado não contém o CNPJ no campo de titularidade esperado para este cadastro.",
};

export async function uploadCertificate(_previous: CertificateState, form: FormData): Promise<CertificateState> {
  const { client, context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin) return { error: "O armazenamento protegido de certificados ainda não está configurado." };
  const capabilities = await admin.rpc("workflow_capabilities");
  if (capabilities.error || capabilities.data?.vault !== true) return { error: "O gerenciador de chaves ainda não está disponível. O arquivo não será aceito." };
  const companyId = form.get("company_id");
  const file = form.get("file");
  const password = form.get("password");
  if (typeof companyId !== "string" || !/^[0-9a-f-]{36}$/i.test(companyId) || !(file instanceof File) ||
    !file.size || file.size > MAX_A1_BYTES || !/\.(pfx|p12)$/i.test(file.name) || typeof password !== "string" || password.length>128)
    return { error: "Escolha sua empresa e um arquivo A1 .pfx ou .p12 de até 256 KB." };
  const company = await client.from("companies").select("id,cnpj").eq("id", companyId).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) return { error: "Empresa não encontrada no seu espaço." };
  const reserved = await admin.rpc("reserve_company_operation", { p_actor: context.user.id, p_company: companyId, p_operation: "inspect_certificate" });
  if (reserved.error || reserved.data !== true) return { error: "Aguarde antes de conferir outro certificado. O limite é de 10 tentativas em 10 minutos." };
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const inspected = await inspectA1(bytes, password, company.data.cnpj);
    if (!inspected.data) return { error: errors[inspected.error ?? ""] ?? "O arquivo não contém um certificado A1 compatível com este cadastro." };
    const id = randomUUID();
    const sealed = sealCertificate(bytes, password, { tenantId: context.tenantId, companyId: company.data.id, certificateId: id });
    const stored = await admin.rpc("store_certificate", { p_actor: context.user.id, p_company: companyId, p_id: id, p_metadata: inspected.data.metadata, p_envelope: sealed.envelope, p_key: sealed.key });
    if (stored.error) return { error: "Não foi possível concluir o armazenamento protegido. Nenhum cadastro de A1 foi confirmado." };
    await ensureAutomaticFiscalSetup(company.data.id).catch(() => undefined);
    const queued = await admin.rpc("enqueue_certificate_verification", {p_actor:context.user.id,p_certificate:id});
    if (!queued.error && queued.data === true) after(async () => {try {await processCertificateChecks(context.tenantId);} catch { /* The durable check remains recoverable. */ }});
    revalidatePath("/painel/certificados");
    return { success: "Certificado armazenado de forma protegida.", notice: queued.error ?
      "A verificação automática aguarda a atualização do processamento. Seu A1 já está salvo; não é necessário enviá-lo novamente." :
      "A verificação na SEFIN foi iniciada automaticamente. O resultado aparecerá nesta página, sem outra ação sua." };
  } catch { return { error: "O serviço protegido está indisponível. Tente novamente." }; }
  finally { bytes.fill(0); }
}

export async function deactivateCertificate(id: string): Promise<CertificateState> {
  const { context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Certificado indisponível." };
  const result = await admin.rpc("revoke_certificate", { p_actor: context.user.id, p_certificate: id });
  if (result.error) return { error: "Não foi possível desativar o certificado." };
  revalidatePath("/painel/certificados");
  return { success: "Certificado desativado nesta conta. A revogação junto à certificadora é uma operação separada." };
}

export async function probeCertificate(id: string): Promise<CertificateState> {
  const { client, context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Verificação indisponível." };
  const certificate=await client.from("company_certificates").select("id,company_id").eq("id",id).eq("tenant_id",context.tenantId).eq("status","active").maybeSingle();
  if (!certificate.data || certificate.error) return { error: "Certificado não encontrado no seu espaço." };
  const company=await client.from("companies").select("id,address,tax_regime").eq("id",certificate.data.company_id).eq("tenant_id",context.tenantId).maybeSingle();
  const municipality=company.data?.address?.municipality_code;
  if (company.error || typeof municipality!=="string" || !/^[1-9]\d{6}$/.test(municipality)) return { error: "Complete o código IBGE do município no cadastro da empresa antes de verificar o acesso." };
  const reserved=await admin.rpc("reserve_company_operation",{p_actor:context.user.id,p_company:company.data!.id,p_operation:"fiscal_access_check"});
  if (reserved.error || reserved.data!==true) return { error: "Aguarde alguns minutos antes de verificar o acesso novamente." };
  const deadline=Date.now()+35_000;
  let material: Awaited<ReturnType<typeof loadCertificateMaterial>> | undefined;
  try {
    material=await loadCertificateMaterial({tenantId:context.tenantId,companyId:certificate.data.company_id,certificateId:certificate.data.id},"access_check");
    const access = await checkHomologationAccess(municipality, material);
    const discoverySteps: ContractDiscoveryStep[] = [];
    const documented=Date.now()+1000<deadline ? await discoverOfficialContract("homologation",material,deadline,undefined,step => discoverySteps.push(step)).catch(()=>null) : null;
    const details = fiscalProbeReport(access, discoverySteps, process.env.VERCEL_GIT_COMMIT_SHA);
    let contractStatus: FiscalContractStatus = "pending";
    if (documented && !JSON.stringify(documented.contract).includes(material.metadata.subject_cnpj)) {
      const stored = await admin.rpc("store_official_nfse_contract",{p_environment:"homologation",p_url:documented.url,p_sha256:documented.sha256,p_contract:documented.contract});
      contractStatus = stored.error ? "storage_pending" : supportedNfseContract(documented.contract) ? "recognized" : "unsupported";
    }
    const feedback = fiscalProbeFeedback(access, company.data!.tax_regime, contractStatus);
    const recorded = await admin.rpc("record_fiscal_access",{p_actor:context.user.id,p_certificate:certificate.data.id,p_status:access.status,p_outcome:access.connected ? "response_received" : "unavailable"});
    revalidatePath("/painel/certificados");
    if (recorded.error) return { error: `${access.message} O registro desta verificação não pôde ser salvo; repita a consulta antes de prosseguir.`, notice: feedback.notice, details };
    return {success: feedback.success, error: feedback.error, notice: feedback.notice, details,
      profileHref: feedback.canReviewProfile ? `/painel/empresas/${company.data!.id}/fiscal?secao=servico` : undefined};
  } catch { return { error: "Não foi possível acessar o certificado protegido para esta verificação." }; }
  finally { material?.pfx.fill(0); }
}
