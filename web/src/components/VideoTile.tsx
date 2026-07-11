import { useEffect, useRef } from "react";

interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
}

export function VideoTile({ stream, label, muted = false, mirror = false }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  return (
    <div className="video-tile">
      <video ref={videoRef} autoPlay playsInline muted={muted} className={mirror ? "mirror" : ""} />
      {!stream && <div className="video-placeholder">No video</div>}
      <span className="video-label">{label}</span>
    </div>
  );
}
