"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmReportReview } from "@/app/painel/importacoes/review-actions";

export function ReviewConfirmation({ id, sha256 }: { id: string; sha256: string }) {
  const [checked, setChecked] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <div className="review-confirmation">
    <label className="fiscal-checkbox"><input type="checkbox" checked={checked} disabled={pending} onChange={e => setChecked(e.target.checked)} /> Conferi os tomadores, valores e competência desta versão para homologação.</label>
    <button className="btn btn--primary" type="button" disabled={pending || !checked} onClick={() => start(async () => {
      try { const result = await confirmReportReview(id, sha256); setError(result.error ?? ""); setMessage(result.success ?? ""); if (result.success) router.refresh(); }
      catch { setError("Não foi possível confirmar. Confira a versão atual e tente novamente."); }
    })}>{pending ? "Confirmando…" : "Confirmar esta revisão"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="save-notice" role="status">{message}</p>}
    <p className="field-hint">A confirmação fica vinculada ao conteúdo desta versão. A transmissão ainda não está habilitada.</p>
  </div>;
}
