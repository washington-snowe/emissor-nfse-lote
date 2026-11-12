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
const output = await mkdtemp(path.join(tmpdir(), "nfse-workspace-ui-"));
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
  for (const width of [1440,1024,820,768,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.goto(`${origin}/?screen=plans`);
    const nav=width>900 ? page.locator('.workspace-sidebar') : page.locator('.workspace-mobile-navigation');
    if(width<=900) await nav.locator(':scope > summary').click();
    for(const name of ['Início','Notas','Notas em lote','Nota avulsa','Cadastro','Serviço','Avançado','Certificado','Perfil','Login','Assinatura','Indicações']) await nav.getByRole('link',{name,exact:true}).waitFor();
    assert.equal(await nav.getByRole('link',{name:'API',exact:true}).count(),0);
    await nav.getByLabel('Empresa em uso').selectOption('00000000-0000-4000-8000-000000000002');
    await page.waitForFunction(()=>window.workflowUiTest.companyId==='00000000-0000-4000-8000-000000000002');
    if(width<=900) await nav.locator(':scope > summary').click();
    await page.getByRole('radio',{name:'Trimestral',exact:false}).check();
    assert.equal(await page.locator('.plan-table tbody tr').count(),5);
    await page.getByText('R$ 40,00',{exact:true}).waitFor();
    await page.getByText('R$ 401,80',{exact:true}).waitFor();
    await page.locator('.plan-table tbody tr').first().getByRole('button',{name:'Escolher plano',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Checkout sintético'}).waitFor();
    await page.screenshot({path:path.join(root,`shots/reports/navigation-plans-${width}.png`),fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(node=>({tag:node.tagName,class:node.className,width:node.getBoundingClientRect().width,right:node.getBoundingClientRect().right})).filter(item=>item.right>innerWidth+1).slice(0,12)));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Account overflow at ${width}`);
    await page.screenshot({path:path.join(root,`shots/reports/navigation-plans-${width}.png`),fullPage:true});
    await page.goto(`${origin}/?screen=profile`);
    await page.getByLabel('Nome',{exact:true}).fill('Perfil sintético alterado');
    await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Falha sintética de perfil'}).waitFor();
    assert.equal(await page.getByLabel('Nome',{exact:true}).inputValue(),'Perfil sintético alterado');
    await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Perfil sintético salvo'}).waitFor();
    assert.equal(await page.locator('[name="version"]').inputValue(),'1');
    await page.goto(`${origin}/?screen=login`);
    await page.getByLabel('Senha atual',{exact:true}).fill('synthetic-current-password');
    await page.getByLabel('Nova senha',{exact:true}).fill('synthetic-new-password');
    await page.getByLabel('Confirme a nova senha',{exact:true}).fill('synthetic-new-password');
    await page.getByRole('button',{name:'Atualizar senha',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Acesso sintético atualizado'}).waitFor();
    for(const input of await page.locator('input[type="password"]').all()) assert.equal(await input.inputValue(),'');
    console.log(`Account ${width}px: full menu without API, company switch, quarterly prices, profile error preservation, login password cleared`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(output, { recursive: true, force: true });
}
