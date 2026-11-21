import {
  RemoteTrackPublication,
  Track,
  type RemoteParticipant,
  type Room,
} from "livekit-client";

/** Max simultaneous audio downloads (visible page + active speakers). */
export const MAX_AUDIO_SUBSCRIPTIONS = 64;

export interface SubscriptionTargets {
  video: Set<string>;
  audio: Set<string>;
  /** Screen-share video: visible page + host (so the host's share works from any page). */
  screen: Set<string>;
}

/**
 * Build who this client should subscribe to.
 * Video: current gallery page only (50 people — scale path for 10k+ rooms).
 * Audio: visible page + active speakers + host (capped).
 */
export function buildSubscriptionTargets(opts: {
  visibleIds: readonly string[];
  activeSpeakerIds: readonly string[];
  hostParticipantId?: string;
  maxAudio?: number;
}): SubscriptionTargets {
  const video = new Set(opts.visibleIds);
  const screen = new Set(opts.visibleIds);
  if (opts.hostParticipantId) screen.add(opts.hostParticipantId);
  const audio = new Set<string>(opts.visibleIds);

  if (opts.hostParticipantId) audio.add(opts.hostParticipantId);

  for (const id of opts.activeSpeakerIds) {
    audio.add(id);
    if (audio.size >= (opts.maxAudio ?? MAX_AUDIO_SUBSCRIPTIONS)) break;
  }

  if (audio.size > (opts.maxAudio ?? MAX_AUDIO_SUBSCRIPTIONS)) {
    const capped = new Set<string>();
    let n = 0;
    for (const id of opts.visibleIds) {
      capped.add(id);
      n += 1;
    }
    if (opts.hostParticipantId && !capped.has(opts.hostParticipantId)) {
      capped.add(opts.hostParticipantId);
      n += 1;
    }
    for (const id of opts.activeSpeakerIds) {
      if (n >= (opts.maxAudio ?? MAX_AUDIO_SUBSCRIPTIONS)) break;
      if (!capped.has(id)) {
        capped.add(id);
        n += 1;
      }
    }
    return { video, audio: capped, screen };
  }

  return { video, audio, screen };
}

function setPublicationSubscribed(pub: RemoteTrackPublication, subscribed: boolean): void {
  if (pub.isSubscribed === subscribed) return;
  pub.setSubscribed(subscribed);
}

/** Apply manual subscribe/unsubscribe for mass rooms (autoSubscribe off). */
export function applySelectiveSubscriptions(room: Room, targets: SubscriptionTargets): void {
  for (const participant of room.remoteParticipants.values()) {
    const id = participant.identity;
    const wantVideo = targets.video.has(id);
    const wantAudio = targets.audio.has(id);

    applyParticipantSubscriptions(participant, wantVideo, wantAudio, targets.screen.has(id));
  }
}

export function applyTargetsToParticipant(
  participant: RemoteParticipant,
  targets: SubscriptionTargets,
): void {
  const id = participant.identity;
  applyParticipantSubscriptions(
    participant,
    targets.video.has(id),
    targets.audio.has(id),
    targets.screen.has(id),
  );
}

export function applyParticipantSubscriptions(
  participant: RemoteParticipant,
  wantVideo: boolean,
  wantAudio: boolean,
  wantScreen: boolean = wantVideo,
): void {
  for (const pub of participant.trackPublications.values()) {
    const remote = pub as RemoteTrackPublication;
    if (pub.kind === Track.Kind.Video) {
      if (pub.source === Track.Source.ScreenShare) {
        setPublicationSubscribed(remote, wantScreen);
      } else {
        setPublicationSubscribed(remote, wantVideo);
      }
    } else if (pub.kind === Track.Kind.Audio) {
      setPublicationSubscribed(remote, wantAudio);
    }
  }
}

export function shouldTrackRemoteParticipant(
  participant: RemoteParticipant,
  targets: SubscriptionTargets,
): boolean {
  const id = participant.identity;
  return targets.video.has(id) || targets.audio.has(id);
}
