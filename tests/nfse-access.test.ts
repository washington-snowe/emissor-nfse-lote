import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import { mock, test } from "node:test";
import { checkHomologationAccess } from "../src/lib/nfse/access-check.ts";
import { nfseRequest, NFSE_BASES, nfseTlsCredentials } from "../src/lib/nfse/http.ts";
import { fiscalTransportError, NfseTransportError } from "../src/lib/nfse/transport-error.ts";

const credentials = { pfx: Buffer.from("SYNTHETIC-NOT-A-REAL-PFX"), password: "SYNTHETIC-PRIVATE-DO-NOT-EXPOSE" };
const secretText = "SYNTHETIC-PRIVATE-DO-NOT-EXPOSE";

test("diagnóstico classifica apenas códigos fixos sem copiar mensagem, senha ou detalhes do provedor", () => {
  const cases = {
    ERR_CRYPTO_UNSUPPORTED_OPERATION: "certificate_format", ERR_OSSL_EVP_UNSUPPORTED: "certificate_format",
    ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE: "client_certificate", ERR_SSL_TLSV1_ALERT_UNKNOWN_CA: "client_certificate",
    CERT_HAS_EXPIRED: "server_certificate", UNABLE_TO_VERIFY_LEAF_SIGNATURE: "server_certificate",
    ERR_TLS_CERT_ALTNAME_INVALID: "server_certificate", ERR_SSL_WRONG_VERSION_NUMBER: "tls",
    ENOTFOUND: "dns", EAI_AGAIN: "dns", ETIMEDOUT: "timeout", ECONNRESET: "connection",
  };
  for (const [code, reason] of Object.entries(cases)) {
    const error = fiscalTransportError(Object.assign(new Error(secretText), { code, privateKeyPem: secretText }));
    assert.equal(error.reason, reason);
    assert.ok(!JSON.stringify(error).includes(secretText));
    assert.ok(!String(error).includes(secretText));
    assert.equal(error.cause, undefined);
  }
  assert.equal(fiscalTransportError(new Error(secretText)).reason, "connection");
});

test("consulta de acesso usa somente GET oficial e distingue resposta JSON, HTML, HTTP e limites sem emitir", async () => {
  for (const status of [200, 204, 301, 400, 401, 403, 404, 422, 429, 500, 503]) {
    const result = await checkHomologationAccess("3550308", credentials, async (environment, url, passed, timeout) => {
      assert.equal(environment, "homologation");
      assert.equal(url, `${NFSE_BASES.homologation}/parametros_municipais/3550308/convenio`);
      assert.equal(passed, credentials);
      assert.equal(timeout, 15000);
      return { status, body: Buffer.from(status === 200 ? '{"synthetic":true}' : secretText), contentType: "application/json" };
    });
    assert.equal(result.status, status);
    assert.equal(result.connected, status === 200);
    assert.ok(!result.message.includes(secretText));
    assert.match(result.message, /Nenhuma nota foi enviada/);
    if (status >= 300) assert.match(result.message, new RegExp(`HTTP ${status}`));
  }
  for (const body of ["null", "[]", '"text"', "<html>" + secretText + "</html>"]) {
    const result = await checkHomologationAccess("3550308", credentials, async () => ({ status: 200, body: Buffer.from(body), contentType: "text/html" }));
    assert.equal(result.connected, false);
    assert.equal(result.diagnostic, "NFSE_INVALID_RESPONSE");
    assert.ok(!result.message.includes(secretText));
  }
  await assert.rejects(checkHomologationAccess("../" + secretText, credentials, async () => { throw new Error("Must not request"); }), /Invalid municipality/);
});

test("falhas de transporte ganham referência segura, sem atribuir tudo a credenciamento", async () => {
  for (const reason of ["certificate_format", "client_certificate", "server_certificate", "tls", "dns", "timeout", "connection", "response_limit", "response", "invalid_destination"] as const) {
    const result = await checkHomologationAccess("3550308", credentials, async () => { throw new NfseTransportError(reason); });
    assert.equal(result.status, 0);
    assert.equal(result.connected, false);
    assert.equal(result.diagnostic, `NFSE_${reason.toUpperCase()}`);
    assert.ok(!result.message.includes(secretText));
    assert.match(result.message, /Nenhuma nota foi enviada/);
  }
});

test("transporte preserva TLS verificado, envia PEM com cadeia e não segue redirecionamento", async () => {
  const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
  const response = new EventEmitter();
  const tls = { ...credentials, privateKeyPem: "SYNTHETIC-KEY", certificatePem: "SYNTHETIC-LEAF", certificateChainPem: "SYNTHETIC-LEAF-AND-CHAIN" };
  let calls = 0;
  const stub = mock.method(https, "request", (url: URL, options: https.RequestOptions, callback: (response: unknown) => void) => {
    calls++;
    assert.equal(url.href, NFSE_BASES.homologation + "/docs/index");
    assert.equal(options.key, tls.privateKeyPem);
    assert.equal(options.cert, tls.certificateChainPem);
    assert.equal(options.pfx, undefined);
    assert.equal(options.passphrase, undefined);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.minVersion, "TLSv1.2");
    assert.equal(options.agent, false);
    request.end = () => queueMicrotask(() => {
      callback(Object.assign(response, { statusCode: 302, headers: { "content-type": "text/html", location: "https://example.invalid/" } }));
      response.emit("data", Buffer.from("redirect")); response.emit("end");
    });
    request.destroy = error => { request.emit("error", error); };
    return request;
  });
  try {
    const result = await nfseRequest("homologation", "GET", NFSE_BASES.homologation + "/docs/index", tls);
    assert.equal(result.status, 302);
    assert.equal(calls, 1);
    assert.throws(() => nfseTlsCredentials({ ...credentials, privateKeyPem: "SYNTHETIC-KEY" }), NfseTransportError);
  } finally { stub.mock.restore(); }
});

test("erro síncrono do OpenSSL também é sanitizado e timeout não provoca outra requisição", async () => {
  let calls = 0;
  const stub = mock.method(https, "request", () => { calls++; throw Object.assign(new Error(secretText), { code: "ERR_CRYPTO_UNSUPPORTED_OPERATION" }); });
  try {
    await assert.rejects(nfseRequest("homologation", "GET", NFSE_BASES.homologation + "/docs/index", credentials), (error: unknown) => error instanceof NfseTransportError && error.reason === "certificate_format" && !String(error).includes(secretText));
    assert.equal(calls, 1);
  } finally { stub.mock.restore(); }
  const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
  const hanging = mock.method(https, "request", () => {
    calls++; request.end = () => {}; request.destroy = error => { request.emit("error", error); }; return request;
  });
  try {
    await assert.rejects(nfseRequest("homologation", "GET", NFSE_BASES.homologation + "/docs/index", credentials, undefined, 5), (error: unknown) => error instanceof NfseTransportError && error.reason === "timeout");
    assert.equal(calls, 2);
  } finally { hanging.mock.restore(); }
});
