import 'server-only';
import {createHash} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {emailConfig,EMAIL_PROVIDERS,providerNames,type EmailProvider} from './config';
import {mailbox} from './routing';
import {sendInvoiceEmail,type ProviderTestMessage} from './providers';

/** Shared DB quotas/lease with invoice email. One intent per provider; no retries or fallback. */
export async function processProviderEmailTests(admin:NonNullable<ReturnType<typeof createAdminClient>>,tenantId?:string,deadline=Date.now()+45_000){
 const config=emailConfig(process.env);
 if(!config.enabled||!EMAIL_PROVIDERS.every(p=>config.providers.includes(p)))return {processed:0,available:false};
 const ready=await admin.rpc('email_provider_tests_ready',{p_tenant:tenantId??null});
 if(ready.error||ready.data!==true)return {processed:0,available:!ready.error};
 let processed=0;
 for(let count=0;count<3&&deadline-Date.now()>30_000;count++){
  const claim=await admin.rpc('claim_email_provider_test',{p_tenant:tenantId??null});
  if(claim.error)throw new Error('Provider test claim unavailable');
  if(!claim.data)break;
  const job=claim.data;
  if(!EMAIL_PROVIDERS.includes(job.provider)||!mailbox(job.destination))throw new Error('Provider test invalid');
  const provider=job.provider as EmailProvider;
  const message:ProviderTestMessage={from:config.sender!,to:job.destination,
   subject:`[TESTE REX · ${providerNames[provider]}] Configuração de e-mail`,
   text:`Olá!\n\nEste é o teste solicitado de envio pelo ${providerNames[provider]}, a partir do Rex.\n\nEsta mensagem não contém nota fiscal nem anexo.\n\nrex`};
  const intent=await admin.rpc('begin_email_provider_test',{p_id:job.id,p_token:job.token,p_sender:message.from,p_payload_sha256:createHash('sha256').update(JSON.stringify(message)).digest('hex')});
  if(intent.error)throw new Error('Provider test intent unavailable');
  if(intent.data?.provider!==provider)break;
  const result=await sendInvoiceEmail(provider,message,process.env);
  const finish=await admin.rpc('finish_email_provider_test',{p_id:job.id,p_token:job.token,p_outcome:result.outcome,p_provider_id:result.outcome==='accepted'?result.id:null});
  if(finish.error||finish.data!==true)throw new Error('Provider test completion unavailable');
  processed++;
 }
 return {processed,available:true};
}
