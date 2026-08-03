import {
  Track,
  VideoPresets,
  type LocalParticipant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Room,
  type RoomOptions,
  type VideoCaptureOptions,
} from "livekit-client";
import {
  substreamForVideoSlot,
  type GalleryVideoTier,
} from "../media/galleryVideoPolicy";

/** High-layer publish budget (~720p30). */
export const LIVEKIT_MAX_VIDEO_BITRATE = VideoPresets.h720.encoding.maxBitrate;
export const LIVEKIT_MAX_FRAMERATE = VideoPresets.h720.encoding.maxFramerate ?? 30;

/** Prefer portrait capture on phones held upright; landscape otherwise (laptop / sideways phone). */
export function isPortraitCapturePreferred(): boolean {
  if (typeof window === "undefined") return false;
  const type = window.screen?.orientation?.type;
  if (typeof type === "string") {
    if (type.startsWith("portrait")) return true;
    if (type.startsWith("landscape")) return false;
  }
  return window.matchMedia("(orientation: portrait)").matches;
}

/**
 * Capture near 720p without forcing a laptop landscape crop on phones.
 * Portrait devices request 720×1280 so the full camera frame can letterbox with object-fit:contain.
 */
export function cameraEnableCaptureOptions(): VideoCaptureOptions {
  const portrait = isPortraitCapturePreferred();
  const longEdge = VideoPresets.h720.width;
  const shortEdge = VideoPresets.h720.height;
  return {
    resolution: {
      width: portrait ? shortEdge : longEdge,
      height: portrait ? longEdge : shortEdge,
      frameRate: LIVEKIT_MAX_FRAMERATE,
    },
    facingMode: "user",
  };
}

/**
 * Publishers send HD + simulcast ladders; viewers adapt via adaptiveStream +
 * gallery quality caps (server still lowers layers when the network cannot keep up).
 */
export function createLiveKitRoomOptions(): RoomOptions {
  return {
    adaptiveStream: {
      // Prefer crisp tiles on HiDPI screens instead of locking to CSS box size.
      pixelDensity: "screen",
    },
    dynacast: true,
    stopLocalTrackOnUnpublish: false,
    videoCaptureDefaults: cameraEnableCaptureOptions(),
    publishDefaults: {
      simulcast: true,
      videoCodec: "vp9",
      backupCodec: { codec: "vp8", encoding: VideoPresets.h720.encoding },
      stopMicTrackOnMute: false,
      // High layer = 720p; lower layers for weak viewers.
      videoEncoding: VideoPresets.h720.encoding,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      degradationPreference: "maintain-resolution",
    },
  };
}

const LAYER_DIMS = [
  VideoPresets.h180.resolution,
  VideoPresets.h360.resolution,
  VideoPresets.h720.resolution,
] as const;

/**
 * Ask LiveKit for the best simulcast layer per visible gallery slot.
 * Dimensions take precedence over adaptiveStream's CSS-tile estimate; the SFU
 * still steps down when bandwidth cannot sustain the request.
 */
export function applyRemoteSimulcastPreferences(
  room: Room,
  visibleOrderedIds: string[],
  tier: GalleryVideoTier,
): void {
  const visible = new Set(visibleOrderedIds);
  let slot = 0;

  for (const identity of visibleOrderedIds) {
    const participant = room.remoteParticipants.get(identity);
    if (!participant) continue;
    const pub = cameraPublication(participant);
    if (!pub) continue;

    const layer = substreamForVideoSlot(slot, tier);
    slot += 1;
    // Prefer HD for small rooms (gallery HD slots); medium/low for large galleries.
    pub.setVideoDimensions(LAYER_DIMS[layer]);
  }

  for (const participant of room.remoteParticipants.values()) {
    if (visible.has(participant.identity)) continue;
    const pub = cameraPublication(participant);
    if (!pub) continue;
    // Off-page: keep a cheap layer so dynacast can park unused HD.
    pub.setVideoDimensions(LAYER_DIMS[0]);
  }
}

function cameraPublication(participant: RemoteParticipant): RemoteTrackPublication | null {
  const pub = participant.getTrackPublication(Track.Source.Camera);
  if (!pub || pub.kind !== "video" || !pub.isSubscribed) return null;
  return pub as RemoteTrackPublication;
}

/** Local preview — screen share preferred, else camera. Never put the mic in a playback stream (echo). */
export function buildLocalParticipantStream(participant: LocalParticipant): MediaStream | null {
  const screen = participant.getTrackPublication(Track.Source.ScreenShare);
  const screenTrack = screen?.track?.mediaStreamTrack;
  if (participant.isScreenShareEnabled && screenTrack) {
    return new MediaStream([screenTrack]);
  }
  if (!participant.isCameraEnabled) return null;
  const cam = participant.getTrackPublication(Track.Source.Camera);
  const track = cam?.track?.mediaStreamTrack;
  if (!track) return null;
  return new MediaStream([track]);
}

/** Keep a MediaStream identity stable; only add/remove tracks (avoids audio restart echo). */
export function syncMediaStreamTracks(stream: MediaStream, desired: MediaStreamTrack[]): void {
  const want = new Set(desired);
  for (const t of [...stream.getTracks()]) {
    if (!want.has(t)) stream.removeTrack(t);
  }
  const have = new Set(stream.getTracks());
  for (const t of desired) {
    if (!have.has(t)) stream.addTrack(t);
  }
}

export function collectRemoteMediaTracks(participant: {
  trackPublications: Map<string, { track?: { mediaStreamTrack: MediaStreamTrack } | null }>;
  getTrackPublication?: (source: Track.Source) => { track?: { mediaStreamTrack: MediaStreamTrack } | null; isMuted?: boolean } | undefined;
}): MediaStreamTrack[] {
  // Prefer screen share over camera so active-speaker / primary tiles show the share.
  if (typeof participant.getTrackPublication === "function") {
    const tracks: MediaStreamTrack[] = [];
    const screen = participant.getTrackPublication(Track.Source.ScreenShare);
    const cam = participant.getTrackPublication(Track.Source.Camera);
    const mic = participant.getTrackPublication(Track.Source.Microphone);
    const screenTrack = screen && !screen.isMuted ? screen.track?.mediaStreamTrack : undefined;
    const camTrack = cam && !cam.isMuted ? cam.track?.mediaStreamTrack : undefined;
    const micTrack = mic?.track?.mediaStreamTrack;
    if (screenTrack) tracks.push(screenTrack);
    else if (camTrack) tracks.push(camTrack);
    if (micTrack) tracks.push(micTrack);
    if (tracks.length) return tracks;
  }

  const tracks: MediaStreamTrack[] = [];
  for (const pub of participant.trackPublications.values()) {
    const track = pub.track?.mediaStreamTrack;
    if (track) tracks.push(track);
  }
  return tracks;
}

export function remoteTrackSignature(tracks: MediaStreamTrack[]): string {
  return tracks.map((t) => `${t.id}:${t.kind}:${t.readyState}`).sort().join("|");
}

export function remoteParticipantStream(participant: {
  trackPublications: Map<string, { track?: { mediaStreamTrack: MediaStreamTrack } | null }>;
}): MediaStream {
  const stream = new MediaStream();
  for (const track of collectRemoteMediaTracks(participant)) {
    stream.addTrack(track);
  }
  return stream;
}

export function participantHasVideo(participant: {
  isCameraEnabled: boolean;
  trackPublications: Map<string, { kind?: string; track?: unknown }>;
}): boolean {
  if (!participant.isCameraEnabled) return false;
  for (const pub of participant.trackPublications.values()) {
    if (pub.kind === "video" && pub.track) return true;
  }
  return false;
}

const LOCAL_TRACK_WAIT_MS = 8000;

/** After enabling mic/cam, wait until LiveKit publishes the local track (or timeout). */
export async function waitForLocalTrack(
  participant: LocalParticipant,
  source: Track.Source,
): Promise<void> {
  const deadline = Date.now() + LOCAL_TRACK_WAIT_MS;
  while (Date.now() < deadline) {
    const pub = participant.getTrackPublication(source);
    if (pub?.track?.mediaStreamTrack && !pub.isMuted) return;
    await new Promise((r) => window.setTimeout(r, 40));
  }
}

export function mediaToggleErrorMessage(kind: "audio" | "video", err: unknown): string {
  const device = kind === "audio" ? "Microphone" : "Camera";
  if (!(err instanceof Error)) return `${device} failed`;

  const msg = err.message;
  if (/permission|denied|notallowed/i.test(msg)) {
    return `${device} permission denied — allow access in your browser settings.`;
  }
  if (/notfound|notreadable|in use|occupied/i.test(msg)) {
    return `${device} not found or already in use by another app.`;
  }
  if (/abort|cancel/i.test(msg)) {
    return `${device} request was cancelled.`;
  }
  return msg || `${device} failed`;
}
