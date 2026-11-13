import { ownSefinLookupId } from "./transport-proof.ts";
import { supportedNfseContract, verifiedSefinLookup } from "./api-contract.ts";
import { NFSE_BASES, type NfseCredentials } from "./http.ts";

export type AutomaticCheckCode = "sefin_verified" | "contract_missing" | "contract_unsupported" | "certificate_unavailable" | "company_incomplete" | "sefin_unavailable" | "service_unavailable";
export type AutomaticCheckResult = { code: AutomaticCheckCode; http: number };
export type CertificateCheckIdentity = { cnpj: string; municipality: string; series: string };

// This pipeline has only a GET dependency. It cannot reserve numbers, enqueue invoices or submit a DPS.
export async function automaticCertificateCheck(identity: CertificateCheckIdentity, deps: {
  load: () => Promise<NfseCredentials & { metadata: { subject_cnpj: string } }>;
  contract: (credentials: NfseCredentials) => Promise<unknown>;
  get: (url: string, credentials: NfseCredentials) => Promise<{ status: number; body: Buffer }>;
}): Promise<AutomaticCheckResult> {
  let id: string;
  try { id = ownSefinLookupId(identity.municipality, identity.cnpj, identity.series); }
  catch { return {code:"company_incomplete",http:0}; }
  let material: Awaited<ReturnType<typeof deps.load>>;
  try { material = await deps.load(); }
  catch { return {code:"certificate_unavailable",http:0}; }
  try {
    if (material.metadata.subject_cnpj !== identity.cnpj) return {code:"certificate_unavailable",http:0};
    const raw = await deps.contract(material);
    if (!raw) return {code:"contract_missing",http:0};
    const contract = supportedNfseContract(raw);
    if (!contract) return {code:"contract_unsupported",http:0};
    const result = await deps.get(NFSE_BASES.homologation + contract.dpsPath.replace(/\{[^}]+\}/,id), material);
    return {code: verifiedSefinLookup(result.status,result.body,id,raw) ? "sefin_verified" : "sefin_unavailable",http:result.status};
  } catch { return {code:"service_unavailable",http:0}; }
  finally { material.pfx.fill(0); }
}
