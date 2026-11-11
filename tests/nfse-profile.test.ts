import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFiscalProfile, profileFromForm, validProfileEvidence } from "../src/lib/nfse/profile.ts";

const fixture = () => ({ issuerMunicipality: "3550308", series: "1", specialRegime: "0", nationalTaxCode: "010101",
  serviceMunicipality: "3550308", description: "Synthetic format test", issTaxation: "1", issWithholding: "1", totals: { mode: "not_informed" } });
test("perfil deriva enquadramento da empresa, preserva ausências e não infere código/tributação", () => {
  const raw = { ...fixture(), tenant_id: "forged", privateKey: "DO-NOT-PERSIST" };
  const profile = parseFiscalProfile(raw, "11222333000181", "mei");
  assert.ok(profile);
  assert.equal(profile.simplesOption, "2");
  assert.equal(profile.issuerRegistration, undefined);
  assert.equal(profile.issRate, undefined);
  assert.ok(parseFiscalProfile({ ...raw, issWithholding: "3" }, "11222333000181", "mei"));
  assert.equal(JSON.stringify(profile).includes("DO-NOT-PERSIST"), false);
  assert.equal(parseFiscalProfile({ ...raw, nationalTaxCode: "" }, "11222333000181", "mei"), null);
  assert.equal(parseFiscalProfile({ ...raw, simplesOption: "3" }, "11222333000181", "mei"), null);
  assert.equal(parseFiscalProfile(raw, "11222333000181", "normal"), null);
  assert.equal(parseFiscalProfile(raw, "11222333000181", "simples"), null);
  assert.ok(parseFiscalProfile({ ...raw, simplesAssessment: "1", totals: { mode: "simples_percent", percent: "6.00" } }, "11222333000181", "simples"));
});
test("formulário fiscal aceita somente campos conhecidos e exige evidência/data válidas", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fixture())) if (typeof value === "string") form.set(key, value);
  form.set("totals.mode", "not_informed");
  form.set("tenant_id", "forged");
  assert.ok(parseFiscalProfile(profileFromForm(form), "11222333000181", "mei"));
  assert.equal(JSON.stringify(profileFromForm(form)).includes("forged"), false);
  assert.ok(validProfileEvidence("Orientação sintética em 11/11/2026", "2026-01-01"));
  for (const evidence of ["", "a", "x\nprivate", "a".repeat(501)]) assert.equal(validProfileEvidence(evidence, "2026-01-01"), false);
  assert.equal(validProfileEvidence("Synthetic reference", "2026-02-30"), false);
});
