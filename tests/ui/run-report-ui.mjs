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
    "@/app/painel/navigation-actions": path.join(root, "tests/ui/workflow-actions.ts"),
    "@/app/painel/conta/actions": path.join(root, "tests/ui/workflow-actions.ts"),
    "@/app/painel/conta/assinatura/actions": path.join(root, "tests/ui/workflow-actions.ts"),
    "@/app/painel/certificados/actions": path.join(root, "tests/ui/workflow-actions.ts"),
    "@/app/painel/importacoes/review-actions": path.join(root, "tests/ui/workflow-actions.ts"),
    "@/app/painel/notas/actions": path.join(root, "tests/ui/workflow-actions.ts"),
    "next/navigation": path.join(root, "tests/ui/navigation.ts"),
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
    assert.equal(await page.getByRole("link", { name: "Segurança", exact: true }).count(), 0);
    assert.equal(await page.getByText("Configurar autenticador", { exact: true }).count(), 0);
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

  await page.goto(`${origin}/?persist=1`);
  await page.getByLabel("Empresa emissora").selectOption("test-company-a");
  await page.getByLabel("Relatório mensal da Shopee", { exact: true }).setInputFiles(fixture);
  await page.getByRole("button", { name: "Conferir relatório", exact: true }).click();
  await page.getByRole("heading", { name: "Comissões por vendedor." }).waitFor();
  assert.equal(await page.evaluate(() => window.workflowUiTest.calls), 0);
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await page.getByRole("link", { name: "Abrir importação", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.workflowUiTest.calls), 1);
  assert.equal(await page.evaluate(() => window.workflowUiTest.companyId), "test-company-a");
  assert.ok(await page.evaluate(() => window.workflowUiTest.fileSize > 0));
  console.log("Reports: explicit save hands original File and selected company to the test boundary exactly once");

  for (const width of [1440,390,320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?screen=certificate`);
    await page.getByLabel("Arquivo A1 (.pfx ou .p12)", { exact: true }).setInputFiles({ name: "synthetic.pfx", mimeType: "application/x-pkcs12", buffer: Buffer.from("SYNTHETIC FIXTURE NOT A REAL CERTIFICATE") });
    await page.getByLabel("Senha do certificado, se definida", { exact: true }).fill("test-password-not-real");
    await page.getByRole("button", { name: "Proteger certificado", exact: true }).click();
    await page.getByText("Envio sintético conferido, sem armazenar certificado.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.workflowUiTest.passwordLength), 22);
    assert.equal(await page.locator("#certificate-password").inputValue(), "");
    await page.getByRole("button", { name: "Verificar acesso à homologação", exact: true }).click();
    await page.getByText("Verificação sintética sem conexão fiscal.", { exact: true }).waitFor();
    await page.getByText("Documentação sintética pendente; nenhuma conexão oficial. Referência: NFSE_CONTRACT_PENDING.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", {name:"Conferir dados fiscais", exact:true}).getAttribute("href"), "/painel/empresas/test-company/fiscal?secao=servico");
    await page.getByText("Detalhes da verificação", { exact: true }).click();
    await page.getByText(/Diagnóstico: nfse-adn-v1/).waitFor();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText: async text => {window.workflowUiTest.clipboard = text;}}}));
    await page.getByRole("button", {name: "Copiar diagnóstico", exact: true}).click();
    await page.getByText("Diagnóstico copiado.", {exact: true}).waitFor();
    assert.ok(await page.evaluate(() => window.workflowUiTest.clipboard?.includes("nfse-adn-v1")));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, `shots/reports/certificate-${width}.png`), fullPage: true });
    console.log(`Workflow ${width}px: A1 fixture form and cleared password, no overflow`);
  }
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?screen=mei`);
    const activate = page.getByRole("button", {name: "Usar configuração MEI", exact: true});
    assert.equal(await activate.isDisabled(), true);
    assert.equal(await page.locator('.mei-setup input[type="text"], .mei-setup select, .mei-setup textarea').count(), 0, "simple MEI setup must not require typing technical fields");
    await page.screenshot({path:path.join(root,`shots/reports/mei-initial-${width}.png`),fullPage:true});
    assert.equal(await page.evaluate(() => window.workflowUiTest.calls), 0);
    await page.getByRole("checkbox").check();
    await activate.click();
    await page.getByRole("alert").filter({hasText: "Falha sintética"}).waitFor();
    assert.equal(await page.getByRole("checkbox").isChecked(), true);
    await page.getByText("Vou emitir comissões de um período anterior", {exact:true}).click();
    await page.getByLabel("Usar esta configuração a partir de", {exact:true}).fill("2026-10-01");
    await activate.click();
    await page.getByRole("link", {name:"Preparar nota avulsa", exact:true}).waitFor();
    assert.equal(await page.getByRole("button", {name:"Usar configuração MEI",exact:true}).count(), 0);
    const payload = JSON.parse(await page.evaluate(() => window.workflowUiTest.reviewJson));
    assert.deepEqual(payload, {version:"0",confirmActivity:"on",validFrom:"2026-10-01"});
    assert.equal(await page.getByRole("link",{name:"Preparar nota avulsa",exact:true}).getAttribute("href"), "/painel/notas/nova?empresa=test-company");
    assert.equal(await page.getByRole("link",{name:"Personalizar serviço e configurações",exact:true}).getAttribute("href"), "/painel/empresas/test-company/fiscal?modo=completo");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `MEI overflow ${width}`);
    await page.screenshot({path:path.join(root,`shots/reports/mei-${width}.png`),fullPage:true});
    await page.goto(`${origin}/?screen=mei&saved=1`);
    await page.getByText("Configuração personalizada já salva",{exact:true}).waitFor();
    assert.equal(await page.getByRole("checkbox").count(),0);
    assert.equal(await page.evaluate(() => window.workflowUiTest.calls),0,"opening an existing MEI configuration must not overwrite it");
    console.log(`MEI ${width}px: confirmation without technical fields, preserved retry/date, no overwrite or overflow`);
  }
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?screen=fiscal`);
    assert.equal(await page.getByLabel("Município emissor · código IBGE", { exact: false }).inputValue(), "3550308");
    assert.equal(await page.locator('[name="nationalTaxCode"]').inputValue(), "");
    assert.equal(await page.locator('[name="issTaxation"]').inputValue(), "");
    for (const [name, value] of Object.entries({ series: "1", validFrom: "2026-01-01", evidence: "Orientação sintética", serviceMunicipality: "3550308", nationalTaxCode: "010101", description: "Serviço sintético de teste" })) {
      await page.locator(`[name="${name}"]`).fill(value);
    }
    for (const [name, value] of Object.entries({ specialRegime: "0", issTaxation: "1", issWithholding: "1", "totals.mode": "not_informed" })) {
      await page.locator(`[name="${name}"]`).selectOption(value);
    }
    await page.getByRole("button", { name: "Salvar configuração fiscal", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Falha sintética" }).waitFor();
    assert.equal(await page.locator('[name="description"]').inputValue(), "Serviço sintético de teste", "failed save must preserve entered data");
    await page.getByRole("button", { name: "Salvar configuração fiscal", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Versão sintética 1 salva" }).waitFor();
    assert.equal(await page.locator('[name="version"]').inputValue(), "1");
    assert.equal(await page.locator('[name="nationalTaxCode"]').inputValue(), "010101");
    await page.getByRole("button", { name: "Salvar configuração fiscal", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Versão sintética 2 salva" }).waitFor();
    await page.locator('[name="foreignTrade"]').check();
    await page.locator('[name="issTaxation"]').selectOption("3");
    await page.locator('[name="totals.mode"]').selectOption("percentages");
    assert.equal(await page.locator('[name="foreignTrade.amount"]').count(), 0, "a per-note foreign value must not be stored as a shared profile value");
    assert.ok(await page.locator('[name="exportResultCountry"]').isVisible());
    assert.ok(await page.locator('[name="totals.federal"]').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Fiscal profile overflow at ${width}`);
    await page.screenshot({ path: path.join(root, `shots/reports/fiscal-${width}.png`), fullPage: true });
    console.log(`Fiscal profile ${width}px: no inferred tax fields, preserves edits on failure/success, version advances, foreign controls, no overflow`);
  }
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?screen=review`);
    assert.equal(await page.locator('#review-recipient').inputValue(), "");
    assert.equal(await page.locator('#review-competence').inputValue(), "");
    assert.equal(await page.getByRole('button', { name: 'Preparar prévia das notas' }).isDisabled(), true);
    await page.locator('#review-competence').fill('2026-10-31');
    await page.locator('#review-type').fill('Comissão sintética de teste');
    await page.locator('#review-evidence').fill('Orientação sintética de teste');
    await page.locator('#review-recipient').selectOption('reported_sellers');
    await page.locator('#review-grouping').selectOption('per_row');
    await page.locator('.review-candidates details').nth(1).locator('summary').click();
    for (const [name, value] of Object.entries({ 'address.postalCode': '000000', 'address.city': 'Synthetic city', 'address.province': 'Synthetic province', 'address.street': 'Synthetic street', 'address.number': '1', 'address.district': 'Synthetic district', foreignAmount: '2.20' })) {
      await page.locator(`[name="row-3.${name}"]`).fill(value);
    }
    await page.locator('[name="confirmRecipientRole"]').check();
    await page.getByRole('button', { name: 'Preparar prévia das notas' }).click();
    await page.getByRole('alert').filter({ hasText: 'Revisão sintética precisa' }).waitFor();
    assert.equal(await page.locator('#review-evidence').inputValue(), 'Orientação sintética de teste');
    assert.equal(await page.locator('[name="row-3.address.street"]').inputValue(), 'Synthetic street');
    await page.getByRole('button', { name: 'Preparar prévia das notas' }).click();
    await page.getByRole('status').filter({ hasText: 'Revisão sintética salva' }).waitFor();
    const payload = JSON.parse(await page.evaluate(() => window.workflowUiTest.reviewJson));
    assert.equal(payload.competenceDate, '2026-10-31');
    assert.equal(payload.confirmRecipientRole, true);
    assert.equal(payload.recipients[1].foreignAmount, '2.20');
    assert.equal(payload.recipients[1].person.address.country, 'CN');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Review overflow at ${width}`);
    await page.screenshot({ path: path.join(root, `shots/reports/review-${width}.png`), fullPage: true });
    await page.goto(`${origin}/?screen=review-confirmation`);
    assert.equal(await page.getByRole('button', { name: 'Confirmar esta revisão' }).isDisabled(), true);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirmar esta revisão' }).click();
    await page.getByRole('status').filter({ hasText: 'Confirmação sintética' }).waitFor();
    assert.equal(await page.evaluate(() => window.workflowUiTest.calls), 1);
    console.log(`Review ${width}px: explicit competence/role, foreign address/value, preserves entered data, gated confirmation, no overflow`);
  }
  await page.goto(`${origin}/?screen=review`);
  await page.locator('#review-recipient').selectOption('single_recipient');
  await page.locator('[name="common.kind"]').selectOption('foreign');
  for (const [name, value] of Object.entries({ document: 'SYNTHETIC-NIF', legalName: 'Synthetic common recipient', country: 'CN', 'address.postalCode': '000000', 'address.city': 'Synthetic city', 'address.province': 'Synthetic province', 'address.street': 'Synthetic street', 'address.number': '1', 'address.district': 'Synthetic district' })) {
    await page.locator(`[name="common.${name}"]`).fill(value);
  }
  assert.equal(await page.locator('[name="row-2.foreignAmount"]').inputValue(), '');
  assert.equal(await page.locator('[name="row-3.foreignAmount"]').inputValue(), '');
  await page.locator('[name="row-2.foreignAmount"]').fill('1.10');
  await page.locator('[name="row-3.foreignAmount"]').fill('2.20');
  await page.locator('#review-competence').fill('2026-10-31');
  await page.locator('#review-type').fill('Synthetic commission');
  await page.locator('#review-evidence').fill('Synthetic accounting reference');
  await page.locator('#review-grouping').selectOption('same_recipient');
  await page.locator('[name="confirmRecipientRole"]').check();
  await page.getByRole('button', { name: 'Preparar prévia das notas' }).click();
  await page.getByRole('alert').filter({ hasText: 'Revisão sintética precisa' }).waitFor();
  const commonPayload = JSON.parse(await page.evaluate(() => window.workflowUiTest.reviewJson));
  assert.equal(commonPayload.commonRecipient.address.country, 'CN');
  assert.deepEqual(commonPayload.recipients.map(row => row.foreignAmount), ['1.10', '2.20']);
  await page.locator('[name="common.kind"]').selectOption('no_nif');
  assert.equal(await page.locator('[name="common.document"]').inputValue(), '');
  await page.locator('[name="common.document"]').selectOption('1');
  await page.getByRole('button', { name: 'Preparar prévia das notas' }).click();
  await page.getByRole('status').filter({ hasText: 'Revisão sintética salva' }).waitFor();
  const withoutNif = JSON.parse(await page.evaluate(() => window.workflowUiTest.reviewJson));
  assert.equal(withoutNif.commonRecipient.kind, 'no_nif');
  assert.equal(withoutNif.commonRecipient.document, '1');
  await page.locator('[name="common.country"]').fill('BR');
  assert.equal(await page.locator('[name="row-2.foreignAmount"]').count(), 0);
  console.log('Review: explicit common foreign recipient preserves per-row currency values; country change clears stale exterior fields');
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?screen=standalone`);
    assert.equal(await page.locator('[name="amount"]').inputValue(), '');
    assert.equal(await page.locator('[name="competenceDate"]').inputValue(), '2026-11-11');
    await page.getByLabel('Quanto você vai faturar?', { exact: false }).fill('862,36');
    await page.screenshot({ path: path.join(root, `shots/reports/standalone-ready-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Preparar nota em homologação' }).click();
    await page.getByRole('alert').filter({ hasText: 'Falha sintética preserva' }).waitFor();
    assert.equal(await page.locator('[name="amount"]').inputValue(), '862,36');
    await page.getByRole('button', { name: 'Preparar nota em homologação' }).click();
    await page.getByRole('link', { name: 'Acompanhar operação' }).waitFor();
    const payload = JSON.parse(await page.evaluate(() => window.workflowUiTest.standaloneJson));
    assert.equal(payload.recipient.document, '11444777000161');
    assert.equal(payload.configuration.nationalTaxCode, '010101');
    assert.equal(payload.amount, '862,36');
    const requestIds = await page.evaluate(() => window.workflowUiTest.requestIds);
    assert.equal(requestIds[0], requestIds[1], 'retry after uncertain acknowledgement keeps same logical request');
    await page.getByRole('button', { name: 'Preparar outra nota' }).click();
    await page.waitForFunction(() => document.activeElement.id === 'single-amount');
    assert.equal(await page.locator('[name="amount"]').inputValue(), '');
    await page.locator('[name="amount"]').fill('1.250,50');
    await page.getByText('Alterar dados da nota', { exact: true }).click();
    await page.locator('[name="description"]').fill('Descrição sintética alterada pelo usuário');
    await page.locator('[name="single-recipient.legalName"]').fill('Tomador sintético editado');
    assert.equal(await page.locator('.standalone-recipient > strong').innerText(), 'Tomador sintético editado');
    await page.getByRole('button', { name: 'Preparar nota em homologação' }).click();
    await page.getByRole('link', { name: 'Acompanhar operação' }).waitFor();
    const nextIds = await page.evaluate(() => window.workflowUiTest.requestIds);
    assert.notEqual(nextIds[2], nextIds[1]);
    assert.equal(await page.evaluate(() => window.workflowUiTest.templateVersion), '1');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Standalone overflow ${width}`);
    await page.screenshot({ path: path.join(root, `shots/reports/standalone-${width}.png`), fullPage: true });
    await page.goto(`${origin}/?screen=operations`);
    const uncertain = page.locator('.fiscal-operation').nth(1);
    assert.equal(await uncertain.getByRole('button', { name: 'Consultar novamente' }).count(), 1);
    assert.equal(await uncertain.getByRole('button', { name: 'Cancelar preparação' }).count(), 0);
    await uncertain.getByRole('button', { name: 'Consultar novamente' }).click();
    await uncertain.getByRole('status').filter({ hasText: 'Ação sintética resume' }).waitFor();
    assert.equal(await page.locator('.fiscal-operation').nth(2).getByRole('button').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Operations overflow ${width}`);
    await page.screenshot({ path: path.join(root, `shots/reports/operations-${width}.png`), fullPage: true });
    console.log(`Invoices ${width}px: amount-only with defaults, retry nonce, editable details, new note, consultation-only uncertainty, no overflow`);
  }
  assert.deepEqual(errors, []);
  console.log("Reports: cancelled read stays discarded; reload clears data; missing company blocks file selection; no runtime errors");
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(output, { recursive: true, force: true });
}
