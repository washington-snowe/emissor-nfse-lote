import { useEffect, type RefObject } from "react";

const dragThreshold = 10;
const damping = 18;
const edgeResistance = .22;
const edgeLimit = 36;

function nearestSnap(viewport: HTMLElement, position: number) {
  const start = viewport.firstElementChild?.getBoundingClientRect().left ?? 0;
  const limit = viewport.scrollWidth - viewport.clientWidth;
  return Array.from(viewport.children, card =>
    Math.min(limit, card.getBoundingClientRect().left - start),
  ).reduce((nearest, point) => Math.abs(point - position) < Math.abs(nearest - position) ? point : nearest, 0);
}

export function usePlanCarouselDrag(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const viewport = element;

    const listeners = new AbortController();
    const { signal } = listeners;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cards = Array.from(viewport.children) as HTMLElement[];
    let press: { id: number; x: number; y: number; left: number; limit: number; lastLeft: number; time: number; velocity: number } | undefined;
    let frame = 0;
    let ignoreClick = false;
    let stretch = 0;

    function moveEdge(next: number) {
      if (stretch === next) return;
      stretch = next;
      cards.forEach(card => { card.style.translate = stretch === 0 ? "" : `${stretch}px 0px`; });
    }

    function stop() {
      const pointer = press?.id;
      cancelAnimationFrame(frame);
      frame = 0;
      press = undefined;
      moveEdge(0);
      delete viewport.dataset.carouselMotion;
      if (pointer !== undefined && viewport.hasPointerCapture(pointer)) viewport.releasePointerCapture(pointer);
    }

    function settle(velocity: number) {
      const from = viewport.scrollLeft;
      const edge = stretch;
      // Project the release along the track before choosing a snap point.
      const target = edge ? from : nearestSnap(viewport, from + velocity * .18);
      if (reducedMotion.matches || (Math.abs(target - from) < 1 && Math.abs(edge) < 1)) {
        viewport.scrollLeft = target;
        stop();
        return;
      }

      viewport.dataset.carouselMotion = "settling";
      const started = performance.now();
      const offset = from - target;
      const impulse = velocity + damping * offset;
      const tick = (now: number) => {
        const elapsed = (now - started) / 1000;
        const remaining = (offset + impulse * elapsed) * Math.exp(-damping * elapsed);
        const edgeRemaining = edge * (1 + damping * elapsed) * Math.exp(-damping * elapsed);
        if (elapsed >= .42 || (elapsed >= .10 && Math.max(Math.abs(remaining), Math.abs(edgeRemaining)) < .75)) {
          viewport.scrollLeft = target;
          stop();
          return;
        }
        viewport.scrollLeft = target + remaining;
        moveEdge(edgeRemaining);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener("pointerdown", event => {
      if (event.target instanceof Node && !viewport.contains(event.target)) stop();
    }, { capture: true, signal });

    viewport.addEventListener("pointerdown", event => {
      ignoreClick = false;
      if (!event.isPrimary || event.button !== 0) return;
      const limit = viewport.scrollWidth - viewport.clientWidth;
      if (limit <= 1) {
        stop();
        return;
      }
      if (event.clientY >= viewport.getBoundingClientRect().top + viewport.clientHeight) return;
      const left = viewport.scrollLeft;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        viewport.dataset.carouselMotion = "held";
      }
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, left: left - stretch / edgeResistance, limit, lastLeft: left, time: event.timeStamp, velocity: 0 };
    }, { signal });

    window.addEventListener("pointermove", event => {
      if (press?.id !== event.pointerId) return;
      const distance = event.clientX - press.x;
      if (viewport.dataset.carouselMotion !== "dragging") {
        if (Math.abs(distance) < dragThreshold || Math.abs(distance) <= Math.abs(event.clientY - press.y)) return;
        viewport.setPointerCapture(event.pointerId);
        viewport.dataset.carouselMotion = "dragging";
        ignoreClick = true;
        const selection = window.getSelection();
        if (selection?.anchorNode && viewport.contains(selection.anchorNode)) selection.removeAllRanges();
      }

      event.preventDefault();
      const wanted = press.left - distance;
      const bounded = Math.max(0, Math.min(press.limit, wanted));
      viewport.scrollLeft = bounded;
      const overflow = (bounded - wanted) * edgeResistance;
      moveEdge(reducedMotion.matches ? 0 : Math.max(-edgeLimit, Math.min(edgeLimit, overflow)));
      const current = viewport.scrollLeft;
      const elapsed = event.timeStamp - press.time;
      if (elapsed >= 8) {
        const velocity = (current - press.lastLeft) * 1000 / elapsed;
        press.velocity = Math.max(-3500, Math.min(3500, velocity));
        press.lastLeft = current;
        press.time = event.timeStamp;
      }
    }, { passive: false, signal });

    window.addEventListener("pointerup", event => {
      if (press?.id !== event.pointerId) return;
      const release = press;
      press = undefined;
      if (viewport.dataset.carouselMotion) settle(event.timeStamp - release.time < 90 ? release.velocity : 0);
    }, { signal });

    viewport.addEventListener("lostpointercapture", event => {
      if (event.target === viewport && press?.id === event.pointerId) stop();
    }, { signal });

    viewport.addEventListener("dragstart", event => { if (press) event.preventDefault(); }, { signal });
    viewport.addEventListener("click", event => {
      if (!ignoreClick || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
      ignoreClick = false;
    }, { capture: true, signal });
    viewport.addEventListener("wheel", stop, { passive: true, signal });
    window.addEventListener("keydown", stop, { signal });
    window.addEventListener("pointercancel", event => { if (press?.id === event.pointerId) stop(); }, { signal });
    window.addEventListener("blur", stop, { signal });
    window.addEventListener("resize", stop, { signal });

    return () => {
      listeners.abort();
      stop();
    };
  }, [ref]);
}
