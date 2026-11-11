"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function QueueRefresh({ waiting, retryAction }: { waiting: boolean; retryAction?: () => Promise<{ error?: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!waiting) return;
    let checks = 0;
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
      if (++checks >= 6) clearInterval(timer);
    }, 10_000);
    return () => clearInterval(timer);
  }, [waiting, router]);
  return <div className="report-back"><div className="report-actions">
    <button className="btn btn--secondary" disabled={pending} onClick={() => router.refresh()}>Atualizar resultado</button>
    {waiting && retryAction && <button className="btn btn--primary" disabled={pending} onClick={() => start(async () => {
      setError("");
      try { const result = await retryAction(); setError(result.error ?? ""); router.refresh(); }
      catch { setError("Não foi possível solicitar o processamento. Tente novamente."); }
    })}>{pending ? "Solicitando…" : "Retomar processamento"}</button>}
  </div><p className="field-error" role="alert">{error}</p></div>;
}
