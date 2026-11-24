"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Upload } from "lucide-react";
import { plans } from "@/lib/billing/catalog";
import { formatFiscalBrl } from "@/lib/nfse/status";
import { PlanCard } from "@/components/plan-card";
import { LandingTutorials } from "@/components/landing-tutorials";

const largestPlan = plans[plans.length - 1];
const maximumVolume = largestPlan.includedNotes;
const maxCsvBytes = 512 * 1024;
const number = new Intl.NumberFormat("pt-BR");

function recommendedPlan(volume: number) {
  return plans.find(plan => volume <= plan.includedNotes) ?? largestPlan;
}

type Estimate =
  | { state: "idle" | "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; count: number; total: string };

export function LandingPricing() {
  const [annual, setAnnual] = useState(true);
  const [volume, setVolume] = useState<number>(plans[0].includedNotes);
  const [estimate, setEstimate] = useState<Estimate>({ state: "idle" });
  const [dragging, setDragging] = useState(false);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const carousel = useRef<HTMLDivElement>(null);
  const reading = useRef(false);
  const cadence = annual ? "annual" : "monthly";
  const recommended = recommendedPlan(volume);
  const reportPlan = estimate.state === "ready" && estimate.count > 0 ? recommendedPlan(estimate.count) : null;

  useEffect(() => {
    // Wait for the slider to settle before bringing an offscreen recommendation into view.
    const timer = window.setTimeout(() => {
      const viewport = carousel.current;
      const card = viewport?.querySelector<HTMLElement>("[data-recommended]");
      if (!viewport || !card || viewport.scrollWidth <= viewport.clientWidth + 1) return;
      const frame = viewport.getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      if (bounds.left < frame.left - 1 || bounds.right > frame.right + 1) {
        viewport.scrollTo({ left: viewport.scrollLeft + bounds.left - frame.left });
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [recommended.code]);

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
      const review = result.data?.review;
      const total = review?.totals[0];
      if (review && total) {
        const nonpositive = review.issues.filter(issue => issue.code === "nonpositive_amount").length;
        setEstimate({ state: "ready", count: total.rowCount - nonpositive, total: total.amount });
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
        <div className="landing-pricing-head">
          <h2 id="planos-titulo">Planos e preços</h2>
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
          <p>CNPJs sem limite em todos os planos.</p>
        </div>
        <div className="landing-volume">
          <div><label htmlFor="landing-volume">Quantas notas você emite por mês?</label><span>{number.format(volume)}</span></div>
          <input id="landing-volume" type="range" min={1} max={maximumVolume} value={volume}
            aria-valuetext={`${number.format(volume)} notas por mês. Plano recomendado: ${recommended.name}`}
            style={{ "--volume-progress": `${100 * (volume - 1) / (maximumVolume - 1)}%` } as CSSProperties}
            onChange={event => setVolume(event.target.valueAsNumber)} />
          <a href="#simulador" className="landing-volume-link text-link">Estimar pelo CSV <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
        <div id="landing-plan-carousel" className="landing-plan-carousel" ref={carousel} role="region" aria-label="Comparação dos planos"
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              step(event.key === "ArrowLeft" ? -1 : 1);
            }
          }} tabIndex={0}>
          {plans.map(plan =>
            <PlanCard key={plan.code} plan={plan} cadence={cadence} showBadge={false} recommended={plan.code === recommended.code}
              action={<Link href="/criar-conta" className="btn btn--primary" aria-label={`Começar agora com o plano ${plan.name}`}>Começar agora <ArrowRight size={16} aria-hidden="true" /></Link>} />,
          )}
        </div>
        {!(edges.atStart && edges.atEnd) && <div className="landing-carousel-controls">
          <button type="button" className="icon-button" aria-label="Ver plano anterior" aria-controls="landing-plan-carousel" disabled={edges.atStart} onClick={() => step(-1)}><ArrowLeft size={18} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label="Ver próximo plano" aria-controls="landing-plan-carousel" disabled={edges.atEnd} onClick={() => step(1)}><ArrowRight size={18} aria-hidden="true" /></button>
        </div>}
      </div>
    </section>

    <LandingTutorials />

    <section className="landing-simulator" id="simulador" aria-labelledby="simulador-titulo">
      <div className="site-width landing-simulator-content">
        <div className="landing-simulator-head">
          <h2 id="simulador-titulo">Estime suas notas pelo CSV</h2>
          <p>Veja quantas notas seu relatório pode gerar, o total de comissões e qual plano cobre esse volume. O arquivo é lido no seu navegador.</p>
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
            <div role="status">
              <dl className="landing-estimate-metrics">
                <div><dt>Notas estimadas</dt><dd>{number.format(estimate.count)}</dd></div>
                <div><dt>Total de comissões</dt><dd>{formatFiscalBrl(estimate.total)}</dd></div>
                <div><dt>Plano recomendado</dt><dd className="landing-estimate-plan">{reportPlan?.name ?? "—"}</dd>
                  {reportPlan && <dd className="landing-estimate-limit">Até {number.format(reportPlan.includedNotes)} notas por mês</dd>}
                </div>
              </dl>
              <p className="landing-estimate-note">{reportPlan
                ? "A estimativa conta uma nota por linha com comissão positiva. A quantidade final depende da revisão e do agrupamento."
                : "Este relatório não tem linhas com comissão positiva."}</p>
            </div>
            {reportPlan && <a className="text-link" href="#planos" onClick={() => setVolume(estimate.count)}>Usar volume na comparação <ArrowRight size={16} aria-hidden="true" /></a>}
          </div>}
        </div>
      </div>
    </section>
  </>;
}
