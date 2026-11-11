"use client";
import { useState, useTransition } from "react";
import { deactivateCertificate } from "@/app/painel/certificados/actions";
export function CertificateDeactivate({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return <div><button className="btn btn--secondary" disabled={pending} onClick={() => start(async () => {
    try { const result = await deactivateCertificate(id); setMessage(result.error ?? result.success ?? ""); }
    catch { setMessage("Não foi possível desativar o certificado."); }
  })}>{pending ? "Desativando…" : "Desativar nesta conta"}</button><p className="field-hint" role="status">{message}</p></div>;
}
