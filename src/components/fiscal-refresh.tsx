"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
export function FiscalRefresh({ waiting }: { waiting: boolean }) {
  const router = useRouter(), [pending, start] = useTransition(), [round, setRound] = useState(0);
  useEffect(() => {
    if (!waiting || round >= 8) return;
    const timer = setTimeout(() => { if (document.visibilityState === "visible") { router.refresh(); setRound(value => value + 1); } }, 8000);
    return () => clearTimeout(timer);
  }, [waiting, round, router]);
  return <button className="btn btn--secondary" disabled={pending} type="button" onClick={() => start(() => { setRound(0); router.refresh(); })}>{pending ? "Atualizando…" : "Atualizar histórico"}</button>;
}
