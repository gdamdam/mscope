import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, useEffect } from "react";
import { useScope, type UseScope } from "./useScope";
import { render, flush } from "./testRender";
import { FakeScopeEngine, frame, ch } from "./testFakes";

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
});
