import { useEffect, useRef, useState } from "react";
import { avatarInitials, avatarTone } from "./chatTypes";
import { useViewerViewport } from "../hooks/useViewerViewport";
import { classifyStreamAspect, type StreamAspect } from "../media/conferenceLayout";

type LocalSelfPipProps = {
  stream: MediaStream | null;
  label: string;
  hasVideo?: boolean;
  /** Hide when alone — stage already shows you full-size. */
  visible: boolean;
};

function readAspect(stream: MediaStream | null, video: HTMLVideoElement | null): StreamAspect {
  if (video && video.videoWidth > 0 && video.videoHeight > 0) {
    return classifyStreamAspect(video.videoWidth, video.videoHeight);
  }
  const track = stream?.getVideoTracks()[0];
  const s = track?.getSettings?.() ?? {};
  const w = Number(s.width) || 0;
  const h = Number(s.height) || 0;
  if (w > 0 && h > 0) return classifyStreamAspect(w, h);
  return "unknown";
}

/**
 * Floating self-view sized to the *source camera* aspect:
 * portrait cam → 9:16 PiP, landscape cam → 16:9 PiP.
 */
export function LocalSelfPip({ stream, label, hasVideo = false, visible }: LocalSelfPipProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewport = useViewerViewport();
  const [streamAspect, setStreamAspect] = useState<StreamAspect>("unknown");

  const videoTrack = stream?.getVideoTracks().find((t) => t.readyState === "live")
    ?? stream?.getVideoTracks()[0]
    ?? null;
  const videoTrackId = videoTrack?.id ?? "";

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (!videoTrack) {
      videoEl.srcObject = null;
      setStreamAspect("unknown");
      return;
    }

    const preview = new MediaStream([videoTrack]);
    videoEl.srcObject = preview;
    videoEl.muted = true;
    videoEl.playsInline = true;
    void videoEl.play().catch(() => undefined);

    const refreshAspect = () => setStreamAspect(readAspect(stream, videoEl));
    videoEl.addEventListener("loadedmetadata", refreshAspect);
    videoEl.addEventListener("resize", refreshAspect);
    refreshAspect();
    const timer = window.setInterval(refreshAspect, 1000);

    const onEnded = () => {
      if (videoEl.srcObject === preview) videoEl.srcObject = null;
      setStreamAspect("unknown");
    };
    videoTrack.addEventListener("ended", onEnded);
    return () => {
      window.clearInterval(timer);
      videoTrack.removeEventListener("ended", onEnded);
      videoEl.removeEventListener("loadedmetadata", refreshAspect);
      videoEl.removeEventListener("resize", refreshAspect);
      videoEl.srcObject = null;
    };
  }, [stream, videoTrack, videoTrackId]);

  if (!visible) return null;

  const showVideo = hasVideo && Boolean(videoTrack);
  const tone = avatarTone(label);
  const initials = avatarInitials(label);

  // Prefer real source-cam dimensions; fall back to device orientation until metadata arrives.
  const pipShape: "portrait" | "landscape" =
    streamAspect === "portrait"
      ? "portrait"
      : streamAspect === "landscape"
        ? "landscape"
        : viewport.isPortrait
          ? "portrait"
          : "landscape";

  return (
    <aside
      className="video-self-pip"
      aria-label="Your video (picture-in-picture)"
      data-has-video={showVideo ? "true" : "false"}
      data-pip-shape={pipShape}
      data-stream-aspect={streamAspect}
    >
      <div className="video-self-pip-inner">
        <video
          ref={videoRef}
          className="video-self-pip-feed mirror"
          autoPlay
          playsInline
          muted
        />
        {!showVideo && (
          <div className="no-video-container" style={{ ["--tile-tone" as string]: tone }}>
            <span className="video-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="no-video-text">{label}</span>
          </div>
        )}
        <div className="video-chrome">
          <span className="video-role">You</span>
          <span className="video-label">{label}</span>
        </div>
      </div>
    </aside>
  );
}
