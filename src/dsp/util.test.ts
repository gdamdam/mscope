import { describe, it, expect } from "vitest";
import { DB_FLOOR, linToDb, dbToLin, clamp } from "./util";

describe("linToDb", () => {
  it("maps full scale to 0 dBFS", () => {
    expect(linToDb(1)).toBeCloseTo(0, 10);
  });
  it("maps half amplitude to ~-6.02 dBFS", () => {
    expect(linToDb(0.5)).toBeCloseTo(-6.0206, 3);
  });
  it("floors zero and negative-magnitude input at DB_FLOOR", () => {
    expect(linToDb(0)).toBe(DB_FLOOR);
    expect(linToDb(-0)).toBe(DB_FLOOR);
  });
  it("uses magnitude (sign-independent)", () => {
    expect(linToDb(-0.5)).toBeCloseTo(linToDb(0.5), 10);
  });
});

describe("dbToLin", () => {
  it("inverts linToDb", () => {
    expect(dbToLin(0)).toBeCloseTo(1, 10);
    expect(dbToLin(linToDb(0.25))).toBeCloseTo(0.25, 10);
  });
});

describe("clamp", () => {
  it("bounds values", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.3, 0, 1)).toBe(0.3);
  });
});
