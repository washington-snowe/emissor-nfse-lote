import { SignedXml } from "xml-crypto";
import { XMLSerializer } from "@xmldom/xmldom";
import { DSIG_NAMESPACE, dpsRoot, directElements, singleElement, parseFiscalXml } from "./xml.ts";
import { NFSE_NAMESPACE } from "./dps.ts";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

/** The accepted signature policy still requires a real official homologation response. */
export function signDps(xml: string, expectedId: string, privateKeyPem: string, publicCertPem: string) {
  dpsRoot(xml, expectedId, false);
  try {
    const signature = new SignedXml({ privateKey: privateKeyPem, publicCert: publicCertPem,
      signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: C14N });
    signature.addReference({
      xpath: `/*[local-name()='DPS' and namespace-uri()='${NFSE_NAMESPACE}']/*[local-name()='infDPS' and namespace-uri()='${NFSE_NAMESPACE}']`,
      transforms: [ENVELOPED, C14N], digestAlgorithm: SHA256,
    });
    signature.computeSignature(xml, { location: { reference: "/*", action: "append" } });
    const signed = signature.getSignedXml();
    if (!verifyDpsSignature(signed, expectedId, publicCertPem)) throw new Error();
    return signed;
  } catch {
    throw new Error("DPS signing failed");
  }
}

/** Pin the holder's known certificate; never trust a key supplied by the XML itself. */
export function verifyDpsSignature(xml: string, expectedId: string, publicCertPem: string): boolean {
  try {
    const { signature } = dpsRoot(xml, expectedId, true);
    const info = singleElement(signature!, DSIG_NAMESPACE, "SignedInfo");
    if (singleElement(info, DSIG_NAMESPACE, "CanonicalizationMethod").getAttribute("Algorithm") !== C14N ||
        singleElement(info, DSIG_NAMESPACE, "SignatureMethod").getAttribute("Algorithm") !== RSA_SHA256) return false;
    const reference = singleElement(info, DSIG_NAMESPACE, "Reference");
    if (reference.getAttribute("URI") !== `#${expectedId}` ||
        singleElement(reference, DSIG_NAMESPACE, "DigestMethod").getAttribute("Algorithm") !== SHA256) return false;
    const transforms = directElements(singleElement(reference, DSIG_NAMESPACE, "Transforms"), DSIG_NAMESPACE, "Transform");
    if (transforms.length !== 2 || transforms[0].getAttribute("Algorithm") !== ENVELOPED ||
        transforms[1].getAttribute("Algorithm") !== C14N) return false;
    const verifier = new SignedXml({ publicCert: publicCertPem, getCertFromKeyInfo: () => null });
    verifier.loadSignature(new XMLSerializer().serializeToString(signature!));
    if (!verifier.checkSignature(xml)) return false;
    const references = verifier.getSignedReferences();
    if (references.length !== 1) return false;
    const verifiedInfo = parseFiscalXml(references[0]).documentElement!;
    return verifiedInfo.namespaceURI === NFSE_NAMESPACE && verifiedInfo.localName === "infDPS" && verifiedInfo.getAttribute("Id") === expectedId;
  } catch {
    return false;
  }
}
