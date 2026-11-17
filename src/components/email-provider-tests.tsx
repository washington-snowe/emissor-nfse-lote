'use client';
import {useActionState} from 'react';
import {requestProviderTests} from '@/app/painel/notas/email-teste/actions';
import {EMAIL_PROVIDERS,providerNames,type EmailProvider} from '@/lib/email/config';
export type ProviderTestDisplay={id:string;provider:EmailProvider;destination:string;status:string;reason:string|null;next_run_at:string;created_at:string};
const labels:Record<string,string>={queued:'Na fila',processing:'Enviando teste',accepted:'Aceito pelo provedor',failed:'Envio recusado',uncertain:'Aceitação não confirmada'};
const reasons:Record<string,string>={provider_quota:'Aguardando liberação da cota do provedor.',interval:'Aguardando o intervalo de envio do provedor.',quota_rejected:'O provedor recusou o envio por cota ou limite da conta.',failed:'Confira a conta, o remetente aprovado e as credenciais deste provedor.',network_uncertain:'Confira o histórico neste provedor antes de repetir; a mensagem pode ter sido aceita.'};
export function EmailProviderTests({request,destinations,configured,sender,ready,tests}:{request:string;destinations:string[];configured:EmailProvider[];sender:string|null;ready:boolean;tests:ProviderTestDisplay[]}){
 const [state,submit,pending]=useActionState(requestProviderTests,{});
 const enabled=ready&&Boolean(sender)&&configured.length===3&&destinations.length>0;
 return <section className="dashboard-welcome"><h2>Teste os três provedores.</h2>
  <p>Uma mensagem simples por Brevo, SendPulse e Mailjet, sem nota fiscal ou anexo. Os envios seguem em fila, respeitando as cotas e o intervalo do SendPulse.</p>
  <p>Remetente: {sender??'Aguardando configuração'}</p>
  <p>{EMAIL_PROVIDERS.map(p=>`${providerNames[p]}: ${configured.includes(p)?'configurado':'aguardando configuração'}`).join(' · ')}</p>
  {!ready&&<p className="save-notice">O teste está aguardando a atualização ou a disponibilidade do banco.</p>}
  {!destinations.length&&<p className="save-notice">Confirme o e-mail da sua conta ou configure o endereço de teste no servidor.</p>}
  <form action={submit}><input type="hidden" name="request" value={request}/><label className="field">Receber os testes em<select name="destination" required disabled={!enabled||pending} defaultValue={destinations[0]}>{destinations.map(email=><option value={email} key={email}>{email}</option>)}</select></label>
   <button className="btn btn--primary" disabled={!enabled||pending}>{pending?'Preparando testes…':'Enviar um teste por provedor'}</button>
   {state.error&&<p className="form-error" role="alert">{state.error}</p>}{state.success&&<p className="save-notice" role="status">{state.success}</p>}
  </form>
  {tests.length>0&&<div className="fiscal-operation-list">{tests.map(test=><article className="fiscal-operation" key={test.id}>
   <h3>{providerNames[test.provider]}</h3><p className="fiscal-identifier">{test.destination}</p><strong>{labels[test.status]??'Resultado indisponível'}</strong>
   {test.reason&&<p>{reasons[test.reason]??'Confira o resultado no provedor.'}</p>}
   {test.status==='accepted'&&<p>Aceito para envio; confira também sua caixa de entrada e o spam.</p>}
  </article>)}</div>}
 </section>;
}
