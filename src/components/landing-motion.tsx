"use client";

import { useEffect } from "react";

const revealSelector = "[data-landing-reveal]";
const revealLead = 28;

export function LandingMotion() {
  useEffect(() => {
    if (!window.IntersectionObserver) return;

    const landing = document.querySelector("[data-landing-motion]");
    if (!landing) return;

    const elements = Array.from(landing.querySelectorAll<HTMLElement>(revealSelector));
    const seen = new WeakSet<HTMLElement>();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (!entry.isIntersecting || seen.has(element) || preference.matches) continue;
        seen.add(element);
        observer.unobserve(element);

        // A fast fling or an anchor jump may already have painted this content.
        const bottom = entry.rootBounds ? entry.rootBounds.bottom - revealLead : window.innerHeight;
        if (entry.boundingClientRect.top >= bottom - 20) element.dataset.landingRevealState = "visible";
      }
    }, { rootMargin: `0px 0px ${revealLead}px` });

    function revealInteracted(event: Event) {
      if (!(event.target instanceof Element)) return;
      let element = event.target.closest<HTMLElement>(revealSelector);
      while (element && landing?.contains(element)) {
        seen.add(element);
        observer.unobserve(element);
        delete element.dataset.landingRevealState;
        element = element.parentElement?.closest<HTMLElement>(revealSelector) ?? null;
      }
    }

    function syncPreference() {
      observer.disconnect();
      if (preference.matches) {
        for (const element of elements) delete element.dataset.landingRevealState;
        return;
      }

      // Content already above the viewport edge stays visible on load or restoration.
      const bottom = document.documentElement.clientHeight;
      for (const element of elements) {
        if (seen.has(element)) continue;
        if (element.getBoundingClientRect().top < bottom) seen.add(element);
        else observer.observe(element);
      }
    }

    syncPreference();
    preference.addEventListener("change", syncPreference);
    landing.addEventListener("focusin", revealInteracted);
    landing.addEventListener("pointerdown", revealInteracted, true);

    return () => {
      observer.disconnect();
      preference.removeEventListener("change", syncPreference);
      landing.removeEventListener("focusin", revealInteracted);
      landing.removeEventListener("pointerdown", revealInteracted, true);
      for (const element of elements) delete element.dataset.landingRevealState;
    };
  }, []);

  return null;
}
