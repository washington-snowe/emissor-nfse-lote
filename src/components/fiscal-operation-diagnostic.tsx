"use client";
import {useState,useTransition} from 'react';
import {getFiscalOperationDiagnostic} from '@/app/painel/notas/diagnostic-actions';
export function FiscalOperationDiagnostic({id}:{id:string}){
 const [pending,start]=useTransition(),[details,setDetails]=useState(''),[message,setMessage]=useState('');
 return <div className="fiscal-operation-diagnostic"><button type="button" className="btn btn--secondary" disabled={pending} onClick={()=>start(async()=>{
  setDetails('');setMessage('');
  try{
   const result=await getFiscalOperationDiagnostic(id);
   if(result.error||!result.details){setMessage(result.error??'Diagnóstico indisponível.');return;}
   setDetails(result.details);
   try{await navigator.clipboard.writeText(result.details);setMessage('Diagnóstico da emissão copiado.');}
   catch{setMessage('Selecione e copie o diagnóstico abaixo.');}
  }catch{setMessage('Não foi possível ler o diagnóstico nesta tentativa.');}
 })}>{pending?'Lendo histórico…':'Copiar diagnóstico da emissão'}</button><p role="status" className="field-hint">{message}</p>{details&&<details open><summary>Diagnóstico da emissão</summary><p className="field-hint" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{details}</p></details>}</div>;
}
