import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifiedSefinLookup } from "../src/lib/nfse/api-contract.ts";
import { ownSefinLookupId, verifyOwnSefinTransport } from "../src/lib/nfse/transport-proof.ts";
import { fiscalProbeReport } from "../src/lib/nfse/probe-report.ts";
import { contractFixture } from "./helpers/fiscal-fixture.ts";
import { supportedNfseContract } from "../src/lib/nfse/api-contract.ts";
import { fiscalProbeFeedback } from "../src/lib/nfse/probe-feedback.ts";

const cnpj = "11222333000181", municipality = "3550308", id = ownSefinLookupId(municipality, cnpj, "1");
const credentials = {pfx: Buffer.from("SYNTHETIC"), password: "PRIVATE-SYNTHETIC-DO-NOT-EXPOSE"};
function contract() {
  const fixture = contractFixture();
  const meta = {tipoAmbiente: {type: "integer"}};
  return {...fixture, paths: {...fixture.paths, "/dps/{id}": {get: {responses: {
    "200": {schema: {type: "object", properties: {...meta, idDps: {type: "string"}, chaveAcesso: {type: "string"}}}},
    "404": {schema: {type: "object", properties: {...meta, erro: {type: "object", properties: {codigo: {type: "string"}}}}}},
  }}}}};
}
test("reserva compartilhada exige resposta SEFIN declarada, não HTML 404 ou parâmetros ADN", () => {
  const missing = Buffer.from('{"tipoAmbiente":2,"erro":{"codigo":"E0002"}}');
  assert.ok(verifiedSefinLookup(404, missing, id, contract()));
  assert.ok(verifiedSefinLookup(200, Buffer.from(JSON.stringify({tipoAmbiente: 2, idDps: id, chaveAcesso: "1".repeat(50)})), id, contract()));
  for (const [status, data] of [
    [404, "<html>404 missing</html>"], [404, '{"message":"Not Found"}'],
    [404, '{"tipoAmbiente":1,"erro":{"codigo":"E0002"}}'], [404, '{"tipoAmbiente":2,"erro":{"codigo":"private"}}'],
    [200, '{"parametrosConvenio":{}}'], [200, '{"tipoAmbiente":2,"idDps":"different","chaveAcesso":"1"}'],
  ] as const) assert.equal(verifiedSefinLookup(status, Buffer.from(data), id, contract()), false);
  assert.equal(verifiedSefinLookup(404, missing, id, contractFixture()), false, "missing response schema must remain blocked");
});

test("consulta SEFIN usa somente identidade própria e GET, sem consumir ou reservar número", async () => {
  assert.equal(id, "DPS355030821122233300018100001000000000000001");
  let calls = 0;
  const input = {municipality, cnpj, holderCnpj: cnpj, series: "1"};
  const result = await verifyOwnSefinTransport(input, credentials, contract(), async (environment, url, passed) => {
    calls++; assert.equal(environment, "homologation"); assert.equal(passed, credentials);
    assert.equal(url, "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/dps/" + id);
    return {status: 404, contentType: "application/json", body: Buffer.from('{"tipoAmbiente":2,"erro":{"codigo":"E0002"}}')};
  });
  assert.ok(result); assert.equal(calls, 1);
  assert.equal(await verifyOwnSefinTransport({...input, holderCnpj: "11444777000161"}, credentials, contract(), async () => {throw new Error("Must not query foreign identity");}), false);
  for (const series of ["0", "50000", "../1"]) assert.throws(() => ownSefinLookupId(municipality, cnpj, series));
});

test("relatório copiável usa apenas rótulos fixos e status, sem certificado, URL ou conteúdo do provedor", () => {
  const report = fiscalProbeReport({connected: false, status: 404, message: credentials.password, diagnostic: credentials.password}, [
    {stage: "portal_index", status: 404, format: "html", outcome: "received"},
    {stage: "schema_direct", status: 200, format: "json", outcome: "captured"},
  ], credentials.password);
  assert.ok(report.includes("nfse-adn-v1")); assert.ok(report.includes("Parâmetros ADN: HTTP 404"));
  assert.ok(report.includes("Contrato SEFIN: HTTP 200"));
  assert.ok(!report.includes(credentials.password)); assert.ok(!report.includes("https://"));
});

test("MEI não confunde 404 JSON de parâmetros auxiliares com veto municipal ou autorização fiscal", () => {
  const access = {connected: false, status: 404, responseFormat: "json" as const, message: "Consulta auxiliar não concluída.", diagnostic: "NFSE_HTTP_404"};
  const feedback = fiscalProbeFeedback(access, "mei", "recognized");
  assert.ok(feedback.success);
  assert.equal(feedback.error, undefined);
  assert.equal(feedback.canReviewProfile, true);
  assert.match(feedback.notice, /ainda serão validados na SEFIN/);
  assert.equal(access.connected, false, "presentation must not forge transport evidence");
  assert.ok(fiscalProbeFeedback(access, "simples", "recognized").error);
  for (const contract of ["pending", "storage_pending", "unsupported"] as const)
    assert.equal(fiscalProbeFeedback(access, "mei", contract).canReviewProfile, false);
  for (const status of [0, 401, 403, 429, 503])
    assert.ok(fiscalProbeFeedback({...access, status}, "mei", "recognized").error);
  assert.ok(fiscalProbeFeedback({...access, responseFormat: "html"}, "mei", "recognized").error);
});

test("contrato oficial capturado preserva integridade e é reconhecido sem comprovar emissão", () => {
  const file = new URL("../integrations/nfse/contracts/sefin-homologation-v1.structural.json", import.meta.url);
  const bytes = readFileSync(file);
  const provenance = JSON.parse(readFileSync(new URL("../integrations/nfse/contracts/sefin-homologation-v1.provenance.json", import.meta.url), "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.structural_file_sha256);
  assert.equal(provenance.kind, "authenticated_official_structural_capture");
  assert.equal(provenance.source_url, "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/swagger/docs/v1");
  const official = JSON.parse(bytes.toString("utf8"));
  const supported = supportedNfseContract(official);
  assert.ok(supported);
  assert.equal(supported.dpsPath, "/dps/{id}");
  assert.equal(supported.nfsePath, "/nfse/{chaveAcesso}");
  assert.ok(official.paths["/nfse"].post.responses["201"]);
  assert.ok(verifiedSefinLookup(404, Buffer.from('{"tipoAmbiente":2,"erro":{"codigo":"E0002"}}'), id, official));
  assert.equal(verifiedSefinLookup(404, Buffer.from('<html>404</html>'), id, official), false);
});
