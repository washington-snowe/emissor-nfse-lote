'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {verifyProduction} from '@/app/painel/importacoes/production-actions';
export function ProductionAccessCheck({companyId,onVerified}:{companyId:string;onVerified:()=>Promise<void>}){
 const [result,setResult]=useState<{verified:boolean;message:string}>(),[pending,start]=useTransition(),started=useRef(false);
 const run=()=>start(async()=>{
  try{const next=await verifyProduction(companyId);setResult(next);if(next.verified)await onVerified();}
  catch{setResult({verified:false,message:'Não foi possível concluir a consulta à produção. Tente novamente.'});}
 });
 useEffect(()=>{if(!started.current){started.current=true;start(async()=>{
  try{const next=await verifyProduction(companyId);setResult(next);if(next.verified)await onVerified();}
  catch{setResult({verified:false,message:'Não foi possível concluir a consulta à produção. Tente novamente.'});}
 });}},[companyId,onVerified]);
 return <section className="save-notice"><h3>Acesso à produção</h3><p>{pending?'Conferindo o A1, a SEFIN e o gerador do DANFS-e. Esta consulta não emite notas.':result?.message??'A verificação começa automaticamente.'}</p>
 {!pending&&<button className="btn btn--secondary" type="button" onClick={run}>Verificar produção novamente</button>}
 </section>;
}
