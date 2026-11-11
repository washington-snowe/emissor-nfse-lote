import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseShopeeSellerCsv, type ParsedShopeeReport } from "../src/lib/shopee-seller-csv.ts";
import { validatePersistedReport } from "../src/lib/persisted-report.ts";

test("resultado persistido permanece vinculado aos bytes e localizações originais antes da exibição", async () => {
  const source = readFileSync(new URL("./fixtures/shopee-seller-monthly-v1.csv", import.meta.url));
  const parsed = await parseShopeeSellerCsv(source);
  assert.ok(parsed.data);
  const hash = parsed.data.review.source.fileSha256;
  assert.deepEqual(validatePersistedReport(JSON.parse(JSON.stringify(parsed.data)),hash),parsed.data);
  assert.equal(validatePersistedReport(parsed.data,"0".repeat(64)),null);
  for (const mutate of [
    (data: typeof parsed.data) => { data!.reportedSellers.pop(); },
    (data: typeof parsed.data) => { data!.reportedSellers[0].location.row = 99; },
    (data: typeof parsed.data) => { data!.reportedSellers[0].referencePeriod = "2026-13"; },
    (data: typeof parsed.data) => { data!.review.rows[0].amount = "1,20"; },
  ]) {
    const copy: ParsedShopeeReport = structuredClone(parsed.data); mutate(copy);
    assert.equal(validatePersistedReport(copy,hash),null);
  }
  assert.equal(validatePersistedReport(null,hash),null);
});
