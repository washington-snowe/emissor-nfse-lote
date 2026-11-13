import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCertificateMaterial } from "@/lib/certificate-material";
import { automaticCertificateCheck } from "@/lib/nfse/automatic-certificate-check";
import { discoverOfficialContract } from "@/lib/nfse/contract";
import { nfseGet } from "@/lib/nfse/http";

export async function processCertificateChecks(tenantId?: string, deadline = Date.now() + 40_000) {
  const admin = createAdminClient();
  if (!admin) return {processed:0,available:false};
  const claimed = await admin.rpc("claim_certificate_verification", {p_tenant:tenantId ?? null});
  if (claimed.error) return {processed:0,available:false};
  const job = claimed.data;
  if (!job) return {processed:0,available:true};
  const result = await automaticCertificateCheck({cnpj:job.cnpj,municipality:job.address?.municipality_code ?? "",series:job.profile ? job.profile.series ?? "" : "1"}, {
    load: () => loadCertificateMaterial({tenantId:job.tenantId,companyId:job.companyId,certificateId:job.certificateId},"access_check"),
    contract: async credentials => {
      const captured = await admin.rpc("fiscal_contract", {p_environment:"homologation"});
      if (captured.error) return null;
      // Use the actual official capture, never the repository's test baseline.
      if (captured.data) return captured.data;
      if (Date.now() + 7000 >= deadline) return null;
      const documented = await discoverOfficialContract("homologation",credentials,deadline-6000).catch(()=>null);
      if (!documented || JSON.stringify(documented.contract).includes(job.cnpj)) return null;
      const saved = await admin.rpc("store_official_nfse_contract", {p_environment:"homologation",p_url:documented.url,p_sha256:documented.sha256,p_contract:documented.contract});
      return saved.error ? null : documented.contract;
    },
    get: (url,credentials) => nfseGet("homologation",url,credentials,5000),
  });
  const finished = await admin.rpc("finish_certificate_verification", {p_certificate:job.certificateId,p_token:job.token,p_code:result.code,p_http:result.http});
  return {processed:finished.data === true ? 1 : 0,available:!finished.error,attempted:true};
}
