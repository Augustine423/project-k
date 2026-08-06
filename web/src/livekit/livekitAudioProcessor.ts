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
 * Open-source DTLN denoiser (MIT) as a LiveKit track processor.
 * Not used by default — MeetingMax prefers browser AEC + noiseSuppression + AGC
 * so echo cancel works cleanly when devices are near each other.
 * Keep this module for optional/advanced use only.
 */
export class DtlnNoiseSuppressorProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  readonly name = "dtln-noise-suppression";
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

let attachInFlight: Promise<boolean> | null = null;

/** Attach DTLN to the local mic publication (no-op if unsupported / already attached). */
export async function attachOpenSourceNoiseFilter(
  roomOrPub: Room | LocalTrackPublication,
): Promise<boolean> {
  const pub =
    "localParticipant" in roomOrPub
      ? roomOrPub.localParticipant.getTrackPublication(Track.Source.Microphone)
      : roomOrPub;

  if (!pub || pub.source !== Track.Source.Microphone) return false;
  const track = pub.track;
  if (!(track instanceof LocalAudioTrack)) return false;

  const existing = track.getProcessor();
  if (existing?.name === "dtln-noise-suppression") return true;

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
