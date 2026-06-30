import { describe, it, expect } from "vitest";
import { DB_FLOOR } from "./util";
import { crestFactorDb, plrDb } from "./dynamics";

describe("crestFactorDb", () => {
  it("computes peak minus rms", () => {
    expect(crestFactorDb(-6, -18)).toBe(12);
  });
  it("floors negative results at 0", () => {
    expect(crestFactorDb(-18, -6)).toBe(0);
  });
  it("returns 0 when rms is at DB_FLOOR (silence)", () => {
    expect(crestFactorDb(-6, DB_FLOOR)).toBe(0);
  });
  it("returns 0 when peak is at DB_FLOOR", () => {
    expect(crestFactorDb(DB_FLOOR, -18)).toBe(0);
  });
  it("returns 0 for non-finite inputs", () => {
    expect(crestFactorDb(NaN, -18)).toBe(0);
    expect(crestFactorDb(-6, Infinity)).toBe(0);
    expect(crestFactorDb(-Infinity, -18)).toBe(0);
  });
});

describe("plrDb", () => {
  it("computes peak minus integrated loudness", () => {
    expect(plrDb(-1, -15)).toBe(14);
  });
  it("can be negative (peak below integrated)", () => {
    expect(plrDb(-20, -10)).toBe(-10);
  });
  it("returns 0 for non-finite inputs", () => {
    expect(plrDb(NaN, -15)).toBe(0);
    expect(plrDb(-1, -Infinity)).toBe(0);
    expect(plrDb(Infinity, -15)).toBe(0);
  });
});
