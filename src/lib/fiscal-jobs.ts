import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCertificateMaterial } from "@/lib/certificate-material";
import { supportedNfseContract, readFiscalJson } from "@/lib/nfse/api-contract";
import { executeFiscalJob, type FiscalJob } from "@/lib/nfse/execute";
import { NFSE_BASES, nfseRequest } from "@/lib/nfse/http";
import { signDps } from "@/lib/nfse/signature";
import { validateFiscalSchema } from "@/lib/nfse/schema";
import { verifyOfficialNfseContents } from "@/lib/nfse/receipt";

export async function processFiscalJobs(tenantId?: string, deadline = Date.now() + 45_000) {
  const admin = createAdminClient();
  if (!admin) return { processed: 0, available: false };
  const enabled = process.env.NFSE_HOMOLOGATION_ENABLED === "true";
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await admin.rpc(name, args);
    if (result.error) throw new Error("Fiscal processing unavailable");
    return result.data;
  };
  const contractResult = await admin.rpc("fiscal_contract", { p_environment: "homologation" });
  if (contractResult.error) return { processed: 0, available: false };
  const contract = supportedNfseContract(contractResult.data);
  if (!enabled || !contract) await rpc("block_fiscal_dependencies", { p_tenant: tenantId ?? null, p_company: null,
    p_reason: !enabled ? "transmission_disabled" : "contract_missing" });
  if (!contract) return { processed: 0, available: true };
  const claimed = await rpc("claim_fiscal_jobs", { p_tenant: tenantId ?? null, p_limit: 1, p_reconcile_only: !enabled });
  const job = claimed?.[0] as FiscalJob | undefined;
  if (!job) return { processed: 0, available: true };
  await executeFiscalJob(job, {
    contract, remainingMs: () => deadline - Date.now(), sign: signDps, validate: xml => validateFiscalSchema(xml, "DPS"),
    identity: async material => {
      const result = await admin.rpc("reserve_fiscal_identity", { p_operation: job.id, p_token: job.lease_token, p_certificate: material.certificateId });
      if (result.error?.code === "23505") return { blocked: "source_duplicate" };
      if (result.error) throw new Error("Fiscal identity unavailable");
      return result.data;
    },
    loadMaterial: async () => {
      const certificateId = await rpc("fiscal_processing_certificate", { p_operation: job.id });
      if (typeof certificateId !== "string") {
        if (job.mode === "prepare") await rpc("block_fiscal_dependencies", { p_tenant: job.tenant_id, p_company: job.company_id, p_reason: "certificate_missing" });
        throw new Error("certificate_missing");
      }
      const material = await loadCertificateMaterial({ tenantId: job.tenant_id, companyId: job.company_id, certificateId }, job.mode === "prepare" ? "emit" : "reconcile");
      try {
        if (job.mode === "prepare") {
          if (deadline - Date.now() < 15_000) throw new Error();
          const municipality = (job.profile_snapshot as { issuerMunicipality?: string })?.issuerMunicipality;
          if (!municipality || !/^[1-9]\d{6}$/.test(municipality)) throw new Error();
          // A self-declared subject in a PKCS#12 is insufficient for the shared legal namespace.
          // Require the documented official mTLS service to respond before reserving an issuer number.
          const probe = await nfseRequest("homologation", "GET", `${NFSE_BASES.homologation}/parametros_municipais/${municipality}/convenio`, material);
          if (probe.status !== 200 || !readFiscalJson(probe.body)) throw new Error();
          const recorded = await rpc("record_fiscal_transport", { p_operation: job.id, p_token: job.lease_token, p_certificate: certificateId });
          if (recorded !== true) throw new Error();
        }
        return { ...material, certificateId };
      } catch { material.pfx.fill(0); throw new Error("certificate_unavailable"); }
    },
    begin: (material, xml) => rpc("begin_fiscal_send", { p_operation: job.id, p_token: job.lease_token,
      p_certificate: material.certificateId, p_signed_xml: xml, p_certificate_pem: material.certificatePem }),
    release: reason => rpc("release_fiscal_preparation", { p_operation: job.id, p_token: job.lease_token, p_reason: reason }),
    request: (method, url, material, body) => nfseRequest("homologation", method, url, material, body),
    receipt: (xml, key, signedDps, holderCert, dpsId) => verifyOfficialNfseContents(xml, { dpsId, signedDps, holderCert, issuerCnpj: job.issuer_cnpj, accessKey: key }),
    finish: (outcome, reason, document) => rpc("finish_fiscal_attempt", { p_operation: job.id, p_token: job.lease_token,
      p_outcome: outcome, p_reason: reason ?? null, p_access_key: document?.accessKey ?? null, p_xml: document?.xml ?? null }),
  });
  return { processed: 1, available: true };
}
