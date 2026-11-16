import {createHash} from 'node:crypto';
import {verifyDpsSignature} from './signature.ts';
import {inspectFiscalDocuments} from './schema.ts';
import {MAX_FISCAL_XML_BYTES,parseFiscalXml,directElements} from './xml.ts';
import {NFSE_NAMESPACE} from './dps.ts';
import {emissionTimeReport} from './emission-time.ts';

/** Inspect the immutable original snapshot in memory. No rebuilding, A1, HTTP or state changes. */
export async function inspectStoredDps(snapshot:unknown,dispatchAt?:string):Promise<string[]>{
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
  const purposes=infos.length===1?directElements(infos.item(0)!,NFSE_NAMESPACE,'finNFSe'):[];
  lines.push(`Finalidade regular finNFSe em infDPS: ${!purposes.length?'ausente':purposes.length===1&&purposes[0].textContent==='0'?'presente':'não reconhecida'}.`);
  const emission=infos.length===1?directElements(infos.item(0)!,NFSE_NAMESPACE,'dhEmi'):[];
  lines.push(...emissionTimeReport(emission.length===1?emission[0].textContent:null,dispatchAt));
 }catch{return [...lines,'Estrutura XML: inválida ou fora dos limites locais.'];}
 lines.push(`Assinatura com o certificado público original: ${verifyDpsSignature(xml,id,certificatePem)?'confere':'não validada'}.`);
 const schema=await inspectFiscalDocuments([xml],'DPS','homologation-20261020');
 lines.push(`XSD homologação 20/10/2026: ${!schema.completed?'validação indisponível':schema.valid?'estrutura aceita':'estrutura recusada'}.`);
 if(schema.fields.length)lines.push(`Campos apontados pelo XSD local: ${schema.fields.join(', ')}.`);
 const legacy=await inspectFiscalDocuments([xml],'DPS','production-20260209');
 lines.push(`XSD de produção 09/02/2026 (legado): ${!legacy.completed?'validação indisponível':legacy.valid?'estrutura aceita':'estrutura recusada'}.`);
 lines.push('O XSD de homologação é usado sem adaptações. A validação local não comprova aceitação pela SEFIN.');
 return lines;
}
