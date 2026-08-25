import {
  AudioPresets,
  ConnectionQuality,
  LocalVideoTrack,
  ScreenSharePresets,
  Track,
  VideoPresets,
  VideoQuality,
  type AudioCaptureOptions,
  type LocalParticipant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Room,
  type RoomOptions,
  type ScreenShareCaptureOptions,
  type VideoCaptureOptions,
} from "livekit-client";
import {
  substreamForVideoSlot,
  type GalleryVideoTier,
} from "../media/galleryVideoPolicy";
import { resolveCaptureDimensions } from "../media/deviceCapture";
import {
  createDeviceBandwidthHint,
  selectAdaptiveCameraTarget,
} from "../media/bandwidthHint";

/** Cap publish / receive at 1080p 16:9 (1920×1080). Viewers adapt via simulcast. */
export const LIVEKIT_MAX_VIDEO_BITRATE = VideoPresets.h1080.encoding.maxBitrate;
export const LIVEKIT_MAX_FRAMERATE = VideoPresets.h1080.encoding.maxFramerate ?? 30;

/**
 * Capture-side WebRTC DSP via browser getUserMedia constraints
 * (Jitsi / Meet / LiveKit default mic path before optional ML filters):
 * Raw mic → AEC → (browser NS unless enhanced DTLN is on) → AGC → Opus.
 *
 * Keep AEC + AGC always on so nearby speakers don't create echo loops.
 * When enhanced NC (DTLN) is enabled, turn off browser noiseSuppression to
 * avoid double-denoising (same idea as Krisp replacing browser NS in Meet).
 */
export function microphoneEnableCaptureOptions(opts?: {
  enhancedNoiseCancel?: boolean;
}): AudioCaptureOptions {
  const enhanced = Boolean(opts?.enhancedNoiseCancel);
  return {
    echoCancellation: true,
    noiseSuppression: !enhanced,
    autoGainControl: true,
    channelCount: 1,
  };
}

/** Re-assert AEC / NS / AGC after enable / NC toggle (some devices drop constraints). */
export async function applyAudioProcessingConstraints(
  track: MediaStreamTrack | undefined | null,
  opts?: { enhancedNoiseCancel?: boolean },
): Promise<void> {
  if (!track || track.kind !== "audio") return;
  const enhanced = Boolean(opts?.enhancedNoiseCancel);
  try {
    await track.applyConstraints({
      echoCancellation: true,
      noiseSuppression: !enhanced,
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

/** Max simulcast layer index (0=h180, 1=h360, 2=h720, 3=h1080) for the viewer's current downlink. */
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
 * Request camera capture before / during enable (host + guests).
 * Quality is picked from the device's current bandwidth hint.
 * Prefer full sensor frame (resizeMode none) — no hardware face/auto-crop.
 */
export function cameraEnableCaptureOptions(opts?: {
  bandwidthHint?: ReturnType<typeof createDeviceBandwidthHint>;
}): VideoCaptureOptions {
  const target = selectAdaptiveCameraTarget(opts?.bandwidthHint);
  return {
    resolution: {
      width: target.width,
      height: target.height,
      frameRate: target.frameRate || LIVEKIT_MAX_FRAMERATE,
      ...(target.portrait ? {} : { aspectRatio: target.width / Math.max(1, target.height) }),
    },
    facingMode: "user",
  };
}

/** Screen share capture — 1080p 16:9. */
export function screenShareCaptureOptions(): ScreenShareCaptureOptions {
  return {
    resolution: {
      width: 1920,
      height: 1080,
      frameRate: 30,
    },
  };
}

/**
 * Build constraints that keep the full camera sensor frame (native camera app style).
 * - Portrait phones: 720×1280 without forced landscape crop
 * - Tablet/laptop: 1920×1080 16:9
 * - resizeMode: "none" when the UA supports it (Chrome/Android)
 * - zoom locked to 1 when exposed
 */
export function fullFrameCameraConstraints(): MediaTrackConstraints {
  const target = selectAdaptiveCameraTarget();
  const base: MediaTrackConstraints = {
    width: { ideal: target.width },
    height: { ideal: target.height },
    frameRate: { ideal: target.frameRate || LIVEKIT_MAX_FRAMERATE, max: LIVEKIT_MAX_FRAMERATE },
    facingMode: { ideal: "user" },
  };

  if (!target.portrait) {
    base.aspectRatio = { ideal: 16 / 9 };
  }

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

  try {
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { zoom?: { min: number; max: number } })
      | undefined;
    if (caps && "zoom" in caps && caps.zoom) {
      await track.applyConstraints({
        advanced: [{ zoom: 1 } as MediaTrackConstraintSet],
      });
    }
  } catch {
    // Zoom constraint not supported — ignore.
  }
}

/**
 * Publishers send 1080p 16:9 + lower simulcast ladders.
 * Each viewer only downloads the layer their bandwidth / tile size can sustain.
 * Mic: browser AEC + noise suppress + AGC (set on getUserMedia / LiveKit capture).
 * Optional enhanced DTLN is attached after publish when the user enables Noise On.
 */
export function createLiveKitRoomOptions(): RoomOptions {
  const bandwidthHint = createDeviceBandwidthHint();
  const target = selectAdaptiveCameraTarget(bandwidthHint);
  return {
    adaptiveStream: {
      pixelDensity: "screen",
    },
    dynacast: true,
    stopLocalTrackOnUnpublish: false,
    // Baseline browser DSP; enhanced NC toggles constraints at mic-enable time.
    audioCaptureDefaults: microphoneEnableCaptureOptions({ enhancedNoiseCancel: false }),
    videoCaptureDefaults: cameraEnableCaptureOptions({ bandwidthHint }),
    publishDefaults: {
      simulcast: true,
      videoCodec: "vp9",
      backupCodec: { codec: "vp8", encoding: VideoPresets.h1080.encoding },
      stopMicTrackOnMute: false,
      audioPreset: AudioPresets.speech,
      dtx: true,
      red: true,
      forceStereo: false,
      videoEncoding:
        target.bitrateKbps >= 4000
          ? VideoPresets.h1080.encoding
          : target.bitrateKbps >= 2500
            ? VideoPresets.h720.encoding
            : target.bitrateKbps >= 1500
              ? VideoPresets.h540.encoding
              : target.bitrateKbps >= 900
                ? VideoPresets.h360.encoding
                : VideoPresets.h180.encoding,
      videoSimulcastLayers:
        target.bitrateKbps >= 2500
          ? [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720]
          : target.bitrateKbps >= 900
            ? [VideoPresets.h180, VideoPresets.h360]
            : [VideoPresets.h180],
      screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
      // Let WebRTC trade resolution/framerate under congestion (best overall quality for bandwidth).
      degradationPreference: "balanced",
    },
  };
}

/** Simulcast ladder: 180 → 360 → 720 → 1080p 16:9. */
const LAYER_DIMS = [
  VideoPresets.h180.resolution,
  VideoPresets.h360.resolution,
  VideoPresets.h720.resolution,
  VideoPresets.h1080.resolution,
] as const;

/** Highest layer index — host + large/featured tiles (1080p). */
export const HD_LAYER_INDEX = 3;

/**
 * Ask LiveKit for the best simulcast layer per visible gallery slot.
 * Host always gets 1080p 16:9 (quality-capped). Other HD slots also prefer 1080p.
 * Dimensions take precedence over adaptiveStream's CSS-tile estimate; the SFU
 * still steps down when bandwidth cannot sustain the request.
 */
export function applyRemoteSimulcastPreferences(
  room: Room,
  visibleOrderedIds: string[],
  tier: GalleryVideoTier,
  connectionQuality: ConnectionQuality = ConnectionQuality.Unknown,
  opts?: { hostParticipantId?: string },
): void {
  const qualityCap = receiveLayerCapForQuality(connectionQuality);
  const visible = new Set(visibleOrderedIds);
  const hostId = opts?.hostParticipantId;
  let slot = 0;

  const setLayer = (participant: RemoteParticipant, layer: number) => {
    const pub = cameraPublication(participant);
    if (!pub) return;
    const capped = Math.min(layer, LAYER_DIMS.length - 1, qualityCap);
    pub.setVideoDimensions(LAYER_DIMS[capped]);
  };

  // Host first — always 1080p 16:9 when link allows (large / stage spotlight).
  if (hostId && visible.has(hostId)) {
    const host = room.remoteParticipants.get(hostId);
    if (host) setLayer(host, HD_LAYER_INDEX);
  }

  for (const identity of visibleOrderedIds) {
    if (hostId && identity === hostId) continue;
    const participant = room.remoteParticipants.get(identity);
    if (!participant) continue;

    const layer = Math.min(
      substreamForVideoSlot(slot, tier),
      LAYER_DIMS.length - 1,
      qualityCap,
    );
    slot += 1;
    setLayer(participant, layer);
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
