"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { plans } from "@/lib/billing/catalog";
import { PlanCard, PlanIntervalToggle } from "@/components/plan-card";

export function LandingPricing() {
  const [annual, setAnnual] = useState(true);
  return <section className="landing-pricing" id="planos" aria-labelledby="planos-titulo">
    <div className="site-width">
      <div className="section-intro split-intro">
        <div><h2 id="planos-titulo">Planos para cada volume</h2><p>CNPJs sem limite em todos os planos. A franquia de notas renova a cada mês.</p></div>
        <PlanIntervalToggle annual={annual} onChange={setAnnual} />
      </div>
      <div className="billing-plan-grid">{plans.map(plan => (
        <PlanCard key={plan.code} plan={plan} cadence={annual ? "annual" : "monthly"}
          action={<Link href="/criar-conta" className="btn btn--secondary">Criar conta <ArrowUpRight size={16} aria-hidden="true" /></Link>} />
      ))}</div>
    </div>
  </section>;
}
