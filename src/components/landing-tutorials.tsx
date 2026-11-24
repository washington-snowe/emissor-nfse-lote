"use client";

import { useSyncExternalStore } from "react";

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
const tutorials = ["Notas de comissão extra", "Nota Avulsa"];

function subscribe(onChange: () => void) {
  const interval = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(interval);
}

function currentMonth() {
  return monthName.format(new Date());
}

export function LandingTutorials() {
  const month = useSyncExternalStore(subscribe, currentMonth, () => "");

  return <section className="landing-tutorials" id="tutoriais" aria-labelledby="tutorial-title">
    <div className="wrap landing-tutorials-content">
      <h2 id="tutorial-title" data-landing-reveal="heading">Tutoriais em menos de <span className="landing-ink-word">1 minuto<svg className="landing-ink-loop" viewBox="0 0 210 66" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength={1} d="M174 12C142 4 94 3 55 10 19 17 3 28 7 40c4 13 27 20 68 21 52 2 108-6 123-22 11-12-4-25-28-31-12-3-27-5-43-4" />
      </svg></span>{" "}<span className="landing-tutorial-subtitle">emitindo as notas {month ? `de ${month}` : "do mês"}</span></h2>
      <div className="landing-tutorials-grid">
        {tutorials.map(title => <div key={title} data-landing-reveal="card">
          <h3>{title}</h3>
          <div className="landing-video-slot" aria-hidden="true" />
        </div>)}
      </div>
    </div>
  </section>;
}
