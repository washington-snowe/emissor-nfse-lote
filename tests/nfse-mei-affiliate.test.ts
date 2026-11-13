import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareMeiAffiliateProfile, MEI_AFFILIATE_EVIDENCE } from "../src/lib/nfse/mei-affiliate.ts";
import { buildDps } from "../src/lib/nfse/dps.ts";
import { validateFiscalSchema } from "../src/lib/nfse/schema.ts";
import { prepareStandalone } from "../src/lib/nfse/standalone.ts";

// All company identities and operations here are synthetic; no remote query or transmission.
const company = { cnpj: "11222333000181", tax_regime: "mei", address: { municipality_code: "3550308" } };
const today = "2026-11-12";
function form() { const f = new FormData(); f.set("version", "0"); f.set("confirmActivity", "on"); return f; }

test("modelo MEI exige escolha da atividade e usa a empresa do servidor, sem aceitar campos fiscais injetados", () => {
  const f = form();
  for (const [key, value] of Object.entries({ tenant_id: "another-owner", issuerMunicipality: "9999999", series: "49999", nationalTaxCode: "010101", issRate: "5.00", issWithholding: "2", evidence: "forged", "totals.mode": "amounts", tax_regime: "mei" })) f.set(key, value);
  const result = prepareMeiAffiliateProfile(company, 0, f, today);
  assert.ok(result.profile);
  assert.equal(result.profile.issuerMunicipality, "3550308");
  assert.equal(result.profile.serviceMunicipality, "3550308");
  assert.equal(result.profile.nationalTaxCode, "170601");
  assert.equal(result.profile.series, "1");
  assert.equal(result.profile.specialRegime, "0");
  assert.equal(result.profile.issWithholding, "1");
  assert.equal(result.profile.issRate, undefined, "MEI must omit aliquota, not set it to zero");
  assert.equal(result.profile.issuerRegistration, undefined);
  assert.equal(result.profile.municipalTaxCode, undefined);
  assert.equal(result.profile.nbsCode, undefined);
  assert.deepEqual(result.profile.totals, { mode: "not_informed" });
  assert.equal(result.evidence, MEI_AFFILIATE_EVIDENCE);
  assert.equal(result.validFrom, today);
  assert.equal(JSON.stringify(result).includes("another-owner"), false);
  assert.ok(prepareMeiAffiliateProfile({ ...company, tax_regime: "simples" }, 0, f, today).error);
  f.delete("confirmActivity");
  assert.ok(prepareMeiAffiliateProfile(company, 0, f, today).error);
});

test("modelo não sobrescreve versões nem adivinha município ou vigência inválida", () => {
  for (const current of [1, 7, -1]) assert.ok(prepareMeiAffiliateProfile(company, current, form(), today).error);
  for (const address of [null, {}, { municipality_code: 3550308 }, { municipality_code: "0355030" }])
    assert.ok(prepareMeiAffiliateProfile({ ...company, address }, 0, form(), today).error);
  const f = form(); f.set("version", "1");
  assert.ok(prepareMeiAffiliateProfile(company, 0, f, today).error);
  f.set("version", "0");
  for (const value of ["2026-02-30", "2026-11-13", "yesterday"]) {
    f.set("validFrom", value); assert.ok(prepareMeiAffiliateProfile(company, 0, f, today).error);
  }
});

test("modelo pronto passa no XSD local e permite relatório anterior somente com vigência confirmada", async () => {
  const f = form(); f.set("validFrom", "2026-10-01");
  const result = prepareMeiAffiliateProfile(company, 0, f, today);
  assert.ok(result.profile);
  const operation = { amount: "862,36", competenceDate: "2026-10-31", configuration: result.profile,
    commissionType: "Comissões sintéticas", reference: "", recipient: { kind: "cnpj", country: "BR", document: "11444777000161", legalName: "Tomador sintético" } };
  assert.equal(prepareStandalone(operation, company.cnpj, "mei", today), null);
  const prepared = prepareStandalone(operation, company.cnpj, "mei", result.validFrom);
  assert.ok(prepared);
  assert.ok(await validateFiscalSchema(prepared.probeXml, "DPS"));
  assert.ok(prepared.probeXml.includes("<cTribNac>170601</cTribNac>"));
  assert.ok(prepared.probeXml.includes("<tpRetISSQN>1</tpRetISSQN>"));
  assert.ok(!prepared.probeXml.includes("<pAliq>"));
  assert.ok(prepared.probeXml.includes("<indTotTrib>0</indTotTrib>"));
  assert.throws(() => buildDps({ environment: "homologation", issuerCnpj: company.cnpj, profile: result.profile!, dpsNumber: "1",
    amount: "1.00", competenceDate: "2027-01-01", emissionTime: "2027-01-01T12:00:00+00:00", recipient: operation.recipient as Parameters<typeof buildDps>[0]["recipient"] }), /2027/);
});
