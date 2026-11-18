'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {verifyProduction} from '@/app/painel/importacoes/production-actions';
export function ProductionAccessCheck({companyId,onVerified}:{companyId:string;onVerified:()=>Promise<void>}){
 const [result,setResult]=useState<{verified:boolean;message:string;details:string}>(),[pending,start]=useTransition(),started=useRef(false),[copied,setCopied]=useState(false);
 const run=()=>start(async()=>{
  setCopied(false);
  try{const next=await verifyProduction(companyId);setResult(next);if(next.verified)await onVerified();}
  catch{setResult({verified:false,message:'Não foi possível concluir a consulta à produção. Tente novamente.',details:''});}
 });
 useEffect(()=>{if(!started.current){started.current=true;start(async()=>{
  try{const next=await verifyProduction(companyId);setResult(next);if(next.verified)await onVerified();}
  catch{setResult({verified:false,message:'Não foi possível concluir a consulta à produção. Tente novamente.',details:''});}
 });}},[companyId,onVerified]);
 return <section className="save-notice"><h3>Acesso à produção</h3><p>{pending?'Conferindo o A1, a SEFIN e o gerador do DANFS-e. Esta consulta não emite notas.':result?.message??'A verificação começa automaticamente.'}</p>
 {!pending&&<button className="btn btn--secondary" type="button" onClick={run}>Verificar produção novamente</button>}
 {result?.details&&<><button className="btn btn--secondary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(result.details);setCopied(true);}catch{setCopied(false);}}}>{copied?'Diagnóstico copiado':'Copiar diagnóstico de produção'}</button><details><summary>Ver diagnóstico</summary><pre className="fiscal-identifier" style={{whiteSpace:'pre-wrap'}}>{result.details}</pre></details></>}
 </section>;
}
