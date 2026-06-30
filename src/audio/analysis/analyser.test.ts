import { describe, it, expect } from "vitest";
import { binToFrequency, frequencyToBin, downsampleWaveform } from "./analyser";

describe("binToFrequency", () => {
  it("bin 0 maps to 0 Hz", () => {
    expect(binToFrequency(0, 2048, 48000)).toBe(0);
  });
  it("the Nyquist bin (fftSize/2) maps to sampleRate/2", () => {
    expect(binToFrequency(1024, 2048, 48000)).toBeCloseTo(24000, 10);
    expect(binToFrequency(512, 1024, 44100)).toBeCloseTo(22050, 10);
  });
  it("scales linearly with bin index", () => {
    // bin * sampleRate / fftSize
    expect(binToFrequency(1, 2048, 48000)).toBeCloseTo(48000 / 2048, 10);
    expect(binToFrequency(100, 4096, 44100)).toBeCloseTo((100 * 44100) / 4096, 10);
  });
});

describe("frequencyToBin", () => {
  it("0 Hz maps to bin 0", () => {
    expect(frequencyToBin(0, 2048, 48000)).toBe(0);
  });
  it("sampleRate/2 maps to the Nyquist bin (fftSize/2)", () => {
    expect(frequencyToBin(24000, 2048, 48000)).toBe(1024);
    expect(frequencyToBin(22050, 1024, 44100)).toBe(512);
  });
  it("rounds to the nearest integer bin", () => {
    // exact midpoint freq -> rounds to nearest bin
    const fftSize = 2048;
    const sampleRate = 48000;
    const binWidth = sampleRate / fftSize;
    // freq just above bin 5 center but below 5.5 -> rounds to 5
    expect(frequencyToBin(binWidth * 5.2, fftSize, sampleRate)).toBe(5);
    // freq above 5.5 -> rounds to 6
    expect(frequencyToBin(binWidth * 5.7, fftSize, sampleRate)).toBe(6);
  });
});

describe("bin <-> frequency round-trip", () => {
  const cases: Array<{ fftSize: number; sampleRate: number; bins: number[] }> = [
    { fftSize: 2048, sampleRate: 48000, bins: [0, 1, 7, 100, 512, 1024] },
    { fftSize: 1024, sampleRate: 44100, bins: [0, 3, 64, 256, 512] },
    { fftSize: 4096, sampleRate: 96000, bins: [0, 1, 1000, 2048] },
  ];
  for (const { fftSize, sampleRate, bins } of cases) {
    for (const bin of bins) {
      it(`bin ${bin} survives round-trip (fft=${fftSize}, sr=${sampleRate})`, () => {
        const freq = binToFrequency(bin, fftSize, sampleRate);
        expect(frequencyToBin(freq, fftSize, sampleRate)).toBe(bin);
      });
    }
  }
});

describe("downsampleWaveform", () => {
  it("returns empty arrays for targetWidth <= 0", () => {
    const data = new Float32Array([1, 2, 3, 4]);
    const z = downsampleWaveform(data, 0);
    expect(z.min.length).toBe(0);
    expect(z.max.length).toBe(0);
    const neg = downsampleWaveform(data, -3);
    expect(neg.min.length).toBe(0);
    expect(neg.max.length).toBe(0);
  });

  it("returns empty arrays for empty input", () => {
    const z = downsampleWaveform(new Float32Array(0), 10);
    expect(z.min.length).toBe(0);
    expect(z.max.length).toBe(0);
  });

  it("computes correct per-column min/max for a known ramp", () => {
    // ramp 0..7, 8 samples into 2 columns -> [0..3] and [4..7]
    const ramp = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const { min, max } = downsampleWaveform(ramp, 2);
    expect(min.length).toBe(2);
    expect(max.length).toBe(2);
    // first column covers samples 0..3
    expect(min[0]).toBe(0);
    expect(max[0]).toBe(3);
    // last column covers samples 4..7
    expect(min[1]).toBe(4);
    expect(max[1]).toBe(7);
  });

  it("each output column holds exactly one sample when targetWidth >= length", () => {
    // exactly-representable float32 values so we can assert with toBe.
    // 3 samples spread across 8 columns: each column maps to one source sample
    // (min == max), and every column is occupied (no holes).
    const data = new Float32Array([5, -2, 9]);
    const { min, max } = downsampleWaveform(data, 8);
    expect(min.length).toBe(8);
    expect(max.length).toBe(8);
    for (let c = 0; c < 8; c++) {
      expect(min[c]).toBe(max[c]); // one sample -> min == max
      expect([5, -2, 9]).toContain(min[c]); // value is one of the inputs
    }
    // boundaries: first column is sample 0, last column is the final sample
    expect(min[0]).toBe(5);
    expect(min[7]).toBe(9);
  });

  it("targetWidth === length is identity (min == max == sample)", () => {
    // Float32Array stores 32-bit floats, so 0.1 etc. are not bit-exact; compare
    // against the same lossy round-trip the storage performs.
    const src = [0.1, -0.5, 0.3, 1];
    const data = new Float32Array(src);
    const { min, max } = downsampleWaveform(data, 4);
    for (let i = 0; i < src.length; i++) {
      expect(min[i]).toBeCloseTo(src[i], 6);
      expect(max[i]).toBeCloseTo(src[i], 6);
      expect(min[i]).toBe(max[i]);
    }
  });

  it("produces min <= max per column for a sine wave", () => {
    const n = 1024;
    const sine = new Float32Array(n);
    for (let i = 0; i < n; i++) sine[i] = Math.sin((2 * Math.PI * 5 * i) / n);
    const { min, max } = downsampleWaveform(sine, 64);
    expect(min.length).toBe(64);
    expect(max.length).toBe(64);
    for (let c = 0; c < 64; c++) {
      expect(min[c]).toBeLessThanOrEqual(max[c]);
      // within sine range
      expect(min[c]).toBeGreaterThanOrEqual(-1.0000001);
      expect(max[c]).toBeLessThanOrEqual(1.0000001);
    }
  });
});
