import { useSyncExternalStore } from "react";

/** Round a logical CSS dimension up to device pixels for a canvas backing store. */
export function backingStorePx(logical: number, dpr: number): number {
  return Math.max(1, Math.round(logical * dpr));
}

function getDpr(): number {
  if (typeof window === "undefined" || !window.devicePixelRatio) return 1;
  return window.devicePixelRatio;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  // A `resolution` media query only fires when the ratio crosses the value it
  // was created with, so re-arm the listener at the new ratio on every change.
  let mq: MediaQueryList | null = null;
  const listener = (): void => {
    onChange();
    arm();
  };
  const detach = (): void => {
    if (!mq) return;
    // removeEventListener is the modern API; some engines only expose removeListener.
    if (mq.removeEventListener) mq.removeEventListener("change", listener);
    else mq.removeListener(listener);
  };
  const arm = (): void => {
    detach();
    mq = window.matchMedia(`(resolution: ${getDpr()}dppx)`);
    if (mq.addEventListener) mq.addEventListener("change", listener);
    else mq.addListener(listener);
  };
  arm();
  return detach;
}

/**
 * Current devicePixelRatio as React state (updates when the window moves to a
 * display with a different ratio, or on browser zoom).
 *
 * Canvas components keep all drawing math in their fixed logical coordinate
 * system: size the backing store to `backingStorePx(logicalDim, dpr)` and apply
 * `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` at the start of each draw so traces
 * render at native resolution instead of being CSS-upscaled (blurry on HiDPI).
 */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, getDpr, () => 1);
}
