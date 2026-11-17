'use server';
import {after} from 'next/server';
import {revalidatePath} from 'next/cache';
import {requireWorkspace} from '@/lib/tenancy-server';
import {createAdminClient} from '@/lib/supabase/admin';
import {emailConfig,EMAIL_PROVIDERS,allowedTestDestinations} from '@/lib/email/config';
import {processProviderEmailTests} from '@/lib/email/provider-tests';
export type ProviderTestState={error?:string;success?:string};
export async function requestProviderTests(_state:ProviderTestState,form:FormData):Promise<ProviderTestState>{
 const {context}=await requireWorkspace(),admin=createAdminClient(),config=emailConfig(process.env);
 if(!admin||!config.enabled||!EMAIL_PROVIDERS.every(p=>config.providers.includes(p)))return {error:'Configure e habilite o remetente e os três provedores no servidor antes do teste.'};
 const request=form.get('request'),raw=form.get('destination');
 const allowed=allowedTestDestinations(context.user.email,Boolean(context.user.email_confirmed_at),config.testTo);
 const destination=typeof raw==='string'?allowed.find(a=>a.toLowerCase()===raw.toLowerCase()):undefined;
 if(typeof request!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request)||!destination)return {error:'Escolha seu e-mail confirmado ou o endereço de teste configurado no servidor.'};
 const result=await admin.rpc('request_email_provider_tests',{p_actor:context.user.id,p_request:request,p_destination:destination});
 if(result.error)return {error:'Não foi possível preparar os testes. Confira se a atualização do banco foi aplicada.'};
 if(result.data!==true)return {error:'Já existe uma rodada de testes nas últimas 24 horas. Confira o resultado abaixo antes de repetir.'};
 after(async()=>{try{await processProviderEmailTests(admin,context.tenantId);}catch{/* Persistent intent prevents duplicate tests. */}});
 revalidatePath('/painel/notas/email-teste');
 return {success:'Três testes preparados: Brevo, SendPulse e Mailjet. Acompanhe o resultado abaixo e confira sua caixa de entrada.'};
}
