/* Isolated CPU/memory budget for untrusted PKCS#12; never writes files or logs inputs. */
const { parentPort, workerData } = require("node:worker_threads");
const { X509Certificate, sign, verify, createHash } = require("node:crypto");
const forge = require("node-forge");

function fail(code) { throw Object.assign(new Error("Certificate rejected"), { domainCode: code }); }
function holderCnpj(cert) {
  const extension = cert.getExtension("subjectAltName");
  if (!extension?.value) return null;
  const names = forge.asn1.fromDer(extension.value);
  const found = [];
  for (const name of names.value) {
    if (name.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || name.type !== 0 || !Array.isArray(name.value)) continue;
    const [oid, explicit] = name.value;
    if (oid?.type !== forge.asn1.Type.OID || forge.asn1.derToOid(oid.value) !== "2.16.76.1.3.3") continue;
    const values = [];
    const visit = (node, depth = 0) => {
      if (!node || depth > 8) return;
      if (Array.isArray(node.value)) node.value.forEach(child => visit(child, depth + 1));
      else if (typeof node.value === "string" && /^[0-9A-Z]{14}$/.test(node.value)) values.push(node.value);
    };
    visit(explicit);
    found.push(...values);
  }
  return new Set(found).size === 1 ? found[0] : null;
}

try {
  const bytes = Buffer.from(workerData.pfx);
  const pfx = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString("binary")), true, workerData.password);
  const keys = pfx.safeContents.flatMap(content => content.safeBags).filter(bag => bag.key).map(bag => bag.key);
  const certificates = pfx.safeContents.flatMap(content => content.safeBags).filter(bag => bag.cert).map(bag => bag.cert);
  if (keys.length !== 1 || certificates.length > 16) fail("ambiguous_certificate");
  const key = keys[0];
  const matches = certificates.filter(cert => cert.publicKey.n?.equals(key.n) && cert.publicKey.e?.equals(key.e));
  if (matches.length !== 1) fail("invalid_key_pair");
  const certificate = matches[0];
  const now = Date.now();
  if (certificate.validity.notBefore.getTime() > now) fail("not_yet_valid");
  if (certificate.validity.notAfter.getTime() <= now) fail("expired");
  const cnpj = holderCnpj(certificate);
  if (!cnpj) fail("missing_holder_cnpj");
  if (cnpj !== workerData.cnpj) fail("holder_mismatch");
  const privateKeyPem = forge.pki.privateKeyToPem(key);
  const certificatePem = forge.pki.certificateToPem(certificate);
  const x509 = new X509Certificate(certificatePem);
  const challenge = Buffer.from("nfse-a1-key-pair-check-v1");
  if (!verify("sha256", challenge, x509.publicKey, sign("sha256", challenge, privateKeyPem))) fail("invalid_key_pair");
  // Build the client chain in memory, leaf first. This does not establish ICP-Brasil trust.
  // Only cryptographically linked issuers are sent; unrelated bags are never included.
  const chain = [certificatePem];
  const remaining = certificates.filter(cert => cert !== certificate).map(cert => {
    const pem = forge.pki.certificateToPem(cert);
    return { pem, x509: new X509Certificate(pem) };
  });
  const seen = new Set([x509.fingerprint256]);
  let current = x509;
  while (current.subject !== current.issuer || !current.verify(current.publicKey)) {
    const issuers = remaining.filter(issuer => current.checkIssued(issuer.x509) && current.verify(issuer.x509.publicKey));
    if (!issuers.length) break;
    if (issuers.length !== 1 || seen.has(issuers[0].x509.fingerprint256)) fail("ambiguous_certificate");
    const issuer = issuers[0];
    seen.add(issuer.x509.fingerprint256);
    // Trust anchors belong to the remote service, not to this uploaded PKCS#12.
    if (issuer.x509.subject === issuer.x509.issuer && issuer.x509.verify(issuer.x509.publicKey)) break;
    chain.push(issuer.pem);
    current = issuer.x509;
  }
  parentPort.postMessage({ data: {
    metadata: {
      subject_cnpj: cnpj,
      fingerprint: createHash("sha256").update(x509.raw).digest("hex"),
      serial_number: certificate.serialNumber,
      valid_from: certificate.validity.notBefore.toISOString(),
      valid_until: certificate.validity.notAfter.toISOString(),
    },
    privateKeyPem, certificatePem, certificateChainPem: chain.join("\n"),
  } });
} catch (error) {
  parentPort.postMessage({ error: error.domainCode ?? "file_or_password" });
} finally {
  parentPort.close();
}
