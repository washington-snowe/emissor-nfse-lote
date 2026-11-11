import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tools = process.env.UI_TOOLS_DIR;
if (!tools) throw new Error("Set UI_TOOLS_DIR to a directory containing esbuild and playwright-core; see docs/cadastro-empresas.md.");
const require = createRequire(import.meta.url);
const { build } = require(path.join(tools, "esbuild"));
const { chromium } = require(path.join(tools, "playwright-core"));
const output = await mkdtemp(path.join(tmpdir(), "nfse-company-ui-"));
await mkdir(path.join(root, "shots/companies"), { recursive: true });
await build({ entryPoints: [path.join(root, "tests/ui/company-entry.tsx")], bundle: true, jsx: "automatic", outfile: path.join(output, "bundle.js"), tsconfig: path.join(root, "tsconfig.json"), alias: {
  "@/app/painel/empresas/actions": path.join(root, "tests/ui/company-actions.ts"),
  "@/app/auth/actions": path.join(root, "tests/ui/auth-actions.ts"),
  "next/navigation": path.join(root, "tests/ui/navigation.ts"),
  "next/link": path.join(root, "tests/ui/link.tsx"),
} });

const server = createServer(async (req, res) => {
  try {
    const files = {
      "/bundle.js": [path.join(output, "bundle.js"), "text/javascript"],
      "/globals.css": [path.join(root, "src/app/globals.css"), "text/css"],
      "/motion.css": [path.join(root, "public/assets/motion/motion.css"), "text/css"],
      "/outfit.woff2": [path.join(root, "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"), "font/woff2"],
    };
    if (files[req.url]) { const [filename, type] = files[req.url]; res.setHeader("Content-Type", type); res.end(await readFile(filename)); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/motion.css"><style>@font-face{font-family:"Outfit Variable";src:url(/outfit.woff2) format("woff2");font-weight:100 900}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  } catch { res.statusCode = 500; res.end("Fixture unavailable"); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", headless: true });
  const errors = [];
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.name));
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    await page.goto(origin);
    await page.getByLabel("CNPJ", { exact: true }).fill("11.222.333/0001-81");
    await page.getByText("Dados preenchidos", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Razão social *", { exact: true }).inputValue(), "Empresa de teste de interface");
    assert.equal(await page.locator("#municipality_code").inputValue(), "3550308");
    assert.equal(await page.evaluate(() => window.companyUiTest.calls), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    await page.screenshot({ path: path.join(root, `shots/companies/${width}.png`), fullPage: true });
    await page.locator("#legal_name").fill("Empresa revisada no teste");
    await page.getByRole("button", { name: "Salvar empresa", exact: true }).click();
    await page.waitForFunction(() => window.companyUiTest.path === "/painel/empresas?salvo=1");
    assert.equal(await page.evaluate(() => window.companyUiTest.calls), 1);
    assert.equal(await page.evaluate(() => window.companyUiTest.saved[0].legal_name), "Empresa revisada no teste");
    console.log(`UI ${width}px: autofill, review, save, no horizontal overflow`);
  }
  await page.goto(origin);
  await page.evaluate(() => window.companyUiTest.mode = "error");
  await page.locator("#cnpj").fill("11222333000181");
  await page.getByText("Consulta de teste indisponível.").waitFor();
  await page.locator("#legal_name").fill("Cadastro manual de teste");
  await page.locator("#tax_regime").selectOption("simples");
  await page.getByRole("button", { name: "Salvar empresa", exact: true }).click();
  await page.waitForFunction(() => window.companyUiTest.saved.length === 1);
  console.log("UI: provider outage preserves manual registration");

  await page.goto(origin);
  await page.evaluate(() => window.companyUiTest.mode = "slow");
  await page.locator("#cnpj").fill("11222333000181");
  await page.waitForFunction(() => window.companyUiTest.calls === 1);
  await page.locator("#cnpj").fill("12ABC34501DE35");
  await page.getByText("Dados preenchidos", { exact: true }).waitFor();
  assert.equal(await page.locator("#legal_name").inputValue(), "Empresa alfanumérica de teste");
  console.log("UI: stale response cannot fill a different CNPJ");

  await page.goto(origin);
  await page.evaluate(() => window.companyUiTest.mode = "slow");
  await page.locator("#cnpj").fill("11222333000181");
  await page.waitForFunction(() => window.companyUiTest.calls === 1);
  await page.getByRole("button", { name: /Preencher manualmente/ }).click();
  await page.locator("#legal_name").fill("Preenchido pelo usuário no teste");
  await page.waitForTimeout(1100);
  assert.equal(await page.locator("#legal_name").inputValue(), "Preenchido pelo usuário no teste");
  assert.deepEqual(errors, []);
  console.log("UI: late response preserves manual edits; no runtime errors");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(output, { recursive: true, force: true });
}
