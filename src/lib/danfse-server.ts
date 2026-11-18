import 'server-only';
import {createHash} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {validDanfsePdf,MAX_DANFSE_BYTES} from '@/lib/nfse/danfse';
import {verifyOfficialNfseContents} from '@/lib/nfse/receipt';
import {renderLocalDanfse} from '@/lib/nfse/danfse-render';
import {DANFSE_RENDERER_VERSION} from '@/lib/nfse/danfse-model';
import type {NfseEnvironment} from '@/lib/nfse/http';

type DanfseContext={actorId:string;tenantId:string;documentId:string};
type Failure='source_unavailable'|'schema_update_required'|'document_invalid'|'rendering_failed';
class DanfseError extends Error{constructor(readonly reason:Failure){super(reason);}}
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');

/** Owner-bound authorized source only. No client XML, key, URL or PDF is accepted.
 * NT008/2026 v1.02 supersedes the suspended ADN generation API. No portal login,
 * private A1, fiscal communication, state transition or new numbering is needed.
 */
export async function loadDanfse(context:DanfseContext,deadline=Date.now()+40_000){
 return readDanfse(context,deadline);
}

/** Same read-only generation as the download. Public certificate snapshot only. */
export async function inspectDanfse(context:DanfseContext){
 const sha=process.env.VERCEL_GIT_COMMIT_SHA??'',build=/^[a-f0-9]{7,40}$/i.test(sha)?sha.slice(0,7):'local';
 const lines=[`Diagnóstico: nfse-danfse-v4 (${build})`,'Modo: geração local pelo XML autorizado · NT008/2026 v1.02.'];let available=false;
 try{await readDanfse(context,Date.now()+40_000,line=>lines.push(line));available=true;}
 catch(error){lines.push(`Preparação do PDF: não concluída · ${error instanceof DanfseError?error.reason:'source_unavailable'}.`);}
 lines.push(`DANFS-e disponível: ${available?'sim':'não'}.`,'Esta conferência não libera produção, não altera a operação e não envia notas ou e-mails.');
 return {available,details:lines.join('\n')};
}

async function readDanfse(context:DanfseContext,deadline:number,report?:(line:string)=>void){
 const admin=createAdminClient();if(!admin)throw new DanfseError('source_unavailable');
 const source=await admin.rpc('danfse_document_source',{p_actor:context.actorId,p_document:context.documentId}),data=source.data;
 if(source.error||!data||data.tenantId!==context.tenantId||!['homologation','production'].includes(data.environment)||!/^\d{50}$/.test(data.accessKey)||!/^\d{14}$/.test(data.cnpj))throw new DanfseError('source_unavailable');
 report?.(`Documento próprio autorizado: conferido · ${data.environment==='production'?'produção':'homologação'}.`);
 if(data.pdf!==null){
  if(typeof data.pdf!=='string'||data.pdf.length>2_710_000)throw new DanfseError('document_invalid');
  const bytes=Buffer.from(data.pdf,'base64');
  if(bytes.length>MAX_DANFSE_BYTES||!validDanfsePdf(bytes)||hash(bytes)!==data.sha256)throw new DanfseError('document_invalid');
  report?.('Origem: cache privado de download oficial anterior · hash conferido. Nenhuma consulta externa.');
  return {bytes,accessKey:data.accessKey,environment:data.environment as NfseEnvironment,source:'official_cache' as const};
 }
 if(data.generator!==DANFSE_RENDERER_VERSION||typeof data.xml!=='string'||!data.original)throw new DanfseError('schema_update_required');
 const original=data.original;
 if(typeof original.xml!=='string'||typeof original.id!=='string'||typeof original.certificatePem!=='string'||hash(data.xml)!==data.xmlSha256||hash(original.xml)!==original.sha256)throw new DanfseError('document_invalid');
 report?.('Hashes do XML autorizado e da DPS original: conferidos.');
 if(deadline-Date.now()<5000)throw new DanfseError('source_unavailable');
 const verified=await verifyOfficialNfseContents(data.xml,{accessKey:data.accessKey,dpsId:original.id,signedDps:original.xml,holderCert:original.certificatePem,issuerCnpj:data.cnpj,environment:data.environment});
 if(!verified)throw new DanfseError('document_invalid');
 report?.('XSD, ambiente, identidade, conteúdo da DPS e assinaturas: conferidos.');
 if(deadline-Date.now()<2000)throw new DanfseError('source_unavailable');
 try{
  const pdf=await renderLocalDanfse(verified.xml,{accessKey:data.accessKey,issuerCnpj:data.cnpj,environment:data.environment});
  report?.('Origem do PDF: geração no Rex pelo XML autorizado, sem acesso ao portal ou à API de PDF.');
  report?.('PDF A4 e QR Code de consulta nacional: gerados.');
  return {bytes:pdf.bytes,accessKey:data.accessKey,environment:data.environment as NfseEnvironment,source:'local_nt008' as const};
 }catch{throw new DanfseError('rendering_failed');}
}
