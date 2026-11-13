import { createHash } from "node:crypto";
import { allowedNfseReadUrl, NFSE_BASES, NFSE_DOCUMENT_INDEXES, nfseGet, type NfseEnvironment, type NfseCredentials } from "./http.ts";
import { fiscalTransportError } from "./transport-error.ts";

// Only structural documentation is exposed: no examples, arbitrary descriptions, headers or defaults.
const allowedKeys = new Set(["type","format","properties","items","required","additionalProperties","$ref","allOf","oneOf","anyOf","nullable","enum","schema","content","application/json","requestBody","responses","parameters","in","name","get","post","head","put","delete","patch"]);
function shape(value: unknown, depth = 0): unknown {
  if (depth>35) throw new Error("Contract nesting limit.");
  if (Array.isArray(value)) return value.map(item=>shape(item,depth+1));
  if (value && typeof value==="object") {
    const output: Record<string,unknown> = {};
    for (const [key,child] of Object.entries(value)) {
      if (allowedKeys.has(key) || /^\d{3}$/.test(key)) {
        if (key==="properties" && child && typeof child==="object")
          output[key]=Object.fromEntries(Object.entries(child).map(([name,definition])=>[name,shape(definition,depth+1)]));
        else output[key]=shape(child,depth+1);
      }
    }
    return output;
  }
  return typeof value==="string" || typeof value==="number" || typeof value==="boolean" || value===null ? value : null;
}

export function structuralContract(input: unknown) {
  if (!input || typeof input!=="object") return null;
  const doc=input as Record<string,unknown>;
  const paths=doc.paths as Record<string,unknown> | undefined;
  if ((!doc.openapi && !doc.swagger) || !paths || !paths["/nfse"] || JSON.stringify(input).length>1_000_000) return null;
  const definitions=doc.definitions as Record<string,unknown> | undefined;
  const components=doc.components as { schemas?: Record<string,unknown> } | undefined;
  const models=definitions ?? components?.schemas ?? {};
  return {
    dialect: String(doc.openapi ?? doc.swagger).slice(0,20),
    paths: Object.fromEntries(Object.entries(paths).filter(([path])=>path.startsWith("/nfse") || path.startsWith("/dps") || path.startsWith("/parametros_municipais")).map(([path,method])=>[path,shape(method)])),
    models: Object.fromEntries(Object.entries(models).map(([name,model])=>[name,shape(model)])),
  };
}

function quotedValue(literal: string): string | null {
  if (literal[0] === '"') {
    try { const value: unknown = JSON.parse(literal); return typeof value === "string" ? value : null; }
    catch { return null; }
  }
  let valid = true;
  const simple: Record<string, string> = { "'": "'", '"': '"', "\\": "\\", "/": "/", n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
  const value = literal.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_match, escape: string) => {
    if (/^[ux]/.test(escape) && escape.length > 2) return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (escape in simple) return simple[escape];
    valid = false; return "";
  });
  return valid ? value : null;
}

// Parse only quoted configuration data; never execute the Swagger page or its scripts.
export function swaggerDocumentReferences(script: string): string[] {
  if (script.length > 1_000_000) return [];
  const urls: string[] = [];
  for (const match of script.matchAll(/\burl["']?\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi)) {
    const value = quotedValue(match[1]); if (value) urls.push(value);
  }
  for (const match of script.matchAll(/\b(?:openApi|specUrl|spec-url)["']?\s*[:=]\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi)) {
    const value = quotedValue(match[1]); if (value) urls.push(value);
  }
  for (const match of script.matchAll(/\bRedoc\.init\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) {
    const value = quotedValue(match[1]); if (value) urls.push(value);
  }
  for (const match of script.matchAll(/JSON\.parse\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\)/g)) {
    try {
      const serialized = quotedValue(match[1]);
      if (!serialized) continue;
      const data: unknown = JSON.parse(serialized);
      if (!data || typeof data !== "object" || !("urls" in data) || !Array.isArray(data.urls)) continue;
      for (const item of data.urls.slice(0, 10))
        if (item && typeof item === "object" && typeof item.url === "string") urls.push(item.url);
    } catch { /* Unknown configuration remains unavailable. */ }
  }
  // Swashbuckle 5 embeds discoveryPaths: arrayFrom('...|...'), not url: '...'.
  for (const match of script.matchAll(/\bdiscoveryPaths\s*:\s*arrayFrom\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\)/g)) {
    const value = quotedValue(match[1]); if (value) urls.push(...value.split("|"));
  }
  return [...new Set(urls)].slice(0, 10);
}

function officialReference(environment: NfseEnvironment, reference: string, from: string): string | null {
  try {
    if (reference.includes("\\") || /[\s\u0000-\u001f]/.test(reference)) return null;
    const url = new URL(reference, from).href;
    return allowedNfseReadUrl(environment, url) && new URL(url).origin === new URL(NFSE_BASES[environment]).origin ? url : null;
  } catch { return null; }
}

export type ContractDiscoveryStep = {
  stage: "portal_index" | "canonical_index" | "initializer" | "schema" | "schema_direct";
  status: number; format: "json" | "html" | "other" | "empty";
  outcome: "received" | "no_reference" | "invalid_contract" | "base_mismatch" | "captured" | "timeout" | "connection" | "tls";
};

export async function discoverOfficialContract(environment: NfseEnvironment, credentials: NfseCredentials, deadline: number, request = nfseGet, report: (step: ContractDiscoveryStep) => void = () => {}) {
  const base = NFSE_BASES[environment];
  const get = async (url: string, stage: ContractDiscoveryStep["stage"]) => {
    if (Date.now() + 1000 >= deadline) return null;
    try {
      const response = await request(environment, url, credentials, Math.min(5000, deadline - Date.now()));
      const type = response.contentType.split(";", 1)[0].trim().toLowerCase();
      const format = !response.body.length ? "empty" : type === "application/json" ? "json" : type === "text/html" ? "html" : "other";
      report({stage, status: response.status, format, outcome: "received"});
      return response;
    } catch (error) {
      const reason = fiscalTransportError(error).reason;
      report({stage, status: 0, format: "empty", outcome: reason === "timeout" ? "timeout" : ["tls", "client_certificate", "server_certificate"].includes(reason) ? "tls" : "connection"});
      return null;
    }
  };
  const captured = (url: string, response: Awaited<ReturnType<typeof nfseGet>>, stage: "schema" | "schema_direct") => {
    try {
      const raw = JSON.parse(response.body.toString("utf8"));
      if (raw.basePath !== undefined && raw.basePath !== new URL(base).pathname) {
        report({stage, status: response.status, format: "json", outcome: "base_mismatch"}); return null;
      }
      const parsed = structuralContract(raw);
      if (parsed) {
        report({stage, status: response.status, format: "json", outcome: "captured"});
        return { url, sha256: createHash("sha256").update(response.body).digest("hex"), contract: parsed };
      }
    } catch { /* No provider content or error text is logged. */ }
    report({stage, status: response.status, format: "other", outcome: "invalid_contract"}); return null;
  };
  const visited = new Set<string>();
  for (const initial of NFSE_DOCUMENT_INDEXES[environment]) {
    const stage = initial.includes("/API/") ? "portal_index" : "canonical_index";
    let indexUrl: string = initial;
    let html = await get(indexUrl, stage);
    if (!html) return null;
    if ([401, 403, 429].includes(html.status) || html.status >= 500) return null;
    if ([301, 302, 307, 308, 404].includes(html.status)) {
      indexUrl += ".html";
      html = await get(indexUrl, stage);
    }
    if (!html) return null;
    if ([401, 403, 429].includes(html.status) || html.status >= 500) return null;
    if (html.status !== 200) continue;
    let references = swaggerDocumentReferences(html.body.toString("utf8"));
    if (!references.length) {
      const initializer = /src=["']([^"']*\b(?:swagger-initializer|index)\.js)["']/.exec(html.body.toString("utf8"));
      const url = initializer ? officialReference(environment, initializer[1], indexUrl) : null;
      if (url) {
        const loaded = await get(url, "initializer");
        if (loaded?.status === 200) references = swaggerDocumentReferences(loaded.body.toString("utf8"));
      }
    }
    if (!references.length) report({stage, status: 200, format: "html", outcome: "no_reference"});
    const urls = [...new Set(references.map(reference => officialReference(environment, reference, indexUrl)).filter((url): url is string => url !== null))];
    for (const url of urls.slice(0, 3)) {
      if (visited.has(url)) continue;
      visited.add(url);
      const response = await get(url, "schema");
      if (response?.status === 200) { const result = captured(url, response, "schema"); if (result) return result; }
    }
  }
  // Known SEFIN document URL from the integration references; fetched live, never import a mirror as evidence.
  const direct = base + "/swagger/docs/v1";
  if (!visited.has(direct)) {
    const response = await get(direct, "schema_direct");
    if (response?.status === 200) return captured(direct, response, "schema_direct");
  }
  return null;
}
