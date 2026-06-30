import { useEffect, useRef } from "react";

/**
 * Detect `prefers-reduced-motion: reduce`. Defaults to false when matchMedia is
 * unavailable (older jsdom). Reactive: updates if the OS setting changes.
 */
export function usePrefersReducedMotion(): boolean {
  const ref = useRef<boolean>(getInitialReducedMotion());
  // We intentionally read once for the initial value and update via subscription
  // below; a state setter is unnecessary because consumers re-read on each frame.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => {
      ref.current = mq.matches;
    };
    // addEventListener is the modern API; some engines still expose addListener.
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return ref.current;
}

function getInitialReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Drive `draw` from a requestAnimationFrame loop while `active`.
 *
 * When the user prefers reduced motion we do NOT run a continuous loop: we draw
 * once whenever `active` or `deps` change, keeping the view static. This is the
 * instrument's honest stance — no gratuitous animation — and avoids battery/CPU
 * churn for users who asked for stillness.
 */
export function useScopeDraw(
  draw: () => void,
  active: boolean,
  deps: ReadonlyArray<unknown> = [],
): void {
  const reduced = usePrefersReducedMotion();
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!active) {
      drawRef.current(); // one final/static paint (e.g. cleared view)
      return;
    }
    if (reduced) {
      drawRef.current(); // single static frame, no loop
      return;
    }
    if (typeof requestAnimationFrame === "undefined") {
      drawRef.current();
      return;
    }
    let raf = 0;
    const tick = (): void => {
      drawRef.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced, ...deps]);
}
