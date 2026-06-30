import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYSIS_CONFIG } from "./types";

// Smoke test: proves the Vitest harness runs and the default config is sane.
describe("DEFAULT_ANALYSIS_CONFIG", () => {
  it("has a positive sample rate", () => {
    expect(DEFAULT_ANALYSIS_CONFIG.sampleRate).toBeGreaterThan(0);
  });

  it("has a clip threshold in (0, 1]", () => {
    expect(DEFAULT_ANALYSIS_CONFIG.clipThreshold).toBeGreaterThan(0);
    expect(DEFAULT_ANALYSIS_CONFIG.clipThreshold).toBeLessThanOrEqual(1);
  });
});
