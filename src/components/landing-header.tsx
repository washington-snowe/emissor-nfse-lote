"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";

const sections = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#consultar-cnpj", label: "Consultar CNPJ" },
  { href: "#planos", label: "Preços" },
  { href: "#simulador", label: "Simulador" },
];

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getSnapshot() {
  if (window.scrollY <= 24) return "top";

  const title = document.getElementById("hero-heading");
  const header = document.getElementById("landing-header");
  if (title && header && title.getBoundingClientRect().bottom <= header.offsetHeight) return "dark";
  return "scrolled";
}

export function LandingHeader() {
  const position = useSyncExternalStore(subscribe, getSnapshot, () => "top");
  const scrolled = position !== "top";

  return <header id="landing-header" className="site-masthead landing-header" data-scrolled={scrolled} data-theme={position === "dark" ? "dark" : "light"}>
    <div className="wrap landing-header-inner">
      <div className="landing-header-brand" inert={!scrolled}><Brand /></div>
      <nav aria-label="Navegação do site" className="landing-nav">
        {sections.map(({ href, label }) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <Link href="/entrar" className="btn btn--primary">Entrar <ArrowUpRight size={16} aria-hidden="true" /></Link>
      <button type="button" className="icon-button landing-menu-toggle" aria-label="Menu de navegação" popoverTarget="landing-mobile-nav">
        <Menu size={20} aria-hidden="true" />
        <X size={20} aria-hidden="true" />
      </button>
      <nav popover="auto" id="landing-mobile-nav" aria-label="Navegação do site" className="landing-mobile-nav">
        {sections.map(({ href, label }) => <a key={href} href={href}
          onClick={event => event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover()}>{label}</a>)}
      </nav>
    </div>
  </header>;
}
