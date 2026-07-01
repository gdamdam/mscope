import { useEffect, useRef, useSyncExternalStore } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  // addEventListener is the modern API; some engines still expose addListener.
  if (mq.addEventListener) {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }
  mq.addListener(onChange);
  return () => mq.removeListener(onChange);
}

function getReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

/**
 * Detect `prefers-reduced-motion: reduce`. Defaults to false when matchMedia is
 * unavailable (older jsdom). State-backed (useSyncExternalStore) so a
 * mid-session OS toggle re-renders consumers immediately, stopping or starting
 * their rAF loops without waiting for an unrelated render.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );
}

/**
 * Drive `draw` from a requestAnimationFrame loop while `active`.
 *
 * `draw` receives `animating: true` only on continuous rAF ticks; one-shot
 * repaints (mount, dep change, inactive or reduced-motion) pass false so
 * scrolling scopes (e.g. the spectrogram waterfall) repaint without advancing.
 *
 * When the user prefers reduced motion we do NOT run a continuous loop: we draw
 * once whenever `active` or `deps` change, keeping the view static. This is the
 * instrument's honest stance — no gratuitous animation — and avoids battery/CPU
 * churn for users who asked for stillness.
 */
export function useScopeDraw(
  draw: (animating?: boolean) => void,
  active: boolean,
  deps: ReadonlyArray<unknown> = [],
): void {
  const reduced = usePrefersReducedMotion();
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!active) {
      drawRef.current(false); // one final/static paint (e.g. cleared view)
      return;
    }
    if (reduced) {
      drawRef.current(false); // single static frame, no loop
      return;
    }
    if (typeof requestAnimationFrame === "undefined") {
      drawRef.current(false);
      return;
    }
    let raf = 0;
    const tick = (): void => {
      drawRef.current(true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced, ...deps]);
}
