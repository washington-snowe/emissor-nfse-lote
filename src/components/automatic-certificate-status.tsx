"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { certificateVerificationMessage, type VerificationDisplay } from "@/lib/certificate-verification-state";

export function AutomaticCertificateStatus({verification,available=true}: {verification?:VerificationDisplay;available?:boolean}) {
  const router = useRouter();
  const status=verification?.status,nextAttempt=verification?.next_attempt;
  useEffect(() => {
    if (!available || status === "verified") return;
    let count=0;
    const waiting = !status || ["queued","checking"].includes(status);
    const refresh = () => {if (!document.hidden) router.refresh();};
    const timer = waiting ? setInterval(() => {refresh(); if (++count>=20) clearInterval(timer!);},6000) : undefined;
    const retryAt = nextAttempt ? Date.parse(nextAttempt) : NaN;
    const retry = Number.isFinite(retryAt) ? setTimeout(refresh,Math.min(310_000,Math.max(1000,retryAt-Date.now()+1000))) : undefined;
    document.addEventListener("visibilitychange",refresh);
    return () => {clearInterval(timer);clearTimeout(retry);document.removeEventListener("visibilitychange",refresh);};
  },[router,available,status,nextAttempt]);
  return <div className="certificate-automatic-status"><p className={verification?.status === "verified" ? "form-success" : "field-hint"} role="status">{available ? certificateVerificationMessage(verification) : "A verificação automática aguarda a atualização do processamento. O certificado já está protegido."}</p>
    {verification && <details><summary>Detalhes da verificação automática</summary><p className="field-hint">SEFIN · homologação · {verification.result_code ?? verification.status}{verification.http_status ? ` · HTTP ${verification.http_status}` : ""}. A consulta não transmite notas.</p></details>}
  </div>;
}
