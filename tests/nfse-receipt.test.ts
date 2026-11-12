import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { identity, signedDps, nfseFixture, contractFixture } from "./helpers/fiscal-fixture.ts";
import { verifyOfficialNfseContents } from "../src/lib/nfse/receipt.ts";
import { supportedNfseContract, readCompressedNfse, definitiveRejection, dpsTransportBody } from "../src/lib/nfse/api-contract.ts";
import { validateFiscalSchema } from "../src/lib/nfse/schema.ts";

test("adaptador condicional exige os campos e caminhos no contrato capturado, sem habilitar por mera presença de /nfse", () => {
  const contract = supportedNfseContract(contractFixture());
  assert.ok(contract);
  assert.equal(supportedNfseContract({ paths: { "/nfse": { post: {} } } }), null);
  const unknown = contractFixture();
  unknown.paths["/nfse"].post.parameters[0].schema.required.push("unimplementedMandatoryField");
  assert.equal(supportedNfseContract(unknown), null);
  assert.equal(definitiveRejection(400, { erros: [{ codigo: "E0001" }] }, contract), true);
  assert.equal(definitiveRejection(400, { erros: [{ codigo: "E0014" }] }, contract), false);
  assert.equal(definitiveRejection(503, { erros: [{ codigo: "E0001" }] }, contract), false);
  assert.equal(definitiveRejection(400, { arbitrary: "not proof" }, contract), false);
});
test("XML comprimido tem base64 canônico, limite de expansão e encoding UTF-8 válido", () => {
  assert.equal(readCompressedNfse(gzipSync(Buffer.from("<synthetic/>")).toString("base64")), "<synthetic/>");
  assert.equal(readCompressedNfse(gzipSync(Buffer.alloc(262145, "a")).toString("base64")), null);
  assert.equal(readCompressedNfse(gzipSync(Buffer.from([0xff])).toString("base64")), null);
  assert.equal(readCompressedNfse("AAAA\n"), null);
  const body = JSON.parse(dpsTransportBody("<synthetic/>").toString());
  assert.equal(readCompressedNfse(body.dpsXmlGZipB64), "<synthetic/>");
});
test("recibo sintético exige XSD, chave, emitente, conteúdo original da DPS e assinatura íntegra da NFS-e", async () => {
  const holder = identity(), service = identity(), dps = signedDps(holder), key = "1".repeat(50);
  const xml = nfseFixture(dps.xml, service, key);
  assert.equal(await validateFiscalSchema(xml, "NFSe"), true);
  const expected = { dpsId: dps.id, signedDps: dps.xml, holderCert: holder.certificatePem, issuerCnpj: "11222333000181", accessKey: key };
  assert.ok(await verifyOfficialNfseContents(xml, expected));
  const returnedUnsignedDps = dps.xml.replace(/<Signature\b[\s\S]*?<\/Signature>/, "");
  assert.ok(await verifyOfficialNfseContents(nfseFixture(returnedUnsignedDps, service), expected));
  assert.equal(await verifyOfficialNfseContents(nfseFixture(returnedUnsignedDps.replace("<vServ>11.01", "<vServ>11.02"), service), expected), null);
  assert.equal(await verifyOfficialNfseContents(xml, { ...expected, accessKey: "2".repeat(50) }), null);
  assert.equal(await verifyOfficialNfseContents(xml, { ...expected, issuerCnpj: "11444777000161" }), null);
  assert.equal(await verifyOfficialNfseContents(xml.replace("<vLiq>11.01", "<vLiq>11.02"), expected), null);
  assert.equal(await verifyOfficialNfseContents(xml.replace("<vServ>11.01", "<vServ>11.02"), expected), null);
  assert.equal(await verifyOfficialNfseContents(nfseFixture(dps.xml, service, key, "103"), expected), null);
  const different = signedDps(holder);
  const differentXml = different.xml.replace("<vServ>11.01", "<vServ>11.02");
  assert.equal(await verifyOfficialNfseContents(nfseFixture(differentXml, service), expected), null);
});
