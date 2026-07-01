import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, useEffect } from "react";
import { useScope, type UseScope } from "./useScope";
import { render, flush } from "./testRender";
import { FakeScopeEngine, frame, ch } from "./testFakes";
import { HISTORY_CAP } from "../analysis/derived";

/** Probe component that exposes the live hook value through a callback ref. */
function Probe({ create, onApi }: { create: () => FakeScopeEngine; onApi: (a: UseScope) => void }) {
  const api = useScope(create);
  useEffect(() => {
    onApi(api);
  });
  return null;
}

describe("useScope", () => {
  let engine: FakeScopeEngine;
  let api: UseScope;

  beforeEach(() => {
    engine = new FakeScopeEngine();
    api = undefined as unknown as UseScope;
  });

  afterEach(() => {
    // no-op; render harness containers are GC'd per test
  });

  function mount() {
    return render(
      createElement(Probe, {
        create: () => engine,
        onApi: (a) => {
          api = a;
        },
      }),
    );
  }

  it("feeds frames into the session and surfaces a summary", async () => {
    const view = mount();
    expect(api.summary.durationMs).toBe(0);

    await flush(async () => {
      engine.emit(frame([ch({ peakDb: -6, clipCount: 3 })], null, { integratedLufs: -18 }));
    });

    expect(api.frame).not.toBeNull();
    expect(api.summary.channels[0].maxPeakDb).toBe(-6);
    expect(api.summary.totalClipCount).toBe(3);
    expect(api.summary.integratedLufs).toBe(-18);

    view.unmount();
  });

  it("resetSession() clears accumulated summary and resets the engine", async () => {
    mount();
    await flush(async () => {
      engine.emit(frame([ch({ peakDb: -3, clipCount: 5 })]));
    });
    expect(api.summary.totalClipCount).toBe(5);

    await flush(async () => {
      api.resetSession();
    });

    expect(api.summary.totalClipCount).toBe(0);
    expect(api.summary.channels.length).toBe(0);
    expect(engine.resetCalls).toBe(1);
  });

  it("exportJson() produces valid, round-trippable JSON of the summary", async () => {
    mount();
    await flush(async () => {
      engine.emit(frame([ch({ peakDb: -8 })]));
    });
    const json = api.exportJson();
    const parsed = JSON.parse(json);
    expect(parsed.channelCount).toBe(1);
    expect(parsed.channels[0].maxPeakDb).toBe(-8);
    // dB/LUFS use a finite floor, never -Infinity (which would serialize to
    // null and break round-tripping). The only legitimate nulls are the mono
    // correlation min/max fields.
    expect(parsed.peakRmsDb).toBe(-20);
    expect(Number.isFinite(parsed.integratedLufs)).toBe(true);
    expect(parsed.correlationMin).toBeNull();
  });

  it("setMonitorGain clamps to [0,1] and reflects engine state", async () => {
    mount();
    await flush(async () => {
      api.setMonitorGain(2);
    });
    expect(api.monitorGain).toBe(1);
    await flush(async () => {
      api.setMonitorGain(-1);
    });
    expect(api.monitorGain).toBe(0);
  });

  it("disposes the engine on unmount", () => {
    const view = mount();
    view.unmount();
    expect(engine.disposeCalls).toBe(1);
  });

  it("accumulates history across frames and caps each ring at HISTORY_CAP", async () => {
    const view = mount();

    await flush(async () => {
      for (let i = 0; i < HISTORY_CAP + 25; i++) {
        engine.emit(
          frame([ch({ peakDb: -6, rmsDb: -18 })], null, { shortTermLufs: -20 }),
        );
      }
    });

    expect(api.history.momentaryLufs.length).toBe(HISTORY_CAP);
    expect(api.history.shortTermLufs.length).toBe(HISTORY_CAP);
    expect(api.history.peakDb.length).toBe(HISTORY_CAP);
    expect(api.history.rmsDb.length).toBe(HISTORY_CAP);
    // Newest values are retained (ring drops oldest).
    expect(api.history.peakDb[api.history.peakDb.length - 1]).toBe(-6);
    expect(api.history.shortTermLufs[api.history.shortTermLufs.length - 1]).toBe(-20);

    view.unmount();
  });

  it("computes dynamics and spectral metrics after a frame", async () => {
    const view = mount();
    expect(api.dynamics).toBeNull();
    expect(api.spectral).toBeNull();

    await flush(async () => {
      engine.emit(
        frame([ch({ peakDb: -6, rmsDb: -18 })], null, { integratedLufs: -20 }),
      );
    });

    expect(api.dynamics).not.toBeNull();
    expect(api.dynamics!.crestDb[0]).toBeCloseTo(12); // -6 - (-18)
    expect(api.dynamics!.plrDb).toBeCloseTo(14); // -6 - (-20)
    expect(api.spectral).not.toBeNull();
    expect(api.spectral!.bandsDb.length).toBeGreaterThan(0);

    view.unmount();
  });

  it("captureTone() attaches a generator source", async () => {
    mount();
    await flush(async () => {
      await api.captureTone({ type: "sine" });
    });
    expect(api.source?.kind).toBe("generator");
  });

  it("captureFile() attaches an audio-file source", async () => {
    mount();
    const blob: Blob = {
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Blob;
    await flush(async () => {
      await api.captureFile(blob);
    });
    expect(api.source?.kind).toBe("audio-file");
  });

  it("setAnalyserConfig() calls the engine and updates analyserConfig", async () => {
    mount();
    expect(api.analyserConfig).toEqual({ fftSize: 2048, smoothing: 0.8 });

    await flush(async () => {
      api.setAnalyserConfig({ fftSize: 4096 });
    });

    expect(engine.setAnalyserConfig).toHaveBeenCalledWith({ fftSize: 4096 });
    expect(api.analyserConfig).toEqual({ fftSize: 4096, smoothing: 0.8 });
  });

  it("snapshot() captures the current summary and clearSnapshot() nulls it", async () => {
    mount();
    await flush(async () => {
      engine.emit(frame([ch({ peakDb: -7, clipCount: 2 })]));
    });
    expect(api.snapshotSummary).toBeNull();

    await flush(async () => {
      api.snapshot();
    });
    expect(api.snapshotSummary).not.toBeNull();
    expect(api.snapshotSummary!.totalClipCount).toBe(2);

    await flush(async () => {
      api.clearSnapshot();
    });
    expect(api.snapshotSummary).toBeNull();
  });

  it("stop() during a pending attach leaves engine/input idle and never resumes", async () => {
    mount();
    // Make the engine's setSource hang until we release it (a slow decode).
    let releaseSetSource!: () => void;
    engine.setSource.mockImplementationOnce(
      () => new Promise<void>((res) => (releaseSetSource = res)),
    );
    const resumeSpy = vi.spyOn(engine, "resume");
    const blob = {
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Blob;

    let attachP: Promise<void> | undefined;
    await flush(async () => {
      attachP = api.captureFile(blob);
      // Let start() resolve so attach reaches the pending setSource await.
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(engine.setSource).toHaveBeenCalledTimes(1);

    await flush(async () => {
      api.stop(); // user hits Stop while the file is still "decoding"
    });
    await flush(async () => {
      releaseSetSource();
      await attachP!;
    });

    // The superseded attach must not resume a detached graph or set state.
    expect(resumeSpy).not.toHaveBeenCalled();
    expect(api.engineState).toBe("idle");
    expect(api.inputState).toBe("idle");
    expect(api.source).toBeNull();
  });

  it("a superseded attach's failure does not clobber the new source's state", async () => {
    mount();
    // First attach: engine.setSource hangs, then rejects AFTER a second attach.
    let failSetSource!: (e: unknown) => void;
    engine.setSource.mockImplementationOnce(
      () => new Promise<void>((_res, rej) => (failSetSource = rej)),
    );
    const blob = {
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Blob;

    let firstP: Promise<void> | undefined;
    await flush(async () => {
      firstP = api.captureFile(blob);
      await new Promise((r) => setTimeout(r, 0));
    });

    // Supersede with a generator source (default setSource impl succeeds).
    await flush(async () => {
      await api.captureTone({ type: "sine" });
    });
    expect(api.source?.kind).toBe("generator");
    expect(api.inputState).toBe("live");

    await flush(async () => {
      failSetSource(new Error("decode failed"));
      await firstP!;
    });

    // The stale rejection must not paint the NEW source as errored.
    expect(api.inputState).toBe("live");
    expect(api.source?.kind).toBe("generator");
  });

  it("resetSession() clears history rings and derived metrics but keeps the snapshot", async () => {
    mount();
    await flush(async () => {
      engine.emit(
        frame([ch({ peakDb: -6, rmsDb: -18 })], null, { integratedLufs: -20 }),
      );
      api.snapshot();
    });
    expect(api.history.peakDb.length).toBe(1);
    expect(api.dynamics).not.toBeNull();
    expect(api.snapshotSummary).not.toBeNull();

    await flush(async () => {
      api.resetSession();
    });

    expect(api.history.peakDb.length).toBe(0);
    expect(api.dynamics).toBeNull();
    expect(api.spectral).toBeNull();
    // Snapshot is a manual hold; reset must leave it alone.
    expect(api.snapshotSummary).not.toBeNull();
  });
});
