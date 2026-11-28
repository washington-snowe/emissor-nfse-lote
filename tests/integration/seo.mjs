import assert from "node:assert/strict";

const origin = process.env.SEO_AUDIT_URL ?? "http://127.0.0.1:3500";
const canonicalOrigin = "https://www.rexnotas.com.br";
const get = path => fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15000) });
const content = (html, name) => html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1];
const canonical = html => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
const structured = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));

const robots = await get("/robots.txt");
assert.equal(robots.status, 200);
const rules = await robots.text();
assert.match(rules, /Allow: \//);
assert.match(rules, /Disallow: \/painel/);
assert.match(rules, /Sitemap: https:\/\/www.rexnotas.com.br\/sitemap.xml/);

const sitemap = await get("/sitemap.xml");
assert.equal(sitemap.status, 200);
const xml = await sitemap.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]));
assert.equal(urls.length, 7);
assert.equal(new Set(urls.map(url => url.href)).size, urls.length);
let guides = 0;
for (const url of urls) {
  assert.equal(url.origin, canonicalOrigin);
  assert.ok(!/painel|auth|entrar|criar-conta|recuperar|api|prototipo/.test(url.pathname));
  const response = await get(url.pathname);
  assert.equal(response.status, 200, url.pathname);
  assert.ok(!response.headers.get("x-robots-tag")?.includes("noindex"));
  const html = await response.text();
  assert.match(content(html, "robots") ?? "", /\bindex\b/);
  assert.doesNotMatch(content(html, "robots") ?? "", /noindex/);
  assert.equal(canonical(html), url.href.replace(/\/$/, ""));
  assert.match(html, /<html lang="pt-BR"/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, url.pathname);
  assert.ok((content(html, "description") ?? "").length >= 70);
  if (url.pathname.startsWith("/guias/")) {
    const graph = structured(html).flatMap(item => item["@graph"] ?? [item]);
    assert.ok(graph.some(item => item["@type"] === "Article" && item.mainEntityOfPage === url.href));
    assert.ok(graph.some(item => item["@type"] === "BreadcrumbList"));
    guides++;
  }
}

const home = await (await get("/?utm_source=seo-audit")).text();
assert.equal(canonical(home), canonicalOrigin);
const graph = structured(home).flatMap(item => item["@graph"] ?? [item]);
assert.ok(graph.some(item => item["@type"] === "WebSite" && item.name === "RexNotas"));
assert.equal(graph.find(item => item["@type"] === "SoftwareApplication").offers.length, 8);
assert.match(home, /Qual relatório preciso importar\?/);
assert.match(home, /href="\/guias"/);
assert.doesNotMatch(home, /icon\.svg/);
assert.match(home, /<link rel="icon"[^>]*href="\/favicon\.ico"/);
assert.match(home, /<link rel="icon"[^>]*href="\/brand\/rex-favicon\.png"[^>]*sizes="96x96"/);
for (const agent of ["Googlebot", "Googlebot-Image/1.0"]) {
  for (const path of ["/favicon.ico", "/brand/rex-favicon.png"]) {
    const response = await fetch(new URL(path, origin), { headers: { "User-Agent": agent }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `${agent} ${path}`);
    assert.ok(!response.headers.get("x-robots-tag")?.includes("noindex"));
    const bytes = Buffer.from(await response.arrayBuffer());
    if (path.endsWith(".png")) {
      assert.match(response.headers.get("content-type") ?? "", /image\/png/);
      assert.equal(bytes.readUInt32BE(16), 96);
      assert.equal(bytes.readUInt32BE(20), 96);
    } else {
      assert.match(response.headers.get("content-type") ?? "", /image\/(?:x-icon|vnd.microsoft.icon)/);
      assert.equal(bytes.readUInt16LE(2), 1);
      assert.equal(bytes.readUInt16LE(4), 3);
      assert.deepEqual([bytes[6], bytes[22], bytes[38]], [16, 32, 48]);
    }
  }
}

for (const path of ["/entrar", "/criar-conta", "/recuperar-senha", "/painel", "/painel/admin", "/api/jobs", "/prototipo"]) {
  const response = await get(path);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  if (response.status === 200) assert.match(content(await response.text(), "robots") ?? "", /noindex/);
}
const missing = await get("/pagina-seo-inexistente");
assert.equal(missing.status, 404);
assert.match(content(await missing.text(), "robots") ?? "", /noindex/);

const social = await get("/opengraph-image");
assert.equal(social.status, 200);
assert.match(social.headers.get("content-type") ?? "", /image\/png/);
const png = Buffer.from(await social.arrayBuffer());
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
console.log(JSON.stringify({ indexablePages: urls.length, guides, canonicalTrackingParameters: true, structuredOffers: 8, privateNoindexHeaders: true, genuine404: true, sharingImage: [1200, 630] }));
