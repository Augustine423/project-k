import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface HlsViewerProps {
  url: string;
  onStatus?: (message: string) => void;
  onLeave: () => void;
}

/**
 * View-only fallback for audiences beyond the WebRTC cap. Uses native HLS (Safari/iOS) when
 * available, otherwise hls.js. Latency is seconds, not the WebRTC 100–250 ms target.
 */
export function HlsViewer({ url, onStatus, onLeave }: HlsViewerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let hls: Hls | null = null;
    let retryTimer: number | undefined;

    const tryPlay = () => {
      void video.play().then(
        () => !disposed && setNeedsTap(false),
        () => !disposed && setNeedsTap(true),
      );
    };
    const onPlaying = () => {
      setWaiting(false);
      statusRef.current?.("Connected (live stream)");
    };
    video.addEventListener("playing", onPlaying);

    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, backBufferLength: 10 });
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || disposed) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // Stream may not be live yet; keep retrying quietly.
          setWaiting(true);
          statusRef.current?.("Waiting for the live stream…");
          retryTimer = window.setTimeout(() => hls?.loadSource(url), 3000);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
          hls?.destroy();
        }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      tryPlay();
    } else {
      statusRef.current?.("This browser cannot play the live stream");
    }

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      video.removeEventListener("playing", onPlaying);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);

  return (
    <div className="hls-viewer">
      <video ref={videoRef} className="hls-viewer-video" playsInline autoPlay controls={false} />
      {waiting && <div className="hls-viewer-overlay">Waiting for the live stream…</div>}
      {needsTap && (
        <button
          type="button"
          className="hls-viewer-overlay hls-viewer-tap"
          onClick={() => {
            const v = videoRef.current;
            if (v) {
              v.muted = false;
              void v.play().then(() => setNeedsTap(false)).catch(() => undefined);
            }
          }}
        >
          Click to play / enable audio
        </button>
      )}
      <button type="button" className="hls-viewer-leave" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
