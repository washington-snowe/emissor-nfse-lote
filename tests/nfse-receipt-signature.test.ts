import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sign} from 'node:crypto';
import {SignedXml,findAncestorNs} from 'xml-crypto';
import {XMLSerializer,type Element} from '@xmldom/xmldom';
import {identity,signedDps,nfseFixture} from './helpers/fiscal-fixture.ts';
import {verifyOfficialNfseContents,inspectOfficialNfseContents} from '../src/lib/nfse/receipt.ts';
import {allowsNfseCanonicalization} from '../src/lib/nfse/receipt-signature-policy.ts';
import {parseFiscalXml,singleElement,DSIG_NAMESPACE} from '../src/lib/nfse/xml.ts';
import {verifyDpsSignature} from '../src/lib/nfse/signature.ts';

// All identities, keys and service documents are synthetic; these are not SEFIN homologation evidence.
const holder=identity(),service=identity(),dps=signedDps(holder),key='1'.repeat(50);
const expected={dpsId:dps.id,signedDps:dps.xml,holderCert:holder.certificatePem,issuerCnpj:'11222333000181',accessKey:key};
const ENVELOPED='http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const C14N='http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const EXCLUSIVE='http://www.w3.org/2001/10/xml-exc-c14n#';
function rootSignature(xml:string){const doc=parseFiscalXml(xml),signature=singleElement(doc.documentElement!,DSIG_NAMESPACE,'Signature');return {doc,signature,info:singleElement(signature,DSIG_NAMESPACE,'SignedInfo')};}
function assertCryptographicSignature(xml:string){
 const {signature}=rootSignature(xml),verifier=new SignedXml({publicCert:service.certificatePem,getCertFromKeyInfo:()=>null});
 verifier.loadSignature(new XMLSerializer().serializeToString(signature));assert.equal(verifier.checkSignature(xml),true,'fixture remains cryptographically signed');
}
function resignInfo(xml:string,change:(info:Element)=>void){
 const {doc,signature,info}=rootSignature(xml);change(info);
 const verifier=new SignedXml({publicCert:service.certificatePem,getCertFromKeyInfo:()=>null});
 verifier.loadSignature(new XMLSerializer().serializeToString(signature));
 const method=singleElement(info,DSIG_NAMESPACE,'CanonicalizationMethod').getAttribute('Algorithm')!;
 const canonical=verifier.getCanonXml([method],info as unknown as Node,{ancestorNamespaces:findAncestorNs(doc as unknown as Document,"/*[local-name()='NFSe']/*[local-name()='Signature']/*[local-name()='SignedInfo']")});
 singleElement(signature,DSIG_NAMESPACE,'SignatureValue').textContent=sign('RSA-SHA256',Buffer.from(canonical),service.privateKeyPem).toString('base64');
 return new XMLSerializer().serializeToString(doc);
}
test('NFS-e verifica as quatro canonicalizações XMLDSIG sem trocar digest, chave ou conteúdo da DPS',async()=>{
 const variants=[[C14N,'C14N 1.0'],[C14N+'#WithComments','C14N 1.0 com comentários'],[EXCLUSIVE,'C14N exclusiva'],[EXCLUSIVE+'WithComments','C14N exclusiva com comentários']];
 for(const [canonicalization,label] of variants){
  const chains=[...new Map([[ENVELOPED,C14N],[ENVELOPED,canonicalization],[ENVELOPED],[canonicalization]].map(chain=>[JSON.stringify(chain),chain])).values()];
  for(const transforms of chains){
   const xml=nfseFixture(dps.xml,service,key,'107',{canonicalization,transforms});
   assertCryptographicSignature(xml);
   const inspected=await inspectOfficialNfseContents(xml,expected);
   assert.ok(inspected.document,JSON.stringify({canonicalization,transforms,checks:inspected.checks}));
   assert.ok(inspected.checks.includes(`Canonicalização da NFS-e: ${label}.`));
  }
 }
});
test('referência local sem Transforms usa C14N1.0 implícita e continua exigindo assinatura válida',async()=>{
 const xml=resignInfo(nfseFixture(dps.xml,service,key),info=>{const ref=singleElement(info,DSIG_NAMESPACE,'Reference');ref.removeChild(singleElement(ref,DSIG_NAMESPACE,'Transforms'));});
 assertCryptographicSignature(xml);assert.ok(await verifyOfficialNfseContents(xml,expected));
 assert.equal(await verifyOfficialNfseContents(xml.replace('<vLiq>11.01','<vLiq>11.02'),expected),null);
});
test('parâmetros de canonicalização continuam sujeitos à política explícita e ao XSD oficial',async()=>{
 const xml=nfseFixture(dps.xml,service,key,'107',{canonicalization:EXCLUSIVE,transforms:[ENVELOPED,EXCLUSIVE],inclusiveNamespacesPrefixList:['#default']});
 assertCryptographicSignature(xml);
 const method=singleElement(rootSignature(xml).info,DSIG_NAMESPACE,'CanonicalizationMethod');
 assert.equal(allowsNfseCanonicalization(method),true);
 // The pinned official XSD does not declare InclusiveNamespaces. Do not modify it to admit extra parameters.
 assert.equal(await verifyOfficialNfseContents(xml,expected),null);
 const invalid=resignInfo(nfseFixture(dps.xml,service,key,'107',{canonicalization:EXCLUSIVE}),info=>{
  const method=singleElement(info,DSIG_NAMESPACE,'CanonicalizationMethod');
  const param=info.ownerDocument!.createElementNS(DSIG_NAMESPACE,'DigestValue');param.textContent='AA==';method.appendChild(param);
 });
 assertCryptographicSignature(invalid);const result=await inspectOfficialNfseContents(invalid,expected);
 assert.equal(result.document,null);assert.match(result.checks.join('\n'),/Política da assinatura da NFS-e: não validado/);assert.ok(!result.checks.join('').includes('SYNTHETIC_PRIVATE_PARAMETER'));
 const excessive=parseFiscalXml(`<CanonicalizationMethod xmlns="${DSIG_NAMESPACE}" Algorithm="${EXCLUSIVE}"><InclusiveNamespaces xmlns="${EXCLUSIVE}" PrefixList="${'p '.repeat(65)}"/></CanonicalizationMethod>`).documentElement!;
 assert.equal(allowsNfseCanonicalization(excessive),false);
});
test('assinatura matemática válida não permite referência a outra árvore ou parâmetros XPath',async()=>{
 const wrong=nfseFixture(dps.xml,service,key,'107',{canonicalization:EXCLUSIVE+'WithComments',referenceXPath:"/*[local-name()='NFSe']/*[local-name()='infNFSe']/*[local-name()='DPS']/*[local-name()='infDPS']"});
 assertCryptographicSignature(wrong);assert.equal(await verifyOfficialNfseContents(wrong,expected),null);
 const xpath=resignInfo(nfseFixture(dps.xml,service,key),info=>{
  const transform=singleElement(singleElement(info,DSIG_NAMESPACE,'Reference'),DSIG_NAMESPACE,'Transforms').firstChild as Element;
  const parameter=info.ownerDocument!.createElementNS(DSIG_NAMESPACE,'XPath');parameter.textContent='true()';transform.appendChild(parameter);
 });
 assertCryptographicSignature(xpath);assert.equal(await verifyOfficialNfseContents(xpath,expected),null);
});
test('método desconhecido, SHA1, dados alterados e referência adicional continuam recusados',async()=>{
 const xml=nfseFixture(dps.xml,service,key,'107',{canonicalization:C14N+'#WithComments'});
 for(const candidate of [xml.replace(C14N+'#WithComments','https://example.invalid/PRIVATE_ALGORITHM'),
  xml.replace('<vServ>11.01','<vServ>11.02'),xml.replace('<vLiq>11.01','<vLiq>11.02'),
  xml.replace('<SignedInfo>','<SignedInfo><!--comment-->')])assert.equal(await verifyOfficialNfseContents(candidate,expected),null);
 const sha1=nfseFixture(dps.xml,service,key,'107',{canonicalization:EXCLUSIVE,signatureAlgorithm:'http://www.w3.org/2000/09/xmldsig#rsa-sha1',digestAlgorithm:'http://www.w3.org/2000/09/xmldsig#sha1'});
 assertCryptographicSignature(sha1);assert.equal(await verifyOfficialNfseContents(sha1,expected),null);
 const multiple=resignInfo(xml,info=>info.appendChild(singleElement(info,DSIG_NAMESPACE,'Reference').cloneNode(true)));
 assertCryptographicSignature(multiple);assert.equal(await verifyOfficialNfseContents(multiple,expected),null);
 const inspected=await inspectOfficialNfseContents(xml.replace(C14N+'#WithComments','https://example.invalid/PRIVATE_ALGORITHM'),expected);
 assert.ok(!inspected.checks.join('').includes('PRIVATE_ALGORITHM'));
 // New reply canonicalization compatibility never changes the original holder's DPS signature policy.
 assert.ok(verifyDpsSignature(dps.xml,dps.id,holder.certificatePem));
 assert.equal(verifyDpsSignature(dps.xml.replace(C14N,C14N+'#WithComments'),dps.id,holder.certificatePem),false);
});
