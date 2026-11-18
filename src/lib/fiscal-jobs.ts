import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCertificateMaterial } from "@/lib/certificate-material";
import { supportedNfseContract,supportedDpsHeadPath } from "@/lib/nfse/api-contract";
import { executeFiscalJob, type FiscalJob } from "@/lib/nfse/execute";
import { nfseRequest,nfseHead,NFSE_BASES,type NfseEnvironment } from "@/lib/nfse/http";
import { inspectOwnSefinTransport,inspectOwnProductionSefinTransport,documentedDpsHeadResult } from "@/lib/nfse/transport-proof";
import {selectedFiscalEnvironment,fiscalEnvironmentEnabled} from '@/lib/nfse/environment';
import { signDps } from "@/lib/nfse/signature";
import { validateFiscalSchema } from "@/lib/nfse/schema";
import { verifyOfficialNfseContents } from "@/lib/nfse/receipt";
import { fiscalRequestTimeout, observedFiscalRequest } from "@/lib/nfse/transport-observation";

export async function processFiscalJobs(tenantId?: string, deadline = Date.now() + 45_000) {
  const admin = createAdminClient();
  if (!admin) return { processed: 0, available: false };
  const productionSchema=await admin.rpc('fiscal_production_schema_ready');
  const productionSchemaReady=!productionSchema.error&&productionSchema.data===true;
  const localDanfse=productionSchemaReady?await admin.rpc('fiscal_local_danfse_ready'):null;
  const localDanfseReady=!localDanfse?.error&&localDanfse?.data===true;
  const selected=selectedFiscalEnvironment(process.env);
  const environments:NfseEnvironment[]=productionSchemaReady?[selected,selected==='production'?'homologation':'production']:['homologation'];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await admin.rpc(name, args);
    if (result.error) throw new Error("Fiscal processing unavailable");
    return result.data;
  };
  for(const environment of environments){
  const enabled=fiscalEnvironmentEnabled(environment,process.env);
  // A schema21 proof must not start new production while the local PDF source is missing.
  // Reconciliation of an existing transmission remains available.
  const prepareEnabled=enabled&&(environment!=='production'||localDanfseReady);
  const contractResult = await admin.rpc("fiscal_contract", { p_environment: environment });
  if (contractResult.error) continue;
  const contract = supportedNfseContract(contractResult.data);
  const diagnostics=await admin.rpc("fiscal_diagnostics_ready");
  const diagnosticsReady=!diagnostics.error&&diagnostics.data===true;
  const schemaDiagnostics=await admin.rpc("fiscal_schema_diagnostics_ready");
  const schemaDiagnosticsReady=!schemaDiagnostics.error&&schemaDiagnostics.data===true;
  if (!prepareEnabled || !contract) await rpc(productionSchemaReady?'block_fiscal_environment_dependencies':"block_fiscal_dependencies", { ...(productionSchemaReady?{p_environment:environment}:{}),p_tenant: tenantId ?? null, p_company: null,
    p_reason: !enabled ? "transmission_disabled" : "contract_missing" });
  if (!contract) continue;
  const claimed = await rpc(productionSchemaReady?'claim_fiscal_jobs_for_environment':"claim_fiscal_jobs", { ...(productionSchemaReady?{p_environment:environment}:{}),p_tenant: tenantId ?? null, p_limit: 1, p_reconcile_only: !prepareEnabled||!diagnosticsReady });
  const job = claimed?.[0] as FiscalJob | undefined;
  if (!job) continue;
  if(job.environment!==environment)throw new Error('Fiscal environment mismatch');
  let expectedDpsId=job.dps_id??undefined;
  const observations:{stage:unknown;data:Record<string,unknown>}[]=[];
  await executeFiscalJob(job, {
    contract,productionEnabled:environment==='production'&&prepareEnabled&&productionSchemaReady, remainingMs: () => deadline - Date.now(), sign: signDps, validate: xml => validateFiscalSchema(xml, "DPS",environment==='production'?'production-20260209':'homologation-20261020'),
    identity: async material => {
      const result = await admin.rpc("reserve_fiscal_identity", { p_operation: job.id, p_token: job.lease_token, p_certificate: material.certificateId });
      if (result.error?.code === "23505") return { blocked: "source_duplicate" };
      if (result.error) throw new Error("Fiscal identity unavailable");
      if(typeof result.data?.id==='string')expectedDpsId=result.data.id;
      return result.data;
    },
    loadMaterial: async () => {
      const certificateId = await rpc("fiscal_processing_certificate", { p_operation: job.id });
      if (typeof certificateId !== "string") {
        if (job.mode === "prepare") await rpc(productionSchemaReady?'block_fiscal_environment_dependencies':"block_fiscal_dependencies", { ...(productionSchemaReady?{p_environment:environment}:{}),p_tenant: job.tenant_id, p_company: job.company_id, p_reason: "certificate_missing" });
        throw new Error("certificate_missing");
      }
      const material = await loadCertificateMaterial({ tenantId: job.tenant_id, companyId: job.company_id, certificateId }, job.mode === "prepare" ? "emit" : "reconcile");
      try {
        if (job.mode === "prepare") {
          if (deadline - Date.now() < 15_000) throw new Error();
          const municipality = (job.profile_snapshot as { issuerMunicipality?: string })?.issuerMunicipality;
          const series = (job.profile_snapshot as { series?: string })?.series;
          if (!municipality || !series || !/^[1-9]\d{6}$/.test(municipality)) throw new Error();
          // A self-declared subject in a PKCS#12 is insufficient for the shared legal namespace.
          // Require the documented official mTLS service to respond before reserving an issuer number.
          // ADN parameter access alone must never unlock the shared SEFIN numbering namespace.
          const lookup={municipality,cnpj:job.issuer_cnpj,holderCnpj:material.metadata.subject_cnpj,series};
          const sefinAccess = environment==='production'?await inspectOwnProductionSefinTransport(lookup,material,contractResult.data):await inspectOwnSefinTransport(lookup,material,contractResult.data);
          if (!sefinAccess.verified) throw new Error();
          const recorded = await rpc(productionSchemaReady?'record_fiscal_environment_transport':"record_fiscal_transport", { p_operation: job.id, p_token: job.lease_token, p_certificate: certificateId,...(productionSchemaReady?{p_http:sefinAccess.http}:{}) });
          if (recorded !== true) throw new Error();
        }
        return { ...material, certificateId };
      } catch { material.pfx.fill(0); throw new Error("certificate_unavailable"); }
    },
    begin: (material, xml) => rpc("begin_fiscal_send_traced", { p_operation: job.id, p_token: job.lease_token,
      p_certificate: material.certificateId, p_signed_xml: xml, p_certificate_pem: material.certificatePem }),
    productionIdentity:async(id,material)=>{
      const path=supportedDpsHeadPath(contractResult.data);if(!path)return 'unverified';
      const response=await nfseHead('production',NFSE_BASES.production+path.replace(/\{[^}]+\}/,id),material,5000);
      return documentedDpsHeadResult(response.status,response.body,response.contentType,contractResult.data);
    },
    release: reason => rpc("release_fiscal_preparation", { p_operation: job.id, p_token: job.lease_token, p_reason: reason }),
    request: (method, url, material, body) => {
      const timeoutMs=fiscalRequestTimeout(method,deadline-Date.now());
      return observedFiscalRequest({operationId:job.id,stage:method==="POST"?"submit":url.includes("/dps/")?"dps_lookup":"nfse_lookup",timeoutMs,expectedDpsId},
        ()=>nfseRequest(environment,method,url,material,body,timeoutMs),event=>{
          // The intent already exists. Retain final metadata for the atomic outcome RPC.
          if(event.phase!=="start"){
            const allowed=["phase","http","format","environment","codes","transport","elapsedMs",...(schemaDiagnosticsReady?["xsdFields","dpsIdentity","serverVersion"]:[])];
            const data=Object.fromEntries(Object.entries(event).filter(([key])=>allowed.includes(key)));
            observations.push({stage:event.stage,data});
          }
          console.info(JSON.stringify(event));
        });
    },
    receipt: (xml, key, signedDps, holderCert, dpsId) => verifyOfficialNfseContents(xml, { dpsId, signedDps, holderCert, issuerCnpj: job.issuer_cnpj, accessKey: key,environment }),
    finish: (outcome, reason, document) => rpc("finish_fiscal_attempt_traced", { p_operation: job.id, p_token: job.lease_token,
      p_outcome: outcome, p_reason: reason ?? null, p_access_key: document?.accessKey ?? null, p_xml: document?.xml ?? null,p_diagnostics:observations }),
  });
  return { processed: 1, available: true };
  }
  return {processed:0,available:true};
}
