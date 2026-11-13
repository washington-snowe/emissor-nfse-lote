'use server';
import {after} from 'next/server';
import {revalidatePath} from 'next/cache';
import {requireWorkspace} from '@/lib/tenancy-server';
import {createAdminClient} from '@/lib/supabase/admin';
import {processInvoiceEmails} from '@/lib/email/jobs';
import {emailConfig} from '@/lib/email/config';
import {mailbox} from '@/lib/email/routing';
export type EmailActionState={error?:string;success?:string};
export async function enableBatchEmails(batchId:string,_state:EmailActionState,_form:FormData):Promise<EmailActionState>{
 void _state;void _form;
 const {context}=await requireWorkspace(),admin=createAdminClient();
 if(!/^[0-9a-f-]{36}$/i.test(batchId)||!admin||!emailConfig(process.env).enabled)return {error:'O domínio e os provedores de e-mail ainda precisam ser configurados.'};
 const result=await admin.rpc('enable_invoice_email',{p_actor:context.user.id,p_batch:batchId});
 if(result.error||result.data!==true)return {error:'Não foi possível preparar os e-mails deste lote.'};
 after(async()=>{try{await processInvoiceEmails(context.tenantId);}catch{/* Durable recovery. */}});revalidatePath('/painel/notas','layout');
 return {success:'Entrega preparada. Em homologação, somente o endereço de teste configurado receberá documentos.'};
}
export async function retryInvoiceEmail(id:string,_state:EmailActionState,_form:FormData):Promise<EmailActionState>{
 void _state;void _form;
 const {context}=await requireWorkspace(),admin=createAdminClient();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!admin)return {error:'Entrega não encontrada.'};
 const raw=_form.get('destination');const destination=raw?mailbox(raw):null;
 if(raw&&!destination)return {error:'Informe um único e-mail válido para o vendedor desta nota.'};
 const result=await admin.rpc('retry_invoice_email',{p_actor:context.user.id,p_delivery:id,p_email:destination});
 if(result.error||result.data!==true)return {error:'Esta entrega não permite nova tentativa automática. Confira o resultado no provedor.'};
 after(async()=>{try{await processInvoiceEmails(context.tenantId);}catch{/* Never retry uncertain acceptance. */}});revalidatePath('/painel/notas','layout');
 return {success:'Nova tentativa de e-mail solicitada. A nota fiscal não será emitida novamente.'};
}
