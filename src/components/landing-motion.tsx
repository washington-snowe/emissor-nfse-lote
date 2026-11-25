"use client";

import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    if (!window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const landing = document.querySelector("[data-landing-motion]");
    const elements = Array.from(landing?.querySelectorAll<HTMLElement>(
      "[data-landing-reveal]:has(.landing-ink-word), .landing-steps > li, .landing-report-preview, .landing-tutorials-grid > div",
    ) ?? []);
    const belowFold = elements.filter(element => element.getBoundingClientRect().top >= window.innerHeight - 16);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-landing-reveal-state", "visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: .08, rootMargin: "0px 0px -16px" });

    // Content already in view stays visible during hydration and deep links.
    for (const element of belowFold) {
      element.dataset.landingRevealState = "pending";
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      for (const element of belowFold) delete element.dataset.landingRevealState;
    };
  }, []);

  return null;
}
