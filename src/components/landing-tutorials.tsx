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
    <div className="site-width landing-tutorials-content">
      <h2 id="tutorial-title">Tutorial em menos de 1 minuto <span>emitindo as notas {month ? `de ${month}` : "do mês"}</span></h2>
      <div className="landing-tutorials-grid">
        {tutorials.map(title => <figure key={title}>
          <div className="landing-video-slot" aria-hidden="true" />
          <figcaption>{title}</figcaption>
        </figure>)}
      </div>
    </div>
  </section>;
}
