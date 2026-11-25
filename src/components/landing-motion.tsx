"use client";

import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    if (!window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const landing = document.querySelector("[data-landing-motion]");
    if (!landing) return;

    const elements = Array.from(landing.querySelectorAll<HTMLElement>(
      "[data-landing-reveal], .landing-plan-carousel > .billing-plan",
    ));
    const belowFold = elements.filter(element => element.getBoundingClientRect().top >= window.innerHeight);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target.getAttribute("data-landing-reveal-state") !== "pending") continue;
        entry.target.setAttribute("data-landing-reveal-state", "visible");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px 24px" });

    function showFocused(event: Event) {
      if (!(event.target instanceof HTMLElement)) return;
      const element = event.target.closest<HTMLElement>("[data-landing-reveal-state]");
      if (!element) return;
      delete element.dataset.landingRevealState;
      observer.unobserve(element);
    }

    // Content already in view stays visible during hydration and deep links.
    for (const element of belowFold) {
      element.dataset.landingRevealState = "pending";
      observer.observe(element);
    }
    landing.addEventListener("focusin", showFocused);

    return () => {
      landing.removeEventListener("focusin", showFocused);
      observer.disconnect();
      for (const element of belowFold) delete element.dataset.landingRevealState;
    };
  }, []);

  return null;
}
