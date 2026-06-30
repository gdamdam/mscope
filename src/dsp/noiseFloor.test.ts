import { describe, it, expect } from "vitest";
import { DB_FLOOR } from "./util";
import { estimateNoiseFloorDb } from "./noiseFloor";

describe("estimateNoiseFloorDb", () => {
  it("returns DB_FLOOR for an empty history", () => {
    expect(estimateNoiseFloorDb([])).toBe(DB_FLOOR);
  });

  it("returns DB_FLOOR when all samples are invalid", () => {
    expect(estimateNoiseFloorDb([NaN, Infinity, DB_FLOOR, -Infinity])).toBe(
      DB_FLOOR,
    );
  });

  it("estimates the ~10th percentile of finite samples", () => {
    // 10 ascending samples; nearest-rank 10th percentile -> ceil(0.1*10)=1st => index 0.
    const hist = [-90, -80, -70, -60, -50, -40, -30, -20, -10, -5];
    expect(estimateNoiseFloorDb(hist)).toBe(-90);
  });

  it("ignores non-finite and DB_FLOOR sentinels before ranking", () => {
    // Finite/non-sentinel sorted: [-90,-80,-70,-60,-50] (5 samples).
    // nearest-rank 10th pct -> ceil(0.1*5)=1 => index 0 => -90.
    const hist = [NaN, -50, DB_FLOOR, -70, Infinity, -90, -60, -80];
    expect(estimateNoiseFloorDb(hist)).toBe(-90);
  });

  it("is order-independent", () => {
    const a = estimateNoiseFloorDb([-50, -90, -70, -60, -80, -40, -30, -20, -10, -5]);
    const b = estimateNoiseFloorDb([-90, -80, -70, -60, -50, -40, -30, -20, -10, -5]);
    expect(a).toBe(b);
  });

  it("handles a single finite sample", () => {
    expect(estimateNoiseFloorDb([NaN, -42, DB_FLOOR])).toBe(-42);
  });
});
