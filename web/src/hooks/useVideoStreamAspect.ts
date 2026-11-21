import { useEffect, useState, type RefObject } from "react";
import { classifyStreamAspect, type StreamAspect } from "../media/conferenceLayout";

export type StreamSize = {
  aspect: StreamAspect;
  width: number;
  height: number;
};

const EMPTY: StreamSize = { aspect: "unknown", width: 0, height: 0 };

function sizeFrom(w: number, h: number): StreamSize | null {
  if (w <= 0 || h <= 0) return null;
  return { aspect: classifyStreamAspect(w, h), width: w, height: h };
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Observe decoded WxH on a bound <video>. Event-driven: `resize` /
 * `loadedmetadata`, plus requestVideoFrameCallback to catch the first frame and
 * rotation changes — no polling timers.
 */
export function useVideoStreamSize(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null | undefined,
  trackSignature = "",
): StreamSize {
  const [size, setSize] = useState<StreamSize>(EMPTY);

  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) {
      setSize(EMPTY);
      return;
    }

    const apply = (next: StreamSize | null) => {
      if (!next) return;
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height && prev.aspect === next.aspect
          ? prev
          : next,
      );
    };

    const settingsSize = () => {
      const settings = track.getSettings?.() ?? {};
      return sizeFrom(Number(settings.width) || 0, Number(settings.height) || 0);
    };

    const video = videoRef.current as FrameCallbackVideo | null;
    const update = () => {
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        apply(sizeFrom(video.videoWidth, video.videoHeight));
        return;
      }
      apply(settingsSize());
    };

    let frameHandle: number | null = null;
    let cancelled = false;
    const watchFrames = () => {
      if (!video?.requestVideoFrameCallback) return;
      frameHandle = video.requestVideoFrameCallback(() => {
        if (cancelled) return;
        update();
        // Only needed until real dimensions are known; resize events cover the rest.
        if (!(video.videoWidth > 0 && video.videoHeight > 0)) watchFrames();
      });
    };

    apply(settingsSize());
    video?.addEventListener("loadedmetadata", update);
    video?.addEventListener("resize", update);
    track.addEventListener("unmute", update);
    update();
    watchFrames();

    const onEnded = () => setSize(EMPTY);
    track.addEventListener("ended", onEnded);

    return () => {
      cancelled = true;
      if (frameHandle !== null) video?.cancelVideoFrameCallback?.(frameHandle);
      track.removeEventListener("ended", onEnded);
      track.removeEventListener("unmute", update);
      video?.removeEventListener("loadedmetadata", update);
      video?.removeEventListener("resize", update);
    };
  }, [stream, trackSignature, videoRef]);

  return size;
}

/** @deprecated Prefer useVideoStreamSize — kept for call sites that only need aspect. */
export function useVideoElementAspect(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null | undefined,
  trackSignature = "",
): StreamAspect {
  return useVideoStreamSize(videoRef, stream, trackSignature).aspect;
}
