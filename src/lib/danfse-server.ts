import 'server-only';
import {createHash} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadCertificateMaterial} from '@/lib/certificate-material';
import {discoverOfficialContract,type ContractDiscoveryStep} from '@/lib/nfse/contract';
import {fetchOfficialDanfse,supportedDanfseContract,validDanfsePdf,MAX_DANFSE_BYTES} from '@/lib/nfse/danfse';
import type {NfseCredentials,NfseEnvironment} from '@/lib/nfse/http';
import {fetchPortalDanfse} from '@/lib/nfse/portal-danfse';
import {fiscalTransportError,NfseTransportError} from '@/lib/nfse/transport-error';

export async function ensureDanfseContract(admin:NonNullable<ReturnType<typeof createAdminClient>>,environment:NfseEnvironment,material:NfseCredentials,deadline:number,report?:(step:ContractDiscoveryStep)=>void){
 const current=await admin.rpc('danfse_contract',{p_environment:environment});
 if(current.error)throw new Error('DANFSe registry unavailable');
 if(current.data&&/^[a-f0-9]{64}$/.test(current.data.sha256)&&supportedDanfseContract(current.data.contract))return current.data;
 const captured=await discoverOfficialContract(environment,material,deadline,undefined,report,'danfse');
 if(!captured||!supportedDanfseContract(captured.contract))throw new Error('DANFSe contract unavailable');
 const stored=await admin.rpc('store_official_danfse_contract',{p_environment:environment,p_url:captured.url,p_sha256:captured.sha256,p_contract:captured.contract});
 if(stored.error)throw new Error('DANFSe registry unavailable');
 return {sha256:captured.sha256,contract:captured.contract};
}

/** Source and cached bytes are owner-bound by the RPC; no client key, URL or PDF is accepted. */
type DanfseContext={actorId:string;tenantId:string;documentId:string};
export async function loadOfficialDanfse(context:DanfseContext,deadline=Date.now()+40_000){
 return readOfficialDanfse(context,deadline);
}

/** Same owner-bound retrieval as the download, with no queue, readiness or PDF-cache mutation. */
export async function inspectOfficialDanfse(context:DanfseContext){
 const sha=process.env.VERCEL_GIT_COMMIT_SHA??'',build=/^[a-f0-9]{7,40}$/i.test(sha)?sha.slice(0,7):'local';
 const lines=[`Diagnóstico: nfse-danfse-v1 (${build})`];let available=false;
 try{await readOfficialDanfse(context,Date.now()+40_000,line=>lines.push(line),true);available=true;}
 catch(error){lines.push(error instanceof NfseTransportError?`Download automático: não confirmado · transporte ${fiscalTransportError(error).reason}.`:'Download automático: não confirmado.');}
 lines.push(`PDF oficial obtido pelo servidor: ${available?'sim':'não'}.`,'Esta conferência não libera produção, não altera a operação e não envia notas ou e-mails.');
 return {available,details:lines.join('\n')};
}

async function readOfficialDanfse(context:DanfseContext,deadline:number,report?:(line:string)=>void,inspectOnly=false){
 const admin=createAdminClient();if(!admin)throw new Error('DANFSe service unavailable');
 const source=await admin.rpc('danfse_document_source',{p_actor:context.actorId,p_document:context.documentId});
 const data=source.data;
 if(source.error||!data||data.tenantId!==context.tenantId||!['homologation','production'].includes(data.environment)||!/^\d{50}$/.test(data.accessKey))throw new Error('DANFSe source unavailable');
 report?.(`Documento próprio autorizado: conferido · ${data.environment==='production'?'produção':'homologação'}.`);
 if(data.pdf!==null){
  if(typeof data.pdf!=='string'||data.pdf.length>2_710_000)throw new Error('DANFSe cache invalid');
  const bytes=Buffer.from(data.pdf,'base64');
  if(bytes.length>MAX_DANFSE_BYTES||!validDanfsePdf(bytes)||createHash('sha256').update(bytes).digest('hex')!==data.sha256)throw new Error('DANFSe cache invalid');
  report?.('Cache privado: PDF íntegro. Nenhuma consulta externa foi necessária.');
  return {bytes,accessKey:data.accessKey,environment:data.environment as NfseEnvironment};
 }
 if(typeof data.certificateId!=='string'||deadline-Date.now()<10_000)throw new Error('DANFSe source unavailable');
 const material=await loadCertificateMaterial({tenantId:data.tenantId,companyId:data.companyId,certificateId:data.certificateId},'reconcile');
 try{
  if(material.metadata.subject_cnpj!==data.cnpj)throw new Error('DANFSe holder mismatch');
  report?.('A1 protegido: titular conferido.');
  let captured:Awaited<ReturnType<typeof ensureDanfseContract>>|undefined,pdf:Awaited<ReturnType<typeof fetchOfficialDanfse>>|undefined;
  try{
   captured=await ensureDanfseContract(admin,data.environment,material,deadline-18_000,step=>report?.(`Documentação DANFS-e: ${step.stage} · HTTP ${step.status} · ${step.outcome}.`));
   if(deadline-Date.now()<8000)throw new Error('DANFSe deadline');
   pdf=await fetchOfficialDanfse(data.environment,data.accessKey,captured.contract,material);
  }catch{report?.('API DANFS-e: PDF não obtido. Consultando a alternativa no portal oficial.');}
  if(pdf&&captured){
   if(!inspectOnly){
    const stored=await admin.rpc('store_fiscal_danfse',{p_actor:context.actorId,p_document:context.documentId,p_environment:data.environment,p_access_key:data.accessKey,p_pdf:pdf.bytes.toString('base64'),p_contract_hash:captured.sha256});
    if(stored.error||stored.data!==true)throw new Error('DANFSe cache unavailable');
   }
   report?.('API DANFS-e: PDF recebido e formato conferido.');
   return {bytes:pdf.bytes,accessKey:data.accessKey,environment:data.environment as NfseEnvironment};
  }
  const portal=await fetchPortalDanfse(data.environment,data.accessKey,material,deadline,step=>{
   report?.(`${step.stage==='portal_login'?'Sessão A1 do portal':'PDF do portal'}: HTTP ${step.status} · ${step.outcome==='accepted'?'conferido':step.outcome==='refused'?'recusado':'recebido'}${step.reason?' · '+step.reason:''}.`);
  });
  // The web portal has no captured API contract. Never register a fabricated one
  // or associate these bytes with the ADN contract hash required by migration21.
  report?.('Origem do PDF: portal oficial do mesmo ambiente. Download sem cache do contrato ADN.');
  return {bytes:portal.bytes,accessKey:data.accessKey,environment:data.environment as NfseEnvironment};
 }finally{material.pfx.fill(0);}
}
