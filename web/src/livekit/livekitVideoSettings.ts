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
import { resolveCaptureDimensions } from "../media/deviceCapture";

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

/** Prefer portrait capture on phones only; tablets + laptops use landscape. */
export function isPortraitCapturePreferred(): boolean {
  return resolveCaptureDimensions().portrait;
}

/**
 * Request device-appropriate camera resolution before / during enable:
 * phone → 720×1280 portrait; tablet + laptop → 1280×720 landscape.
 * Prefer full sensor frame (resizeMode none) — no hardware face/auto-crop.
 * UI renders with object-fit: contain.
 */
export function cameraEnableCaptureOptions(): VideoCaptureOptions {
  const { width, height, aspectRatio, portrait } = resolveCaptureDimensions();
  return {
    resolution: {
      width,
      height,
      frameRate: LIVEKIT_MAX_FRAMERATE,
      // Soft ideal only — exact aspectRatio forces many phones to crop the sensor.
      ...(portrait ? {} : { aspectRatio }),
    },
    facingMode: "user",
  };
}

/**
 * Build constraints that keep the full camera sensor frame (native camera app style).
 * - Portrait phones: prefer 720×1280 without crop-and-scale
 * - resizeMode: "none" when the UA supports it (Chrome/Android)
 * - zoom locked to 1 when exposed
 */
export function fullFrameCameraConstraints(): MediaTrackConstraints {
  const { width, height, portrait } = resolveCaptureDimensions();
  const base: MediaTrackConstraints = {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: LIVEKIT_MAX_FRAMERATE, max: LIVEKIT_MAX_FRAMERATE },
    facingMode: { ideal: "user" },
  };

  // Avoid forcing aspectRatio on phones — browsers often crop to satisfy it.
  if (!portrait) {
    base.aspectRatio = { ideal: 16 / 9 };
  }

  // Spec: resizeMode "none" = UA must not crop/downscale the source to fit.
  const withResize = {
    ...base,
    resizeMode: "none",
  } as MediaTrackConstraints;

  return withResize;
}

/** Re-assert device + orientation capture targets after enable / rotate (no hardware crop). */
export async function applyOrientationCaptureConstraints(
  track: MediaStreamTrack | undefined | null,
): Promise<void> {
  if (!track || track.kind !== "video") return;

  const tryApply = async (constraints: MediaTrackConstraints) => {
    await track.applyConstraints(constraints);
  };

  try {
    await tryApply(fullFrameCameraConstraints());
  } catch {
    // Fallback without resizeMode (Safari / older WebViews).
    const { width, height, portrait } = resolveCaptureDimensions();
    try {
      await tryApply({
        width: { ideal: width },
        height: { ideal: height },
        ...(portrait ? {} : { aspectRatio: { ideal: 16 / 9 } }),
        frameRate: { ideal: LIVEKIT_MAX_FRAMERATE },
      });
    } catch {
      // Keep negotiated settings if the browser rejects.
    }
  }

  // Lock digital zoom to 1× when the track exposes it (stops some Android face crops).
  try {
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { zoom?: { min: number; max: number } })
      | undefined;
    if (caps && "zoom" in caps && caps.zoom) {
      await track.applyConstraints({
        advanced: [{ zoom: caps.zoom.min ?? 1 } as MediaTrackConstraintSet],
      });
    }
  } catch {
    // Zoom constraint not supported — ignore.
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

/** Local camera preview only (no mic — avoids echo). */
export function buildLocalCameraStream(participant: LocalParticipant): MediaStream | null {
  if (!participant.isCameraEnabled) return null;
  const cam = participant.getTrackPublication(Track.Source.Camera);
  const track = cam?.track?.mediaStreamTrack;
  if (!track) return null;
  return new MediaStream([track]);
}

/** Local screen-share preview only. */
export function buildLocalScreenStream(participant: LocalParticipant): MediaStream | null {
  if (!participant.isScreenShareEnabled) return null;
  const screen = participant.getTrackPublication(Track.Source.ScreenShare);
  const track = screen?.track?.mediaStreamTrack;
  if (!track) return null;
  return new MediaStream([track]);
}

/**
 * Local preview — camera preferred for the self tile.
 * Prefer {@link buildLocalCameraStream} + {@link buildLocalScreenStream} for side-by-side.
 */
export function buildLocalParticipantStream(participant: LocalParticipant): MediaStream | null {
  return buildLocalCameraStream(participant) ?? buildLocalScreenStream(participant);
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
  // Camera + mic for the person tile. Screen share is a separate tile/stream.
  if (typeof participant.getTrackPublication === "function") {
    const tracks: MediaStreamTrack[] = [];
    const cam = participant.getTrackPublication(Track.Source.Camera);
    const mic = participant.getTrackPublication(Track.Source.Microphone);
    const camTrack = cam && !cam.isMuted ? cam.track?.mediaStreamTrack : undefined;
    const micTrack = mic?.track?.mediaStreamTrack;
    if (camTrack) tracks.push(camTrack);
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

/** Remote screen-share video track only (no audio). */
export function collectRemoteScreenTrack(participant: {
  getTrackPublication?: (source: Track.Source) => { track?: { mediaStreamTrack: MediaStreamTrack } | null; isMuted?: boolean } | undefined;
}): MediaStreamTrack | null {
  if (typeof participant.getTrackPublication !== "function") return null;
  const screen = participant.getTrackPublication(Track.Source.ScreenShare);
  const track = screen && !screen.isMuted ? screen.track?.mediaStreamTrack : undefined;
  return track ?? null;
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
