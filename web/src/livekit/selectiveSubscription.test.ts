import { describe, expect, it, vi } from "vitest";
import { Track } from "livekit-client";
import { applyParticipantSubscriptions, buildSubscriptionTargets } from "./selectiveSubscription";

function pub(kind: Track.Kind, source: Track.Source) {
  return { kind, source, isSubscribed: false, setSubscribed: vi.fn() };
}

describe("buildSubscriptionTargets", () => {
  it("subscribes video/screen for visible ids and screen for host", () => {
    const t = buildSubscriptionTargets({ visibleIds: ["a", "b"], activeSpeakerIds: ["c"], hostParticipantId: "h" });
    expect([...t.video].sort()).toEqual(["a", "b"]);
    expect(t.screen.has("h")).toBe(true);
    expect(t.screen.has("c")).toBe(false);
    expect(t.audio.has("c")).toBe(true);
  });
});

describe("screen-share subscription rule", () => {
  it("does not subscribe screen share for audio-only participants", () => {
    const screen = pub(Track.Kind.Video, Track.Source.ScreenShare);
    const cam = pub(Track.Kind.Video, Track.Source.Camera);
    const p = { trackPublications: new Map([["s", screen], ["c", cam]]) } as never;
    applyParticipantSubscriptions(p, false, true);
    expect(screen.setSubscribed).not.toHaveBeenCalledWith(true);
    expect(cam.setSubscribed).not.toHaveBeenCalledWith(true);
  });
  it("subscribes screen share when video is wanted", () => {
    const screen = pub(Track.Kind.Video, Track.Source.ScreenShare);
    const p = { trackPublications: new Map([["s", screen]]) } as never;
    applyParticipantSubscriptions(p, true, false);
    expect(screen.setSubscribed).toHaveBeenCalledWith(true);
  });
});
