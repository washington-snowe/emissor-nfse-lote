"use client";
import {useState,useTransition} from 'react';
import {getFiscalOperationDiagnostic} from '@/app/painel/notas/diagnostic-actions';
import {getFiscalReceiptDiagnostic} from '@/app/painel/notas/receipt-diagnostic-actions';
export function FiscalOperationDiagnostic({id}:{id:string}){
 const [pending,start]=useTransition(),[details,setDetails]=useState(''),[message,setMessage]=useState('');
 const [receiptAvailable,setReceiptAvailable]=useState(false),[liveReport,setLiveReport]=useState(false);
 const copy=async(text:string,success:string)=>{
  setDetails(text);try{await navigator.clipboard.writeText(text);setMessage(success);}catch{setMessage('Selecione e copie o diagnóstico abaixo.');}
 };
 return <div className="fiscal-operation-diagnostic"><button type="button" className="btn btn--secondary" disabled={pending} onClick={()=>start(async()=>{
  setDetails('');setMessage('');setReceiptAvailable(false);setLiveReport(false);
  try{
   const result=await getFiscalOperationDiagnostic(id);
   if(result.error||!result.details){setMessage(result.error??'Diagnóstico indisponível.');return;}
   setReceiptAvailable(result.receiptAvailable===true);
   await copy(result.details,'Diagnóstico da emissão copiado.');
  }catch{setMessage('Não foi possível ler o diagnóstico nesta tentativa.');}
 })}>{pending?'Aguarde…':'Copiar diagnóstico da emissão'}</button>
 {receiptAvailable&&<div><p className="field-hint">Próximo passo: clique em “Conferir documento na SEFIN” para gerar o relatório nfse-receipt-v1. Serão feitas somente consultas pelo A1, sem reenviar ou alterar esta operação.</p><button type="button" className="btn btn--secondary" disabled={pending} onClick={()=>start(async()=>{
  setMessage('');
  try{
   const result=await getFiscalReceiptDiagnostic(id);
   if(result.error||!result.details){setMessage(result.error??'Conferência indisponível.');return;}
   setLiveReport(true);await copy(result.details,'Conferência do documento copiada.');
  }catch{setMessage('Não foi possível concluir esta conferência. Nenhuma nota foi enviada.');}
 })}>Conferir documento na SEFIN</button></div>}
 <p role="status" className="field-hint">{message}</p>{details&&<details open><summary>{liveReport?'Conferência do documento na SEFIN':'Diagnóstico da emissão'}</summary><p className="field-hint" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{details}</p></details>}</div>;
}
