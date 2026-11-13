"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
export function ImportProcessingRefresh(){
  const router=useRouter();
  useEffect(()=>{let count=0;const refresh=()=>{if(!document.hidden)router.refresh();};const timer=setInterval(()=>{refresh();if(++count>=20)clearInterval(timer);},6000);document.addEventListener("visibilitychange",refresh);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};},[router]);
  return <p className="field-hint" role="status">Estamos conferindo o relatório. A prévia aparecerá automaticamente nesta página.</p>;
}
