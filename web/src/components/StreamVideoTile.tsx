import { useEffect, useRef, useState } from "react";
import { avatarInitials, avatarTone } from "./chatTypes";
import { useVideoStreamSize } from "../hooks/useVideoStreamAspect";
import { forgetAudioElement, playAudioElement } from "../media/audioPlayback";
import {
  classifyStreamAspect,
  resolveTileFit,
  type ConferenceLayoutMode,
  type StreamAspect,
  type TileFitMode,
} from "../media/conferenceLayout";

interface StreamVideoTileProps {
  stream: MediaStream | null;
  /** When stream object is reused, bump this so track add/remove rebinds cleanly. */
  trackSignature?: string;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  isSpeaking?: boolean;
  micMuted?: boolean;
  networkQuality?: "excellent" | "good" | "poor" | "lost" | "unknown";
  /** When false, tile shows avatar but audio may still play (off-page / audio-only). */
  hasVideo?: boolean;
  /** Reports the decoded source ratio (width / height) whenever it changes. */
  onSourceRatio?: (ratio: number) => void;
  /** Show decoded WxH badge (dev/quality check). */
  showStats?: boolean;
  roleBadge?: string;
  size?: "grid" | "spotlight" | "strip";
  /** Conference stage layout (always mosaic). */
  layoutMode?: ConferenceLayoutMode;
  /** Override automatic fit (cover / contain / contain-blur). */
  fit?: TileFitMode;
  /**
   * Publisher device hint (mobile → portrait). Used when decoded frame size is
   * missing/wrong so phone cameras still render as 9:16 boxes.
   */
  preferredAspect?: StreamAspect;
  className?: string;
}

function attachMediaStream(element: HTMLMediaElement, stream: MediaStream | null) {
  try {
    element.pause();
    element.srcObject = stream;
  } catch {
    /* legacy fallback unused on modern browsers */
  }
}

function aspectFromTrack(stream: MediaStream | null | undefined): StreamAspect {
  const track = stream?.getVideoTracks()[0];
  if (!track) return "unknown";
  const settings = track.getSettings?.() ?? {};
  const w = Number(settings.width) || 0;
  const h = Number(settings.height) || 0;
  if (w > 0 && h > 0) return classifyStreamAspect(w, h);
  return "unknown";
}

/**
 * Resolve display aspect for the tile box.
 * Publisher orientation hint (mm.videoAspect) wins — it tracks real phone
 * orientation. Measured WxH is the fallback (some browsers lie about rotation).
 */
export function resolveDisplayAspect(opts: {
  measured: StreamAspect;
  preferred?: StreamAspect;
  isScreenShare?: boolean;
}): StreamAspect {
  if (opts.isScreenShare) {
    return opts.measured !== "unknown" ? opts.measured : "landscape";
  }
  if (opts.preferred === "portrait" || opts.preferred === "landscape" || opts.preferred === "square") {
    return opts.preferred;
  }
  return opts.measured;
}

/**
 * Observe the tile's rendered w/h ratio. Quantised so layout transitions (which fire
 * many resize callbacks) only re-render when the ratio meaningfully changes.
 */
function useTileBoxRatio(ref: React.RefObject<HTMLElement | null>): number | undefined {
  const [ratio, setRatio] = useState<number | undefined>();
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const next = Math.round((rect.width / rect.height) * 50) / 50;
      setRatio((prev) => (prev === next ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return ratio;
}

/** One video element per tile — contain (+ optional blur fill) so content is never cropped. */
export function StreamVideoTile({
  stream,
  trackSignature = "",
  label,
  muted = false,
  mirror = false,
  isSpeaking = false,
  micMuted,
  networkQuality = "unknown",
  hasVideo,
  showStats = import.meta.env.DEV,
  onSourceRatio,
  roleBadge,
  size = "grid",
  layoutMode = "gallery",
  fit: fitOverride,
  preferredAspect,
  className = "",
}: StreamVideoTileProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const blurRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const statsRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === tileRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = () => {
    const el = tileRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => undefined);
    } else {
      // iOS Safari only supports fullscreen on the video element itself.
      (videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
    }
  };
  const [copied, setCopied] = useState(false);

  const videoTrack = stream?.getVideoTracks()[0] ?? null;
  const audioTrack = stream?.getAudioTracks()[0] ?? null;
  const videoTrackId = videoTrack?.id ?? "";
  const audioTrackId = audioTrack?.id ?? "";

  const liveSize = useVideoStreamSize(videoRef, stream, `${trackSignature}:${videoTrackId}`);
  const bootAspect = aspectFromTrack(stream);
  const measuredAspect = liveSize.aspect !== "unknown" ? liveSize.aspect : bootAspect;
  const streamAspect = resolveDisplayAspect({
    measured: measuredAspect,
    preferred: preferredAspect,
  });
  const boxRatio = useTileBoxRatio(tileRef);
  const streamRatio =
    liveSize.width > 0 && liveSize.height > 0 ? liveSize.width / liveSize.height : undefined;
  const fit =
    fitOverride ??
    resolveTileFit({
      streamAspect,
      layout: layoutMode,
      size,
      boxRatio,
      streamRatio,
    });
  const useBlurFill = fit === "contain-blur";

  useEffect(() => {
    if (streamRatio) onSourceRatio?.(streamRatio);
  }, [streamRatio, onSourceRatio]);

  const showVideo =
    hasVideo !== undefined
      ? hasVideo && Boolean(stream?.getVideoTracks().length)
      : Boolean(stream?.getVideoTracks().length);

  // Bind only when the underlying track changes — layout/fit/UI state changes must
  // never re-attach the stream (that is what causes a visible flicker).
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    attachMediaStream(videoEl, videoTrack ? new MediaStream([videoTrack]) : null);
    if (videoTrack) void videoEl.play().catch(() => undefined);

    const onEnded = () => attachMediaStream(videoEl, null);
    videoTrack?.addEventListener("ended", onEnded);
    return () => {
      videoTrack?.removeEventListener("ended", onEnded);
      attachMediaStream(videoEl, null);
    };
  }, [videoTrack]);

  // The blur backdrop mounts/unmounts with the fit mode; it binds independently.
  const blurActive = useBlurFill && showVideo;
  useEffect(() => {
    const blurEl = blurRef.current;
    if (!blurEl || !blurActive || !videoTrack) return;
    attachMediaStream(blurEl, new MediaStream([videoTrack]));
    void blurEl.play().catch(() => undefined);
    return () => attachMediaStream(blurEl, null);
  }, [blurActive, videoTrack]);

  // Push live aspect onto parent cell so CSS can size 1:1 / 9:16 / 16:9 boxes.
  useEffect(() => {
    const tileEl = tileRef.current;
    if (!tileEl) return;
    const aspect = streamAspect !== "unknown" ? streamAspect : "";
    if (aspect) tileEl.dataset.streamAspect = aspect;
    else delete tileEl.dataset.streamAspect;

    const cell = tileEl.closest(
      ".mosaic-cell, .grid-cell, .jitsi-cell, .filmstrip-cell, .featured-cell, .mm-slot, .mm-pair__cell, .mm-stage__cell",
    );
    if (!(cell instanceof HTMLElement)) return;
    // Freeform gallery locks box via data-box — don't override portrait/square unit.
    if (cell.dataset.box === "portrait" || cell.dataset.box === "landscape") return;
    if (aspect) cell.dataset.streamAspect = aspect;
    else delete cell.dataset.streamAspect;

    // Reused cells must not keep this participant's aspect after unmount/change.
    return () => {
      if (cell.isConnected && cell.dataset.box === undefined) delete cell.dataset.streamAspect;
    };
  }, [streamAspect]);

  // Audio bind — local tile is muted so mic never plays into speakers (echo).
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const audioStream = audioTrack && !muted ? new MediaStream([audioTrack]) : null;
    attachMediaStream(audioEl, audioStream);
    if (audioStream) playAudioElement(audioEl);

    const onEnded = () => attachMediaStream(audioEl, null);
    audioTrack?.addEventListener("ended", onEnded);
    return () => {
      audioTrack?.removeEventListener("ended", onEnded);
      forgetAudioElement(audioEl);
      attachMediaStream(audioEl, null);
    };
  }, [audioTrack, audioTrackId, muted]);

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
    update();

    return () => {
      videoEl.removeEventListener("loadedmetadata", update);
      videoEl.removeEventListener("resize", update);
    };
  }, [videoTrackId, showStats]);

  const tone = avatarTone(label);
  const initials = avatarInitials(label);
  const feedClass = ["video-feed", mirror ? "mirror" : ""].filter(Boolean).join(" ");
  const audioIsMuted = micMuted ?? (!audioTrack || Boolean(audioTrack.muted));

  async function copyParticipantName() {
    try {
      await navigator.clipboard.writeText(label);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      setMenuOpen(false);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      ref={tileRef}
      className={[
        "video-tile",
        `is-${size}`,
        isSpeaking ? "is-speaking" : "",
        showVideo ? "has-video" : "no-video",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-fit={fit}
      data-stream-aspect={streamAspect !== "unknown" ? streamAspect : undefined}
      data-ai-active={isSpeaking ? "true" : undefined}
    >
      {blurActive ? (
        <div className="video-letterbox-backdrop" style={{ ["--tile-tone" as string]: tone }} aria-hidden="true">
          <span>{initials}</span>
        </div>
      ) : null}
      {blurActive ? (
        <video
          ref={blurRef}
          autoPlay
          playsInline
          muted
          aria-hidden
          className={["video-feed-blur", mirror ? "mirror" : ""].filter(Boolean).join(" ")}
        />
      ) : null}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={feedClass}
      />
      {!muted && (
        <audio ref={audioRef} hidden autoPlay playsInline aria-hidden />
      )}
      {!showVideo && (
        <div className="no-video-container" style={{ ["--tile-tone" as string]: tone }}>
          <span className="video-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="no-video-text">{label}</span>
        </div>
      )}
      {!className.includes("mm-self-pip__tile") && !label.endsWith("(Screen)") && (
        <div className="video-tile-indicators" aria-label="Participant status">
          {audioIsMuted && (
            <span className="video-tile-status" title="Microphone muted" aria-label="Microphone muted">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 5.1 2.1M15 9V5a3 3 0 0 0-5.1-2.1M5 10v1a7 7 0 0 0 12 4.9M19 10v1a7 7 0 0 1-.4 2.3M12 18v4m-4 0h8M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          {isSpeaking && (
            <span className="video-audio-wave" title="Speaking" aria-label="Speaking">
              <i /><i /><i />
            </span>
          )}
          <span
            className={`video-network-quality quality-${networkQuality}`}
            title={`Connection: ${networkQuality}`}
            aria-label={`Connection quality: ${networkQuality}`}
          >
            <i /><i /><i />
          </span>
        </div>
      )}
      {showStats && <span ref={statsRef} className="video-res-badge" aria-hidden />}
      <div className="video-chrome">
        {roleBadge && <span className="video-role">{roleBadge}</span>}
        <span className="video-label">{label}</span>
      </div>
      {showVideo && (
        <button
          type="button"
          className="video-tile-fullscreen"
          aria-label={isFullscreen ? "Exit full screen" : `Full screen ${label}`}
          title={isFullscreen ? "Exit full screen" : "Full screen"}
          onClick={toggleFullscreen}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <path
              d={isFullscreen ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"}
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className="video-tile-menu">
        <button
          type="button"
          className="video-tile-menu-button"
          aria-label={`More options for ${label}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">•••</span>
        </button>
        {menuOpen && (
          <div className="video-tile-menu-popover" role="menu">
            <button type="button" role="menuitem" onClick={() => void copyParticipantName()}>
              {copied ? "Copied" : "Copy name"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
