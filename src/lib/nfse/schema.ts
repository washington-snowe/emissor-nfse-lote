import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { Worker } from "node:worker_threads";
import { parseFiscalXml, singleElement } from "./xml.ts";
import { NFSE_NAMESPACE } from "./dps.ts";
import { SCHEMA_FIELDS } from './schema-evidence.ts';

type SchemaFile = { fileName: string; contents: string };
export type FiscalSchemaRevision='homologation-20261020'|'production-20260209';
const DEFAULT_REVISION:FiscalSchemaRevision='homologation-20261020';
const cached=new Map<FiscalSchemaRevision,Promise<SchemaFile[]>>();
const SERIES_PATTERN = '<xs:pattern value="^0{0,4}\\d{1,5}$"/>';

async function schemas(revision:FiscalSchemaRevision): Promise<SchemaFile[]> {
  if(!['homologation-20261020','production-20260209'].includes(revision))throw new Error('Unknown fiscal schema revision');
  const legacy=revision==='production-20260209';
  const directory=legacy?'schemas/1.01':'schemas/homologation/20261020';
  const manifest=legacy?'provenance.json':'homologation-20261020.provenance.json';
  const provenance = JSON.parse(await readFile(join(process.cwd(),'integrations/nfse',manifest), "utf8")) as {
    files: { file: string; sha256: string }[];
  };
  return Promise.all(provenance.files.map(async entry => {
    if (entry.file!==`integrations/nfse/${directory}/${basename(entry.file)}`||!/^\w[\w.-]*\.xsd$/.test(basename(entry.file))) throw new Error("Fiscal schema unavailable");
    const bytes = await readFile(join(process.cwd(),'integrations/nfse',directory,basename(entry.file)));
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Fiscal schema integrity failure");
    let contents = bytes.toString("utf8");
    if (legacy&&basename(entry.file) === "tiposSimples_v1.01.xsd") {
      // libxml2 treats ^/$ as literals in XSD regex. Anexo I/RN144 requires numeric series.
      // Adapt exactly this facet in memory; preserve upstream bytes and enforce RN144 below.
      if (contents.split(SERIES_PATTERN).length !== 2) throw new Error("Unsupported fiscal schema revision");
      contents = contents.replace(SERIES_PATTERN, '<xs:pattern value="0{0,4}\\d{1,5}"/>');
    }
    return { fileName: basename(entry.file), contents };
  }));
}

export async function validateFiscalSchema(xml: string, kind: "DPS" | "NFSe", revision:FiscalSchemaRevision=DEFAULT_REVISION): Promise<boolean> {
  return validateFiscalDocuments([xml], kind,revision);
}

export async function validateFiscalDocuments(xmls: string[], kind: "DPS" | "NFSe",revision:FiscalSchemaRevision=DEFAULT_REVISION): Promise<boolean> {
  return (await inspectFiscalDocuments(xmls,kind,revision)).valid;
}

/** Fixed field names only; raw XSD output may contain taxpayer data. */
export async function inspectFiscalDocuments(xmls: string[], kind: "DPS" | "NFSe",revision:FiscalSchemaRevision=DEFAULT_REVISION):Promise<{valid:boolean;completed:boolean;fields:string[]}> {
  const unavailable={valid:false,completed:false,fields:[] as string[]};
  if (kind !== "DPS" && kind !== "NFSe") return unavailable;
  try {
    if (!Array.isArray(xmls) || xmls.length < 1 || xmls.length > 500 || xmls.reduce((size, xml) => size + Buffer.byteLength(xml), 0) > 4_000_000) return unavailable;
    for (const xml of xmls) {
      const doc = parseFiscalXml(xml);
      if (doc.documentElement!.localName !== kind || doc.documentElement!.namespaceURI !== NFSE_NAMESPACE) return {valid:false,completed:true,fields:[kind]};
      const dps = doc.getElementsByTagNameNS(NFSE_NAMESPACE, "infDPS");
      if (dps.length !== 1) return {valid:false,completed:true,fields:['infDPS']};
      const series = singleElement(dps.item(0)!, NFSE_NAMESPACE, "serie").textContent ?? "";
      if (!/^\d{5}$/.test(series) || BigInt(series) < 1n || BigInt(series) > 49999n) return {valid:false,completed:true,fields:['serie']};
    }
    if(!cached.has(revision))cached.set(revision,schemas(revision).catch(error=>{cached.delete(revision);throw error;}));
    const files = await cached.get(revision)!;
    const schema = files.find(file => file.fileName === `${kind}_v1.01.xsd`)!;
    return await new Promise<{valid:boolean;completed:boolean;fields:string[]}>(resolve => {
      const worker = new Worker(join(process.cwd(), "server/schema-worker.cjs"), {
        workerData: { xmls, schema, preload: files.filter(file => file !== schema), diagnosticFields:SCHEMA_FIELDS },
        resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
      });
      let finished = false;
      const finish = (result:typeof unavailable) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(result);
      };
      const timer = setTimeout(() => finish(unavailable), 8000);
      worker.once("message", result => finish({valid:result?.valid===true,completed:typeof result?.valid==='boolean',fields:Array.isArray(result?.fields)?result.fields.filter((field:unknown)=>SCHEMA_FIELDS.some(name=>name===field)).slice(0,10):[]}));
      worker.once("error", () => finish(unavailable));
      worker.once("exit", () => finish(unavailable));
    });
  } catch {
    return unavailable;
  }
}
