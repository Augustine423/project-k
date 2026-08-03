import { useEffect, useState, type RefObject } from "react";
import { classifyStreamAspect, type StreamAspect } from "../media/conferenceLayout";

/** Observe decoded dimensions on a bound <video> (and track settings fallback). */
export function useVideoElementAspect(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null | undefined,
  trackSignature = "",
): StreamAspect {
  const [aspect, setAspect] = useState<StreamAspect>("unknown");

  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) {
      setAspect("unknown");
      return;
    }

    const readFromSettings = () => {
      const settings = track.getSettings?.() ?? {};
      const w = Number(settings.width) || 0;
      const h = Number(settings.height) || 0;
      if (w > 0 && h > 0) {
        setAspect(classifyStreamAspect(w, h));
        return true;
      }
      return false;
    };

    const updateFromElement = () => {
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        setAspect(classifyStreamAspect(video.videoWidth, video.videoHeight));
        return;
      }
      readFromSettings();
    };

    readFromSettings();
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", updateFromElement);
    video?.addEventListener("resize", updateFromElement);
    const timer = window.setInterval(updateFromElement, 1500);
    updateFromElement();

    const onEnded = () => setAspect("unknown");
    track.addEventListener("ended", onEnded);

    return () => {
      window.clearInterval(timer);
      track.removeEventListener("ended", onEnded);
      video?.removeEventListener("loadedmetadata", updateFromElement);
      video?.removeEventListener("resize", updateFromElement);
    };
  }, [stream, trackSignature, videoRef]);

  return aspect;
}
