import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalAmount, MAX_REPORT_ROWS, reviewCommissionReport } from "../src/lib/imports.ts";

// Internal contract fixtures; these are not real marketplace report layouts.
const row = (patch: Record<string, unknown> = {}) => ({
  location: { row: 2 },
  externalId: "synthetic-operation",
  competence: "2026-11",
  currency: "BRL",
  amount: "0.10",
  commissionType: "synthetic-type",
  reportedRecipient: "synthetic-reference",
  ...patch,
});

const report = (rows = [row()], source: Record<string, unknown> = {}) => ({
  contractVersion: 1,
  source: {
    platform: "shopee",
    format: "csv",
    fileSha256: "a".repeat(64),
    adapterId: "internal-test-fixture",
    adapterVersion: "test-1",
    ...source,
  },
  rows,
});

test("valores decimais mantêm precisão e recusam números JS, ambiguidade e arredondamento", () => {
  for (const [input, expected] of [
    ["0.1000", "0.1"], ["-0.00", "0"], ["-120.123456789012", "-120.123456789012"],
    ["999999999999999999.999999999999", "999999999999999999.999999999999"],
  ]) assert.equal(canonicalAmount(input), expected);
  for (const value of [
    0.1, NaN, Infinity, null, undefined, [], {}, "", "1,20", "1.000,20", "1,000.20",
    "R$ 1.00", "01.00", "1e3", "+1", " 1", "1\n", "1.1234567890123", "1000000000000000000",
  ]) assert.equal(canonicalAmount(value), null, String(value));
});

test("totais exatos não somam moedas distintas nem perdem casas fracionárias", () => {
  const result = reviewCommissionReport(report([
    row(),
    row({ location: { row: 3 }, amount: "0.2" }),
    row({ location: { row: 4 }, amount: "-0.05", competence: "2026-10" }),
    row({ location: { row: 5 }, amount: "3.000000000001", currency: "USD" }),
  ]));
  assert.ok(result.data);
  assert.deepEqual(result.data.totals, [
    { currency: "BRL", amount: "0.25", rowCount: 3 },
    { currency: "USD", amount: "3.000000000001", rowCount: 1 },
  ]);
  assert.equal(result.data.rows.length, 4);
  assert.equal(result.data.rows[2].competence, "2026-10");
  assert.deepEqual(result.data.issues, [{ rowIndex: 2, code: "nonpositive_amount" }]);
  assert.equal(result.data.fiscalStatus, "not_evaluated");
  assert.doesNotThrow(() => JSON.stringify(result.data));
});

test("soma ultrapassa o limite individual sem overflow ou arredondamento", () => {
  const result = reviewCommissionReport(report([
    row({ amount: "999999999999999999.999999999999" }),
    row({ location: { row: 3 }, amount: "0.000000000001" }),
  ]));
  assert.equal(result.data?.totals[0].amount, "1000000000000000000");
  const cancellation = reviewCommissionReport(report([
    row({ amount: "-123.456789012345" }),
    row({ location: { row: 3 }, amount: "123.456789012345" }),
  ]));
  assert.equal(cancellation.data?.totals[0].amount, "0");
});

test("ausências explícitas e valores não positivos ficam visíveis, sem inferir moeda ou tomador", () => {
  const result = reviewCommissionReport(report([row({
    externalId: null, competence: null, currency: null, amount: "-0.00",
    commissionType: null, reportedRecipient: null,
  })]));
  assert.ok(result.data);
  assert.equal(result.data.rows.length, 1);
  assert.equal(result.data.rows[0].amount, "0");
  assert.deepEqual(result.data.totals, []);
  assert.deepEqual(result.data.issues.map((issue) => issue.code), [
    "missing_external_id", "missing_competence", "missing_currency",
    "missing_commission_type", "missing_reported_recipient", "nonpositive_amount",
  ]);
  assert.equal(result.data.fiscalStatus, "not_evaluated");
});

test("linha inválida rejeita o relatório inteiro e não produz total parcial", () => {
  for (const patch of [
    { amount: "12,34" }, { amount: 12.34 }, { currency: "brl" }, { currency: "BRL\n" },
    { competence: "2026-13" }, { competence: "2026-00" }, { competence: "2026-11\n" },
    { externalId: "" }, { commissionType: "x".repeat(121) }, { reportedRecipient: undefined },
    { location: { row: 2n } }, { location: { row: NaN } }, { location: { row: {} } },
    { location: { row: 3, page: 1 } },
  ]) {
    const result = reviewCommissionReport(report([row(), row({ location: { row: 3 }, ...patch })]));
    assert.equal(result.data, undefined);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.every((error) => error.path.startsWith("rows.1")));
  }
});

test("proveniência distingue planilhas/páginas e recusa repetir a mesma localização", () => {
  for (const [format, location, secondLocation] of [
    ["csv", { row: 2 }, { row: 3 }],
    ["xlsx", { row: 2, sheet: "A" }, { row: 2, sheet: "B" }],
    ["pdf", { row: 1, page: 1 }, { row: 1, page: 2 }],
  ] as const) {
    const valid = reviewCommissionReport(report([
      row({ location }), row({ location: secondLocation }),
    ], { format }));
    assert.ok(valid.data);
    assert.deepEqual(valid.data.rows.map((entry) => entry.location), [location, secondLocation]);
    // Repeated business IDs can be legitimate; only repeated source locations fail here.
    assert.equal(valid.data.rows[0].externalId, valid.data.rows[1].externalId);
    const duplicate = reviewCommissionReport(report([
      row({ location }), row({ location }),
    ], { format }));
    assert.ok(duplicate.errors.some((error) => error.code === "duplicate_location"));
    assert.equal(duplicate.data, undefined);
  }
  for (const format of ["xlsx", "pdf"])
    assert.equal(reviewCommissionReport(report([row()], { format })).data, undefined);
});

test("fronteira rejeita metadados e limites inválidos e descarta campos fora do contrato", () => {
  for (const input of [
    null, [], {}, { ...report(), contractVersion: 2 }, report([], {}),
    report(Array.from({ length: MAX_REPORT_ROWS + 1 }, () => row())),
    report([row()], { platform: ["shopee"] }), report([row()], { format: ["csv"] }),
    report([row()], { platform: "unknown" }), report([row()], { format: "exe" }),
    report([row()], { fileSha256: "a".repeat(64) + "\n" }),
    report([row()], { fileSha256: "" }), report([row()], { adapterId: "" }),
    report([row()], { adapterVersion: "" }),
  ]) {
    const result = reviewCommissionReport(input);
    assert.equal(result.data, undefined);
    assert.ok(result.errors.length);
  }
  const input = { ...report([row({ tenant_id: "forged", readyToIssue: true })]), tenant_id: "forged" };
  const result = reviewCommissionReport(input);
  assert.ok(result.data);
  assert.ok(!JSON.stringify(result.data).includes("forged"));
  assert.ok(!JSON.stringify(result.data).includes("readyToIssue"));
  assert.equal(result.data.fiscalStatus, "not_evaluated");
  const capped = reviewCommissionReport(report(Array.from({ length: 200 }, () => row({ amount: null }))));
  assert.equal(capped.errors.length, 100);
  assert.equal(capped.data, undefined);
});
