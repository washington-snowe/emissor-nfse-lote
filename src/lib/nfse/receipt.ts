import { createHash, X509Certificate } from "node:crypto";
import { XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { parseFiscalXml, singleElement, directElements, DSIG_NAMESPACE } from "./xml.ts";
import { NFSE_NAMESPACE } from "./dps.ts";
import { verifiedDpsReference, unsignedDpsReference } from "./signature.ts";
import { validateFiscalSchema } from "./schema.ts";

/** Only call for XML obtained through the pinned official mTLS transport, never uploaded XML. */
export async function verifyOfficialNfseContents(xml: string, expected: { dpsId: string; signedDps: string; holderCert: string; issuerCnpj: string; accessKey: string }) {
  try {
    if (!/^\d{50}$/.test(expected.accessKey) || !await validateFiscalSchema(xml, "NFSe")) return null;
    const doc = parseFiscalXml(xml), root = doc.documentElement!;
    const info = singleElement(root, NFSE_NAMESPACE, "infNFSe");
    if (info.getAttribute("Id") !== `NFS${expected.accessKey}` || singleElement(singleElement(info, NFSE_NAMESPACE, "emit"), NFSE_NAMESPACE, "CNPJ").textContent !== expected.issuerCnpj) return null;
    const status = singleElement(info, NFSE_NAMESPACE, "cStat").textContent;
    if (status !== "100" && status !== "107") return null;
    const serializer = new XMLSerializer();
    const embeddedNode = singleElement(info, NFSE_NAMESPACE, "DPS");
    const embedded = serializer.serializeToString(embeddedNode);
    const requestReference = verifiedDpsReference(expected.signedDps, expected.dpsId, expected.holderCert);
    const returnedReference = embeddedNode.getElementsByTagNameNS(DSIG_NAMESPACE, "Signature").length ?
      verifiedDpsReference(embedded, expected.dpsId, expected.holderCert) : unsignedDpsReference(embedded, expected.dpsId);
    if (!requestReference || !returnedReference || createHash("sha256").update(requestReference).digest("hex") !== createHash("sha256").update(returnedReference).digest("hex")) return null;
    const signature = singleElement(root, DSIG_NAMESPACE, "Signature"), signedInfo = singleElement(signature, DSIG_NAMESPACE, "SignedInfo");
    const reference = singleElement(signedInfo, DSIG_NAMESPACE, "Reference");
    const transforms = directElements(singleElement(reference, DSIG_NAMESPACE, "Transforms"), DSIG_NAMESPACE, "Transform");
    if (singleElement(signedInfo, DSIG_NAMESPACE, "SignatureMethod").getAttribute("Algorithm") !== "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" ||
      singleElement(signedInfo, DSIG_NAMESPACE, "CanonicalizationMethod").getAttribute("Algorithm") !== "http://www.w3.org/TR/2001/REC-xml-c14n-20010315" ||
      singleElement(reference, DSIG_NAMESPACE, "DigestMethod").getAttribute("Algorithm") !== "http://www.w3.org/2001/04/xmlenc#sha256" ||
      reference.getAttribute("URI") !== `#NFS${expected.accessKey}` || transforms.length !== 2 ||
      transforms[0].getAttribute("Algorithm") !== "http://www.w3.org/2000/09/xmldsig#enveloped-signature" ||
      transforms[1].getAttribute("Algorithm") !== "http://www.w3.org/TR/2001/REC-xml-c14n-20010315") return null;
    const certificates = signature.getElementsByTagNameNS(DSIG_NAMESPACE, "X509Certificate");
    if (certificates.length !== 1) return null;
    const certificate = new X509Certificate(Buffer.from((certificates.item(0)!.textContent ?? "").replace(/\s/g, ""), "base64"));
    const processed = Date.parse(singleElement(info, NFSE_NAMESPACE, "dhProc").textContent ?? "");
    if (!Number.isFinite(processed) || processed < certificate.validFromDate.getTime() || processed > certificate.validToDate.getTime()) return null;
    const verifier = new SignedXml({ publicCert: certificate.toString(), getCertFromKeyInfo: () => null });
    verifier.loadSignature(serializer.serializeToString(signature));
    if (!verifier.checkSignature(xml) || verifier.getSignedReferences().length !== 1) return null;
    const verified = parseFiscalXml(verifier.getSignedReferences()[0]).documentElement!;
    if (verified.localName !== "infNFSe" || verified.namespaceURI !== NFSE_NAMESPACE || verified.getAttribute("Id") !== `NFS${expected.accessKey}`) return null;
    return { accessKey: expected.accessKey, xml, number: singleElement(info, NFSE_NAMESPACE, "nNFSe").textContent!, status };
  } catch { return null; }
}
