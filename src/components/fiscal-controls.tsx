"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enqueueReport, manageOperation, resumeBatch, type FiscalActionState } from "@/app/painel/notas/actions";

export function FiscalControls({ operationId, batchId, reviewId, sha256, status, transmitCount = 0 }: {
  operationId?: string; batchId?: string; reviewId?: string; sha256?: string; status?: string; transmitCount?: number;
}) {
  const [pending, start] = useTransition(), [result, setResult] = useState<FiscalActionState>({});
  const router = useRouter();
  const run = (action: () => Promise<FiscalActionState>) => start(async () => {
    try { const next = await action(); setResult(next); if (next.id) router.push(`/painel/notas/lotes/${next.id}`); else if (next.success) router.refresh(); }
    catch { setResult({ error: "Não foi possível confirmar a ação. Atualize o histórico antes de repetir." }); }
  });
  return <div className="fiscal-controls">
    {batchId && <button className="btn btn--secondary" type="button" disabled={pending} onClick={() => run(() => resumeBatch(batchId))}>Retomar processamento do lote</button>}
    {reviewId && sha256 && <button className="btn btn--primary" type="button" disabled={pending} onClick={() => run(() => enqueueReport(reviewId, sha256, crypto.randomUUID()))}>Colocar lote na fila de homologação</button>}
    {operationId && ["blocked", "intervention", "uncertain"].includes(status ?? "") && <button className="btn btn--secondary" type="button" disabled={pending} onClick={() => run(() => manageOperation(operationId, "resume"))}>{transmitCount ? "Consultar novamente" : "Retomar preparação"}</button>}
    {operationId && transmitCount === 0 && ["queued", "blocked", "preparing", "intervention"].includes(status ?? "") && <button className="btn btn--secondary" type="button" disabled={pending} onClick={() => run(() => manageOperation(operationId, "cancel"))}>Cancelar preparação</button>}
    {result.error && <p className="form-error" role="alert">{result.error}</p>}{result.success && <p className="save-notice" role="status">{result.success}</p>}
  </div>;
}
