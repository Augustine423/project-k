import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getViewerInfo } from "../api/client";
import { VideoTile } from "../components/VideoTile";
import { JanusViewerClient } from "../janus/janusViewerClient";

export function ViewerPage() {
  const { roomId = "" } = useParams();
  const clientRef = useRef<JanusViewerClient | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");
  const [message, setMessage] = useState("Loading webinar…");

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const client = new JanusViewerClient({
      onStream: (incoming) => {
        if (cancelled) return;
        setStream((prev) => {
          const merged = prev ?? new MediaStream();
          for (const track of incoming.getTracks()) {
            const dup = merged.getTracks().find((t) => t.kind === track.kind);
            if (dup) merged.removeTrack(dup);
            merged.addTrack(track);
          }
          return merged;
        });
        setStatus("connected");
        setMessage("Watching live stream");
      },
      onError: (err) => {
        if (!cancelled) {
          setStatus("error");
          setMessage(err);
        }
      },
      onDisconnected: () => {
        if (!cancelled) {
          setStatus("error");
          setMessage("Disconnected from stream");
        }
      },
    });

    clientRef.current = client;

    (async () => {
      try {
        const info = await getViewerInfo(roomId);
        if (cancelled) return;
        await client.connect(info.janusWsUrl);
        await client.watch(info.mountpointId);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Failed to join as viewer");
        }
      }
    })();

    return () => {
      cancelled = true;
      client.destroy();
      clientRef.current = null;
    };
  }, [roomId]);

  return (
    <div className="page viewer-page">
      <header className="room-header">
        <div>
          <h1>Webinar viewer</h1>
          <p className="room-meta">Room {roomId} · {message}</p>
        </div>
        <Link className="btn btn-secondary" to={`/join/${roomId}`}>
          Join as participant
        </Link>
      </header>
      <div className="viewer-stage">
        {status === "error" && <div className="banner error">{message}</div>}
        <VideoTile stream={stream} label="Live broadcast" />
        {status === "loading" && <p className="viewer-hint">Waiting for host to start broadcasting…</p>}
      </div>
    </div>
  );
}
