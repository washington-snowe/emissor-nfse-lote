import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { executeFiscalJob, type FiscalJob } from "../src/lib/nfse/execute.ts";
import { supportedNfseContract } from "../src/lib/nfse/api-contract.ts";
import { signDps } from "../src/lib/nfse/signature.ts";
import { validateFiscalSchema } from "../src/lib/nfse/schema.ts";
import { verifyOfficialNfseContents } from "../src/lib/nfse/receipt.ts";
import { identity, fiscalProfile, recipient, signedDps, nfseFixture, contractFixture } from "./helpers/fiscal-fixture.ts";

const holder = identity(), service = identity(), signed = signedDps(holder), accessKey = "1".repeat(50);
type Dependencies = Parameters<typeof executeFiscalJob>[1];
function scenario(mode: "prepare" | "reconcile" = "prepare") {
  const events: string[] = [], finishes: string[] = [], pfx = Buffer.from("SYNTHETIC TRANSPORT FIXTURE ONLY");
  const job: FiscalJob = { id: "00000000-0000-4000-8000-000000000001", tenant_id: "00000000-0000-4000-8000-000000000002",
    company_id: "00000000-0000-4000-8000-000000000003", lease_token: "00000000-0000-4000-8000-000000000004", mode, environment: "homologation",
    issuer_cnpj: "11222333000181", profile_snapshot: fiscalProfile, competence_date: "2026-10-31", amount: "11.01", foreign_amount: null,
    dps_number: mode === "reconcile" ? "1" : null, dps_id: mode === "reconcile" ? signed.id : null, recipient, intermediary: null,
    signed_dps_xml: mode === "reconcile" ? signed.xml : null, holder_certificate_pem: mode === "reconcile" ? holder.certificatePem : null };
  let xml = signed.xml;
  const deps: Dependencies = {
    contract: supportedNfseContract(contractFixture())!, remainingMs: () => 45_000,
    identity: async () => { events.push("reserve-number"); return { id: signed.id, number: "1" }; },
    loadMaterial: async () => { events.push("verify-holder"); return { ...holder, pfx, password: "synthetic", certificateId: "00000000-0000-4000-8000-000000000005" }; },
    sign: signDps, validate: value => validateFiscalSchema(value, "DPS"),
    begin: async (_material, value) => { events.push("persist-send-intent"); xml = value; return true; },
    release: async reason => { events.push("release:" + reason); },
    request: async (method, url) => {
      events.push(method);
      if (url.includes("/dps/")) return { status: 200, body: Buffer.from(JSON.stringify({ chaveAcesso: accessKey })) };
      const nfse = nfseFixture(xml, service, accessKey);
      return { status: 200, body: Buffer.from(JSON.stringify({ nfseXmlGZipB64: gzipSync(Buffer.from(nfse)).toString("base64"), ...(method === "POST" ? { chaveAcesso: accessKey } : {}) })) };
    },
    receipt: (document, key, expectedDps, cert, dpsId) => verifyOfficialNfseContents(document, { accessKey: key, signedDps: expectedDps, holderCert: cert, dpsId, issuerCnpj: job.issuer_cnpj }),
    finish: async (outcome, reason) => { finishes.push(outcome); events.push("finish:" + outcome + ":" + (reason ?? "")); },
  };
  return { job, deps, events, finishes, pfx };
}
test("pipeline local sintético persiste intenção antes do único POST e exige recibo íntegro", async () => {
  const s = scenario(); await executeFiscalJob(s.job, s.deps);
  assert.ok(s.events.indexOf("persist-send-intent") < s.events.indexOf("POST"));
  assert.ok(s.events.indexOf("verify-holder") < s.events.indexOf("reserve-number"));
  assert.equal(s.events.filter(event => event === "POST").length, 1);
  assert.deepEqual(s.finishes, ["authorized"]);
  assert.ok(s.pfx.every(byte => byte === 0));
});
test("ausência de A1 ou origem já reservada não obtêm permissão de envio", async () => {
  const missing = scenario(); missing.deps.loadMaterial = async () => { throw new Error("certificate_missing"); };
  await executeFiscalJob(missing.job, missing.deps);
  assert.equal(missing.events.includes("reserve-number"), false);
  assert.ok(missing.events.includes("release:certificate_missing"));
  const overlap = scenario(); overlap.deps.identity = async () => ({ blocked: "source_duplicate" });
  await executeFiscalJob(overlap.job, overlap.deps);
  assert.ok(overlap.events.includes("release:source_duplicate"));
  assert.equal(overlap.events.includes("POST"), false);
});
test("confirmação de intenção negada ou sem resposta impede POST", async () => {
  for (const throwing of [false, true]) {
    const s = scenario(); s.deps.begin = async () => { if (throwing) throw new Error("synthetic lost acknowledgement"); return false; };
    await executeFiscalJob(s.job, s.deps);
    assert.equal(s.events.includes("POST"), false); assert.ok(s.pfx.every(byte => byte === 0));
  }
});
test("timeout após intenção e resposta 2xx sem documento mantêm resultado incerto", async () => {
  for (const throwing of [false, true]) {
    const s = scenario(); s.deps.request = async () => { if (throwing) throw new Error("synthetic network timeout"); return { status: 200, body: Buffer.from("{}") }; };
    await executeFiscalJob(s.job, s.deps);
    assert.deepEqual(s.finishes, ["uncertain"]);
  }
});
test("reconciliação local usa somente GET e permite XML sem repetir chave no envelope", async () => {
  const s = scenario("reconcile"); await executeFiscalJob(s.job, s.deps);
  assert.deepEqual(s.events.filter(event => event === "GET" || event === "POST"), ["GET", "GET"]);
  assert.deepEqual(s.finishes, ["authorized"]);
});
test("404 e duplicidade E0014 não liberam retransmissão", async () => {
  const reconcile = scenario("reconcile"); reconcile.deps.request = async () => ({ status: 404, body: Buffer.from("{}") });
  await executeFiscalJob(reconcile.job, reconcile.deps); assert.deepEqual(reconcile.finishes, ["not_found"]);
  for (const [code, outcome] of [["E0014", "uncertain"], ["E0001", "rejected"]]) {
    const s = scenario(); s.deps.request = async () => ({ status: 400, body: Buffer.from(JSON.stringify({ erros: [{ codigo: code }] })) });
    await executeFiscalJob(s.job, s.deps); assert.deepEqual(s.finishes, [outcome]);
  }
});
test("produção, dinheiro numérico e prazo insuficiente não iniciam transmissão", async () => {
  const production = scenario(); production.job.environment = "production"; await executeFiscalJob(production.job, production.deps);
  assert.equal(production.events.includes("POST"), false);
  const numeric = scenario(); numeric.job.amount = 999999999999999.99; await executeFiscalJob(numeric.job, numeric.deps);
  assert.ok(numeric.events.includes("release:invalid_xml")); assert.equal(numeric.events.includes("POST"), false);
  const budget = scenario(); budget.deps.remainingMs = () => 10_000; await executeFiscalJob(budget.job, budget.deps);
  assert.ok(budget.events.includes("release:preparation_retry")); assert.equal(budget.events.includes("POST"), false);
});
