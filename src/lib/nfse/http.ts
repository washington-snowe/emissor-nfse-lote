import https from "node:https";
import { fiscalTransportError, NfseTransportError } from "./transport-error.ts";

export type NfseCredentials = {
  pfx: Buffer; password: string;
  privateKeyPem?: string; certificatePem?: string; certificateChainPem?: string;
};

export function nfseTlsCredentials(credentials: NfseCredentials) {
  // The isolated A1 parser has already checked holder, validity and key correspondence.
  // Avoid reopening legacy RC2 PKCS#12 bags in OpenSSL 3. Never enable legacy TLS/providers.
  if (credentials.privateKeyPem || credentials.certificatePem || credentials.certificateChainPem) {
    if (!credentials.privateKeyPem || !credentials.certificatePem) throw new NfseTransportError("certificate_format");
    return { key: credentials.privateKeyPem, cert: credentials.certificateChainPem ?? credentials.certificatePem };
  }
  return { pfx: credentials.pfx, passphrase: credentials.password };
}

export type NfseEnvironment = "homologation" | "production";
// The portal's restricted Swagger link still includes /API. Read-only testing returned 404 there.
// Canonical application prefix and sources: integrations/nfse/access-provenance.json.
export const NFSE_BASES = {
  homologation: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
  production: "https://sefin.nfse.gov.br/SefinNacional",
} as const;

// Official portal lists ADN Parametrização separately from SEFIN emission.
export const NFSE_PARAMETER_BASES = {
  homologation: "https://adn.producaorestrita.nfse.gov.br/parametrizacao",
  production: "https://adn.nfse.gov.br/parametrizacao",
} as const;
export const NFSE_DOCUMENT_INDEXES = {
  homologation: [
    "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index",
    "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/docs/index",
  ],
  production: ["https://sefin.nfse.gov.br/SefinNacional/docs/index"],
} as const;

export function municipalParametersUrl(environment: NfseEnvironment, municipality: string) {
  if (!/^[1-9]\d{6}$/.test(municipality)) throw new Error("Invalid municipality for fiscal access.");
  return `${NFSE_PARAMETER_BASES[environment]}/${municipality}/convenio`;
}

export function allowedNfseReadUrl(environment: NfseEnvironment, url: string): URL | null {
  const sefin = allowedNfseUrl(environment, url);
  if (sefin) return sefin;
  try {
    const target = new URL(url), parameters = new URL(NFSE_PARAMETER_BASES[environment]);
    if (target.protocol !== "https:" || target.username || target.password || target.hash || target.search) return null;
    if (target.origin === parameters.origin && /^\/parametrizacao\/[1-9]\d{6}\/convenio$/.test(target.pathname)) return target;
    // Portal's historical UI mount: GET documentation only, never invoice routes or writes.
    const official = new URL(NFSE_BASES[environment]);
    if (environment === "homologation" && target.origin === official.origin &&
      /^\/API\/SefinNacional\/(?:docs\/(?:index(?:\.html)?|index\.js|swagger-initializer\.js)|swagger\/(?:docs\/v1|v1\/swagger\.json))$/.test(target.pathname)) return target;
  } catch { /* Unknown destinations remain blocked. */ }
  return null;
}

export function allowedNfseUrl(environment: NfseEnvironment, url: string): URL | null {
  try {
    const base = new URL(NFSE_BASES[environment]);
    const candidate = new URL(url);
    return candidate.protocol === "https:" && !candidate.username && !candidate.password && !candidate.hash &&
      candidate.origin === base.origin && candidate.pathname.startsWith(base.pathname + "/") ? candidate : null;
  } catch { return null; }
}

export function nfseGet(environment: NfseEnvironment, url: string, credentials: NfseCredentials, timeoutMs = 5000): Promise<{ status: number; body: Buffer; contentType: string }> {
  return nfseRequest(environment, "GET", url, credentials, undefined, timeoutMs);
}

export function nfseRequest(environment: NfseEnvironment, method: "GET" | "POST", url: string, credentials: NfseCredentials, body?: Buffer, timeoutMs = 5000): Promise<{ status: number; body: Buffer; contentType: string }> {
  const target = method === "GET" ? allowedNfseReadUrl(environment,url) : allowedNfseUrl(environment,url);
  if (!target || !["GET", "POST"].includes(method) || method === "POST" && (target.href !== NFSE_BASES[environment] + "/nfse" || !body || body.length > 512_000)) return Promise.reject(new NfseTransportError("invalid_destination"));
  return new Promise((resolve,reject) => {
    let request: ReturnType<typeof https.request> | undefined;
    const limit = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, method === "GET" ? 15000 : 5000)) : 5000;
    const timer = setTimeout(() => request?.destroy(new NfseTransportError("timeout")), limit);
    const fail = (error: unknown) => { clearTimeout(timer); reject(fiscalTransportError(error)); };
    try { request = https.request(target, {
      method, ...nfseTlsCredentials(credentials),
      rejectUnauthorized: true, minVersion: "TLSv1.2", agent: false,
      headers: { Accept: "application/json,text/html", "User-Agent": "EmissorNfse/0.1", ...(body ? { "Content-Type": "application/json", "Content-Length": String(body.length) } : {}) },
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 1_000_000) { request?.destroy(new NfseTransportError("response_limit")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => { clearTimeout(timer); resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks), contentType: response.headers["content-type"] ?? "" }); });
      response.on("error", () => fail(new NfseTransportError("response")));
      response.on("aborted", () => fail(new NfseTransportError("response")));
    }); } catch (error) { fail(error); return; }
    request.on("error", fail);
    request.end(body);
  });
}
