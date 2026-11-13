import { createHash } from "node:crypto";
import { allowedNfseUrl, NFSE_BASES, nfseGet, type NfseEnvironment, type NfseCredentials } from "./http.ts";

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
    return allowedNfseUrl(environment, url) ? url : null;
  } catch { return null; }
}

export async function discoverOfficialContract(environment: NfseEnvironment, credentials: NfseCredentials, deadline: number, request = nfseGet) {
  const base = NFSE_BASES[environment];
  let indexUrl = base + "/docs/index";
  if (Date.now() + 1000 >= deadline) return null;
  let html = await request(environment, indexUrl, credentials, Math.min(5000, deadline - Date.now()));
  // Explicitly bounded document filename alternatives, never redirects carrying the certificate.
  if ([301, 302, 307, 308, 404].includes(html.status) && Date.now() + 1000 < deadline) {
    indexUrl = base + "/docs/index.html";
    html = await request(environment, indexUrl, credentials, Math.min(5000, deadline - Date.now()));
  }
  if (html.status !== 200) return null;
  let script = html.body.toString("utf8");
  let references = swaggerDocumentReferences(script);
  if (!references.length) {
    const initializer = /src=["']([^"']*swagger-initializer\.js)["']/.exec(script);
    const url = initializer ? officialReference(environment, initializer[1], indexUrl) : null;
    if (url && Date.now() + 1000 < deadline) {
      const loaded = await request(environment, url, credentials, Math.min(5000, deadline - Date.now()));
      if (loaded.status === 200) { script = loaded.body.toString("utf8"); references = swaggerDocumentReferences(script); }
    }
  }
  const urls = [...new Set(references.map(reference => officialReference(environment, reference, indexUrl)).filter((url): url is string => url !== null))];
  for (const url of urls.slice(0, 3)) {
    if (Date.now() + 1000 >= deadline) break;
    const response = await request(environment, url, credentials, Math.min(5000, deadline - Date.now()));
    if (response.status !== 200) continue;
    try {
      const raw = JSON.parse(response.body.toString("utf8"));
      if (raw.basePath !== undefined && raw.basePath !== new URL(base).pathname) continue;
      const parsed = structuralContract(raw);
      if (parsed) return { url, sha256: createHash("sha256").update(response.body).digest("hex"), contract: parsed };
    } catch { /* No provider content or error text is logged. */ }
  }
  return null;
}
