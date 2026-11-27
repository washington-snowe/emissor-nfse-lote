"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";

const sections = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#consultar-cnpj", label: "Consultar CNPJ" },
  { href: "#planos", label: "Preços" },
  { href: "#simulador", label: "Simulador" },
];

type HeaderPosition = "top" | "scrolled" | "dark";

export function LandingHeader() {
  const [position, setPosition] = useState<HeaderPosition>("top");

  useEffect(() => {
    const title = document.getElementById("hero-heading");
    const header = document.getElementById("landing-header");
    let darkAfter = Infinity;
    let previous: HeaderPosition = "top";

    function syncPosition() {
      const y = window.scrollY;
      const next = y <= 24 ? "top" : y >= darkAfter ? "dark" : "scrolled";
      if (next === previous) return;
      previous = next;
      setPosition(next);
    }

    function measure() {
      if (title && header) darkAfter = title.getBoundingClientRect().bottom + window.scrollY - header.offsetHeight;
      syncPosition();
    }

    function finishIntro(event: AnimationEvent) {
      if (event.target === title) measure();
    }

    const resize = window.ResizeObserver ? new ResizeObserver(measure) : undefined;
    if (title) resize?.observe(title);
    if (header) resize?.observe(header);
    const frame = window.requestAnimationFrame(measure);
    title?.addEventListener("animationend", finishIntro);
    window.addEventListener("scroll", syncPosition, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      resize?.disconnect();
      window.cancelAnimationFrame(frame);
      title?.removeEventListener("animationend", finishIntro);
      window.removeEventListener("scroll", syncPosition);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const scrolled = position !== "top";

  return <header id="landing-header" className="site-masthead landing-header" data-scrolled={scrolled} data-theme={position === "dark" ? "dark" : "light"}>
    <div className="wrap landing-header-inner">
      <div className="landing-header-brand" inert={!scrolled}><Brand /></div>
      <nav aria-label="Navegação do site" className="landing-nav">
        {sections.map(({ href, label }) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <Link href="/entrar" className="btn btn--primary">Entrar <ArrowUpRight size={16} aria-hidden="true" /></Link>
      <button type="button" className="icon-button landing-menu-toggle motion-icon-swap" aria-label="Menu de navegação" popoverTarget="landing-mobile-nav">
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
