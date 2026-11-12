import { buildDps, type FiscalPerson } from "./dps.ts";
import { parseFiscalProfile } from "./profile.ts";
import { NFSE_BASES, type NfseEnvironment } from "./http.ts";
import { dpsTransportBody, readFiscalJson, readCompressedNfse, definitiveRejection, type SupportedNfseContract } from "./api-contract.ts";

export type FiscalJob = {
  id: string; tenant_id: string; company_id: string; lease_token: string; mode: "prepare" | "reconcile";
  environment: NfseEnvironment; issuer_cnpj: string; profile_snapshot: unknown; competence_date: string; amount: string | number;
  foreign_amount: string | number | null; dps_number: string | null; dps_id: string | null; recipient: FiscalPerson; intermediary: FiscalPerson | null;
  signed_dps_xml: string | null; holder_certificate_pem: string | null;
};
export type FiscalMaterial = { pfx: Buffer; password: string; privateKeyPem: string; certificatePem: string; certificateId: string };
type Outcome = "authorized" | "rejected" | "uncertain" | "not_found" | "intervention";
type Dependencies = {
  contract: SupportedNfseContract; loadMaterial(): Promise<FiscalMaterial>; remainingMs(): number;
  identity(material: FiscalMaterial): Promise<{ id: string; number: string } | { blocked: "source_duplicate" } | null>;
  sign(xml: string, id: string, key: string, cert: string): string;
  validate(xml: string): Promise<boolean>;
  begin(material: FiscalMaterial, xml: string): Promise<boolean>;
  release(reason: string): Promise<unknown>;
  request(method: "GET" | "POST", url: string, material: FiscalMaterial, body?: Buffer): Promise<{ status: number; body: Buffer }>;
  receipt(xml: string, key: string, signedDps: string, holderCert: string, dpsId: string): Promise<{ xml: string; accessKey: string } | null>;
  finish(outcome: Outcome, reason?: string, document?: { xml: string; accessKey: string }): Promise<unknown>;
};

// Monetary database values must be returned as strings, not rounded JSON numbers.
export async function executeFiscalJob(job: FiscalJob, deps: Dependencies) {
  let material: FiscalMaterial | undefined, dispatched = job.mode === "reconcile";
  try {
    if (job.environment !== "homologation") throw new Error("Unsupported fiscal environment");
    try { material = await deps.loadMaterial(); }
    catch (error) {
      if (dispatched) await deps.finish("intervention", "certificate_unavailable");
      else await deps.release(error instanceof Error && error.message === "certificate_missing" ? "certificate_missing" : "certificate_unavailable");
      return;
    }
    const base = NFSE_BASES.homologation;
    let result: { status: number; body: Buffer }, signedDps: string, holderCert: string, lookupKey: string | undefined;
    let dpsId = job.dps_id;
    if (job.mode === "prepare") {
      if (deps.remainingMs() < 25_000) { await deps.release("preparation_retry"); return; }
      const regime = (job.profile_snapshot as { simplesOption?: string })?.simplesOption;
      const profile = parseFiscalProfile(job.profile_snapshot, job.issuer_cnpj, regime === "2" ? "mei" : regime === "3" ? "simples" : "");
      if (!profile || typeof job.amount !== "string" || job.foreign_amount !== null && typeof job.foreign_amount !== "string") {
        await deps.release("invalid_xml"); return;
      }
      const identity = await deps.identity(material);
      if (!identity) { await deps.release("configuration_changed"); return; }
      if ("blocked" in identity) { await deps.release(identity.blocked); return; }
      dpsId = identity.id;
      const built = buildDps({ environment: "homologation", issuerCnpj: job.issuer_cnpj, profile, dpsNumber: identity.number,
        competenceDate: job.competence_date, emissionTime: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"), amount: job.amount,
        recipient: job.recipient, intermediary: job.intermediary ?? undefined, foreignAmount: job.foreign_amount ?? undefined });
      if (built.id !== dpsId) { await deps.release("invalid_xml"); return; }
      signedDps = deps.sign(built.xml, built.id, material.privateKeyPem, material.certificatePem);
      if (!await deps.validate(signedDps)) { await deps.release("invalid_xml"); return; }
      const body = dpsTransportBody(signedDps);
      if (deps.remainingMs() < 25_000) { await deps.release("preparation_retry"); return; }
      if (!await deps.begin(material, signedDps)) { await deps.release("configuration_changed"); return; }
      dispatched = true;
      holderCert = material.certificatePem;
      result = await deps.request("POST", base + "/nfse", material, body);
    } else {
      if (deps.remainingMs() < 20_000) { await deps.finish("uncertain", "network_uncertain"); return; }
      if (!job.signed_dps_xml || !job.holder_certificate_pem || !dpsId) { await deps.finish("intervention", "response_invalid"); return; }
      signedDps = job.signed_dps_xml; holderCert = job.holder_certificate_pem;
      const lookup = await deps.request("GET", base + deps.contract.dpsPath.replace(/\{[^}]+\}/, encodeURIComponent(dpsId)), material);
      if (lookup.status === 404) { await deps.finish("not_found", "not_found"); return; }
      const key = readFiscalJson(lookup.body)?.chaveAcesso;
      if (lookup.status !== 200 || typeof key !== "string" || !/^\d{50}$/.test(key)) { await deps.finish("uncertain", "response_invalid"); return; }
      lookupKey = key;
      result = await deps.request("GET", base + deps.contract.nfsePath.replace(/\{[^}]+\}/, key), material);
    }
    const json = readFiscalJson(result.body);
    if (job.mode === "prepare" && definitiveRejection(result.status, json, deps.contract)) {
      await deps.finish("rejected", "provider_rejection"); return;
    }
    if (result.status < 200 || result.status >= 300) { await deps.finish("uncertain", "network_uncertain"); return; }
    const xml = readCompressedNfse(json?.nfseXmlGZipB64);
    // GET /nfse may omit chaveAcesso: the key remains bound to the official GET /dps lookup.
    const key = job.mode === "prepare" ? json?.chaveAcesso : lookupKey;
    if (!xml || typeof key !== "string" || !/^\d{50}$/.test(key) || json?.chaveAcesso !== undefined && json.chaveAcesso !== key) { await deps.finish("uncertain", "response_invalid"); return; }
    const document = await deps.receipt(xml, key, signedDps, holderCert, dpsId!);
    if (!document) { await deps.finish("uncertain", "response_invalid"); return; }
    await deps.finish("authorized", undefined, document);
  } catch {
    try { if (dispatched) await deps.finish("uncertain", "network_uncertain"); else await deps.release("preparation_failed"); }
    catch { /* Durable sending lease recovers as uncertain, never as a new POST. */ }
  } finally { material?.pfx.fill(0); }
}
