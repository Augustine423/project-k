import {
  AudioPresets,
  ConnectionQuality,
  LocalVideoTrack,
  Track,
  VideoPresets,
  VideoQuality,
  type AudioCaptureOptions,
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

/** Prefer device max quality — do not cap to 720p. Viewers adapt via simulcast. */
export const LIVEKIT_MAX_VIDEO_BITRATE = VideoPresets.h1080.encoding.maxBitrate;
export const LIVEKIT_MAX_FRAMERATE = VideoPresets.h1080.encoding.maxFramerate ?? 30;

/**
 * Capture-side WebRTC DSP via browser getUserMedia constraints:
 * Raw mic → AEC → noise suppress → AGC → Opus.
 * Keep all three on so nearby laptop/phone speakers don't create echo loops.
 */
export function microphoneEnableCaptureOptions(): AudioCaptureOptions {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
}

/** Re-assert AEC / NS / AGC after enable (some devices drop constraints on restart). */
export async function applyAudioProcessingConstraints(
  track: MediaStreamTrack | undefined | null,
): Promise<void> {
  if (!track || track.kind !== "audio") return;
  try {
    await track.applyConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    });
  } catch {
    // Keep negotiated settings if the browser rejects a constraint.
  }
}

/**
 * Cap local camera simulcast publish layers when uplink quality drops.
 * Receive-side adaptation remains on adaptiveStream + gallery layer prefs.
 */
export function applyLocalUplinkVideoQuality(room: Room, quality: ConnectionQuality): void {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  const track = pub?.track;
  if (!track || !(track instanceof LocalVideoTrack)) return;

  let maxQuality: VideoQuality;
  switch (quality) {
    case ConnectionQuality.Poor:
      maxQuality = VideoQuality.MEDIUM;
      break;
    case ConnectionQuality.Lost:
      maxQuality = VideoQuality.LOW;
      break;
    case ConnectionQuality.Good:
    case ConnectionQuality.Excellent:
    case ConnectionQuality.Unknown:
    default:
      maxQuality = VideoQuality.HIGH;
      break;
  }
  track.setPublishingQuality(maxQuality);
}

/** Max simulcast layer index (0=h180 … 3=h1080) for the viewer's current downlink. */
export function receiveLayerCapForQuality(quality: ConnectionQuality): number {
  switch (quality) {
    case ConnectionQuality.Lost:
      return 0;
    case ConnectionQuality.Poor:
      return 1;
    case ConnectionQuality.Good:
      return 2;
    case ConnectionQuality.Excellent:
    case ConnectionQuality.Unknown:
    default:
      return 3;
  }
}

/** Ideal capture targets — browser picks the best mode the camera supports. */
const CAPTURE_LONG_EDGE = 1920;
const CAPTURE_SHORT_EDGE = 1080;

/** Prefer portrait capture on phones held upright; landscape otherwise (laptop / sideways phone). */
export function isPortraitCapturePreferred(): boolean {
  if (typeof window === "undefined") return false;
  const type = window.screen?.orientation?.type;
  if (typeof type === "string") {
    if (type.startsWith("portrait")) return true;
    if (type.startsWith("landscape")) return false;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(orientation: portrait)").matches;
  }
  return window.innerHeight > window.innerWidth;
}

/**
 * Request the device's best camera quality for the current orientation.
 * No hard max — `ideal` lets the browser choose the highest supported mode.
 * Downstream viewers receive lower simulcast layers when bandwidth is limited.
 */
export function cameraEnableCaptureOptions(): VideoCaptureOptions {
  const portrait = isPortraitCapturePreferred();
  return {
    resolution: {
      width: portrait ? CAPTURE_SHORT_EDGE : CAPTURE_LONG_EDGE,
      height: portrait ? CAPTURE_LONG_EDGE : CAPTURE_SHORT_EDGE,
      frameRate: LIVEKIT_MAX_FRAMERATE,
      aspectRatio: portrait ? 9 / 16 : 16 / 9,
    },
    facingMode: "user",
  };
}

/** Re-assert orientation + high ideal resolution after enable / rotate. */
export async function applyOrientationCaptureConstraints(
  track: MediaStreamTrack | undefined | null,
): Promise<void> {
  if (!track || track.kind !== "video") return;
  const portrait = isPortraitCapturePreferred();
  try {
    await track.applyConstraints({
      width: { ideal: portrait ? CAPTURE_SHORT_EDGE : CAPTURE_LONG_EDGE },
      height: { ideal: portrait ? CAPTURE_LONG_EDGE : CAPTURE_SHORT_EDGE },
      aspectRatio: { ideal: portrait ? 9 / 16 : 16 / 9 },
      frameRate: { ideal: LIVEKIT_MAX_FRAMERATE },
    });
  } catch {
    // Browser may reject; keep whatever was negotiated.
  }
}

/**
 * Publishers send high quality + simulcast ladders.
 * Each viewer only downloads the layer their bandwidth / tile size can sustain.
 * Mic: browser AEC + noise suppress + AGC (set on getUserMedia / LiveKit capture).
 */
export function createLiveKitRoomOptions(): RoomOptions {
  return {
    adaptiveStream: {
      pixelDensity: "screen",
    },
    dynacast: true,
    stopLocalTrackOnUnpublish: false,
    audioCaptureDefaults: microphoneEnableCaptureOptions(),
    videoCaptureDefaults: cameraEnableCaptureOptions(),
    publishDefaults: {
      simulcast: true,
      videoCodec: "vp9",
      backupCodec: { codec: "vp8", encoding: VideoPresets.h1080.encoding },
      stopMicTrackOnMute: false,
      audioPreset: AudioPresets.speech,
      dtx: true,
      red: true,
      forceStereo: false,
      videoEncoding: VideoPresets.h1080.encoding,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
      // Let WebRTC trade resolution/framerate under congestion (best overall quality for bandwidth).
      degradationPreference: "balanced",
    },
  };
}

const LAYER_DIMS = [
  VideoPresets.h180.resolution,
  VideoPresets.h360.resolution,
  VideoPresets.h720.resolution,
  VideoPresets.h1080.resolution,
] as const;

/**
 * Ask LiveKit for the best simulcast layer per visible gallery slot.
 * Dimensions take precedence over adaptiveStream's CSS-tile estimate; the SFU
 * still steps down when bandwidth cannot sustain the request.
 * `connectionQuality` further caps layers when the local link is congested.
 */
export function applyRemoteSimulcastPreferences(
  room: Room,
  visibleOrderedIds: string[],
  tier: GalleryVideoTier,
  connectionQuality: ConnectionQuality = ConnectionQuality.Unknown,
): void {
  const qualityCap = receiveLayerCapForQuality(connectionQuality);
  const visible = new Set(visibleOrderedIds);
  let slot = 0;

  for (const identity of visibleOrderedIds) {
    const participant = room.remoteParticipants.get(identity);
    if (!participant) continue;
    const pub = cameraPublication(participant);
    if (!pub) continue;

    const layer = Math.min(
      substreamForVideoSlot(slot, tier),
      LAYER_DIMS.length - 1,
      qualityCap,
    );
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
