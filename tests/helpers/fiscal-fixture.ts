import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { buildDps, NFSE_NAMESPACE, type FiscalProfile } from "../../src/lib/nfse/dps.ts";
import { signDps } from "../../src/lib/nfse/signature.ts";

// All keys, signatures, documents and OpenAPI below are synthetic. No ICP-Brasil/official API evidence.
export function identity() {
  const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01T00:00:00Z"); cert.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  cert.setSubject([{ name: "commonName", value: "SYNTHETIC TEST ONLY" }]); cert.setIssuer(cert.subject.attributes);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: forge.pki.certificateToPem(cert) };
}
export const fiscalProfile: FiscalProfile = { issuerMunicipality: "3550308", series: "1", simplesOption: "2", specialRegime: "0",
  serviceMunicipality: "3550308", nationalTaxCode: "010101", description: "Synthetic fiscal fixture", issTaxation: "1", issWithholding: "1", totals: { mode: "not_informed" } };
export const recipient = { kind: "cnpj" as const, country: "BR", document: "11444777000161", legalName: "Synthetic recipient" };
export function signedDps(holder: ReturnType<typeof identity>) {
  const built = buildDps({ environment: "homologation", issuerCnpj: "11222333000181", dpsNumber: "1", competenceDate: "2026-10-31",
    emissionTime: "2026-11-11T12:00:00+00:00", profile: fiscalProfile, amount: "11.01", recipient });
  return { id: built.id, xml: signDps(built.xml, built.id, holder.privateKeyPem, holder.certificatePem) };
}
export function nfseFixture(signed: string, service: ReturnType<typeof identity>, accessKey = "1".repeat(50), code = "107") {
  const embedded = signed.replace(/^<\?xml[^?]*\?>/, "");
  const emitted = /<dhEmi>([^<]+)<\/dhEmi>/.exec(signed)![1];
  const processed = new Date(Date.parse(emitted) + 60_000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const xml = `<NFSe xmlns="${NFSE_NAMESPACE}" versao="1.01"><infNFSe Id="NFS${accessKey}"><xLocEmi>Municipio sintetico</xLocEmi><xLocPrestacao>Municipio sintetico</xLocPrestacao><nNFSe>1</nNFSe><xTribNac>Servico sintetico</xTribNac><verAplic>TEST_ONLY</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><cStat>${code}</cStat><dhProc>${processed}</dhProc><nDFSe>1</nDFSe><emit><CNPJ>11222333000181</CNPJ><xNome>Emitente sintetico</xNome><enderNac><xLgr>Endereco sintetico</xLgr><nro>1</nro><xBairro>Distrito sintetico</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>00000000</CEP></enderNac></emit><valores><vLiq>11.01</vLiq></valores>${embedded}</infNFSe></NFSe>`;
  const signer = new SignedXml({ privateKey: service.privateKeyPem, publicCert: service.certificatePem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315" });
  signer.addReference({ xpath: `/*[local-name()='NFSe']/*[local-name()='infNFSe']`, digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"] });
  signer.computeSignature(xml, { location: { reference: "/*", action: "append" } });
  return signer.getSignedXml();
}
export function contractFixture() {
  const string = { type: "string" };
  const response = (properties: Record<string, unknown>) => ({ schema: { type: "object", properties } });
  return { dialect: "2.0", models: {}, paths: {
    "/nfse": { post: { parameters: [{ in: "body", schema: { type: "object", required: ["dpsXmlGZipB64"], properties: { dpsXmlGZipB64: string } } }],
      responses: { "200": response({ nfseXmlGZipB64: string, chaveAcesso: string }), "400": response({ erros: { type: "array", items: { type: "object", properties: { codigo: string } } } }) } } },
    "/dps/{id}": { get: { responses: { "200": response({ chaveAcesso: string }) } } },
    "/nfse/{chaveAcesso}": { get: { responses: { "200": response({ nfseXmlGZipB64: string }) } } },
  } };
}
