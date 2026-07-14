import { useEffect, useRef } from "react";

interface StreamVideoTileProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  isSpeaking?: boolean;
  /** When false, tile shows avatar but audio may still play (off-page / audio-only). */
  hasVideo?: boolean;
  /** Show decoded WxH badge like Janus demo #curres (dev/quality check). */
  showStats?: boolean;
}

/** Same as Janus.attachMediaStream — element.srcObject = stream. */
function attachMediaStream(element: HTMLMediaElement, stream: MediaStream | null) {
  try {
    element.srcObject = stream;
  } catch {
    /* legacy fallback unused on modern browsers */
  }
}

/**
 * Janus demo playback (mvideoroom.js):
 * - one <video> per video track, width 100%, rounded centered
 * - hidden <audio> for remote sound (local tile stays muted on video)
 */
export function StreamVideoTile({
  stream,
  label,
  muted = false,
  mirror = false,
  isSpeaking = false,
  hasVideo,
  showStats = import.meta.env.DEV,
}: StreamVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const statsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl) return;

    const videoTrack = stream?.getVideoTracks()[0] ?? null;
    const audioTrack = stream?.getAudioTracks()[0] ?? null;

    const videoStream = videoTrack ? new MediaStream([videoTrack]) : null;
    const audioStream = audioTrack && !muted ? new MediaStream([audioTrack]) : null;

    attachMediaStream(videoEl, videoStream);
    if (audioEl) attachMediaStream(audioEl, audioStream);

    void videoEl.play().catch(() => undefined);
    if (audioEl && audioStream) void audioEl.play().catch(() => undefined);

    return () => {
      attachMediaStream(videoEl, null);
      if (audioEl) attachMediaStream(audioEl, null);
    };
  }, [stream, muted]);

  const showVideo =
    hasVideo !== undefined
      ? hasVideo && Boolean(stream?.getVideoTracks().length)
      : Boolean(stream?.getVideoTracks().length);

  useEffect(() => {
    if (!showStats) return;
    const videoEl = videoRef.current;
    const badge = statsRef.current;
    if (!videoEl || !badge) return;

    const update = () => {
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      badge.textContent = w > 0 && h > 0 ? `${w}×${h}` : "";
    };

    videoEl.addEventListener("loadedmetadata", update);
    videoEl.addEventListener("resize", update);
    const timer = window.setInterval(update, 1000);
    update();

    return () => {
      videoEl.removeEventListener("loadedmetadata", update);
      videoEl.removeEventListener("resize", update);
      window.clearInterval(timer);
    };
  }, [stream, showStats]);

  return (
    <div className={`video-tile relative${isSpeaking ? " is-speaking" : ""}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={["video-feed rounded centered", mirror ? "mirror" : ""].filter(Boolean).join(" ")}
      />
      {!muted && (
        <audio ref={audioRef} className="hide" autoPlay playsInline aria-hidden />
      )}
      {!showVideo && (
        <div className="no-video-container">
          <span className="no-video-text">{label}</span>
        </div>
      )}
      {showStats && <span ref={statsRef} className="video-res-badge hide" aria-hidden />}
      <span className="video-label">{label}</span>
    </div>
  );
}
