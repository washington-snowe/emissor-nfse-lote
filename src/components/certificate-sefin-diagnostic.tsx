"use client";
import { useState, useTransition } from "react";
import { diagnoseCertificateSefin, type CertificateState } from "@/app/painel/certificados/actions";

export function CertificateSefinDiagnostic({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<CertificateState>({});
  const [copied, setCopied] = useState("");
  return <div className="certificate-sefin-diagnostic">
    <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => start(async () => {
      setState({}); setCopied("");
      try { setState(await diagnoseCertificateSefin(id)); }
      catch { setState({ error: "Não foi possível gerar o diagnóstico nesta tentativa." }); }
    })}>{pending ? "Consultando SEFIN…" : "Gerar diagnóstico da SEFIN"}</button>
    <p role="status" className={state.error ? "field-error" : "field-hint"}>{state.error ?? state.success}</p>
    {state.details && <>
      <details open><summary>Diagnóstico da SEFIN</summary><p className="field-hint" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{state.details}</p></details>
      <button type="button" className="btn btn--secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(state.details!); setCopied("Diagnóstico SEFIN copiado."); }
        catch { setCopied("Selecione e copie o texto do diagnóstico acima."); }
      }}>Copiar diagnóstico SEFIN</button>
      <p role="status" className="field-hint">{copied}</p>
    </>}
  </div>;
}
