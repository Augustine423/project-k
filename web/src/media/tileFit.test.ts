import { describe, expect, it } from "vitest";
import { resolveTileFit } from "./conferenceLayout";

const base = { streamAspect: "landscape", layout: "gallery", size: "grid" } as const;

describe("resolveTileFit", () => {
  it("uses contain when box matches stream", () => {
    expect(resolveTileFit({ ...base, boxRatio: 16 / 9, streamRatio: 16 / 9 })).toBe("contain");
  });
  it("uses contain-blur for portrait in landscape box", () => {
    expect(resolveTileFit({ ...base, boxRatio: 16 / 9, streamRatio: 9 / 16 })).toBe("contain-blur");
  });
  it("never crops when ratios are unknown", () => {
    expect(resolveTileFit(base)).toBe("contain-blur");
  });
});
