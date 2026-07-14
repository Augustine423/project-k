/**
 * Janus VideoRoom capture + publish helpers aligned with
 * janus-gateway/html/demos/mvideoroom.js and janus.js trackConstraints.
 *
 * Streaming model (default demo): one WebRTC video track per publisher,
 * VP8/VP9/H264 negotiated in SDP — not simulcast unless explicitly enabled.
 * Resolution comes from getUserMedia constraints below (native or Janus presets).
 */

/** janus.js trackConstraints video presets */
export const JanusVideoCapture = {
  /** mvideoroom.js default — browser picks best camera mode (often 1280×720). */
  native: true as const,
  /** hires / hdres — ideal 1280×720 */
  hires: "hires" as const,
  /** stdres — ideal 640×480 */
  stdres: "stdres" as const,
} as const;

export type JanusVideoCapturePreset =
  (typeof JanusVideoCapture)[keyof typeof JanusVideoCapture];

/**
 * Default capture: "hires" requests ideal 1280×720 from the browser via
 * Janus's built-in preset (maps to getUserMedia width:1280, height:720).
 * The previous "native" default let the browser choose freely — often 480p
 * on machines with multiple virtual camera devices or on low-power laptops.
 */
export const DEFAULT_PUBLISH_CAPTURE = JanusVideoCapture.hires;

/**
 * Simulcast on by default: Janus sends three spatial quality layers to
 * subscribers and each subscriber receives only the layer that fits their
 * bandwidth. Without simulcast every subscriber receives the full-resolution
 * stream regardless of their connection quality.
 */
export const DEFAULT_SIMULCAST = true;

/** Build createOffer tracks[] like mvideoroom.js publishOwnFeed(). */
export function buildPublisherTracks(opts: {
  audio: boolean;
  video: boolean;
  capture?: JanusVideoCapturePreset;
  simulcast?: boolean;
}): Record<string, unknown>[] {
  const tracks: Record<string, unknown>[] = [];
  if (opts.audio) {
    tracks.push({ type: "audio", capture: true, recv: false });
  }
  if (opts.video) {
    // simulcast defaults to DEFAULT_SIMULCAST (true) if not explicitly set.
    const useSimulcast = opts.simulcast ?? DEFAULT_SIMULCAST;
    tracks.push({
      type: "video",
      capture: opts.capture ?? DEFAULT_PUBLISH_CAPTURE,
      recv: false,
      ...(useSimulcast ? { simulcast: true } : {}),
    });
  }
  return tracks;
}

/** configure body after createOffer — matches demo publish message. */
export function buildPublishConfigure(audio: boolean, video: boolean): Record<string, unknown> {
  return { request: "configure", audio, video: video || undefined };
}
