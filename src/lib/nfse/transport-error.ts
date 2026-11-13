export type NfseTransportFailure = "invalid_destination" | "certificate_format" | "client_certificate" |
  "server_certificate" | "tls" | "dns" | "timeout" | "connection" | "response_limit" | "response";

// Only fixed categories cross this boundary. Never retain a raw TLS message, cause or credential.
export class NfseTransportError extends Error {
  readonly reason: NfseTransportFailure;
  constructor(reason: NfseTransportFailure) {
    super(reason === "invalid_destination" ? "Invalid fiscal destination." : "Fiscal transport unavailable.");
    this.name = "NfseTransportError";
    this.reason = reason;
  }
}

export function fiscalTransportError(error: unknown): NfseTransportError {
  if (error instanceof NfseTransportError) return error;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  if (["ERR_CRYPTO_UNSUPPORTED_OPERATION", "ERR_OSSL_EVP_UNSUPPORTED", "ERR_OSSL_UNSUPPORTED", "ERR_SSL_BAD_DECRYPT", "ERR_OSSL_BAD_DECRYPT", "ERR_OSSL_PKCS12_CIPHERFINAL_ERROR"].includes(code))
    return new NfseTransportError("certificate_format");
  if (["ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE", "ERR_SSL_SSLV3_ALERT_CERTIFICATE_EXPIRED", "ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED", "ERR_SSL_TLSV1_ALERT_UNKNOWN_CA", "ERR_SSL_SSLV3_ALERT_UNSUPPORTED_CERTIFICATE", "ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN"].includes(code))
    return new NfseTransportError("client_certificate");
  if (["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code))
    return new NfseTransportError("server_certificate");
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return new NfseTransportError("dns");
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)) return new NfseTransportError("timeout");
  if (code.startsWith("ERR_SSL_") || code.startsWith("ERR_TLS_")) return new NfseTransportError("tls");
  return new NfseTransportError("connection");
}
