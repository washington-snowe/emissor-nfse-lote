import { createHash } from "node:crypto";
import { allowedNfseUrl, NFSE_BASES, nfseGet, type NfseEnvironment } from "./http.ts";

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

export async function discoverOfficialContract(environment: NfseEnvironment, credentials: { pfx: Buffer; password: string }, deadline: number) {
  const base=NFSE_BASES[environment];
  const indexUrl=base+"/docs/index";
  const html=await nfseGet(environment,indexUrl,credentials,Math.min(5000,deadline-Date.now()));
  if (html.status!==200) return null;
  let script=html.body.toString("utf8");
  if (!/swagger\.json|swagger\/docs|["']url["']\s*:|\burl\s*:/.test(script)) {
    const initializer=/src=["']([^"']*swagger-initializer\.js)["']/.exec(script);
    if (initializer && Date.now()+1000<deadline) {
      const url=new URL(initializer[1],indexUrl).href;
      if (!allowedNfseUrl(environment,url)) return null;
      const loaded=await nfseGet(environment,url,credentials,Math.min(5000,deadline-Date.now()));
      if (loaded.status===200) script=loaded.body.toString("utf8");
    }
  }
  const urls=[...script.matchAll(/\burl["']?\s*:\s*["']([^"']+)["']/gi)].map(match=>match[1]);
  // Swashbuckle may embed its URL configuration as a JSON string; parse data, never evaluate JS.
  const config=/JSON\.parse\(\s*('(?:\\.|[^'\\])*')\s*\)/.exec(script);
  if (config) {
    try {
      const serialized=JSON.parse('"'+config[1].slice(1,-1).replaceAll('"','\\"').replaceAll("\\'","'")+'"');
      const decoded=JSON.parse(serialized) as { urls?: { url: string }[] };
      urls.push(...(decoded.urls ?? []).map(item=>item.url));
    } catch { /* Unknown configuration is not executed or guessed. */ }
  }
  for (const candidate of urls.slice(0,3)) {
    if (Date.now()+1000>=deadline) break;
    const url=new URL(candidate,indexUrl).href;
    if (!allowedNfseUrl(environment,url)) continue;
    const response=await nfseGet(environment,url,credentials,Math.min(5000,deadline-Date.now()));
    if (response.status!==200) continue;
    try {
      const parsed=structuralContract(JSON.parse(response.body.toString("utf8")));
      if (parsed) return { url,sha256:createHash("sha256").update(response.body).digest("hex"),contract:parsed };
    } catch { /* No provider content or error text is logged. */ }
  }
  return null;
}
