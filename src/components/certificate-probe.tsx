"use client";
import { useState, useTransition } from "react";
import { probeCertificate, type CertificateState } from "@/app/painel/certificados/actions";
export function CertificateProbe({ id }: { id: string }) {
  const [pending,start]=useTransition();
  const [state,setState]=useState<CertificateState>({});
  const [copyStatus,setCopyStatus]=useState("");
  return <div><button className="btn btn--secondary" disabled={pending} onClick={()=>start(async()=>{
    setCopyStatus("");
    try { setState(await probeCertificate(id)); }
    catch { setState({error:"Não foi possível concluir a verificação. Tente novamente."}); }
  })}>{pending ? "Verificando acesso…" : "Verificar acesso à homologação"}</button><p className={state.error ? "field-error" : "form-success"} role="status">{state.error ?? state.success}</p>{state.notice && <p className="field-hint" role="status">{state.notice}</p>}{state.details && <div><details><summary>Detalhes da verificação</summary><p className="field-hint" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{state.details}</p></details><button className="btn btn--secondary" type="button" onClick={async()=>{
    try { await navigator.clipboard.writeText(state.details!); setCopyStatus("Diagnóstico copiado."); }
    catch { setCopyStatus("Abra os detalhes da verificação para copiar o texto."); }
  }}>Copiar diagnóstico</button><p className="field-hint" role="status">{copyStatus}</p></div>}</div>;
}
