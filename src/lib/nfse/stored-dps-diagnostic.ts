import {createHash} from 'node:crypto';
import {verifyDpsSignature} from './signature.ts';
import {inspectFiscalDocuments} from './schema.ts';
import {MAX_FISCAL_XML_BYTES,parseFiscalXml} from './xml.ts';
import {NFSE_NAMESPACE} from './dps.ts';

/** Inspect the immutable original snapshot in memory. No rebuilding, A1, HTTP or state changes. */
export async function inspectStoredDps(snapshot:unknown):Promise<string[]>{
 const unavailable=['XML original: indisponível para análise local.'];
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))return unavailable;
 const {xml,sha256,id,certificatePem}=snapshot as Record<string,unknown>;
 if(typeof xml!=='string'||!xml.length||Buffer.byteLength(xml)>MAX_FISCAL_XML_BYTES||
  typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)||typeof id!=='string'||!/^DPS\d{42}$/.test(id)||
  typeof certificatePem!=='string'||certificatePem.length>32768)return unavailable;
 const matches=createHash('sha256').update(xml).digest('hex')===sha256;
 const lines=['Análise local da DPS original armazenada (sem consulta ou envio).',`Hash do XML original: ${matches?'confere':'divergente'}.`];
 if(!matches)return [...lines,'Análise interrompida por divergência de integridade.'];
 try{
  const doc=parseFiscalXml(xml),root=doc.documentElement!;
  const version=root.getAttribute('versao');
  lines.push(`Versão do XML: ${['1.00','1.01'].includes(version??'')?version:'não reconhecida'}.`);
  const infos=doc.getElementsByTagNameNS(NFSE_NAMESPACE,'infDPS');
  lines.push(`Identidade do XML: ${root.namespaceURI===NFSE_NAMESPACE&&root.localName==='DPS'&&infos.length===1&&infos.item(0)!.getAttribute('Id')===id?'confere':'divergente'}.`);
 }catch{return [...lines,'Estrutura XML: inválida ou fora dos limites locais.'];}
 lines.push(`Assinatura com o certificado público original: ${verifyDpsSignature(xml,id,certificatePem)?'confere':'não validada'}.`);
 const schema=await inspectFiscalDocuments([xml],'DPS');
 lines.push(`XSD local 1.01: ${!schema.completed?'validação indisponível':schema.valid?'estrutura aceita':'estrutura recusada'}.`);
 if(schema.fields.length)lines.push(`Campos apontados pelo XSD local: ${schema.fields.join(', ')}.`);
 lines.push('O validador local adapta apenas a expressão da série; não comprova aceitação pela SEFIN.');
 return lines;
}
