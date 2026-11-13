import 'server-only';
import {createHash} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {emailConfig,type EmailProvider} from './config';
import {mailbox,sellerEmailRoute} from './routing';
import {sendInvoiceEmail,type InvoiceMessage} from './providers';
import {validatePersistedReport} from '@/lib/persisted-report';
import {parseFiscalXml,singleElement} from '@/lib/nfse/xml';
import {NFSE_NAMESPACE} from '@/lib/nfse/dps';

export async function processInvoiceEmails(tenantId?:string,deadline=Date.now()+45_000){
 const config=emailConfig(process.env),admin=createAdminClient();
 if(!config.enabled||!admin)return {processed:0,available:false};
 let processed=0;
 for(let count=0;count<8&&deadline-Date.now()>20_000;count++){
  const claimed=await admin.rpc('claim_invoice_email',{p_tenant:tenantId??null});
  if(claimed.error||!claimed.data)return {processed,available:!claimed.error};
  const job=claimed.data;
  const finish=async(outcome:string,id?:string,destination?:string)=>{
   const result=await admin.rpc('finish_invoice_email',{p_delivery:job.id,p_token:job.token,p_outcome:outcome,p_provider_id:id??null,p_destination:destination??null});
   if(result.error||result.data!==true)throw new Error('Email completion unavailable');
  };
  let destination:string|null=null;
  if(job.origin==='report'){
   const report=validatePersistedReport(job.report,job.reportHash);
   if(!report||!job.group){await finish('ambiguous_recipient');processed++;continue;}
   const route=sellerEmailRoute(report,job.group);
   if(!route.email&&!(route.reason==='invalid_email'&&mailbox(job.destinationOverride))){await finish(route.reason??'invalid_email');processed++;continue;}
   destination=mailbox(job.destinationOverride)??route.email??null;
  }else destination=mailbox(job.destinationOverride)??mailbox(job.recipient?.email);
  if(!destination){await finish('invalid_email');processed++;continue;}
  if(job.environment!=='homologation'||!config.testTo){await finish('test_address_missing',undefined,destination);processed++;continue;}
  let number:string;
  try{
   if(typeof job.xml!=='string'||createHash('sha256').update(job.xml).digest('hex')!==job.xmlSha256||!/^\d{50}$/.test(job.accessKey))throw new Error();
   const info=singleElement(parseFiscalXml(job.xml).documentElement!,NFSE_NAMESPACE,'infNFSe');
   if(info.getAttribute('Id')!=='NFS'+job.accessKey)throw new Error();
   number=singleElement(info,NFSE_NAMESPACE,'nNFSe').textContent??'';
   if(!/^\d{1,15}$/.test(number))throw new Error();
  }catch{await finish('document_invalid',undefined,destination);processed++;continue;}
  const message:InvoiceMessage={from:config.sender!,to:config.testTo,subject:'[HOMOLOGAÇÃO · SEM VALOR FISCAL] NFS-e '+number,
   text:['Olá,','Este é um teste de entrega de NFS-e, sem valor fiscal. Nenhum e-mail foi enviado ao vendedor.','Emissor: '+job.issuer+' · CNPJ '+job.issuerCnpj,'Tomador: '+job.recipient.legalName,'NFS-e: '+number,'Competência: '+job.competence,'Valor: R$ '+String(job.amount).replace('.',','),'O XML autorizado no ambiente de homologação está anexado.','rex'].join('\n\n'),
   xml:job.xml,filename:'NFSe-homologacao-'+job.accessKey+'.xml'};
  const intent=await admin.rpc('begin_invoice_email',{p_delivery:job.id,p_token:job.token,p_providers:config.providers,p_destination:message.to,p_sender:message.from,p_test:true,p_payload_sha256:createHash('sha256').update(JSON.stringify(message)).digest('hex')});
  if(intent.error)throw new Error('Email reservation unavailable');
  if(!intent.data?.provider)return {processed,available:true};
  const result=await sendInvoiceEmail(intent.data.provider as EmailProvider,message,process.env);
  await finish(result.outcome,result.outcome==='accepted'?result.id:undefined,destination);processed++;
  // Short pacing only. SendPulse's 75s interval is persisted in PostgreSQL, never slept inside Vercel.
  if(deadline-Date.now()>22_000)await new Promise(resolve=>setTimeout(resolve,1100));
 }
 return {processed,available:true};
}
