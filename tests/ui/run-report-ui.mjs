import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tools = process.env.UI_TOOLS_DIR;
if (!tools) throw new Error("Set UI_TOOLS_DIR as described in docs/cadastro-empresas.md.");
const require = createRequire(import.meta.url);
const { build } = require(path.join(tools, "esbuild"));
const { chromium } = require(path.join(tools, "playwright-core"));
const output = await mkdtemp(path.join(tmpdir(), "nfse-report-ui-"));
const fixture = path.join(root, "tests/fixtures/shopee-seller-monthly-v1.csv");
let browser;
let server;
try {
  await mkdir(path.join(root, "shots/reports"), { recursive: true });
  await build({ entryPoints: [path.join(root, "tests/ui/report-entry.tsx")], bundle: true, jsx: "automatic", outfile: path.join(output, "bundle.js"), tsconfig: path.join(root, "tsconfig.json"), alias: {
    "@/app/auth/actions": path.join(root, "tests/ui/auth-actions.ts"),
    "next/link": path.join(root, "tests/ui/link.tsx"),
  } });
  server = createServer(async (req, res) => {
    try {
      const files = {
        "/bundle.js": [path.join(output, "bundle.js"), "text/javascript"],
        "/globals.css": [path.join(root, "src/app/globals.css"), "text/css"],
        "/motion.css": [path.join(root, "public/assets/motion/motion.css"), "text/css"],
        "/outfit.woff2": [path.join(root, "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"), "font/woff2"],
        "/mono.woff2": [path.join(root, "node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2"), "font/woff2"],
      };
      if (files[req.url]) { const [file, type] = files[req.url]; res.setHeader("Content-Type", type); res.end(await readFile(file)); return; }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/motion.css"><style>@font-face{font-family:"Outfit Variable";src:url(/outfit.woff2) format("woff2");font-weight:100 900}@font-face{font-family:"DM Mono";src:url(/mono.woff2) format("woff2")}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
    } catch { res.statusCode = 500; res.end("Fixture unavailable"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", headless: true });
  const page = await browser.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", error => errors.push(error.name));
  page.on("request", request => requests.push({ method: request.method(), url: request.url() }));
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    await page.goto(origin);
    await page.getByLabel("Empresa emissora").selectOption("test-company-a");
    await page.getByLabel("Relatório mensal da Shopee", { exact: true }).setInputFiles(fixture);
    requests.length = 0;
    await page.getByRole("button", { name: "Conferir relatório", exact: true }).click();
    await page.getByRole("heading", { name: "Comissões por vendedor." }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 4);
    assert.equal(await page.locator(".report-totals").innerText(), "Linhas de vendedores\n4\nMês de conclusão\n10/2026\nTotal informado nas linhas\nR$ 11,00");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}`);
    assert.ok(!requests.some(request => request.method !== "GET"), "local preview must not upload the file");
    assert.ok(!requests.some(request => !request.url.startsWith(origin)), "local preview must not contact a third party");
    await page.waitForFunction(() => document.activeElement.id === "report-result-title");
    const inspectButton = page.getByRole("button", { name: "Conferir relatório", exact: true });
    await inspectButton.hover();
    await page.waitForTimeout(180);
    assert.ok(await inspectButton.evaluate(element => getComputedStyle(element).getPropertyValue("--bg").trim() !== ""));
    assert.notEqual(await inspectButton.evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)", "hover must keep a visible button background");
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(root, `shots/reports/${width}.png`), fullPage: true });
    console.log(`Reports ${width}px: local CSV, exact totals, result focus, no page overflow or upload`);
  }
  await page.getByLabel("Empresa emissora").selectOption("test-company-b");
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page.getByRole("button", { name: "Conferir relatório", exact: true }).click();
  await page.getByRole("heading", { name: "Comissões por vendedor." }).waitFor();
  assert.ok((await page.locator(".report-result-heading").innerText()).includes("Empresa sintética B"));
  await page.locator(".report-seller-details summary").nth(2).click();
  assert.ok(await page.getByText("loja-c@empresa.example", { exact: true }).isVisible());
  await page.getByRole("button", { name: "Limpar arquivo", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 0);
  assert.equal(await page.locator("#report-file").inputValue(), "");
  console.log("Reports: company change invalidates preview; foreign seller details remain visible; clear discards file");

  await page.getByLabel("Relatório mensal da Shopee", { exact: true }).setInputFiles({ name: "unknown.csv", mimeType: "text/csv", buffer: Buffer.from("unknown,layout\na,b") });
  await page.getByRole("button", { name: "Conferir relatório", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "não corresponde" }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page.getByLabel("Relatório mensal da Shopee", { exact: true }).setInputFiles({ name: "large.csv", mimeType: "text/csv", buffer: Buffer.alloc(512 * 1024 + 1, 65) });
  await page.getByRole("button", { name: "Conferir relatório", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "até 512 KB" }).waitFor();
  console.log("Reports: unknown layout and oversized file fail without a partial preview");

  await page.goto(origin);
  await page.getByLabel("Empresa emissora").selectOption("test-company-a");
  await page.getByLabel("Relatório mensal da Shopee", { exact: true }).setInputFiles(fixture);
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise(resolve => setTimeout(resolve, 300));
      return original.call(this);
    };
  });
  await page.getByRole("button", { name: "Conferir relatório", exact: true }).click();
  await page.getByRole("button", { name: "Limpar arquivo", exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page.reload();
  assert.equal(await page.locator("tbody tr").count(), 0);
  assert.equal(await page.locator("#report-file").inputValue(), "");
  await page.goto(`${origin}/?empty=1`);
  await page.getByRole("heading", { name: "Primeiro, cadastre sua empresa." }).waitFor();
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log("Reports: cancelled read stays discarded; reload clears data; missing company blocks file selection; no runtime errors");
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(output, { recursive: true, force: true });
}
