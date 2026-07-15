import { useEffect, useRef } from "react";

interface StreamVideoTileProps {
  stream: MediaStream | null;
  /** When stream object is reused, bump this so track add/remove rebinds cleanly. */
  trackSignature?: string;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  isSpeaking?: boolean;
  /** When false, tile shows avatar but audio may still play (off-page / audio-only). */
  hasVideo?: boolean;
  /** Show decoded WxH badge (dev/quality check). */
  showStats?: boolean;
}

function attachMediaStream(element: HTMLMediaElement, stream: MediaStream | null) {
  try {
    element.pause();
    element.srcObject = stream;
  } catch {
    /* legacy fallback unused on modern browsers */
  }
}

/** One video element per tile; hidden audio for remote sound. */
export function StreamVideoTile({
  stream,
  trackSignature = "",
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

  const videoTrack = stream?.getVideoTracks()[0] ?? null;
  const audioTrack = stream?.getAudioTracks()[0] ?? null;
  const videoTrackId = videoTrack?.id ?? "";
  const audioTrackId = audioTrack?.id ?? "";

  // Video bind — independent of audio so quality/layer changes don't restart sound.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const videoStream = videoTrack ? new MediaStream([videoTrack]) : null;
    attachMediaStream(videoEl, videoStream);
    if (videoStream) void videoEl.play().catch(() => undefined);

    const onEnded = () => attachMediaStream(videoEl, null);
    videoTrack?.addEventListener("ended", onEnded);
    return () => {
      videoTrack?.removeEventListener("ended", onEnded);
      attachMediaStream(videoEl, null);
    };
  }, [videoTrack, videoTrackId, trackSignature]);

  // Audio bind — local tile is muted so mic never plays into speakers (echo).
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const audioStream = audioTrack && !muted ? new MediaStream([audioTrack]) : null;
    attachMediaStream(audioEl, audioStream);
    if (audioStream) void audioEl.play().catch(() => undefined);

    const onEnded = () => attachMediaStream(audioEl, null);
    audioTrack?.addEventListener("ended", onEnded);
    return () => {
      audioTrack?.removeEventListener("ended", onEnded);
      attachMediaStream(audioEl, null);
    };
  }, [audioTrack, audioTrackId, muted]);

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
  }, [videoTrackId, showStats]);

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
