import { Worker } from "node:worker_threads";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const MAX_A1_BYTES = 256 * 1024;
type CertificateContext = { tenantId: string; companyId: string; certificateId: string };
export type CertificateMetadata = {
  subject_cnpj: string; fingerprint: string; serial_number: string; valid_from: string; valid_until: string;
};
type VerifiedCertificate = { metadata: CertificateMetadata; privateKeyPem: string; certificatePem: string };
type Envelope = { version: 1; iv: string; tag: string; ciphertext: string };

export async function inspectA1(bytes: Uint8Array, password: string, cnpj: string): Promise<{ data?: VerifiedCertificate; error?: string }> {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_A1_BYTES || typeof password !== "string" || password.length > 128 || !/^[0-9A-Z]{14}$/.test(cnpj))
    return { error: "invalid_input" };
  const worker = new Worker(path.join(process.cwd(), "server/certificate-worker.cjs"), {
    workerData: { pfx: bytes, password, cnpj },
    resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 },
  });
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: "processing_timeout" }), 4000);
      worker.once("message", message => { clearTimeout(timer); resolve(message); });
      worker.once("error", () => { clearTimeout(timer); resolve({ error: "file_or_password" }); });
      worker.once("exit", () => { clearTimeout(timer); resolve({ error: "file_or_password" }); });
    });
  } finally { await worker.terminate(); }
}

function associatedData(context: CertificateContext) {
  if (![context.tenantId, context.companyId, context.certificateId].every(id => id.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))
    throw new Error("Invalid certificate context.");
  return Buffer.from(JSON.stringify(["nfse-a1", 1, context.tenantId.toLowerCase(), context.companyId.toLowerCase(), context.certificateId.toLowerCase()]));
}

export function sealCertificate(bytes: Uint8Array, password: string, context: CertificateContext) {
  if (!bytes.byteLength || bytes.byteLength > MAX_A1_BYTES || password.length > 128) throw new Error("Invalid certificate input.");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(context));
  const plaintext = Buffer.from(JSON.stringify({ pfx: Buffer.from(bytes).toString("base64"), password }));
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { key: key.toString("base64"), envelope: { version: 1, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("base64") } satisfies Envelope };
  } finally { key.fill(0); plaintext.fill(0); }
}

export function openCertificate(envelope: Envelope, encodedKey: string, context: CertificateContext) {
  const key = Buffer.from(encodedKey, "base64");
  let plaintext: Buffer | undefined;
  try {
    if (key.length !== 32 || envelope.version !== 1 || !/^[0-9a-f]{24}$/.test(envelope.iv) || !/^[0-9a-f]{32}$/.test(envelope.tag) || envelope.ciphertext.length > 450000)
      throw new Error("Invalid envelope.");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "hex"));
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    const payload = JSON.parse(plaintext.toString("utf8"));
    if (typeof payload.password !== "string" || payload.password.length > 128 || typeof payload.pfx !== "string") throw new Error("Invalid payload.");
    const pfx = Buffer.from(payload.pfx, "base64");
    if (!pfx.length || pfx.length > MAX_A1_BYTES) throw new Error("Invalid payload.");
    return { pfx, password: payload.password as string };
  } catch { throw new Error("Protected certificate unavailable."); }
  finally { key.fill(0); plaintext?.fill(0); }
}
