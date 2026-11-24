"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Upload } from "lucide-react";
import { money, planPrice, plans, type Cadence, type Plan } from "@/lib/billing/catalog";
import { PlanCard } from "@/components/plan-card";

const maximumVolume = 10_000;
const maxCsvBytes = 512 * 1024;
const number = new Intl.NumberFormat("pt-BR");

function estimateMonthly(plan: Plan, cadence: Cadence, extraNotes: number) {
  const months = cadence === "annual" ? 12n : 1n;
  const units = BigInt(planPrice(plan, cadence)) * 100n + BigInt(extraNotes) * BigInt(plan.overageUnits) * months;
  return money(String((units + 50n * months) / (100n * months)));
}

type Estimate =
  | { state: "idle" | "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; count: number };

export function LandingPricing() {
  const [annual, setAnnual] = useState(true);
  const [volume, setVolume] = useState(150);
  const [estimate, setEstimate] = useState<Estimate>({ state: "idle" });
  const [dragging, setDragging] = useState(false);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const carousel = useRef<HTMLDivElement>(null);
  const reading = useRef(false);
  const cadence = annual ? "annual" : "monthly";

  useEffect(() => {
    const viewport = carousel.current;
    if (!viewport) return;
    const sync = () => {
      const next = {
        atStart: viewport.scrollLeft < 2,
        atEnd: viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2,
      };
      setEdges(old => old.atStart === next.atStart && old.atEnd === next.atEnd ? old : next);
    };
    const resize = new ResizeObserver(sync);
    resize.observe(viewport);
    viewport.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => {
      resize.disconnect();
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  function step(direction: -1 | 1) {
    const viewport = carousel.current;
    const firstCard = viewport?.firstElementChild;
    if (!viewport || !(firstCard instanceof HTMLElement)) return;
    const gap = Number.parseFloat(getComputedStyle(viewport).columnGap) || 0;
    const stepWidth = firstCard.offsetWidth + gap;
    const index = Math.round(viewport.scrollLeft / stepWidth);
    viewport.scrollTo({ left: (index + direction) * stepWidth });
  }

  async function readReport(file: File | undefined) {
    if (!file || reading.current) return;
    if (!file.name.toLowerCase().endsWith(".csv") || file.size < 1 || file.size > maxCsvBytes) {
      setEstimate({ state: "error", message: "Escolha um arquivo CSV de até 512 KB." });
      return;
    }
    reading.current = true;
    setEstimate({ state: "loading" });
    try {
      const [{ parseShopeeSellerCsv }, buffer] = await Promise.all([
        import("@/lib/shopee-seller-csv"),
        file.arrayBuffer(),
      ]);
      const result = await parseShopeeSellerCsv(new Uint8Array(buffer));
      if (result.data) {
        setEstimate({ state: "ready", count: result.data.review.rows.length });
      } else {
        setEstimate({ state: "error", message: "Não foi possível ler o CSV. Confira se é o relatório mensal por vendedor da Shopee." });
      }
    } catch {
      setEstimate({ state: "error", message: "A leitura falhou. Selecione o arquivo novamente." });
    } finally {
      reading.current = false;
    }
  }

  return <>
    <section className="landing-pricing" id="planos" aria-labelledby="planos-titulo">
      <div className="site-width">
        <div className="landing-section-head">
          <div>
            <h2 id="planos-titulo">Planos e preços</h2>
            <p>CNPJs sem limite em todos os planos.</p>
          </div>
          <fieldset className="landing-cadence">
            <legend className="sr-only">Período da assinatura</legend>
            <label>
              <input type="radio" name="landing-cadence" checked={!annual} onChange={() => setAnnual(false)} />
              <span>Mensal</span>
            </label>
            <label>
              <input type="radio" name="landing-cadence" checked={annual} onChange={() => setAnnual(true)} />
              <span>Anual <small>−20%</small></span>
            </label>
          </fieldset>
        </div>
        <div className="landing-volume">
          <div><label htmlFor="landing-volume">Quantas notas você emite por mês?</label><span>{number.format(volume)}</span></div>
          <input id="landing-volume" type="range" min={1} max={maximumVolume} value={volume}
            aria-valuetext={`${number.format(volume)} notas por mês`}
            style={{ "--volume-progress": `${100 * (volume - 1) / (maximumVolume - 1)}%` } as CSSProperties}
            onChange={event => setVolume(event.target.valueAsNumber)} />
          <a href="#simulador" className="text-link">Estimar pelo CSV <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
        <div id="landing-plan-carousel" className="landing-plan-carousel" ref={carousel} role="region" aria-label="Comparação dos planos"
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              step(event.key === "ArrowLeft" ? -1 : 1);
            }
          }} tabIndex={0}>
          {plans.map(plan => {
            const extra = Math.max(0, volume - plan.includedNotes);
            return <PlanCard key={plan.code} plan={plan} cadence={cadence} showBadge={false}
              estimate={extra > 0 ? `${estimateMonthly(plan, cadence, extra)}/mês com excedentes` : undefined}
              action={<Link href="/criar-conta" className="btn btn--secondary" aria-label={`Criar conta para o plano ${plan.name}`}>Criar conta</Link>} />;
          })}
        </div>
        <div className="landing-carousel-footer">
          {volume > plans[0].includedNotes && <p>A estimativa considera o volume de notas informado acima.</p>}
          {!(edges.atStart && edges.atEnd) && <div className="landing-carousel-controls">
            <button type="button" className="icon-button" aria-label="Ver plano anterior" aria-controls="landing-plan-carousel" disabled={edges.atStart} onClick={() => step(-1)}><ArrowLeft size={18} aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label="Ver próximo plano" aria-controls="landing-plan-carousel" disabled={edges.atEnd} onClick={() => step(1)}><ArrowRight size={18} aria-hidden="true" /></button>
          </div>}
        </div>
      </div>
    </section>

    <section className="landing-simulator" id="simulador" aria-labelledby="simulador-titulo">
      <div className="site-width landing-simulator-grid">
        <div>
          <h2 id="simulador-titulo">Estime suas notas pelo CSV</h2>
          <p>Use o relatório mensal da Shopee para estimar seu volume. A leitura acontece no seu navegador.</p>
        </div>
        <div className="landing-file-panel">
          <label className="landing-file-zone" data-dragging={dragging} data-busy={estimate.state === "loading"}
            onDragOver={event => {
              event.preventDefault();
              if (event.dataTransfer.types.includes("Files") && !reading.current) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => {
              event.preventDefault();
              setDragging(false);
              void readReport(event.dataTransfer.files[0]);
            }}>
            <Upload size={22} aria-hidden="true" />
            <span><strong>Selecionar ou soltar o CSV</strong><small>Relatório mensal por vendedor · até 512 KB</small></span>
            <input type="file" accept=".csv,text/csv" aria-label="Relatório mensal da Shopee" disabled={estimate.state === "loading"}
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void readReport(file);
              }} />
          </label>
          {estimate.state === "loading" && <div className="landing-estimate landing-estimate-skeleton" role="status">
            <span className="sr-only">Lendo relatório…</span>
            <span aria-hidden="true" /><span aria-hidden="true" />
          </div>}
          {estimate.state === "error" && <p className="landing-estimate landing-estimate-error" role="alert">{estimate.message}</p>}
          {estimate.state === "ready" && <div className="landing-estimate">
            <p role="status"><strong>{number.format(estimate.count)}</strong> {estimate.count === 1 ? "linha de comissão" : "linhas de comissão"}</p>
            <p>A quantidade final de notas depende da revisão e do agrupamento.</p>
            <a className="text-link" href="#planos" onClick={() => setVolume(estimate.count)}>Usar volume na comparação <ArrowRight size={16} aria-hidden="true" /></a>
          </div>}
        </div>
      </div>
    </section>
  </>;
}
