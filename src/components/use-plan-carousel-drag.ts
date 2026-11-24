import { useEffect, type RefObject } from "react";

const dragThreshold = 10;
const damping = 18;

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
    let press: { id: number; x: number; y: number; left: number; lastLeft: number; time: number; velocity: number } | undefined;
    let frame = 0;
    let ignoreClick = false;

    function stop() {
      const pointer = press?.id;
      cancelAnimationFrame(frame);
      frame = 0;
      press = undefined;
      delete viewport.dataset.carouselMotion;
      if (pointer !== undefined && viewport.hasPointerCapture(pointer)) viewport.releasePointerCapture(pointer);
    }

    function settle(velocity: number) {
      const from = viewport.scrollLeft;
      // Project the release along the track before choosing a snap point.
      const target = nearestSnap(viewport, from + velocity * .18);
      if (reducedMotion.matches || Math.abs(target - from) < 1) {
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
        if (elapsed >= .42 || (elapsed >= .10 && Math.abs(remaining) < .75)) {
          viewport.scrollLeft = target;
          stop();
          return;
        }
        viewport.scrollLeft = target + remaining;
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener("pointerdown", event => {
      if (event.target instanceof Node && !viewport.contains(event.target)) stop();
    }, { capture: true, signal });

    viewport.addEventListener("pointerdown", event => {
      ignoreClick = false;
      if (event.pointerType !== "mouse" || event.button !== 0 || viewport.scrollWidth <= viewport.clientWidth + 1) {
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
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, left, lastLeft: left, time: event.timeStamp, velocity: 0 };
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
      viewport.scrollLeft = press.left - distance;
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

    viewport.addEventListener("lostpointercapture", event => { if (press?.id === event.pointerId) stop(); }, { signal });

    viewport.addEventListener("dragstart", event => { if (press) event.preventDefault(); }, { signal });
    viewport.addEventListener("click", event => {
      if (!ignoreClick || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
      ignoreClick = false;
    }, { capture: true, signal });
    viewport.addEventListener("wheel", stop, { passive: true, signal });
    window.addEventListener("keydown", stop, { signal });
    window.addEventListener("pointercancel", stop, { signal });
    window.addEventListener("blur", stop, { signal });
    window.addEventListener("resize", stop, { signal });

    return () => {
      listeners.abort();
      stop();
    };
  }, [ref]);
}
