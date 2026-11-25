"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Upload } from "lucide-react";
import { estimateBestPlan, money, plans, type Cadence } from "@/lib/billing/catalog";
import { planSelectionHref } from "@/lib/billing/plan-selection";
import { formatFiscalBrl } from "@/lib/nfse/status";
import { PlanCard } from "@/components/plan-card";
import { LandingTutorials } from "@/components/landing-tutorials";
import { usePlanCarouselDrag } from "@/components/use-plan-carousel-drag";

const largestPlan = plans[plans.length - 1];
const maximumVolume = largestPlan.includedNotes;
const maxCsvBytes = 512 * 1024;
const number = new Intl.NumberFormat("pt-BR");

function cardStep(viewport: HTMLDivElement) {
  const gap = Number.parseFloat(getComputedStyle(viewport).columnGap) || 0;
  return (viewport.firstElementChild?.getBoundingClientRect().width ?? 0) + gap;
}

type Estimate =
  | { state: "idle" | "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; count: number; total: string };

export function LandingPricing() {
  const [annual, setAnnual] = useState(true);
  const [volume, setVolume] = useState<number>(plans[0].includedNotes);
  const [draftVolume, setDraftVolume] = useState<string>();
  const [estimate, setEstimate] = useState<Estimate>({ state: "idle" });
  const [dragging, setDragging] = useState(false);
  const [visible, setVisible] = useState({ first: 1, last: 1 });
  const carousel = useRef<HTMLDivElement>(null);
  usePlanCarouselDrag(carousel);
  const reading = useRef(false);
  const cadence = annual ? "annual" : "monthly";
  const recommended = estimateBestPlan(volume, cadence);
  const reportQuote = estimate.state === "ready" && estimate.count > 0 ? estimateBestPlan(estimate.count, cadence) : null;

  useEffect(() => {
    const viewport = carousel.current;
    if (!viewport) return;
    const sync = () => {
      const width = cardStep(viewport);
      if (width <= 0) return;
      const first = 1 + Math.round(viewport.scrollLeft / width);
      const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2;
      const last = atEnd ? plans.length : Math.min(plans.length, first + Math.round(viewport.clientWidth / width) - 1);
      setVisible(old => old.first === first && old.last === last ? old : { first, last });
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

  function revealRecommendation(value: number, behavior: ScrollBehavior, cycle: Cadence = cadence) {
    const viewport = carousel.current;
    const card = viewport?.children.item(plans.indexOf(estimateBestPlan(value, cycle).plan));
    if (!viewport || !card || viewport.scrollWidth <= viewport.clientWidth + 1) return;
    const frame = viewport.getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    if (bounds.left < frame.left - 1 || bounds.right > frame.right + 1) {
      viewport.scrollTo({ left: viewport.scrollLeft + bounds.left - frame.left, behavior });
    }
  }

  function selectCadence(next: Cadence) {
    setAnnual(next === "annual");
    revealRecommendation(volume, "auto", next);
  }

  function step(direction: -1 | 1, behavior: ScrollBehavior) {
    const viewport = carousel.current;
    if (!viewport) return;
    const stepWidth = cardStep(viewport);
    if (stepWidth <= 0) return;
    const index = Math.round(viewport.scrollLeft / stepWidth);
    viewport.scrollTo({ left: (index + direction) * stepWidth, behavior });
  }

  function commitVolume(value: number) {
    const next = Number.isFinite(value) ? Math.min(maximumVolume, Math.max(1, Math.round(value))) : volume;
    setDraftVolume(undefined);
    setVolume(next);
    if (draftVolume !== undefined) revealRecommendation(next, "instant");
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
        const message = result.error?.code === "empty_report"
          ? "O relatório está vazio. Selecione um CSV com linhas de comissão."
          : result.error?.code === "row_limit"
            ? "O relatório passou de 10.000 linhas. Selecione um CSV menor."
            : "Não foi possível ler o CSV. Confira se é o relatório mensal por vendedor da Shopee.";
        setEstimate({ state: "error", message });
      }
    } catch {
      setEstimate({ state: "error", message: "A leitura falhou. Selecione o arquivo novamente." });
    } finally {
      reading.current = false;
    }
  }

  return <>
    <section className="landing-pricing" id="planos" aria-labelledby="planos-titulo">
      <div className="wrap">
        <div className="landing-pricing-head" data-landing-reveal="heading">
          <h2 id="planos-titulo">Planos e preços</h2>
          <fieldset className="landing-cadence">
            <legend className="sr-only">Período da assinatura</legend>
            <label>
              <input type="radio" name="landing-cadence" checked={!annual} onChange={() => selectCadence("monthly")} />
              <span>Mensal</span>
            </label>
            <label>
              <input type="radio" name="landing-cadence" checked={annual} onChange={() => selectCadence("annual")} />
              <span>Anual <small className="landing-discount-tag">−20%</small></span>
            </label>
          </fieldset>
        </div>
        <div className="landing-volume" data-landing-reveal="row">
          <div className="landing-volume-heading">
            <label htmlFor="landing-volume-exact">Notas por mês</label>
            <input id="landing-volume-exact" type="number" inputMode="numeric" min={1} max={maximumVolume} step={1}
              value={draftVolume ?? volume}
              onChange={event => {
                const input = event.currentTarget;
                setDraftVolume(input.value);
                if (input.value && input.validity.valid) setVolume(input.valueAsNumber);
              }}
              onBlur={event => commitVolume(event.currentTarget.valueAsNumber)}
              onKeyDown={event => {
                if (event.key === "Enter") commitVolume(event.currentTarget.valueAsNumber);
              }} />
          </div>
          <input id="landing-volume" type="range" min={1} max={maximumVolume} value={volume}
            aria-label="Ajustar notas por mês"
            aria-valuetext={`${number.format(volume)} notas por mês. Menor custo estimado: ${recommended.plan.name}, ${money(recommended.monthlyCents)} por mês.`}
            style={{ "--volume-progress": `${100 * (volume - 1) / (maximumVolume - 1)}%` } as CSSProperties}
            onChange={event => {
              const input = event.currentTarget;
              setVolume(input.valueAsNumber);
              if (input.matches(":focus-visible")) revealRecommendation(input.valueAsNumber, "instant");
            }}
            onPointerUp={event => {
              if (event.isPrimary) revealRecommendation(event.currentTarget.valueAsNumber, "auto");
            }} />
          <div className="landing-volume-summary">
            <p><strong>{recommended.plan.name} · {money(recommended.monthlyCents)}/mês</strong> é o menor custo estimado{recommended.extraNotes > 0
              ? ` com ${number.format(recommended.extraNotes)} ${recommended.extraNotes === 1 ? "nota excedente" : "notas excedentes"}`
              : ""}.</p>
            <a href="#simulador" className="text-link">Estimar pelo CSV <ArrowRight size={15} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="landing-carousel-controls" data-landing-reveal="row">
          <span>{visible.first === visible.last ? visible.first : `${visible.first}–${visible.last}`} de {plans.length}</span>
          <button type="button" className="icon-button" aria-label="Ver plano anterior" aria-controls="landing-plan-carousel" aria-disabled={visible.first === 1} onClick={event => {
            if (visible.first > 1) step(-1, event.detail === 0 ? "instant" : "auto");
          }}><ArrowLeft size={18} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label="Ver próximo plano" aria-controls="landing-plan-carousel" aria-disabled={visible.last === plans.length} onClick={event => {
            if (visible.last < plans.length) step(1, event.detail === 0 ? "instant" : "auto");
          }}><ArrowRight size={18} aria-hidden="true" /></button>
        </div>
        <div id="landing-plan-carousel" className="landing-plan-carousel" ref={carousel} role="region" aria-label="Comparação dos planos"
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              step(event.key === "ArrowLeft" ? -1 : 1, "instant");
            }
          }} tabIndex={0}>
          {plans.map(plan =>
            <PlanCard key={plan.code} plan={plan} cadence={cadence} variant="landing" showBadge={false} recommended={plan.code === recommended.plan.code}
              action={<Link href={planSelectionHref("/criar-conta", { plan, cadence })} className="btn" aria-label={`Começar agora — ${plan.name}`}>Começar agora <ArrowRight size={16} aria-hidden="true" /></Link>} />,
          )}
        </div>
      </div>
    </section>

    <LandingTutorials />

    <section className="landing-simulator" id="simulador" aria-labelledby="simulador-titulo">
      <div className="wrap landing-simulator-content">
        <div className="landing-simulator-head" data-landing-reveal="heading">
          <h2 id="simulador-titulo">Quantas notas você precisa emitir?</h2>
          <p>Baixe o <a className="landing-report-link" href="https://affiliate.shopee.com.br/report/monthly_report" target="_blank" rel="noreferrer">
            <strong>Relatório Mensal</strong><span className="sr-only"> (abre em nova aba)</span>
            <svg viewBox="0 0 144 9" preserveAspectRatio="none" aria-hidden="true">
              <path pathLength={1} d="M2 6.5C39 3 92 1.5 142 5" />
            </svg>
          </a> na Central do Afiliado e solte o arquivo aqui.</p>
          <p className="landing-simulator-note">Veja a quantidade de notas, o total de comissões e o plano mais econômico para o seu volume. O arquivo é lido no seu navegador.</p>
        </div>
        <div className="landing-file-panel" data-landing-reveal="panel">
          <label className="landing-file-zone" data-dragging={dragging} data-busy={estimate.state === "loading"}
            onDragOver={event => {
              event.preventDefault();
              if (event.dataTransfer.types.includes("Files") && !reading.current) {
                event.dataTransfer.dropEffect = "copy";
                setDragging(true);
              }
            }}
            onDragLeave={event => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDragging(false);
            }}
            onDrop={event => {
              event.preventDefault();
              setDragging(false);
              void readReport(event.dataTransfer.files[0]);
            }}>
            <Upload size={22} aria-hidden="true" />
            <span><strong>{dragging ? "Solte o CSV para estimar" : "Selecionar ou soltar o CSV"}</strong><small>Relatório mensal por vendedor · até 512 KB</small></span>
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
                <div><dt>Total do relatório</dt><dd>{formatFiscalBrl(estimate.total)}</dd></div>
                <div><dt>Menor custo estimado</dt><dd className="landing-estimate-plan">{reportQuote?.plan.name ?? "—"}</dd>
                  {reportQuote && <dd className="landing-estimate-limit">{money(reportQuote.monthlyCents)}/mês · {annual ? "Anual" : "Mensal"}</dd>}
                </div>
              </dl>
              <p className="landing-estimate-note">{reportQuote
                ? "A estimativa conta uma nota por linha com comissão positiva. A quantidade final depende da revisão e do agrupamento."
                : "Este relatório não tem linhas com comissão positiva."}</p>
            </div>
            {reportQuote && <a className="text-link" href="#planos" onClick={event => {
              setVolume(estimate.count);
              revealRecommendation(estimate.count, event.detail === 0 ? "instant" : "auto");
            }}>Usar volume na comparação <ArrowRight size={16} aria-hidden="true" /></a>}
          </div>}
        </div>
      </div>
    </section>
  </>;
}
