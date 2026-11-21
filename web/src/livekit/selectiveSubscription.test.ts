import { describe, expect, it, vi } from "vitest";
import { Track } from "livekit-client";
import {
  applyParticipantSubscriptions,
  applyStageHiddenVideo,
  buildSubscriptionTargets,
  withoutHiddenVideo,
} from "./selectiveSubscription";

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

describe("stage hidden (+N) video", () => {
  it("drops hidden ids from video but keeps audio", () => {
    const t = withoutHiddenVideo(
      buildSubscriptionTargets({ visibleIds: ["a", "b"], activeSpeakerIds: [] }),
      ["b"],
    );
    expect([...t.video]).toEqual(["a"]);
    expect(t.audio.has("b")).toBe(true);
  });

  it("unsubscribes hidden camera, keeps audio and restores returning ids", () => {
    const cam = pub(Track.Kind.Video, Track.Source.Camera);
    const mic = pub(Track.Kind.Audio, Track.Source.Microphone);
    cam.isSubscribed = true;
    const room = {
      remoteParticipants: new Map([["x", { trackPublications: new Map([["c", cam], ["m", mic]]) }]]),
    } as never;
    applyStageHiddenVideo(room, ["x"], new Set());
    expect(cam.setSubscribed).toHaveBeenCalledWith(false);
    expect(mic.setSubscribed).not.toHaveBeenCalled();
    cam.isSubscribed = false;
    applyStageHiddenVideo(room, [], new Set(["x"]));
    expect(cam.setSubscribed).toHaveBeenLastCalledWith(true);
  });
});
