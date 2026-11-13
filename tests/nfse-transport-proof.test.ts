import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedSefinLookup } from "../src/lib/nfse/api-contract.ts";
import { ownSefinLookupId, verifyOwnSefinTransport } from "../src/lib/nfse/transport-proof.ts";
import { fiscalProbeReport } from "../src/lib/nfse/probe-report.ts";
import { contractFixture } from "./helpers/fiscal-fixture.ts";

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
