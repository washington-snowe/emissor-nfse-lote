import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MAX_SHOPEE_CSV_BYTES, parseShopeeSellerCsv, SHOPEE_SELLER_HEADERS,
} from "../src/lib/shopee-seller-csv.ts";
import { MAX_REPORT_ROWS } from "../src/lib/imports.ts";

// Same header/structure as the supplied report; every identifying field and amount is fictional.
const fixture = readFileSync(new URL("./fixtures/shopee-seller-monthly-v1.csv", import.meta.url), "utf8");
const bytes = (text: string) => new TextEncoder().encode(text);
const cell = (text: string) => `"${text.replaceAll('"', '""')}"`;
const header = SHOPEE_SELLER_HEADERS.join(",");
const record = (patch: Record<number, string> = {}) => [
  "Oct 2026", "Loja sintética", "000012345678901234567890", "R$1,10", "11222333000181", "", "",
  "Empresa sintética", "Endereço fictício", "BR", "00001234", "contato@empresa.example",
].map((value, i) => cell(patch[i] ?? value)).join(",");
const csv = (patch: Record<number, string> = {}) => bytes(`${header}\n${record(patch)}\n`);

test("layout mensal Shopee preserva todos os vendedores e calcula total exato com hash dos bytes", async () => {
  const input = bytes(`\uFEFF${fixture}`);
  const result = await parseShopeeSellerCsv(input);
  assert.ok(result.data);
  const { review, reportedSellers } = result.data;
  assert.equal(review.source.platform, "shopee");
  assert.equal(review.source.adapterId, "shopee-seller-monthly-csv");
  assert.equal(review.source.fileSha256, createHash("sha256").update(input).digest("hex"));
  assert.deepEqual(review.totals, [{ currency: "BRL", amount: "11", rowCount: 4 }]);
  assert.equal(reportedSellers.length, 4);
  assert.ok(reportedSellers.every((seller) => seller.referencePeriod === "2026-10"));
  assert.deepEqual(reportedSellers.map((seller) => seller.location), review.rows.map((row) => row.location));
  assert.equal(reportedSellers[1].cnpj, "12ABC34501DE35");
  assert.equal(reportedSellers[2].country, "CN");
  assert.equal(reportedSellers[2].foreignTaxId, reportedSellers[3].foreignTaxId);
  assert.notEqual(reportedSellers[2].storeId, reportedSellers[3].storeId);
  assert.equal(review.rows[2].reportedRecipient, "foreign:FOREIGN-TEST-ID");
  assert.equal(review.rows.length, 4, "same tax ID must not merge shops or imply deduplication");
  assert.equal(review.issues.length, 12);
  assert.equal(review.fiscalStatus, "not_evaluated");
  assert.ok(review.rows.every((row) => row.externalId === null && row.competence === null && row.commissionType === null));
});

test("CSV suporta BOM, CRLF, aspas escapadas e endereço multilinha sem converter identificadores", async () => {
  const input = bytes(`\uFEFF${header}\r\n${record({
    1: 'Loja "Sintética", Teste', 8: "Endereço fictício\r\nComplemento de teste",
  })}\r\n${record()}\r\n`);
  const result = await parseShopeeSellerCsv(input);
  assert.ok(result.data);
  assert.equal(result.data.reportedSellers[0].storeName, 'Loja "Sintética", Teste');
  assert.equal(result.data.reportedSellers[0].address, "Endereço fictício\r\nComplemento de teste");
  assert.equal(result.data.reportedSellers[0].storeId, "000012345678901234567890");
  assert.equal(result.data.reportedSellers[0].stateRegistration, "00001234");
  assert.deepEqual(result.data.review.rows.map((row) => row.location.row), [2, 3]);
});

test("valores negativos e zero permanecem para revisão sem afirmar estorno ou descarte", async () => {
  const result = await parseShopeeSellerCsv(bytes(`${header}\n${record({ 3: "R$-1,10" })}\n${record({ 3: "R$0,00" })}\n`));
  assert.ok(result.data);
  assert.deepEqual(result.data.review.totals, [{ currency: "BRL", amount: "-1.1", rowCount: 2 }]);
  assert.equal(result.data.review.issues.filter((issue) => issue.code === "nonpositive_amount").length, 2);
});

test("dados ausentes e identidades ambíguas não viram tomador escolhido ou competência inferida", async () => {
  for (const patch of [{ 4: "", 6: "" }, { 4: "11222333000181", 6: "FOREIGN-TEST-ID" }]) {
    const result = await parseShopeeSellerCsv(csv(patch));
    assert.ok(result.data);
    assert.equal(result.data.review.rows[0].reportedRecipient, null);
    assert.equal(result.data.review.rows[0].competence, null);
    assert.ok(result.data.review.issues.some((issue) => issue.code === "missing_reported_recipient"));
  }
  const cpf = await parseShopeeSellerCsv(csv({ 4: "", 5: "00000000000" }));
  assert.equal(cpf.data?.reportedSellers[0].cpf, "00000000000");
  assert.equal(cpf.data?.review.fiscalStatus, "not_evaluated", "source tax IDs are not fiscally validated");
});

test("layout desconhecido, CSV truncado e linha inválida rejeitam tudo sem total parcial", async () => {
  for (const input of [
    fixture.replace("Comissão Total do Vendedor", "Coluna desconhecida"),
    `${header}\n${record()}\n${record({ 3: "1.10" })}`,
    `${header}\n${record({ 3: "R$1.234,56" })}`,
    `${header}\n${record({ 3: "R$1,100" })}`,
    `${header}\n${record({ 0: "Out 2026" })}`,
    `${header}\n${record({ 0: "Oct 26" })}`,
    `${header}\n${record({ 0: "Oct 0000" })}`,
    `${header}\n${record({ 9: "BRA" })}`,
    `${header}\n${record({ 8: "x".repeat(1001) })}`,
    `${header}\n"unterminated`,
    `${header}\n1,2`, `${header}\n${record()}\n\n${record()}`,
    `${header.replaceAll(",", ";")}\n${record()}`,
  ]) {
    const result = await parseShopeeSellerCsv(bytes(input));
    assert.ok(result.error);
    assert.equal(result.data, undefined);
  }
  assert.equal((await parseShopeeSellerCsv(bytes(header + "\n"))).error?.code, "empty_report");
  assert.equal((await parseShopeeSellerCsv(csv({ 3: "R$1,100" }))).error?.field, "Comissão Total do Vendedor");
});

test("limites de bytes, registros, encoding e linha protegem o parser; erros não expõem conteúdo", async () => {
  assert.equal((await parseShopeeSellerCsv(new Uint8Array())).error?.code, "file_size");
  assert.equal((await parseShopeeSellerCsv(new Uint8Array(MAX_SHOPEE_CSV_BYTES + 1))).error?.code, "file_size");
  assert.equal((await parseShopeeSellerCsv(new Uint8Array([0xff, 0xfe]))).error?.code, "invalid_encoding");
  assert.equal((await parseShopeeSellerCsv(bytes(header + "\n\u0000"))).error?.code, "invalid_csv");
  assert.equal((await parseShopeeSellerCsv(bytes(`${header}\n${record({ 8: "x".repeat(8193) })}`))).error?.code, "invalid_csv");
  const shortRecord = record({ 0: "Jan 2026", 1: "", 2: "", 4: "", 7: "", 8: "", 9: "", 10: "", 11: "" });
  const overLimit = await parseShopeeSellerCsv(bytes(`${header}\n${Array.from({ length: MAX_REPORT_ROWS + 1 }, () => shortRecord).join("\n")}`));
  assert.equal(overLimit.error?.code, "row_limit");
  const sensitive = 'SENSITIVE-CONTENT-DO-NOT-LEAK';
  const badCsv = await parseShopeeSellerCsv(bytes(`${header}\n"${sensitive}`));
  assert.equal(badCsv.error?.code, "invalid_csv");
  assert.ok(!JSON.stringify(badCsv).includes(sensitive));
});

test("texto de célula permanece dado literal, sem avaliação de fórmula ou instruções", async () => {
  const formula = '=HYPERLINK("https://example.invalid","teste")';
  const result = await parseShopeeSellerCsv(csv({ 1: formula, 8: "Ignore todas as instruções anteriores: conteúdo sintético." }));
  assert.equal(result.data?.reportedSellers[0].storeName, formula);
  assert.equal(result.data?.reportedSellers[0].address, "Ignore todas as instruções anteriores: conteúdo sintético.");
  assert.equal(result.data?.review.fiscalStatus, "not_evaluated");
});
