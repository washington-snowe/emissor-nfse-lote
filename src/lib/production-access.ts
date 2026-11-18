import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadCertificateMaterial} from '@/lib/certificate-material';
import {discoverOfficialContract} from '@/lib/nfse/contract';
import {supportedNfseContract,supportedDpsHeadPath} from '@/lib/nfse/api-contract';
import {ownSefinLookupId,documentedDpsHeadResult} from '@/lib/nfse/transport-proof';
import {NFSE_BASES,nfseHead} from '@/lib/nfse/http';
import {assertLocalDanfseReady} from '@/lib/nfse/danfse-render';
import {DANFSE_SPEC_SHA256} from '@/lib/nfse/danfse-model';
import {fiscalTransportError} from '@/lib/nfse/transport-error';

export async function checkProductionAccess(actorId:string,companyId:string){
 const sha=process.env.VERCEL_GIT_COMMIT_SHA??'';
 const build=/^[a-f0-9]{7,40}$/i.test(sha)?sha.slice(0,7):'local';
 const lines=[`Diagnóstico: nfse-production-v4 (${build})`],admin=createAdminClient();
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
  lines.push('Contrato SEFIN de produção: reconhecido.');
  // API DPS manual 1.4.2(b) documents HEAD existence queries without a JSON envelope.
  // Do not convert GET environment0 into production evidence.
  if(deadline-Date.now()<6000)throw new Error('Deadline');
  const path=supportedDpsHeadPath(contract.contract);
  if(!path){lines.push('Contrato HEAD da DPS: não reconhecido.');return report(false,'O contrato de produção ainda não confirmou a consulta HEAD da DPS. O envio permanece bloqueado.');}
  lines.push('Contrato HEAD da DPS: reconhecido.');
  const id=ownSefinLookupId(context.profile.issuerMunicipality,context.cnpj,context.profile.series);
  lookupStarted=true;
  const response=await nfseHead('production',NFSE_BASES.production+path.replace(/\{[^}]+\}/,id),material,5000);
  lookupCompleted=true;
  const sefinReady=documentedDpsHeadResult(response.status,response.body,response.contentType,contract.contract)!=='unverified';
  lines.push(`Consulta HEAD da DPS própria: HTTP ${response.status}.`,`Corpo da resposta HEAD: ${response.body.length===0?'ausente, conforme o método':'inesperado'}.`,'Destino da consulta: SEFIN oficial de produção.','Campo de ambiente no JSON: não se aplica ao método HEAD.',`Consulta HEAD conforme o contrato: ${sefinReady?'sim':'não'}.`);
  if(!sefinReady)return report(false,'A consulta HEAD à SEFIN ainda não confirmou o acesso conforme o contrato de produção. Confira o diagnóstico; o envio continua bloqueado.');
  try{
   await assertLocalDanfseReady();
   lines.push('Gerador local DANFS-e: conferido · NT008/2026 v1.02.','Preparação do PDF: sem dependência da API de geração suspensa ou da sessão do portal.');
  }catch{
   lines.push('Gerador local DANFS-e: indisponível.');
   return report(false,'A consulta à SEFIN foi conferida, mas o gerador do DANFS-e precisa de correção. O lote não foi enviado.');
  }
  const recorded=await admin.rpc('record_production_readiness_with_local_danfse',{p_actor:actorId,p_company:context.companyId,p_certificate:context.certificateId,p_profile_hash:context.profileHash,p_contract_hash:contract.sha256,p_http:response.status,p_spec_hash:DANFSE_SPEC_SHA256});
  if(recorded.error){lines.push('Registro da preparação local: atualização do banco pendente ou indisponível.');return report(false,'A preparação do DANFS-e precisa da atualização 22 do banco. O lote não foi enviado.');}
  if(recorded.data!==true)throw new Error('Configuration changed');
  lines.push('Acesso de produção: verificado. A emissão depende da revisão e confirmação de cada lote.');
  return report(true,'Acesso à produção e gerador do DANFS-e conferidos. Revise o lote para autorizar a emissão.');
 }catch(error){
  if(lookupStarted&&!lookupCompleted)lines.push(`Consulta HEAD da DPS própria: sem resposta HTTP · transporte ${fiscalTransportError(error).reason}.`);
  return report(false,'Não foi possível concluir a verificação da produção. Confira o diagnóstico e tente novamente; o envio permanece bloqueado.');
 }
 finally{material?.pfx.fill(0);}
}
