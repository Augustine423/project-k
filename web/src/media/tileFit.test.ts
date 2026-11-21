import { describe, expect, it } from "vitest";
import { FIT_THRESHOLD, resolveTileFit } from "./conferenceLayout";

const base = { streamAspect: "landscape", layout: "gallery", size: "grid" } as const;

describe("resolveTileFit", () => {
  it("uses contain when box matches stream", () => {
    expect(resolveTileFit({ ...base, boxRatio: 16 / 9, streamRatio: 16 / 9 })).toBe("contain");
  });
  it("uses contain-blur for portrait in landscape box", () => {
    expect(resolveTileFit({ ...base, boxRatio: 16 / 9, streamRatio: 9 / 16 })).toBe("contain-blur");
  });
  it("fills the tile when the ratios are close, letterboxes past FIT_THRESHOLD", () => {
    const near = Math.exp(FIT_THRESHOLD * 0.6);
    const far = Math.exp(FIT_THRESHOLD * 1.2);
    expect(resolveTileFit({ ...base, boxRatio: near, streamRatio: 1 })).toBe("cover");
    expect(resolveTileFit({ ...base, boxRatio: far, streamRatio: 1 })).toBe("contain-blur");
  });
  it("never crops when ratios are unknown", () => {
    expect(resolveTileFit(base)).toBe("contain-blur");
  });
});
