import assert from "node:assert/strict";
import { test } from "node:test";
import forge from "node-forge";
import { readFile } from "node:fs/promises";
import { validateXML } from "xmllint-wasm";
import { buildDps, fiscalDecimal, type DpsInput } from "../src/lib/nfse/dps.ts";
import { signDps, verifyDpsSignature } from "../src/lib/nfse/signature.ts";
import { parseFiscalXml } from "../src/lib/nfse/xml.ts";
import { validateFiscalSchema, validateFiscalDocuments } from "../src/lib/nfse/schema.ts";

// All identities/data below are synthetic parser fixtures, never ICP-Brasil/homologation proof.
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01";
cert.validity.notBefore = new Date("2026-01-01T00:00:00Z");
cert.validity.notAfter = new Date("2027-01-01T00:00:00Z");
cert.setSubject([{ name: "commonName", value: "SYNTHETIC XML TEST ONLY" }]);
cert.setIssuer(cert.subject.attributes);
cert.sign(keys.privateKey, forge.md.sha256.create());
const publicCert = forge.pki.certificateToPem(cert);
const privateKey = forge.pki.privateKeyToPem(keys.privateKey);
const fixture = (): DpsInput => ({
  environment: "homologation", issuerCnpj: "11222333000181", dpsNumber: "1",
  competenceDate: "2026-10-31", emissionTime: "2026-11-11T12:00:00+00:00", amount: "11.01",
  profile: { issuerMunicipality: "3550308", series: "1", simplesOption: "2", specialRegime: "0",
    serviceMunicipality: "3550308", nationalTaxCode: "010101", description: "Serviço sintético & teste <XML>",
    issTaxation: "1", issWithholding: "1", totals: { mode: "not_informed" } },
  recipient: { kind: "cnpj", document: "11444777000161", country: "BR", legalName: "Tomador sintético & testes" },
});
const sign = (input: DpsInput) => { const built = buildDps(input); return { ...built, xml: signDps(built.xml, built.id, privateKey, publicCert) }; };

test("DPS vincula município/CNPJ/série/número, competência explícita, ambiente e decimal exato", () => {
  const input = fixture();
  input.amount = "999999999999999.99";
  input.dpsNumber = "999999999999999";
  const built = buildDps(input);
  assert.equal(built.id, "DPS355030821122233300018100001999999999999999");
  assert.ok(built.xml.includes("<vServ>999999999999999.99</vServ>"));
  assert.ok(built.xml.includes("<tpAmb>2</tpAmb>"));
  assert.ok(built.xml.includes("<serie>00001</serie>"));
  assert.ok(built.xml.includes("<dCompet>2026-10-31</dCompet>"));
  assert.ok(built.xml.includes("&amp; teste &lt;XML&gt;"));
  assert.equal(fiscalDecimal("0.1", "test"), "0.10");
  for (const value of ["-1.00", "1,00", "1.001", "01.00", "1e2", "NaN", " 1", "1000000000000000.00"]) {
    assert.throws(() => fiscalDecimal(value, "test"), /Invalid fiscal field/);
  }
  assert.throws(() => buildDps({ ...input, amount: "0" }), /service_amount/);
  assert.throws(() => buildDps({ ...input, competenceDate: "2026-02-30" }), /competence_date/);
  assert.throws(() => buildDps({ ...input, competenceDate: "2027-01-01" }), /ibscbs/);
  assert.throws(() => buildDps({ ...input, emissionTime: "2026-02-30T12:00:00+00:00" }), /emission_time/);
  for (const series of ["0", "50000", "90000", "^1$", "1.0"]) {
    assert.throws(() => buildDps({ ...input, profile: { ...input.profile, series } }), /series/);
  }
});

test("assinatura verifica certificado conhecido e detecta alterações, referência trocada e duplicação de nós", () => {
  const built = sign(fixture());
  assert.ok(verifyDpsSignature(built.xml, built.id, publicCert));
  for (const xml of [
    built.xml.replace("<vServ>11.01</vServ>", "<vServ>11.02</vServ>"),
    built.xml.replace("<dCompet>2026-10-31", "<dCompet>2026-10-30"),
    built.xml.replace(`URI="#${built.id}"`, 'URI="https://example.invalid/external.xml"'),
    built.xml.replace("<infDPS ", `<infDPS Id="${built.id}" `),
    built.xml.replace("</DPS>", `<infDPS xmlns="urn:attacker" Id="${built.id}"/></DPS>`),
    built.xml.replace("rsa-sha256", "hmac-sha1"),
    built.xml.replace("<toma>", "<toma Id=\"another\">"),
  ]) assert.equal(verifyDpsSignature(xml, built.id, publicCert), false);
  const otherKeys = forge.pki.rsa.generateKeyPair(2048);
  assert.equal(verifyDpsSignature(built.xml, built.id, forge.pki.publicKeyToPem(otherKeys.publicKey)), false);
  assert.throws(() => signDps(built.xml, built.id, privateKey, publicCert), /signature structure/);
  assert.throws(() => parseFiscalXml('<!DOCTYPE DPS [<!ENTITY x SYSTEM "file:///etc/passwd">]><DPS>&x;</DPS>'), /Invalid fiscal XML/);
  assert.throws(() => parseFiscalXml("<a>".repeat(33) + "</a>".repeat(33)), /Invalid fiscal XML/);
});

test("XSD preservado reproduz incompatibilidade da série; adaptação pontual valida DPS assinada", async () => {
  const built = sign(fixture());
  const provenance = JSON.parse(await readFile("integrations/nfse/provenance.json", "utf8"));
  const files = await Promise.all(provenance.files.map(async ({ file }: { file: string }) => ({
    fileName: file.split("/").at(-1)!, contents: await readFile(file, "utf8"),
  })));
  const schema = files.find(file => file.fileName === "DPS_v1.01.xsd")!;
  const upstream = await validateXML({ xml: built.xml, schema, preload: files.filter(file => file !== schema),
    maxMemoryPages: 1024, modifyArguments: args => ["--nonet", ...args] });
  assert.equal(upstream.valid, false);
  assert.ok(upstream.rawOutput.includes("serie") && upstream.rawOutput.includes("pattern"));
  assert.equal(await validateFiscalSchema(built.xml, "DPS"), true);
  assert.equal(await validateFiscalSchema(built.xml.replace("<serie>00001", "<serie>90000"), "DPS"), false);
  assert.equal(await validateFiscalSchema(built.xml.replace("<serie>00001</serie>", "<serie>^00001$</serie>"), "DPS"), false);
  assert.equal(await validateFiscalSchema(built.xml.replace("<cTribNac>010101", "<cTribNac>bad"), "DPS"), false);
  assert.equal(await validateFiscalSchema(built.xml.replace("<tpAmb>2", "<tpAmb>3"), "DPS"), false);
});

test("ME/EPP exige apuração e estimativa; tomador estrangeiro exige endereço e comércio exterior sem presumir exportação", async () => {
  const input = fixture();
  input.profile = { ...input.profile, simplesOption: "3", simplesAssessment: "1", totals: { mode: "simples_percent", percent: "6.00" } };
  assert.equal(await validateFiscalSchema(sign(input).xml, "DPS"), true);
  assert.throws(() => buildDps({ ...input, profile: { ...input.profile, totals: { mode: "not_informed" } } }), /not_informed_for_simples/);
  const foreign = fixture();
  foreign.recipient = { kind: "foreign", document: "SYNTHETIC-NIF", country: "CN", legalName: "Synthetic foreign recipient",
    address: { country: "CN", postalCode: "000000", city: "Synthetic city", province: "Synthetic region", street: "Synthetic street", number: "1", district: "Synthetic district" } };
  assert.throws(() => buildDps(foreign), /foreign_trade_required/);
  foreign.profile.foreignTrade = { mode: "1", relationship: "0", currency: "986", providerIncentive: "01", recipientIncentive: "01", temporaryGoods: "1", mdic: "0" };
  assert.throws(() => buildDps(foreign), /foreign_amount/);
  foreign.foreignAmount = "11.01";
  const built = sign(foreign);
  assert.ok(built.xml.includes("<tribISSQN>1</tribISSQN>"));
  assert.equal(built.xml.includes("<cPaisResult>"), false);
  assert.equal(await validateFiscalSchema(built.xml, "DPS"), true);
  assert.throws(() => buildDps({ ...foreign, recipient: { ...foreign.recipient, address: undefined } }), /foreign_address/);
  const invalid = structuredClone(foreign);
  invalid.profile.foreignTrade!.mode = "9";
  assert.equal(await validateFiscalSchema(sign(invalid).xml, "DPS"), false);
  const domestic = fixture();
  domestic.profile.foreignTrade = foreign.profile.foreignTrade;
  assert.equal(buildDps(domestic).xml.includes("<comExt>"), false, "foreign defaults do not add foreign trade to a domestic row");
});

test("validação de prévia em lote é limitada e recusa o lote inteiro se um XML falhar", async () => {
  const xml = buildDps(fixture()).xml;
  assert.equal(await validateFiscalDocuments(Array(500).fill(xml), "DPS"), true);
  assert.equal(await validateFiscalDocuments(Array(501).fill(xml), "DPS"), false);
  assert.equal(await validateFiscalDocuments([xml, xml.replace("<cTribNac>010101", "<cTribNac>invalid")], "DPS"), false);
});
