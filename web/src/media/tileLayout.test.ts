import { describe, expect, it } from "vitest";
import { computeLayout, nearestCorner, type LayoutInput, type Rect } from "./tileLayout";

const people = (aspects: number[]) => aspects.map((aspect, i) => ({ id: `p${i}`, aspect }));
const base = (over: Partial<LayoutInput>): LayoutInput => ({
  width: 1200, height: 700, gap: 10, participants: people([16 / 9]), mode: "gallery-mixed", ...over,
});
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

function expectValid(input: LayoutInput) {
  const { rects } = computeLayout(input);
  const list = Object.values(rects);
  for (const r of list) {
    expect(r.x).toBeGreaterThanOrEqual(-1);
    expect(r.y).toBeGreaterThanOrEqual(-1);
    expect(r.x + r.w).toBeLessThanOrEqual(input.width + 1);
    expect(r.y + r.h).toBeLessThanOrEqual(input.height + 1);
  }
  if (input.mode !== "call")
    list.forEach((a, i) => list.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
  return rects;
}

describe("computeLayout", () => {
  it.each([1, 2, 5, 9, 16])("fits %i mixed tiles without overlap", (n) => {
    const aspects = Array.from({ length: n }, (_, i) => [16 / 9, 9 / 16, 4 / 3, 1][i % 4]);
    for (const [width, height] of [[1440, 800], [390, 700], [800, 360]]) {
      const rects = expectValid(base({ width, height, participants: people(aspects) }));
      expect(Object.keys(rects)).toHaveLength(n);
    }
  });

  it("keeps each tile's own aspect ratio in mixed mode", () => {
    const rects = computeLayout(base({ participants: people([9 / 16, 16 / 9, 1]) })).rects;
    expect(rects.p0.w / rects.p0.h).toBeCloseTo(9 / 16, 1);
    expect(rects.p2.w / rects.p2.h).toBeCloseTo(1, 1);
  });

  it("uses same-height rows when everything fits one row", () => {
    const r = computeLayout(base({ width: 2000, height: 400, participants: people([16 / 9, 9 / 16]) })).rects;
    expect(r.p0.h).toBe(r.p1.h);
  });

  it("uniform: 16:9 on landscape stage, 3:4 on portrait stage, last row centered", () => {
    const land = expectValid(base({ mode: "gallery-uniform", participants: people(Array(5).fill(1)) }));
    expect(land.p0.w / land.p0.h).toBeCloseTo(16 / 9, 1);
    const port = expectValid(base({ mode: "gallery-uniform", width: 400, height: 800, participants: people(Array(3).fill(1)) }));
    expect(port.p0.w / port.p0.h).toBeCloseTo(3 / 4, 1);
    const last = land.p4;
    const rowTop = Object.values(land).filter((r) => r.y === last.y);
    const left = Math.min(...rowTop.map((r) => r.x));
    const right = Math.max(...rowTop.map((r) => r.x + r.w));
    expect(Math.abs(left - (1200 - right))).toBeLessThanOrEqual(2);
  });

  it("speaker: strip on right for landscape, bottom for portrait, max 4 slots with +N", () => {
    const land = computeLayout(base({ mode: "speaker", participants: people(Array(8).fill(16 / 9)) }));
    expect(Object.keys(land.rects)).toHaveLength(4);
    expect(land.overflow?.ids).toHaveLength(4);
    expect(land.rects.p1.x).toBeGreaterThan(land.rects.p0.x + land.rects.p0.w);
    const port = computeLayout(base({ mode: "speaker", width: 400, height: 800, participants: people(Array(3).fill(1)) }));
    expect(port.rects.p1.y).toBeGreaterThan(port.rects.p0.y + port.rects.p0.h);
    expect(port.overflow).toBeNull();
  });

  it("speaker: pinned participant becomes the spotlight", () => {
    const r = computeLayout(base({ mode: "speaker", pinnedId: "p2", participants: people([1, 1, 1]) })).rects;
    expect(r.p2.w).toBeGreaterThan(r.p0.w);
  });

  it("call: remote fills the stage and self floats in the chosen corner", () => {
    const input = base({ mode: "call", selfId: "p1", participants: people([16 / 9, 9 / 16]), corner: "tl" });
    const r = computeLayout(input).rects;
    expect(r.p0).toEqual({ x: 0, y: 0, w: 1200, h: 700 });
    expect(r.p1.x).toBeLessThan(50);
    expect(r.p1.y).toBeLessThan(50);
    expect(r.p1.w).toBeLessThanOrEqual(200);
  });

  it("snaps to the nearest corner", () => {
    expect(nearestCorner(900, 100, 1000, 800)).toBe("tr");
    expect(nearestCorner(100, 700, 1000, 800)).toBe("bl");
  });

  it("returns nothing for an empty stage", () => {
    expect(computeLayout(base({ width: 0 })).rects).toEqual({});
  });
});
