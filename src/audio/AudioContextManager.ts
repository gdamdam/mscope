/**
 * Owns the single AudioContext for the app and the (idempotent) loading of the
 * meters AudioWorklet module.
 *
 * The context is created lazily on first `getContext()` so we never instantiate
 * audio hardware before the user attaches a source (and so autoplay policies are
 * satisfied by a user gesture upstream). All consumers share one context; we
 * guard against creating a second context or registering the worklet module
 * twice (addModule rejects a re-register on some engines).
 */

// The `?worker&url` suffix makes Vite bundle the worklet (and its whole dsp
// import graph) into a separate, transpiled module file and hand back its URL —
// the suite-proven pattern (see mgrains) for loading AudioWorklets under Vite.
// A plain `new URL(..., import.meta.url)` does NOT emit a standalone worklet
// chunk, so addModule() would fail at runtime.
import metersWorkletUrl from "./meters.worklet.ts?worker&url";

export class AudioContextManager {
  private ctx: AudioContext | null = null;
  private workletLoaded = false;
  /** In-flight addModule promise, so concurrent callers share one load. */
  private workletLoading: Promise<void> | null = null;

  /** Lazily create (once) and return the shared AudioContext. */
  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
    }
    return this.ctx;
  }

  /** Whether a context has been created yet (without creating one). */
  hasContext(): boolean {
    return this.ctx !== null;
  }

  /**
   * Register the meters worklet module. Idempotent: subsequent calls (or
   * concurrent calls) resolve without re-adding the module.
   */
  async loadMetersWorklet(): Promise<void> {
    if (this.workletLoaded) return;
    if (this.workletLoading) return this.workletLoading;

    const ctx = this.getContext();
    this.workletLoading = ctx.audioWorklet
      .addModule(metersWorkletUrl)
      .then(() => {
        this.workletLoaded = true;
      })
      .finally(() => {
        this.workletLoading = null;
      });
    return this.workletLoading;
  }

  async resume(): Promise<void> {
    if (this.ctx) await this.ctx.resume();
  }

  async suspend(): Promise<void> {
    if (this.ctx) await this.ctx.suspend();
  }

  /** Close the context and drop all derived state. Idempotent. */
  dispose(): void {
    if (this.ctx) {
      // close() returns a promise; we don't await teardown.
      void this.ctx.close();
      this.ctx = null;
    }
    this.workletLoaded = false;
    this.workletLoading = null;
  }
}
