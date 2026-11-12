import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBrlInput } from "../src/lib/nfse/amount-input.ts";
import { prepareStandalone, todayInBrazil } from "../src/lib/nfse/standalone.ts";
import { fiscalProfile, recipient } from "./helpers/fiscal-fixture.ts";
test("nota individual lê valores brasileiros sem float, ambiguidade ou arredondamento", () => {
  for (const [input, expected] of [["862,36", "862.36"], ["R$ 1.250,5", "1250.50"], ["1.000", "1000.00"], ["999.999.999.999.999,99", "999999999999999.99"]]) assert.equal(parseBrlInput(input), expected);
  for (const invalid of [0, "0", "0,00", "-1,00", "1,001", "1.23", "01,00", "1e2", "1,000.00", "1.000.000.000.000.000,00"]) assert.equal(parseBrlInput(invalid), null);
});
test("competência inicial usa São Paulo e dados da nota são validados com o perfil da própria empresa", () => {
  assert.equal(todayInBrazil(new Date("2026-11-12T01:00:00Z")), "2026-11-11");
  const value = { amount: "862,36", competenceDate: "2026-10-31", commissionType: "Comissões sintéticas", reference: "", recipient,
    configuration: fiscalProfile, tenant_id: "DO-NOT-STORE", privateKey: "DO-NOT-STORE" };
  const ready = prepareStandalone(value, "11222333000181", "mei", "2026-01-01");
  assert.ok(ready); assert.equal(ready.data.amount, "862.36");
  assert.equal(JSON.stringify(ready).includes("DO-NOT-STORE"), false);
  assert.equal(prepareStandalone({ ...value, competenceDate: "2027-01-01" }, "11222333000181", "mei", "2026-01-01"), null);
  assert.equal(prepareStandalone(value, "11222333000181", "mei", "2026-11-01"), null);
});
