import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { NFSE_NAMESPACE } from "./dps.ts";

export const DSIG_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";
export const MAX_FISCAL_XML_BYTES = 256 * 1024;

/** No DTD, external entities, parser recovery, excessive nesting or unbounded trees. */
export function parseFiscalXml(xml: string): Document {
  try {
    if (typeof xml !== "string" || !xml.length || Buffer.byteLength(xml) > MAX_FISCAL_XML_BYTES ||
        /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || Buffer.from(xml).toString("utf8") !== xml) throw new Error();
    const doc = new DOMParser({ onError() { throw new Error(); } }).parseFromString(xml, "application/xml");
    if (!doc.documentElement || doc.doctype) throw new Error();
    const pending = [{ node: doc.documentElement, depth: 1 }];
    let count = 0;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++count > 4096 || depth > 32) throw new Error();
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) pending.push({ node: child as Element, depth: depth + 1 });
        else if (![3, 4].includes(child.nodeType)) throw new Error();
      }
    }
    return doc;
  } catch {
    // XML parser errors can contain certificate/customer data. Never expose the raw message.
    throw new Error("Invalid fiscal XML");
  }
}

export function directElements(parent: Element, namespace: string, name: string): Element[] {
  const result: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (node as Element).namespaceURI === namespace && (node as Element).localName === name) {
      result.push(node as Element);
    }
  }
  return result;
}

export function singleElement(parent: Element, namespace: string, name: string): Element {
  const elements = directElements(parent, namespace, name);
  if (elements.length !== 1) throw new Error("Invalid fiscal XML structure");
  return elements[0];
}

export function dpsRoot(xml: string, expectedId: string, signed: boolean) {
  if (!/^DPS\d{42}$/.test(expectedId)) throw new Error("Invalid DPS identity");
  const doc = parseFiscalXml(xml);
  const root = doc.documentElement!;
  if (root.namespaceURI !== NFSE_NAMESPACE || root.localName !== "DPS" || root.getAttribute("versao") !== "1.01") {
    throw new Error("Invalid DPS structure");
  }
  const info = singleElement(root, NFSE_NAMESPACE, "infDPS");
  if (info.getAttribute("Id") !== expectedId) throw new Error("Invalid DPS identity");
  const all = doc.getElementsByTagName("*");
  let identities = 0;
  for (let i = 0; i < all.length; i++) {
    const element = all.item(i)!;
    for (let a = 0; a < element.attributes.length; a++) {
      const attribute = element.attributes.item(a)!;
      if ((attribute.localName ?? attribute.name).toLowerCase() === "id") {
        if (element !== info || attribute.name !== "Id") throw new Error("Ambiguous DPS identity");
        identities++;
      }
    }
  }
  const signatures = doc.getElementsByTagNameNS(DSIG_NAMESPACE, "Signature");
  if (identities !== 1 || signatures.length !== (signed ? 1 : 0) ||
      (signed && signatures.item(0)!.parentNode !== root)) throw new Error("Invalid DPS signature structure");
  return { doc, root, info, signature: signed ? signatures.item(0)! : null };
}
