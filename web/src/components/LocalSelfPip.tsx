import { useEffect, useRef } from "react";
import { avatarInitials, avatarTone } from "./chatTypes";

type LocalSelfPipProps = {
  stream: MediaStream | null;
  label: string;
  hasVideo?: boolean;
  /** Hide when alone — stage already shows you full-size. */
  visible: boolean;
};

/**
 * Dedicated floating self-view. Binds localStream directly to its own <video>
 * (outside the gallery grid) so preview is never lost when remotes fill the stage.
 */
export function LocalSelfPip({ stream, label, hasVideo = false, visible }: LocalSelfPipProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoTrack = stream?.getVideoTracks().find((t) => t.readyState === "live")
    ?? stream?.getVideoTracks()[0]
    ?? null;
  const videoTrackId = videoTrack?.id ?? "";

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (!videoTrack) {
      videoEl.srcObject = null;
      return;
    }

    const preview = new MediaStream([videoTrack]);
    videoEl.srcObject = preview;
    videoEl.muted = true;
    videoEl.playsInline = true;
    void videoEl.play().catch(() => undefined);

    const onEnded = () => {
      if (videoEl.srcObject === preview) videoEl.srcObject = null;
    };
    videoTrack.addEventListener("ended", onEnded);
    return () => {
      videoTrack.removeEventListener("ended", onEnded);
      videoEl.srcObject = null;
    };
  }, [videoTrack, videoTrackId]);

  if (!visible) return null;

  const showVideo = hasVideo && Boolean(videoTrack);
  const tone = avatarTone(label);
  const initials = avatarInitials(label);

  return (
    <aside
      className="video-self-pip"
      aria-label="Your video (picture-in-picture)"
      data-has-video={showVideo ? "true" : "false"}
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
