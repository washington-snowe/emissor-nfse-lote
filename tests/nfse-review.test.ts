import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseShopeeSellerCsv } from "../src/lib/shopee-seller-csv.ts";
import { prepareFiscalReview, reviewCandidates, canonicalReviewJson, readReviewSnapshot } from "../src/lib/nfse/review.ts";
import type { FiscalProfile } from "../src/lib/nfse/dps.ts";

const profile: FiscalProfile = { issuerMunicipality: "3550308", series: "1", simplesOption: "2", specialRegime: "0", serviceMunicipality: "3550308",
  nationalTaxCode: "010101", description: "Synthetic review only", issTaxation: "1", issWithholding: "1", totals: { mode: "not_informed" },
  foreignTrade: { mode: "1", relationship: "0", currency: "986", providerIncentive: "01", recipientIncentive: "01", temporaryGoods: "1", mdic: "0" } };
const binding = { companyId: "00000000-0000-4000-8000-000000000001", issuerCnpj: "11222333000181", importId: "00000000-0000-4000-8000-000000000002",
  profileId: "00000000-0000-4000-8000-000000000003", profileSha256: "a".repeat(64), profileVersion: 1, profile };
async function reportFixture() {
  const report = await parseShopeeSellerCsv(await readFile("tests/fixtures/shopee-seller-monthly-v1.csv"));
  assert.ok(report.data);
  return report.data;
}
const input = () => ({ competenceDate: "2026-10-31", commissionType: "Synthetic commission", evidenceReference: "Synthetic accounting reference",
  recipientChoice: "reported_sellers", confirmRecipientRole: true, grouping: "per_row", recipients: [] as Record<string, unknown>[] });
const foreignAddress = { country: "CN", postalCode: "000000", city: "Synthetic city", province: "Synthetic province", street: "Synthetic street", number: "1", district: "Synthetic district" };

test("relatório nunca determina tomador/competência e revisão impede itens externos sem dados próprios", async () => {
  const report = await reportFixture();
  assert.equal(prepareFiscalReview(report, {}, binding).issues[0].code, "review_fields");
  assert.equal(prepareFiscalReview(report, { ...input(), confirmRecipientRole: false }, binding).issues[0].code, "review_fields");
  assert.equal(prepareFiscalReview(report, { ...input(), competenceDate: "" }, binding).issues[0].code, "review_fields");
  const candidates = reviewCandidates(report);
  assert.equal(candidates.length, 4);
  assert.equal(candidates[2].person.address, undefined);
  const incomplete = prepareFiscalReview(report, input(), binding);
  assert.equal(incomplete.snapshot, undefined);
  assert.ok(incomplete.issues.some(issue => issue.row === candidates[2].row));
  const completed = input();
  completed.recipients = candidates.filter(candidate => candidate.person.country === "CN").map(candidate => ({ row: candidate.row,
    person: { ...candidate.person, address: foreignAddress }, foreignAmount: candidate.amount }));
  // The synthetic import intentionally includes an alphanumeric CNPJ unsupported by this fiscal XSD.
  completed.recipients.push({ row: 3, person: { ...candidates[1].person, document: "11444777000161" } });
  const result = prepareFiscalReview(report, completed, binding);
  assert.deepEqual(result.issues, []);
  assert.equal(result.snapshot?.groups.length, 4);
  assert.equal(result.snapshot?.total, "11.00");
  assert.equal(result.snapshot?.competenceDate, "2026-10-31");
  assert.equal(result.snapshot?.groups[0].foreignAmount, undefined);
  assert.equal(result.snapshot?.groups[2].foreignAmount, "3.30");
});

test("consolidação depende de opção explícita e só une pessoas completas iguais; soma mantém centavos", async () => {
  const report = await reportFixture();
  const common = { kind: "cnpj", document: "11444777000161", country: "BR", legalName: "Synthetic common recipient" };
  const request = { ...input(), recipientChoice: "single_recipient", commonRecipient: common };
  const separated = prepareFiscalReview(report, request, binding);
  assert.equal(separated.snapshot?.groups.length, 4);
  const merged = prepareFiscalReview(report, { ...request, grouping: "same_recipient" }, binding);
  assert.deepEqual(merged.issues, []);
  assert.equal(merged.snapshot?.groups.length, 1);
  assert.equal(merged.snapshot?.groups[0].amount, "11.00");
  assert.equal(merged.snapshot?.groups[0].sourceRows.length, 4);
  assert.equal(merged.snapshot?.groups[0].sourceClaims.length, 4);
  assert.equal(merged.snapshot?.groups[0].allocations.length, 4);
  const withCpf = prepareFiscalReview(report, { ...request, commonRecipient: { kind: "cpf", document: "529.982.247-25", country: "BR", legalName: "Synthetic CPF parser fixture" } }, binding);
  assert.equal(withCpf.snapshot?.groups[0].recipient.document, "52998224725");
  assert.equal(prepareFiscalReview(report, { ...request, commonRecipient: { ...common, document: "invalid-document" } }, binding).snapshot, undefined);
});

test("escopo mensal detecta repetição entre reexportações sem chamar ID de loja de ID de operação", async () => {
  const report = await reportFixture();
  const request = { ...input(), recipientChoice: "single_recipient", commonRecipient: { kind: "cnpj", document: "11444777000161", country: "BR", legalName: "Synthetic recipient" } };
  const first = prepareFiscalReview(report, request, binding).snapshot!;
  const reexport = structuredClone(report);
  reexport.review.source.fileSha256 = "b".repeat(64);
  reexport.review.rows[0].amount = "1.99";
  const second = prepareFiscalReview(reexport, request, binding).snapshot!;
  assert.equal(first.groups[0].sourceClaims[0], second.groups[0].sourceClaims[0]);
  assert.notEqual(first.fileSha256, second.fileSha256);
  assert.notEqual(first.groups[0].amount, second.groups[0].amount);
  reexport.reportedSellers[1].storeId = reexport.reportedSellers[0].storeId;
  assert.ok(prepareFiscalReview(reexport, request, binding).issues.some(issue => issue.code === "duplicate_source"));
  report.review.rows[0].amount = "-1.10";
  assert.ok(prepareFiscalReview(report, request, binding).issues.some(issue => issue.code === "unsupported_amount"));
});

test("snapshot descarta campos desconhecidos e sua representação muda ao revisar evidência ou perfil", async () => {
  const report = await reportFixture();
  const request = { ...input(), recipientChoice: "single_recipient", commonRecipient: { kind: "cnpj", document: "11444777000161", country: "BR", legalName: "Synthetic recipient", tenant_id: "untrusted" }, secret: "DO-NOT-STORE" };
  const first = prepareFiscalReview(report, request, binding).snapshot!;
  assert.ok(!JSON.stringify(first).includes("DO-NOT-STORE"));
  assert.ok(!JSON.stringify(first).includes("untrusted"));
  const second = prepareFiscalReview(report, { ...request, evidenceReference: "Updated synthetic evidence" }, binding).snapshot!;
  assert.notEqual(canonicalReviewJson(first), canonicalReviewJson(second));
  assert.equal(canonicalReviewJson({ b: "á", a: 1 }), canonicalReviewJson({ a: 1, b: "á" }));
  assert.throws(() => canonicalReviewJson({ a: Number.NaN }), /Invalid review/);
  assert.ok(readReviewSnapshot(first, binding.importId, report.review.source.fileSha256));
  assert.equal(readReviewSnapshot(first, binding.importId, "b".repeat(64)), null);
  assert.equal(readReviewSnapshot({ ...first, groups: [{ ...first.groups[0], allocations: null }] }, binding.importId, report.review.source.fileSha256), null);
});

test("consolidação estrangeira preserva valores por linha para auditoria e reabertura da revisão", async () => {
  const report = await reportFixture();
  const request = { ...input(), recipientChoice: "single_recipient", grouping: "same_recipient", commonRecipient: {
    kind: "foreign", document: "SYNTHETIC-NIF", country: "CN", legalName: "Synthetic foreign recipient", address: foreignAddress },
    recipients: report.review.rows.map(row => ({ row: row.location.row, foreignAmount: row.amount })) };
  const snapshot = prepareFiscalReview(report, request, binding).snapshot;
  assert.ok(snapshot);
  assert.equal(snapshot.groups.length, 1);
  assert.equal(snapshot.groups[0].foreignAmount, "11.00");
  assert.deepEqual(snapshot.groups[0].allocations.map(value => value.foreignAmount), ["1.10", "2.20", "3.30", "4.40"]);
  assert.deepEqual(reviewCandidates(report, snapshot).map(value => value.foreignAmount), ["1.10", "2.20", "3.30", "4.40"]);
});
