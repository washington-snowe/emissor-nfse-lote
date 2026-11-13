import assert from "node:assert/strict";
import { test } from "node:test";
import forge from "node-forge";
import { spawnSync } from "node:child_process";
import { createSecureContext } from "node:tls";
import { X509Certificate } from "node:crypto";
import { inspectA1, sealCertificate, openCertificate, MAX_A1_BYTES } from "../src/lib/certificates.ts";
import { nfseTlsCredentials } from "../src/lib/nfse/http.ts";

// Self-signed fixtures are only parser/security tests, never an ICP-Brasil credential or homologation.
const keyPair = forge.pki.rsa.generateKeyPair(2048);
const password = "synthetic-fixture-password";
function fixture(cnpj: string | null = "11222333000181", validity: "valid" | "expired" | "future" = "valid") {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = "01";
  const now = Date.now();
  cert.validity.notBefore = new Date(now + (validity === "future" ? 86400000 : -86400000));
  cert.validity.notAfter = new Date(now + (validity === "expired" ? -3600000 : 172800000));
  cert.setSubject([{ name: "commonName", value: "SYNTHETIC TEST ONLY:11222333000181" }]);
  cert.setIssuer(cert.subject.attributes);
  if (cnpj) {
    const otherName = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer("2.16.76.1.3.3").getBytes()),
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, cnpj),
        ]),
      ]),
    ]);
    cert.setExtensions([{ id: "2.5.29.17", value: forge.asn1.toDer(otherName).getBytes() }]);
  }
  cert.sign(keyPair.privateKey, forge.md.sha256.create());
  const asn = forge.pkcs12.toPkcs12Asn1(keyPair.privateKey, [cert], password, { algorithm: "aes256", count: 2048 });
  return { bytes: Buffer.from(forge.asn1.toDer(asn).getBytes(), "binary"), asn, certificate: cert };
}

test("PKCS#12 verifica senha, chave, validade e CNPJ do otherName, sem confiar no commonName", async () => {
  const good = fixture();
  const result = await inspectA1(good.bytes, password, "11222333000181");
  assert.ok(result.data);
  assert.equal(result.data.metadata.subject_cnpj, "11222333000181");
  assert.match(result.data.metadata.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(result.data.privateKeyPem.includes("PRIVATE KEY"));
  assert.equal((await inspectA1(good.bytes, "incorrect-fixture-password", "11222333000181")).error, "file_or_password");
  assert.equal((await inspectA1(good.bytes, password, "12ABC34501DE35")).error, "holder_mismatch");
  assert.equal((await inspectA1(fixture(null).bytes, password, "11222333000181")).error, "missing_holder_cnpj");
  assert.equal((await inspectA1(fixture(undefined, "expired").bytes, password, "11222333000181")).error, "expired");
  assert.equal((await inspectA1(fixture(undefined, "future").bytes, password, "11222333000181")).error, "not_yet_valid");
  assert.equal((await inspectA1(Buffer.from("not-pkcs12"), password, "11222333000181")).error, "file_or_password");
  assert.equal((await inspectA1(Buffer.alloc(MAX_A1_BYTES + 1), password, "11222333000181")).error, "invalid_input");
});

test("A1 RC2 sintético passa no parser e usa PEM em memória sem habilitar criptografia legada no TLS", async () => {
  const { certificate } = fixture();
  const exported = spawnSync("openssl", ["pkcs12", "-export", "-legacy", "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-RC2-40", "-passout", `pass:${password}`], {
    input: forge.pki.privateKeyToPem(keyPair.privateKey) + forge.pki.certificateToPem(certificate), maxBuffer: MAX_A1_BYTES,
  });
  // The subprocess handles only generated fixtures, never uploaded certificates or keys.
  assert.equal(exported.status, 0, "Synthetic legacy PFX export must succeed");
  try {
    assert.throws(() => createSecureContext({ pfx: exported.stdout, passphrase: password }));
    const inspected = await inspectA1(exported.stdout, password, "11222333000181");
    assert.ok(inspected.data);
    const options = nfseTlsCredentials({ pfx: exported.stdout, password, ...inspected.data });
    assert.ok("key" in options);
    assert.ok(!("pfx" in options));
    assert.ok(!("passphrase" in options));
    assert.doesNotThrow(() => createSecureContext(options));
  } finally { exported.stdout.fill(0); }
});

test("cadeia TLS inclui folha e intermediária em ordem, sem raiz nem certificados alheios", async () => {
  const rootKeys = forge.pki.rsa.generateKeyPair(2048), intermediateKeys = forge.pki.rsa.generateKeyPair(2048);
  const ca = (name: string, keys: typeof rootKeys, issuer?: forge.pki.Certificate, signer = keys.privateKey) => {
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = name === "SYNTHETIC ROOT" ? "02" : "03";
    cert.validity.notBefore = new Date(Date.now() - 86400000); cert.validity.notAfter = new Date(Date.now() + 172800000);
    cert.setSubject([{ name: "commonName", value: name }]); cert.setIssuer((issuer ?? cert).subject.attributes);
    cert.setExtensions([{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true }]);
    cert.sign(signer, forge.md.sha256.create());
    return cert;
  };
  const root = ca("SYNTHETIC ROOT", rootKeys);
  const intermediate = ca("SYNTHETIC INTERMEDIATE", intermediateKeys, root, rootKeys.privateKey);
  const leaf = fixture().certificate;
  leaf.setIssuer(intermediate.subject.attributes); leaf.sign(intermediateKeys.privateKey, forge.md.sha256.create());
  const unrelated = ca("SYNTHETIC UNRELATED", rootKeys);
  const asn = forge.pkcs12.toPkcs12Asn1(keyPair.privateKey, [intermediate, unrelated, leaf, root], password, { algorithm: "aes256", count: 2048 });
  const inspected = await inspectA1(Buffer.from(forge.asn1.toDer(asn).getBytes(), "binary"), password, "11222333000181");
  assert.ok(inspected.data);
  const chain = inspected.data.certificateChainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  assert.equal(chain.length, 2);
  const subjects = chain.map(pem => new X509Certificate(pem).subject);
  assert.match(subjects[0], /SYNTHETIC TEST ONLY/);
  assert.equal(subjects[1], "CN=SYNTHETIC INTERMEDIATE");
  assert.equal(inspected.data.certificatePem.trim(), chain[0]);
  assert.doesNotThrow(() => createSecureContext(nfseTlsCredentials({ pfx: Buffer.alloc(0), password, ...inspected.data })));
});

test("PKCS#12 com custo malicioso é encerrado em thread isolada com limite de tempo", async () => {
  const { asn } = fixture();
  const root = asn.value as forge.asn1.Asn1[];
  const mac = root[2].value as forge.asn1.Asn1[];
  mac[2].value = forge.asn1.integerToDer(50_000_000).getBytes();
  const started = Date.now();
  const result = await inspectA1(Buffer.from(forge.asn1.toDer(asn).getBytes(), "binary"), password, "11222333000181");
  assert.equal(result.error, "processing_timeout");
  assert.ok(Date.now() - started < 7000);
  assert.equal(result.data, undefined);
});

test("envelope usa chave e nonce únicos e autentica tenant, empresa e certificado", () => {
  const context = { tenantId: "00000000-0000-4000-8000-000000000001", companyId: "00000000-0000-4000-8000-000000000002", certificateId: "00000000-0000-4000-8000-000000000003" };
  const bytes = Buffer.from("synthetic pkcs12 plaintext");
  const first = sealCertificate(bytes, password, context);
  const second = sealCertificate(bytes, password, context);
  assert.notEqual(first.key, second.key);
  assert.notEqual(first.envelope.iv, second.envelope.iv);
  assert.ok(!JSON.stringify(first.envelope).includes(password));
  const opened = openCertificate(first.envelope, first.key, context);
  assert.deepEqual(opened.pfx, bytes);
  assert.equal(opened.password, password);
  for (const field of ["tenantId", "companyId", "certificateId"])
    assert.throws(() => openCertificate(first.envelope, first.key, { ...context, [field]: "00000000-0000-4000-8000-000000000099" }), /Protected certificate unavailable/);
  assert.throws(() => openCertificate(first.envelope, second.key, context), /Protected certificate unavailable/);
  assert.throws(() => openCertificate({ ...first.envelope, tag: "0".repeat(32) }, first.key, context), /Protected certificate unavailable/);
  assert.throws(() => openCertificate({ ...first.envelope, ciphertext: Buffer.from("tampered").toString("base64") }, first.key, context), /Protected certificate unavailable/);
});
