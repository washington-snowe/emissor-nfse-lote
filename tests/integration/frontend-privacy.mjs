import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const origin = new URL(process.env.FRONTEND_AUDIT_URL ?? "http://localhost:3000");
const configuredValues = [
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  ...Object.entries(process.env).filter(([name]) => name.startsWith("SECURITY_CANARY_")).map(([, value]) => value),
].filter(value => value && value.length > 10);

const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:sb_secret_|sb_publishable_|sk_live_|sk_test_|whsec_|xkeysib-|sp_apikey_)[\w-]{20,}/,
  /https:\/\/[a-z]{20}\.supabase\.co\b/,
];

function inspect(body, resource) {
  for (const pattern of credentialPatterns) {
    assert.ok(!pattern.test(body), `Identificador de configuração ou credencial em ${resource}`);
  }
  for (const value of configuredValues) {
    assert.ok(!body.includes(value), `Valor de configuração encontrado em ${resource}`);
  }
}

async function inspectDirectory(directory) {
  let checked = 0;
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) checked += await inspectDirectory(file);
    else if (/\.(?:js|css|json|html|map)$/.test(file)) {
      inspect(await readFile(file, "utf8"), file);
      checked++;
    }
  }
  return checked;
}

const assets = new Set();
const publicPages = ["/", "/entrar", "/criar-conta", "/recuperar-senha"];
for (const route of publicPages) {
  const response = await fetch(new URL(route, origin), { redirect: "error", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, route);
  const body = await response.text();
  inspect(body, route);
  for (const match of body.matchAll(/(?:href|src)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)) {
    const url = new URL(match[1], origin);
    if (url.origin === origin.origin && url.pathname.startsWith("/_next/static/")) {
      assets.add(url.pathname + url.search);
    }
  }
}
assert.ok(assets.size > 0, "Nenhum arquivo do navegador foi localizado");
for (const asset of assets) {
  const response = await fetch(new URL(asset, origin), { redirect: "error", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, asset);
  inspect(await response.text(), asset);
}

const protectedRoutes = ["/painel", "/prototipo?tela=admin", "/painel/seguranca", "/painel/admin", "/painel/certificados", "/painel/importacoes", "/painel/notas",
  "/painel/notas/documentos/00000000-0000-4000-8000-000000000001",
  "/painel/notas/documentos/00000000-0000-4000-8000-000000000001/danfse"];
for (const route of protectedRoutes) {
  const response = await fetch(new URL(route, origin), { redirect: "manual", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 307, route);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/entrar", route);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/, route);
  inspect(await response.text(), route);
}
for (const [route, method] of [["/api/jobs", "GET"], ["/api/jobs", "POST"], ["/api/jobs/email", "POST"]]) {
  const response = await fetch(new URL(route, origin), { method, redirect: "manual", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 401, route);
  inspect(await response.text(), route);
}
const localAssets = process.env.FRONTEND_AUDIT_STATIC_DIR ? await inspectDirectory(process.env.FRONTEND_AUDIT_STATIC_DIR) : 0;
console.log(JSON.stringify({ publicPages: publicPages.length, publicAssets: assets.size, protectedRoutes: protectedRoutes.length, workerRequestsDenied: 3, localAssets }));
