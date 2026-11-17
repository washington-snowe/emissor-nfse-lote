'use client';
import {useActionState} from 'react';
import {enableBatchEmails,retryInvoiceEmail} from '@/app/painel/notas/email-actions';
export function InvoiceEmailControls({batchId,deliveryId,needsEmail=false,environment='homologation'}:{batchId?:string;deliveryId?:string;needsEmail?:boolean;environment?:'homologation'|'production'}){
 const action=batchId?enableBatchEmails.bind(null,batchId):retryInvoiceEmail.bind(null,deliveryId!);
 const [state,submit,pending]=useActionState(action,{});
 return <form action={submit}>{needsEmail&&<label className="field">E-mail correto deste vendedor<input name="destination" type="email" required maxLength={254}/></label>}<button className="btn btn--secondary" disabled={pending}>{pending?'Preparando e-mails…':batchId?(environment==='production'?'Preparar entrega de e-mails':'Preparar entrega de e-mails em homologação'):'Tentar entregar novamente'}</button>{state.error&&<p role="alert" className="form-error">{state.error}</p>}{state.success&&<p role="status" className="save-notice">{state.success}</p>}</form>;
}
