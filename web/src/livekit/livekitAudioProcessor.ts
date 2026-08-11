import {
  LocalAudioTrack,
  Track,
  type AudioProcessorOptions,
  type LocalTrackPublication,
  type Room,
  type TrackProcessor,
} from "livekit-client";
import { createNoiseSuppressionAudioWorklet } from "@workadventure/noise-suppression/audio-worklet";

type WorkletHandle = Awaited<ReturnType<typeof createNoiseSuppressionAudioWorklet>>;

/**
 * Enhanced noise cancellation for MeetingMax.
 *
 * Stack (aligned with project-k references):
 * 1. **Browser DSP** (always) — LiveKit `AudioCaptureOptions`:
 *    echoCancellation + noiseSuppression + autoGainControl
 *    (same WebRTC path Jitsi/Meet use before optional ML filters).
 * 2. **Enhanced NC** (optional toggle) — DTLN AudioWorklet track processor
 *    (open-source stand-in for LiveKit Meet Krisp / Jitsi rnnoise).
 *
 * Toggle UX mirrors `meet/lib/MicrophoneSettings.tsx` (Krisp on/off).
 */

export const NOISE_CANCEL_STORAGE_KEY = "mm.enhancedNoiseCancel";
export const DTLN_PROCESSOR_NAME = "dtln-noise-suppression";

export type NoiseCancelMode = "browser" | "enhanced";

/** Prefer enhanced NC on desktop; phones stay on browser DSP for battery/AEC. */
export function defaultEnhancedNoiseCancelEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.innerWidth <= 900;
    if (coarse && narrow) return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function readEnhancedNoiseCancelEnabled(): boolean {
  if (typeof window === "undefined") return defaultEnhancedNoiseCancelEnabled();
  try {
    const raw = window.localStorage.getItem(NOISE_CANCEL_STORAGE_KEY);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* ignore */
  }
  return defaultEnhancedNoiseCancelEnabled();
}

export function persistEnhancedNoiseCancelEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOISE_CANCEL_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Open-source DTLN denoiser as a LiveKit track processor
 * (Meet Krisp / Jitsi NoiseSuppressorEffect analogue).
 */
export class DtlnNoiseSuppressorProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  readonly name = DTLN_PROCESSOR_NAME;
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private destination?: MediaStreamAudioDestinationNode;
  private worklet?: WorkletHandle;

  async init(opts: AudioProcessorOptions): Promise<void> {
    await this.setup(opts.track);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.setup(opts.track);
  }

  async destroy(): Promise<void> {
    try {
      this.source?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      this.worklet?.dispose();
    } catch {
      /* ignore */
    }
    try {
      this.destination?.disconnect();
    } catch {
      /* ignore */
    }

    this.source = undefined;
    this.worklet = undefined;
    this.destination = undefined;
    this.processedTrack = undefined;

    const ctx = this.context;
    this.context = undefined;
    if (ctx && ctx.state !== "closed") {
      await ctx.close().catch(() => undefined);
    }
  }

  private async setup(track: MediaStreamTrack): Promise<void> {
    // DTLN models expect 16 kHz mono; browser resamples capture into this context.
    const context = new AudioContext({ sampleRate: 16_000 });
    this.context = context;
    if (context.state === "suspended") {
      await context.resume();
    }

    const source = context.createMediaStreamSource(new MediaStream([track]));
    const destination = context.createMediaStreamDestination();
    const worklet = await createNoiseSuppressionAudioWorklet(context, {
      bypassUntilReady: true,
    });

    source.connect(worklet.node).connect(destination);
    await worklet.ready;

    const [out] = destination.stream.getAudioTracks();
    if (!out) {
      worklet.dispose();
      source.disconnect();
      await context.close().catch(() => undefined);
      this.context = undefined;
      throw new Error("DTLN noise suppression did not produce an audio track");
    }

    this.source = source;
    this.destination = destination;
    this.worklet = worklet;
    this.processedTrack = out;
  }
}

function micPublication(roomOrPub: Room | LocalTrackPublication): LocalTrackPublication | null {
  const pub =
    "localParticipant" in roomOrPub
      ? roomOrPub.localParticipant.getTrackPublication(Track.Source.Microphone)
      : roomOrPub;
  if (!pub || pub.source !== Track.Source.Microphone) return null;
  return pub;
}

let attachInFlight: Promise<boolean> | null = null;

/** Attach DTLN to the local mic (no-op if unsupported / already attached). */
export async function attachOpenSourceNoiseFilter(
  roomOrPub: Room | LocalTrackPublication,
): Promise<boolean> {
  const pub = micPublication(roomOrPub);
  if (!pub) return false;
  const track = pub.track;
  if (!(track instanceof LocalAudioTrack)) return false;

  const existing = track.getProcessor();
  if (existing?.name === DTLN_PROCESSOR_NAME) return true;

  if (attachInFlight) return attachInFlight;

  attachInFlight = (async () => {
    try {
      if (typeof AudioWorkletNode === "undefined") return false;
      await track.setProcessor(new DtlnNoiseSuppressorProcessor());
      return true;
    } catch {
      return false;
    } finally {
      attachInFlight = null;
    }
  })();

  return attachInFlight;
}

/** Remove enhanced NC processor; browser AEC/NS/AGC remain on the capture track. */
export async function detachOpenSourceNoiseFilter(
  roomOrPub: Room | LocalTrackPublication,
): Promise<void> {
  const pub = micPublication(roomOrPub);
  if (!pub) return;
  const track = pub.track;
  if (!(track instanceof LocalAudioTrack)) return;
  const existing = track.getProcessor();
  if (!existing || existing.name !== DTLN_PROCESSOR_NAME) return;
  try {
    await track.stopProcessor();
  } catch {
    /* ignore */
  }
}

/**
 * Apply preferred noise mode to the live mic publication.
 * `enhanced` → DTLN processor; `browser` → stop processor (WebRTC NS only).
 */
export async function syncNoiseCancellation(
  roomOrPub: Room | LocalTrackPublication,
  enhanced: boolean,
): Promise<boolean> {
  if (!enhanced) {
    await detachOpenSourceNoiseFilter(roomOrPub);
    return false;
  }
  return attachOpenSourceNoiseFilter(roomOrPub);
}
