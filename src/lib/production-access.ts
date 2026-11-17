import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadCertificateMaterial} from '@/lib/certificate-material';
import {discoverOfficialContract} from '@/lib/nfse/contract';
import {supportedNfseContract,verifiedSefinLookup,readFiscalJson} from '@/lib/nfse/api-contract';
import {ownSefinLookupId} from '@/lib/nfse/transport-proof';
import {NFSE_BASES,nfseGet} from '@/lib/nfse/http';
import {fiscalResponseObservation} from '@/lib/nfse/transport-observation';
import {ensureDanfseContract} from '@/lib/danfse-server';
import {fiscalTransportError} from '@/lib/nfse/transport-error';

export async function checkProductionAccess(actorId:string,companyId:string){
 const sha=process.env.VERCEL_GIT_COMMIT_SHA??'';
 const build=/^[a-f0-9]{7,40}$/i.test(sha)?sha.slice(0,7):'local';
 const lines=[`Diagnóstico: nfse-production-v2 (${build})`],admin=createAdminClient();
 const report=(verified:boolean,message:string)=>({verified,message,details:[...lines,'Nenhuma nota foi enviada por esta verificação.'].join('\n')});
 if(!admin)return report(false,'O processamento protegido não está disponível.');
 const reserved=await admin.rpc('reserve_production_check',{p_actor:actorId,p_company:companyId});
 const context=reserved.data;
 if(reserved.error||!context)return report(false,'Confira o A1 ativo e o perfil MEI desta empresa. Se acabou de verificar, aguarde alguns minutos.');
 let material:Awaited<ReturnType<typeof loadCertificateMaterial>>|undefined;
 let lookupStarted=false,lookupCompleted=false;
 try{
  const deadline=Date.now()+45_000;
  material=await loadCertificateMaterial({tenantId:context.tenantId,companyId:context.companyId,certificateId:context.certificateId},'access_check');
  if(material.metadata.subject_cnpj!==context.cnpj)throw new Error('Holder mismatch');
  lines.push('A1 protegido: aberto e validado localmente.');
  const current=await admin.rpc('fiscal_contract_record',{p_environment:'production'});
  if(current.error)throw new Error('Registry unavailable');
  let contract=current.data;
  if(!contract||!supportedNfseContract(contract.contract)){
   const captured=await discoverOfficialContract('production',material,deadline-15_000,undefined,step=>lines.push(`Documentação SEFIN: ${step.stage} · HTTP ${step.status} · ${step.outcome}.`));
   if(!captured||!supportedNfseContract(captured.contract)||JSON.stringify(captured.contract).includes(context.cnpj))throw new Error('Contract unsupported');
   const saved=await admin.rpc('store_official_nfse_contract',{p_environment:'production',p_url:captured.url,p_sha256:captured.sha256,p_contract:captured.contract});
   if(saved.error)throw new Error('Registry unavailable');
   contract={contract:captured.contract,sha256:captured.sha256};
  }
  const supported=supportedNfseContract(contract.contract)!;
  lines.push('Contrato SEFIN de produção: reconhecido.');
  // Query fiscal transport first; PDF documentation must not hide its result.
  if(deadline-Date.now()<6000)throw new Error('Deadline');
  const id=ownSefinLookupId(context.profile.issuerMunicipality,context.cnpj,context.profile.series);
  lookupStarted=true;
  const response=await nfseGet('production',NFSE_BASES.production+supported.dpsPath.replace(/\{[^}]+\}/,id),material,5000);
  lookupCompleted=true;
  const observation=fiscalResponseObservation(response.status,response.body,id),data=readFiscalJson(response.body);
  lines.push(`Consulta da DPS própria: HTTP ${observation.http}.`,`Ambiente informado: ${data?.tipoAmbiente===1?'produção':data?.tipoAmbiente===2?'homologação':data?.tipoAmbiente===0?'número 0':'não reconhecido'}.`,`Códigos fiscais: ${observation.codes.length?observation.codes.join(', '):'não identificados'}.`);
  const sefinReady=verifiedSefinLookup(response.status,response.body,id,contract.contract,'production');
  lines.push(`Consulta SEFIN compatível com produção: ${sefinReady?'sim':'não'}.`);
  let danfseReady=false,danfseHttp:number|undefined;
  try{
   await ensureDanfseContract(admin,'production',material,deadline-5000,step=>{
    if(step.status>0)danfseHttp=step.status;
    lines.push(`Documentação DANFS-e: ${step.stage} · HTTP ${step.status} · ${step.outcome}.`);
   });
   danfseReady=true;lines.push('Contrato DANFS-e de produção: reconhecido.');
  }catch{lines.push('Contrato DANFS-e de produção: não confirmado.');}
  if(!sefinReady)return report(false,'A consulta à SEFIN ainda não confirmou o acesso conforme o contrato de produção. Confira o diagnóstico; o envio continua bloqueado.');
  if(!danfseReady)return report(false,danfseHttp===503
   ?'A consulta à SEFIN de produção foi conferida, mas a documentação oficial do DANFS-e retornou HTTP 503. A preparação dos documentos continua pendente; o lote não foi enviado.'
   :'A consulta à SEFIN de produção foi conferida. Falta obter e validar o contrato oficial do DANFS-e para preparar os documentos; o lote não foi enviado.');
  const recorded=await admin.rpc('record_production_readiness',{p_actor:actorId,p_company:context.companyId,p_certificate:context.certificateId,p_profile_hash:context.profileHash,p_contract_hash:contract.sha256,p_http:response.status});
  if(recorded.error||recorded.data!==true)throw new Error('Configuration changed');
  lines.push('Acesso de produção: verificado. A emissão depende da revisão e confirmação de cada lote.');
  return report(true,'Acesso à produção e contratos conferidos. Revise o lote para autorizar a emissão.');
 }catch(error){
  if(lookupStarted&&!lookupCompleted)lines.push(`Consulta da DPS própria: sem resposta HTTP · transporte ${fiscalTransportError(error).reason}.`);
  return report(false,'Não foi possível concluir a verificação da produção. Confira o diagnóstico e tente novamente; o envio permanece bloqueado.');
 }
 finally{material?.pfx.fill(0);}
}
