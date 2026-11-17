'use client';
import {useState,useTransition} from 'react';
import {getDanfseDiagnostic} from '@/app/painel/notas/danfse-diagnostic-actions';

export function DanfseDiagnostic({documentId}:{documentId:string}){
 const [pending,start]=useTransition(),[details,setDetails]=useState(''),[message,setMessage]=useState('');
 return <div className="fiscal-operation-diagnostic"><button className="btn btn--secondary" type="button" disabled={pending} onClick={()=>start(async()=>{
  setDetails('');setMessage('');
  try{
   const result=await getDanfseDiagnostic(documentId);
   if(result.error||!result.details){setMessage(result.error??'Conferência indisponível.');return;}
   setDetails(result.details);
   try{await navigator.clipboard.writeText(result.details);setMessage('Diagnóstico do DANFS-e copiado.');}
   catch{setMessage('Selecione e copie o diagnóstico abaixo.');}
  }catch{setMessage('Não foi possível conferir o DANFS-e. Nenhuma nota ou e-mail foi enviado.');}
 })}>{pending?'Conferindo PDF oficial…':'Conferir DANFS-e'}</button>
 {message&&<p className="field-hint" role="status">{message}</p>}{details&&<details open><summary>Diagnóstico do DANFS-e</summary><p className="field-hint" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{details}</p></details>}</div>;
}
