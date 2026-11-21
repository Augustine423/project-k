import { describe, expect, it } from "vitest";
import { packTiles } from "./tilePack";

describe("packTiles", () => {
  it("never overflows the area", () => {
    for (const n of [1, 2, 3, 5, 9, 16]) {
      for (const [w, h] of [[1000, 700], [390, 600], [1440, 800]]) {
        const p = packTiles(n, w, h)!;
        expect(p.tileW * p.cols).toBeLessThanOrEqual(w);
        expect(p.tileH * p.rows).toBeLessThanOrEqual(h);
        expect(p.cols * p.rows).toBeGreaterThanOrEqual(n);
      }
    }
  });

  it("keeps a wide tile for a lone participant on a wide stage", () => {
    const p = packTiles(1, 1400, 600)!;
    expect(p.tileW / p.tileH).toBeCloseTo(16 / 9, 1);
  });

  it("stacks tiles in a narrow portrait viewport", () => {
    const p = packTiles(2, 390, 700)!;
    expect(p.cols).toBe(1);
  });

  it("returns null for an empty area", () => {
    expect(packTiles(3, 0, 0)).toBeNull();
  });
});
