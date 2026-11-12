import { gzipSync, gunzipSync } from "node:zlib";
import { MAX_FISCAL_XML_BYTES } from "./xml.ts";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
function model(raw: unknown, models: ObjectValue, depth = 0): ObjectValue {
  if (depth > 15) throw new Error("Unsupported official contract");
  const schema = object(raw);
  if (typeof schema.$ref === "string") {
    if (!/^#\/(?:definitions|components\/schemas)\/[^/]+$/.test(schema.$ref)) throw new Error("Unsupported official reference");
    return model(models[decodeURIComponent(schema.$ref.split("/").at(-1)!)], models, depth + 1);
  }
  if (schema.oneOf || schema.anyOf) throw new Error("Unsupported official union");
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map(part => model(part, models, depth + 1));
    return { properties: Object.assign({}, ...parts.map(part => object(part.properties))), required: parts.flatMap(part => Array.isArray(part.required) ? part.required : []) };
  }
  return schema;
}
function bodySchema(operation: ObjectValue, response: boolean, models: ObjectValue): ObjectValue {
  let raw: unknown;
  if (response) {
    const responses = object(operation.responses);
    const result = object(responses["200"] ?? responses["201"]);
    raw = result.schema ?? object(object(result.content)["application/json"]).schema;
  } else {
    raw = object(object(object(operation.requestBody).content)["application/json"]).schema;
    if (!raw && Array.isArray(operation.parameters)) raw = object(operation.parameters.find(item => object(item).in === "body")).schema;
  }
  return model(raw, models);
}
export type SupportedNfseContract = { dpsPath: string; nfsePath: string; errorCodesKey: string | null; errorsKey: string | null };

/** Conditional adapter: disabled unless the captured official OpenAPI actually declares every required field/path. */
export function supportedNfseContract(value: unknown): SupportedNfseContract | null {
  try {
    const contract = object(value), paths = object(contract.paths), models = object(contract.models);
    const post = object(object(paths["/nfse"]).post);
    const request = bodySchema(post, false, models), response = bodySchema(post, true, models);
    if (object(object(request.properties).dpsXmlGZipB64).type !== "string" ||
      (Array.isArray(request.required) && request.required.some(key => key !== "dpsXmlGZipB64")) ||
      object(object(response.properties).nfseXmlGZipB64).type !== "string" || object(object(response.properties).chaveAcesso).type !== "string") return null;
    const dpsPath = Object.keys(paths).find(path => /^\/dps\/\{[A-Za-z][A-Za-z0-9_]*\}$/.test(path) &&
      object(object(bodySchema(object(object(paths[path]).get), true, models).properties).chaveAcesso).type === "string");
    const nfsePath = Object.keys(paths).find(path => /^\/nfse\/\{[A-Za-z][A-Za-z0-9_]*\}$/.test(path) &&
      object(object(bodySchema(object(object(paths[path]).get), true, models).properties).nfseXmlGZipB64).type === "string");
    if (!dpsPath || !nfsePath) return null;
    let errorsKey: string | null = null, errorCodesKey: string | null = null;
    const failures = object(post.responses);
    for (const code of ["400", "422"]) {
      const errorResponse = object(failures[code]);
      const shape = model(errorResponse.schema ?? object(object(errorResponse.content)["application/json"]).schema, models);
      const properties = object(shape.properties);
      const candidate = Object.keys(properties).find(key => /^erros$/i.test(key));
      if (candidate) {
        const items = model(object(properties[candidate]).items, models);
        const field = Object.keys(object(items.properties)).find(key => /^codigo$/i.test(key) && object(object(items.properties)[key]).type === "string");
        if (field) { errorsKey = candidate; errorCodesKey = field; }
      }
    }
    return { dpsPath, nfsePath, errorsKey, errorCodesKey };
  } catch { return null; }
}

export function dpsTransportBody(xml: string): Buffer {
  if (Buffer.byteLength(xml) > MAX_FISCAL_XML_BYTES) throw new Error("Fiscal payload limit");
  return Buffer.from(JSON.stringify({ dpsXmlGZipB64: gzipSync(Buffer.from(xml), { level: 6 }).toString("base64") }));
}
export function readFiscalJson(body: Buffer): ObjectValue | null {
  try {
    if (body.length > 1_000_000) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : null;
  } catch { return null; }
}
export function readCompressedNfse(value: unknown): string | null {
  try {
    if (typeof value !== "string" || value.length > 700_000 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
    const packed = Buffer.from(value, "base64");
    if (packed[0] !== 0x1f || packed[1] !== 0x8b || packed.toString("base64") !== value) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(gunzipSync(packed, { maxOutputLength: MAX_FISCAL_XML_BYTES }));
  } catch { return null; }
}
export function definitiveRejection(status: number, body: ObjectValue | null, contract: SupportedNfseContract): boolean {
  if (![400, 422].includes(status) || !body || !contract.errorsKey || !contract.errorCodesKey) return false;
  const errors = body[contract.errorsKey];
  return Array.isArray(errors) && errors.length > 0 && errors.length <= 100 && errors.every(error => {
    const code = object(error)[contract.errorCodesKey!];
    return typeof code === "string" && /^E\d{4}$/.test(code) && code !== "E0014";
  });
}
