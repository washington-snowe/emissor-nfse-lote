import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedNfseUrl, NFSE_BASES, nfseGet } from "../src/lib/nfse/http.ts";
import { createHash } from "node:crypto";
import { structuralContract, swaggerDocumentReferences, discoverOfficialContract } from "../src/lib/nfse/contract.ts";

test("mTLS só aceita destinos oficiais do ambiente escolhido e não segue URLs de terceiros", async()=>{
  assert.ok(allowedNfseUrl("homologation",NFSE_BASES.homologation+"/nfse"));
  assert.equal(NFSE_BASES.homologation, "https://sefin.producaorestrita.nfse.gov.br/SefinNacional");
  assert.equal(allowedNfseUrl("homologation", "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse"), null);
  for (const url of ["http://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse",NFSE_BASES.production+"/nfse",NFSE_BASES.homologation+"/../outside","https://example.invalid/nfse","https://user:password@sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse",NFSE_BASES.homologation+"/nfse#fragment"]) {
    assert.equal(allowedNfseUrl("homologation",url),null);
    await assert.rejects(nfseGet("homologation",url,{pfx:Buffer.from("synthetic"),password:"not-a-real-password"}),/Invalid fiscal destination/);
  }
});

test("Swagger lê url, JSON serializado e discoveryPaths sem executar JavaScript", () => {
  const url = "../swagger/docs/v1";
  for (const script of [
    `SwaggerUIBundle({url: '${url}'});`,
    `var config = JSON.parse(${JSON.stringify(JSON.stringify({ urls: [{ url }] }))});`,
    `var swashbuckleConfig = {discoveryPaths: arrayFrom('${url}')};`,
  ]) assert.deepEqual(swaggerDocumentReferences(script), [url]);
  assert.deepEqual(swaggerDocumentReferences("discoveryPaths: arrayFrom('../a|../b')"), ["../a", "../b"]);
  assert.deepEqual(swaggerDocumentReferences("url: 'broken\\z'; JSON.parse('not json')"), []);
  assert.deepEqual(swaggerDocumentReferences("x".repeat(1_000_001)), []);
});

test("descoberta segue somente referências oficiais do Swagger no prefixo canônico e preserva hash da origem", async () => {
  const base = NFSE_BASES.homologation;
  const url = base + "/swagger/docs/v1";
  const body = Buffer.from(JSON.stringify({ swagger: "2.0", basePath: "/SefinNacional", paths: { "/nfse": { post: { description: "PRIVATE-FIXTURE" } } } }));
  const calls: string[] = [];
  const contract = await discoverOfficialContract("homologation", { pfx: Buffer.from("SYNTHETIC"), password: "SYNTHETIC" }, Date.now() + 30000, async (_env, target) => {
    calls.push(target);
    if (target === base + "/docs/index") return { status: 200, contentType: "text/html", body: Buffer.from(`discoveryPaths: arrayFrom('https://example.invalid/schema|${url}'); globalThis.doNotExecuteFixture = true;`) };
    assert.equal(target, url);
    return { status: 200, contentType: "application/json", body };
  });
  assert.ok(contract);
  assert.equal(contract.url, url);
  assert.equal(contract.sha256, createHash("sha256").update(body).digest("hex"));
  assert.equal(JSON.stringify(contract.contract).includes("PRIVATE-FIXTURE"), false);
  assert.deepEqual(calls, [base + "/docs/index", url]);
  assert.equal("doNotExecuteFixture" in globalThis, false);
});

test("descoberta aceita index.html e inicializador referenciado, sem tentar alternativas após 403 ou prazo esgotado", async () => {
  const base = NFSE_BASES.homologation, calls: string[] = [];
  const sources: Record<string, {status: number; body: string}> = {
    [base + "/docs/index"]: {status: 404, body: "missing"},
    [base + "/docs/index.html"]: {status: 200, body: '<script src="swagger-initializer.js"></script>'},
    [base + "/docs/swagger-initializer.js"]: {status: 200, body: 'url: "../swagger/v1/swagger.json"'},
    [base + "/swagger/v1/swagger.json"]: {status: 200, body: '{"openapi":"3.0.1","paths":{"/nfse":{"post":{}}}}'},
  };
  const credentials = {pfx: Buffer.from("SYNTHETIC"), password: "SYNTHETIC"};
  const result = await discoverOfficialContract("homologation", credentials, Date.now() + 30000, async (_env, target) => {
    calls.push(target); assert.ok(target in sources);
    return {status: sources[target].status, contentType: "text/plain", body: Buffer.from(sources[target].body)};
  });
  assert.ok(result);
  assert.deepEqual(calls, Object.keys(sources));
  calls.length = 0;
  assert.equal(await discoverOfficialContract("homologation", credentials, Date.now() + 30000, async (_env, target) => {
    calls.push(target); return {status: 403, contentType: "text/html", body: Buffer.from("SYNTHETIC")};
  }), null);
  assert.deepEqual(calls, [base + "/docs/index"]);
  assert.equal(await discoverOfficialContract("homologation", credentials, Date.now(), async () => { throw new Error("Must not request after deadline"); }), null);
});

test("contrato com basePath diferente e referências externas ou inválidas não é registrado", async () => {
  const base = NFSE_BASES.homologation;
  let calls = 0;
  const result = await discoverOfficialContract("homologation", {pfx: Buffer.from("SYNTHETIC"), password: "SYNTHETIC"}, Date.now() + 30000, async (_env, target) => {
    calls++;
    if (target.endsWith("/docs/index")) return {status: 200, contentType: "text/html", body: Buffer.from(`url: 'https://['; url: 'https://example.invalid/data'; url: '${base}/swagger/docs/v1'`)};
    assert.equal(target, base + "/swagger/docs/v1");
    return {status: 200, contentType: "application/json", body: Buffer.from('{"swagger":"2.0","basePath":"/DifferentService","paths":{"/nfse":{}}}')};
  });
  assert.equal(result, null);
  assert.equal(calls, 2);
});

test("documentação descoberta publica somente estrutura, sem exemplos ou descrições arbitrárias",()=>{
  // Structural OpenAPI fixture, not an official fiscal API contract or response.
  const fixture = {
    openapi: "3.0.1",
    info: { title: "fixture" },
    paths: {
      "/nfse": {
        post: {
          description: "PRIVATE-FIXTURE",
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/TestPayload" } } } },
          responses: {
            "200": {
              description: "PRIVATE-FIXTURE",
              content: { "application/json": { schema: { type: "object", properties: { testField: { type: "string", example: "PRIVATE-FIXTURE" } } } } },
            },
          },
        },
      },
    },
    components: {
      schemas: { TestPayload: { type: "object", properties: { testPayload: { type: "string", default: "PRIVATE-FIXTURE" } }, required: ["testPayload"] } },
    },
  };
  const result=structuralContract(fixture);
  assert.ok(result);
  assert.ok(!JSON.stringify(result).includes("PRIVATE-FIXTURE"));
  assert.ok(JSON.stringify(result).includes("testPayload"));
  assert.equal(structuralContract({}),null);
  assert.equal(structuralContract({swagger:"2.0",paths:{"/unrelated":{}}}),null);
});
