import 'server-only';
import {createHash} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadCertificateMaterial} from '@/lib/certificate-material';
import {discoverOfficialContract,type ContractDiscoveryStep} from '@/lib/nfse/contract';
import {fetchOfficialDanfse,supportedDanfseContract,validDanfsePdf,MAX_DANFSE_BYTES} from '@/lib/nfse/danfse';
import type {NfseCredentials,NfseEnvironment} from '@/lib/nfse/http';

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
export async function loadOfficialDanfse(context:{actorId:string;tenantId:string;documentId:string},deadline=Date.now()+40_000){
 const admin=createAdminClient();if(!admin)throw new Error('DANFSe service unavailable');
 const source=await admin.rpc('danfse_document_source',{p_actor:context.actorId,p_document:context.documentId});
 const data=source.data;
 if(source.error||!data||data.tenantId!==context.tenantId||!['homologation','production'].includes(data.environment)||!/^\d{50}$/.test(data.accessKey))throw new Error('DANFSe source unavailable');
 if(data.pdf!==null){
  if(typeof data.pdf!=='string'||data.pdf.length>2_710_000)throw new Error('DANFSe cache invalid');
  const bytes=Buffer.from(data.pdf,'base64');
  if(bytes.length>MAX_DANFSE_BYTES||!validDanfsePdf(bytes)||createHash('sha256').update(bytes).digest('hex')!==data.sha256)throw new Error('DANFSe cache invalid');
  return {bytes,accessKey:data.accessKey,environment:data.environment as NfseEnvironment};
 }
 if(typeof data.certificateId!=='string'||deadline-Date.now()<10_000)throw new Error('DANFSe source unavailable');
 const material=await loadCertificateMaterial({tenantId:data.tenantId,companyId:data.companyId,certificateId:data.certificateId},'reconcile');
 try{
  if(material.metadata.subject_cnpj!==data.cnpj)throw new Error('DANFSe holder mismatch');
  const captured=await ensureDanfseContract(admin,data.environment,material,deadline-8000);
  if(deadline-Date.now()<8000)throw new Error('DANFSe deadline');
  const pdf=await fetchOfficialDanfse(data.environment,data.accessKey,captured.contract,material);
  const stored=await admin.rpc('store_fiscal_danfse',{p_actor:context.actorId,p_document:context.documentId,p_environment:data.environment,p_access_key:data.accessKey,p_pdf:pdf.bytes.toString('base64'),p_contract_hash:captured.sha256});
  if(stored.error||stored.data!==true)throw new Error('DANFSe cache unavailable');
  return {bytes:pdf.bytes,accessKey:data.accessKey,environment:data.environment as NfseEnvironment};
 }finally{material.pfx.fill(0);}
}
