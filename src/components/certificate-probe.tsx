"use client";
import { useState, useTransition } from "react";
import { probeCertificate, type CertificateState } from "@/app/painel/certificados/actions";
export function CertificateProbe({ id }: { id: string }) {
  const [pending,start]=useTransition();
  const [state,setState]=useState<CertificateState>({});
  return <div><button className="btn btn--secondary" disabled={pending} onClick={()=>start(async()=>{
    try { setState(await probeCertificate(id)); }
    catch { setState({error:"Não foi possível concluir a verificação. Tente novamente."}); }
  })}>{pending ? "Verificando acesso…" : "Verificar acesso à homologação"}</button><p className={state.error ? "field-error" : "form-success"} role="status">{state.error ?? state.success}</p>{state.notice && <p className="field-hint" role="status">{state.notice}</p>}</div>;
}
