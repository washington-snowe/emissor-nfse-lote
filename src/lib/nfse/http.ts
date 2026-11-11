import https from "node:https";

export type NfseEnvironment = "homologation" | "production";
// Published in the Portal Nacional's "APIs - Prod. Restrita e Produção" page, checked 2026-11-11.
export const NFSE_BASES = {
  homologation: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
  production: "https://sefin.nfse.gov.br/SefinNacional",
} as const;

export function allowedNfseUrl(environment: NfseEnvironment, url: string): URL | null {
  try {
    const base = new URL(NFSE_BASES[environment]);
    const candidate = new URL(url);
    return candidate.protocol === "https:" && !candidate.username && !candidate.password && !candidate.hash &&
      candidate.origin === base.origin && candidate.pathname.startsWith(base.pathname + "/") ? candidate : null;
  } catch { return null; }
}

export function nfseGet(environment: NfseEnvironment, url: string, credentials: { pfx: Buffer; password: string }, timeoutMs = 5000): Promise<{ status: number; body: Buffer; contentType: string }> {
  const target = allowedNfseUrl(environment,url);
  if (!target) return Promise.reject(new Error("Invalid fiscal destination."));
  return new Promise((resolve,reject) => {
    const request = https.request(target, {
      method: "GET", pfx: credentials.pfx, passphrase: credentials.password,
      rejectUnauthorized: true, minVersion: "TLSv1.2", agent: false,
      headers: { Accept: "application/json,text/html", "User-Agent": "EmissorNfse/0.1" },
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 1_000_000) { request.destroy(new Error("Fiscal response limit.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => { clearTimeout(timer); resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks), contentType: response.headers["content-type"] ?? "" }); });
      response.on("error", () => { clearTimeout(timer); reject(new Error("Fiscal response unavailable.")); });
    });
    const timer = setTimeout(() => request.destroy(new Error("Fiscal deadline exceeded.")), Math.max(1,Math.min(timeoutMs,5000)));
    request.on("error", () => { clearTimeout(timer); reject(new Error("Fiscal connection unavailable.")); });
    request.end();
  });
}
