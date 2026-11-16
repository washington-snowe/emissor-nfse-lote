import type {Element} from '@xmldom/xmldom';

export const NFSE_C14N_METHODS={
 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315':'C14N 1.0',
 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments':'C14N 1.0 com comentários',
 'http://www.w3.org/2001/10/xml-exc-c14n#':'C14N exclusiva',
 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments':'C14N exclusiva com comentários',
} as const;
const ENVELOPED='http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const EXCLUSIVE_NAMESPACE='http://www.w3.org/2001/10/xml-exc-c14n#';
const elements=(node:Element)=>{const result:Element[]=[];for(let child=node.firstChild;child;child=child.nextSibling)if(child.nodeType===1)result.push(child as Element);return result;};
const significantText=(node:Element)=>{for(let child=node.firstChild;child;child=child.nextSibling)if([3,4].includes(child.nodeType)&&child.nodeValue?.trim())return true;return false;};
export function nfseCanonicalizationLabel(uri:unknown):string{
 if(typeof uri==='string'&&Object.hasOwn(NFSE_C14N_METHODS,uri))return NFSE_C14N_METHODS[uri as keyof typeof NFSE_C14N_METHODS];
 if(uri==='http://www.w3.org/2006/12/xml-c14n11')return 'C14N 1.1 (não suportada)';
 if(uri==='http://www.w3.org/2006/12/xml-c14n11#WithComments')return 'C14N 1.1 com comentários (não suportada)';
 return 'não reconhecido';
}
/** Built-in canonicalizers only. No XPath/XSLT, algorithm registration or remote URI resolution. */
export function allowsNfseCanonicalization(node:Element):boolean{
 const uri=node.getAttribute('Algorithm');
 if(!uri||!Object.hasOwn(NFSE_C14N_METHODS,uri)||significantText(node))return false;
 const params=elements(node);
 if(!params.length)return true;
 if(!uri.startsWith(EXCLUSIVE_NAMESPACE)||params.length!==1)return false;
 const param=params[0];
 if(param.namespaceURI!==EXCLUSIVE_NAMESPACE||param.localName!=='InclusiveNamespaces'||elements(param).length||significantText(param)||!param.hasAttribute('PrefixList'))return false;
 for(let i=0;i<param.attributes.length;i++){
  const attr=param.attributes.item(i)!;
  if(attr.namespaceURI!=='http://www.w3.org/2000/xmlns/'&&(attr.name!=='PrefixList'||attr.namespaceURI))return false;
 }
 const list=param.getAttribute('PrefixList')!;
 if(list.length>2048)return false;
 const prefixes=list.trim()?list.trim().split(/[\t\r\n ]+/):[];
 return prefixes.length<=64&&prefixes.every(prefix=>/^(?:#default|[A-Za-z_][A-Za-z0-9_.-]*)$/.test(prefix));
}
export function nfseReferenceTransformLabels(transforms:Element[]):string[]{
 if(!transforms.length)return ['C14N 1.0 implícita'];
 const labels=transforms.slice(0,3).map(node=>node.getAttribute('Algorithm')===ENVELOPED?'assinatura envelopada':nfseCanonicalizationLabel(node.getAttribute('Algorithm')));
 if(transforms.length===1&&transforms[0].getAttribute('Algorithm')===ENVELOPED)labels.push('C14N 1.0 implícita');
 return labels;
}
/** These chains preserve the complete local referenced subtree. The digest/signature must still verify. */
export function allowsNfseReferenceTransforms(transforms:Element[]):boolean{
 if(!transforms.length)return true;
 if(transforms.length>2)return false;
 const enveloped=transforms[0].getAttribute('Algorithm')===ENVELOPED;
 if(enveloped){
  if(elements(transforms[0]).length||significantText(transforms[0]))return false;
  return transforms.length===1||allowsNfseCanonicalization(transforms[1]);
 }
 return transforms.length===1&&allowsNfseCanonicalization(transforms[0]);
}
