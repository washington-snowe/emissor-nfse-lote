import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, mkdir, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import serverChromium from "@sparticuz/chromium";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { panelPreviewViewport } from "../src/lib/panel-preview.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(tmpdir(), "rex-panel-preview-"));
const output = path.join(root, "public/brand/rex-panel-desktop.webp");
let server;
let browser;
try {
  await build({
    entryPoints: [path.join(root, "scripts/panel-preview/entry.tsx")],
    bundle: true, minify: true, jsx: "automatic",
    outfile: path.join(temporary, "preview.js"),
    tsconfig: path.join(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "next/link": path.join(root, "scripts/panel-preview/link.tsx"),
      "@/app/auth/actions": path.join(root, "scripts/panel-preview/actions.ts"),
      "@/app/painel/navigation-actions": path.join(root, "scripts/panel-preview/actions.ts"),
    },
  });
  const files = new Map([
    ["/preview.js", [path.join(temporary, "preview.js"), "text/javascript"]],
    ["/globals.css", [path.join(root, "src/app/globals.css"), "text/css"]],
    ["/experience.css", [path.join(root, "src/app/experience.css"), "text/css"]],
    ["/panel.css", [path.join(root, "src/app/painel/panel.css"), "text/css"]],
    ["/outfit.woff2", [path.join(root, "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"), "font/woff2"]],
    ["/mono.woff2", [path.join(root, "node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2"), "font/woff2"]],
    ["/brand/rex-logo-small.webp", [path.join(root, "public/brand/rex-logo-small.webp"), "image/webp"]],
  ]);
  server = createServer(async (request, response) => {
    try {
      const file = files.get(request.url);
      if (file) {
        response.setHeader("Content-Type", file[1]);
        response.end(await readFile(file[0]));
        return;
      }
      if (request.url !== "/") { response.writeHead(404).end(); return; }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/experience.css"><link rel="stylesheet" href="/panel.css"><style>@font-face{font-family:"Outfit Variable";src:url(/outfit.woff2);font-weight:100 900}@font-face{font-family:"DM Mono";src:url(/mono.woff2)}</style></head><body><div id="root"></div><script src="/preview.js"></script></body></html>`);
    } catch { response.writeHead(500).end("Preview resource unavailable."); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.PANEL_PREVIEW_CHROME_PATH || await serverChromium.executablePath();
  const environment = Object.fromEntries(["PATH", "TMPDIR", "LD_LIBRARY_PATH", "FONTCONFIG_PATH", "LANG"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  browser = await chromium.launch({ executablePath, args: serverChromium.args, headless: true, env: environment });
  const page = await browser.newPage({ viewport: panelPreviewViewport, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.name));
  // The browser can only read the local fixture's fixed resources.
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  await page.locator(".overview-dashboard").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  assert.ok(await page.locator("tbody tr").count() > 0);
  assert.equal(await page.locator(".workspace-sidebar a[aria-current=page]").getAttribute("href"), `/painel?empresa=00000000-0000-4000-8000-000000000001`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), panelPreviewViewport.width);
  assert.deepEqual(errors, []);
  const screenshot = await page.screenshot({ fullPage: false });
  const encoded = await sharp(screenshot).webp({ quality: 92 }).withMetadata({
    exif: { IFD0: { ImageDescription: "RexNotas home captured from shared application components at build time. Synthetic demonstration data only." } },
  }).toBuffer();
  await mkdir(path.dirname(output), { recursive: true });
  const staged = path.join(path.dirname(output), ".rex-panel-desktop.webp.tmp");
  await writeFile(staged, encoded);
  await rename(staged, output);
  console.log("Panel preview generated from shared home components (synthetic data).");
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
