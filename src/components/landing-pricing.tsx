"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { money, overagePrice, planPrice, plans } from "@/lib/billing/catalog";

export function LandingPricing() {
  const [annual, setAnnual] = useState(true);
  return <section className="rex-pricing" id="planos" aria-labelledby="planos-titulo">
    <div className="rex-wrap">
      <div className="rex-section-head">
        <div><h2 id="planos-titulo">Um plano para o seu ritmo.</h2><p>Emita por quantos CNPJs precisar. A franquia de notas é mensal.</p></div>
        <label className="rex-switch"><input type="checkbox" role="switch" checked={annual} onChange={(event) => setAnnual(event.target.checked)} /> Anual <span>Economize 20%</span></label>
      </div>
      <div className="rex-price-grid">
        {plans.map((plan) => {
          const featured = plan.code === "afiliado-pro";
          const price = planPrice(plan, annual ? "annual" : "monthly");
          return <article className={`billing-plan rex-price${featured ? " billing-plan--featured" : ""}`} key={plan.code}>
            <div className="rex-price-heading"><h3>{plan.name}</h3>{featured && <span className="billing-plan-badge">Mais Escolhido</span>}</div>
            <p className="billing-plan-price"><strong>{money(annual ? Math.round(price / 12) : price)}</strong><span>/mês</span></p>
            <p className="billing-plan-cycle">{annual ? `Cobrança anual de ${money(price)}` : "Cobrança mensal"}</p>
            <ul><li><Check size={16} aria-hidden="true" />{plan.includedNotes.toLocaleString("pt-BR")} notas por mês</li>
              <li><Check size={16} aria-hidden="true" />{overagePrice(plan.overageUnits)} por excedente</li></ul>
            <Link href="/criar-conta" className="btn btn--secondary">Começar <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </article>;
        })}
      </div>
    </div>
  </section>;
}
