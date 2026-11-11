import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { Worker } from "node:worker_threads";
import { parseFiscalXml, singleElement } from "./xml.ts";
import { NFSE_NAMESPACE } from "./dps.ts";

type SchemaFile = { fileName: string; contents: string };
let cached: Promise<SchemaFile[]> | undefined;
const SERIES_PATTERN = '<xs:pattern value="^0{0,4}\\d{1,5}$"/>';

async function schemas(): Promise<SchemaFile[]> {
  const provenance = JSON.parse(await readFile(join(process.cwd(), "integrations/nfse/provenance.json"), "utf8")) as {
    files: { file: string; sha256: string }[];
  };
  return Promise.all(provenance.files.map(async entry => {
    if (!/^integrations\/nfse\/schemas\/1\.01\/[\w.-]+\.xsd$/.test(entry.file)) throw new Error("Fiscal schema unavailable");
    const bytes = await readFile(join(process.cwd(), "integrations/nfse/schemas/1.01", basename(entry.file)));
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Fiscal schema integrity failure");
    let contents = bytes.toString("utf8");
    if (basename(entry.file) === "tiposSimples_v1.01.xsd") {
      // libxml2 treats ^/$ as literals in XSD regex. Anexo I/RN144 requires numeric series.
      // Adapt exactly this facet in memory; preserve upstream bytes and enforce RN144 below.
      if (contents.split(SERIES_PATTERN).length !== 2) throw new Error("Unsupported fiscal schema revision");
      contents = contents.replace(SERIES_PATTERN, '<xs:pattern value="0{0,4}\\d{1,5}"/>');
    }
    return { fileName: basename(entry.file), contents };
  }));
}

export async function validateFiscalSchema(xml: string, kind: "DPS" | "NFSe"): Promise<boolean> {
  if (kind !== "DPS" && kind !== "NFSe") return false;
  try {
    const doc = parseFiscalXml(xml);
    if (doc.documentElement!.localName !== kind || doc.documentElement!.namespaceURI !== NFSE_NAMESPACE) return false;
    const dps = doc.getElementsByTagNameNS(NFSE_NAMESPACE, "infDPS");
    if (dps.length !== 1) return false;
    const series = singleElement(dps.item(0)!, NFSE_NAMESPACE, "serie").textContent ?? "";
    if (!/^\d{5}$/.test(series) || BigInt(series) < 1n || BigInt(series) > 49999n) return false;
    cached ??= schemas().catch(error => { cached = undefined; throw error; });
    const files = await cached;
    const schema = files.find(file => file.fileName === `${kind}_v1.01.xsd`)!;
    return await new Promise<boolean>(resolve => {
      const worker = new Worker(join(process.cwd(), "server/schema-worker.cjs"), {
        workerData: { xml, schema, preload: files.filter(file => file !== schema) },
        resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
      });
      let finished = false;
      const finish = (valid: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(valid);
      };
      const timer = setTimeout(() => finish(false), 8000);
      worker.once("message", result => finish(result?.valid === true));
      worker.once("error", () => finish(false));
      worker.once("exit", () => finish(false));
    });
  } catch {
    return false;
  }
}
