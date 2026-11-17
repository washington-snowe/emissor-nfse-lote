import { createHash, X509Certificate } from "node:crypto";
import { XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { parseFiscalXml, singleElement, directElements, DSIG_NAMESPACE,dpsRoot } from "./xml.ts";
import { NFSE_NAMESPACE } from "./dps.ts";
import { verifiedDpsReference, unsignedDpsReference } from "./signature.ts";
import { inspectFiscalDocuments } from "./schema.ts";
import type {Element} from '@xmldom/xmldom';
import {allowsNfseCanonicalization,allowsNfseReferenceTransforms,nfseCanonicalizationLabel,nfseReferenceTransformLabels} from './receipt-signature-policy.ts';

export type ExpectedNfse={ dpsId: string; signedDps: string; holderCert: string; issuerCnpj: string; accessKey: string;environment?:'homologation'|'production' };
type ReceiptObserver=(line:string)=>void;
const algorithms:Record<string,string>={
 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256':'RSA-SHA256',
 'http://www.w3.org/2000/09/xmldsig#rsa-sha1':'RSA-SHA1',
 'http://www.w3.org/2001/04/xmlenc#sha256':'SHA256',
 'http://www.w3.org/2000/09/xmldsig#sha1':'SHA1',
};
// Diagnostic only: no XML normalization is used to accept a document.
function namespaceContextOnly(a:string,b:string):boolean{
 try{
  const project=(element:Element):unknown=>{
   const attrs=[];
   for(let i=0;i<element.attributes.length;i++){
    const attr=element.attributes.item(i)!;
    if(attr.namespaceURI!=='http://www.w3.org/2000/xmlns/')attrs.push([attr.namespaceURI??'',attr.localName??attr.name,attr.value]);
   }
   attrs.sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)));
   const children:unknown[]=[];
   for(let node=element.firstChild;node;node=node.nextSibling)children.push(node.nodeType===1?project(node as Element):[node.nodeType,node.nodeValue]);
   return [element.namespaceURI,element.localName,attrs,children];
  };
  return a!==b&&JSON.stringify(project(parseFiscalXml(a).documentElement!))===JSON.stringify(project(parseFiscalXml(b).documentElement!));
 }catch{return false;}
}
export async function inspectOfficialNfseContents(xml:string,expected:ExpectedNfse){
 const checks:string[]=[];
 const document=await verifyOfficialNfseContents(xml,expected,line=>checks.push(line));
 return {document,checks};
}

/** Only call for XML obtained through the pinned official mTLS transport, never uploaded XML. */
export async function verifyOfficialNfseContents(xml: string, expected:ExpectedNfse,observer?:ReceiptObserver) {
  let stage='estrutura da DPS original';
  const note=(line:string)=>{try{observer?.(line);}catch{/* Diagnostics never change validation. */}};
  const check=(label:string,ok:boolean)=>{note(`${label}: ${ok?'confere':'não validado'}.`);return ok;};
  try {
    const requestReference = verifiedDpsReference(expected.signedDps, expected.dpsId, expected.holderCert);
    if(!check('Assinatura da DPS original',!!requestReference))return null;
    // Choose historical compatibility from the pinned original, never from the incoming NFSe.
    const original=dpsRoot(expected.signedDps,expected.dpsId,true);
    if(expected.environment&&!check('Ambiente da DPS original',singleElement(original.info,NFSE_NAMESPACE,'tpAmb').textContent===(expected.environment==='production'?'1':'2')))return null;
    const revision=directElements(original.info,NFSE_NAMESPACE,'finNFSe').length?'homologation-20261020':'production-20260209';
    if (!check('Formato da chave da consulta',/^\d{50}$/.test(expected.accessKey)))return null;
    stage='estrutura e XSD da NFS-e';
    const schema=await inspectFiscalDocuments([xml],'NFSe',revision);
    note(`XSD da NFS-e: ${!schema.completed?'validação indisponível':schema.valid?'estrutura aceita':'estrutura recusada'}.`);
    if(schema.fields.length)note(`Campos apontados pelo XSD da NFS-e: ${schema.fields.join(', ')}.`);
    if(!schema.valid)return null;
    const doc = parseFiscalXml(xml), root = doc.documentElement!;
    const info = singleElement(root, NFSE_NAMESPACE, "infNFSe");
    if(!check('Identidade da NFS-e vinculada à chave',info.getAttribute('Id')===`NFS${expected.accessKey}`))return null;
    if(!check('Emitente vinculado à empresa',singleElement(singleElement(info,NFSE_NAMESPACE,'emit'),NFSE_NAMESPACE,'CNPJ').textContent===expected.issuerCnpj))return null;
    const status = singleElement(info, NFSE_NAMESPACE, "cStat").textContent;
    note(`Código fiscal cStat: ${typeof status==='string'&&/^\d{3}$/.test(status)?status:'não reconhecido'}.`);
    if(!check('Status fiscal reconhecido',status==='100'||status==='107'))return null;
    stage='vínculo da DPS incorporada';
    const serializer = new XMLSerializer();
    const embeddedNode = singleElement(info, NFSE_NAMESPACE, "DPS");
    const embedded = serializer.serializeToString(embeddedNode);
    const embeddedInfo=singleElement(embeddedNode,NFSE_NAMESPACE,'infDPS');
    if(!check('Identidade da DPS incorporada',embeddedInfo.getAttribute('Id')===expected.dpsId))return null;
    const returnedReference = embeddedNode.getElementsByTagNameNS(DSIG_NAMESPACE, "Signature").length ?
      verifiedDpsReference(embedded, expected.dpsId, expected.holderCert) : unsignedDpsReference(embedded, expected.dpsId);
    check('Referência da DPS retornada',!!returnedReference);
    const dpsPreserved=!!returnedReference&&createHash('sha256').update(requestReference!).digest('hex')===createHash('sha256').update(returnedReference).digest('hex');
    check('Conteúdo autenticado da DPS preservado',dpsPreserved);
    if(!dpsPreserved&&returnedReference&&namespaceContextOnly(requestReference!,returnedReference))note('Diferença canônica restrita ao contexto de namespaces/prefixos. Isso não libera a autorização.');
    stage='estrutura da assinatura da NFS-e';
    const signature = singleElement(root, DSIG_NAMESPACE, "Signature"), signedInfo = singleElement(signature, DSIG_NAMESPACE, "SignedInfo");
    const reference = singleElement(signedInfo, DSIG_NAMESPACE, "Reference");
    const transformContainers=directElements(reference,DSIG_NAMESPACE,'Transforms');
    const transforms=transformContainers.length===1?directElements(transformContainers[0],DSIG_NAMESPACE,'Transform'):[];
    const canonicalization=singleElement(signedInfo,DSIG_NAMESPACE,'CanonicalizationMethod');
    for(const [label,uri] of [['Método da assinatura da NFS-e',singleElement(signedInfo,DSIG_NAMESPACE,'SignatureMethod').getAttribute('Algorithm')],['Digest da NFS-e',singleElement(reference,DSIG_NAMESPACE,'DigestMethod').getAttribute('Algorithm')]])
      note(`${label}: ${uri&&Object.hasOwn(algorithms,uri)?algorithms[uri]:'não reconhecido'}.`);
    note(`Canonicalização da NFS-e: ${nfseCanonicalizationLabel(canonicalization.getAttribute('Algorithm'))}.`);
    note(`Transformações da referência: ${nfseReferenceTransformLabels(transforms).join(' + ')}.`);
    if (singleElement(signedInfo, DSIG_NAMESPACE, "SignatureMethod").getAttribute("Algorithm") !== "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" ||
      !allowsNfseCanonicalization(canonicalization) ||
      singleElement(reference, DSIG_NAMESPACE, "DigestMethod").getAttribute("Algorithm") !== "http://www.w3.org/2001/04/xmlenc#sha256" ||
      reference.getAttribute("URI") !== `#NFS${expected.accessKey}` || transformContainers.length>1 ||
      !allowsNfseReferenceTransforms(transforms)) {check('Política da assinatura da NFS-e',false);return null;}
    check('Política da assinatura da NFS-e',true);
    const certificates = signature.getElementsByTagNameNS(DSIG_NAMESPACE, "X509Certificate");
    if(!check('Certificado público único da NFS-e',certificates.length===1))return null;
    const certificate = new X509Certificate(Buffer.from((certificates.item(0)!.textContent ?? "").replace(/\s/g, ""), "base64"));
    const processed = Date.parse(singleElement(info, NFSE_NAMESPACE, "dhProc").textContent ?? "");
    if(!check('Validade do certificado no processamento',Number.isFinite(processed)&&processed>=certificate.validFromDate.getTime()&&processed<=certificate.validToDate.getTime()))return null;
    stage='verificação criptográfica da NFS-e';
    const verifier = new SignedXml({ publicCert: certificate.toString(), getCertFromKeyInfo: () => null });
    verifier.loadSignature(serializer.serializeToString(signature));
    if(!check('Assinatura criptográfica da NFS-e',verifier.checkSignature(xml)&&verifier.getSignedReferences().length===1))return null;
    const verified = parseFiscalXml(verifier.getSignedReferences()[0]).documentElement!;
    if(!check('Referência assinada vinculada à NFS-e',verified.localName==='infNFSe'&&verified.namespaceURI===NFSE_NAMESPACE&&verified.getAttribute('Id')===`NFS${expected.accessKey}`))return null;
    if(!dpsPreserved)return null;
    return { accessKey: expected.accessKey, xml, number: singleElement(info, NFSE_NAMESPACE, "nNFSe").textContent!, status };
  } catch { note(`Conferência interrompida: ${stage} não validada.`);return null; }
}
