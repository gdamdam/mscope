import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";

// Tell React 18 we're inside an act-aware test environment so effect flushing
// is synchronous and "not configured to support act(...)" warnings disappear.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/**
 * Minimal render harness (no @testing-library available). Mounts a React tree
 * into a detached container, wrapping in act() so effects flush synchronously.
 */
export interface RenderResult {
  container: HTMLElement;
  root: Root;
  rerender(el: ReactElement): void;
  unmount(): void;
}

export function render(el: ReactElement): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });
  return {
    container,
    root,
    rerender(next: ReactElement) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Flush React effects / state updates for an action. */
export async function flush(fn: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await fn();
  });
}
