"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function getSnapshot() {
  return window.scrollY > 24;
}

export function LandingHeader() {
  const scrolled = useSyncExternalStore(subscribe, getSnapshot, () => false);

  return <header className="site-masthead landing-header" data-scrolled={scrolled}>
    <div className="site-width landing-header-inner">
      <div className="landing-header-brand" inert={!scrolled}><Brand /></div>
      <nav aria-label="Navegação do site" className="landing-nav">
        <a href="#como-funciona">Como funciona</a>
        <a href="#planos">Preços</a>
        <a href="#simulador">Simulador</a>
      </nav>
      <Link href="/entrar" className="btn btn--primary">Entrar <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>
  </header>;
}
