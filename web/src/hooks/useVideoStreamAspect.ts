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

/** Observe decoded WxH on a bound <video> (track settings as fallback). */
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

    const readFromSettings = () => {
      const settings = track.getSettings?.() ?? {};
      return sizeFrom(Number(settings.width) || 0, Number(settings.height) || 0);
    };

    const update = () => {
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        apply(sizeFrom(video.videoWidth, video.videoHeight));
        return;
      }
      apply(readFromSettings());
    };

    apply(readFromSettings());
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", update);
    video?.addEventListener("resize", update);
    const timer = window.setInterval(update, 800);
    update();

    const onEnded = () => setSize(EMPTY);
    track.addEventListener("ended", onEnded);

    return () => {
      window.clearInterval(timer);
      track.removeEventListener("ended", onEnded);
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
