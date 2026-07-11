import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  endRoom,
  forwardPublisherStreams,
  kickParticipant,
  listParticipants,
  setRoomLocked,
} from "../api/client";
import { sendRoomChat, useRoomEvents } from "../api/useRoomEvents";
import { clearTicket, getTicket, saveTicket } from "../api/ticketStore";
import type { JoinTicket, Participant } from "../api/types";
import { ChatPanel, type ChatMessage } from "../components/ChatPanel";
import { ControlBar } from "../components/ControlBar";
import { HostPanel } from "../components/HostPanel";
import { VideoGrid, type GridTile } from "../components/VideoGrid";
import { JanusRoomClient } from "../janus/janusRoomClient";

function isHostRole(role: string): boolean {
  return role === "host" || role === "cohost";
}

function mergeRemoteStream(existing: MediaStream | null, incoming: MediaStream): MediaStream {
  const stream = existing ?? new MediaStream();
  for (const track of incoming.getTracks()) {
    const kind = track.kind;
    const dup = stream.getTracks().find((t) => t.kind === kind);
    if (dup) stream.removeTrack(dup);
    stream.addTrack(track);
  }
  return stream;
}

export function RoomPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const clientRef = useRef<JanusRoomClient | null>(null);

  const [ticket, setTicket] = useState<JoinTicket | null>(() => getTicket(roomId));
  const [status, setStatus] = useState<"loading" | "connected" | "error" | "ended">("loading");
  const [statusMessage, setStatusMessage] = useState("Connecting…");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteFeeds, setRemoteFeeds] = useState<
    Map<string, { displayName: string; stream: MediaStream }>
  >(new Map());
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hostBusy, setHostBusy] = useState(false);
  const [ownStreams, setOwnStreams] = useState<{ mid: string; type: "audio" | "video" }[]>([]);

  const token = ticket?.participantToken ?? "";
  const isHost = ticket ? isHostRole(ticket.participant.role) : false;
  const isWebinar = ticket?.room.mode === "webinar";

  const refreshParticipants = useCallback(async () => {
    if (!roomId) return;
    try {
      const list = await listParticipants(roomId);
      setParticipants(list);
    } catch {
      // non-fatal
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const stored = getTicket(roomId);
    if (!stored) {
      navigate(`/join/${roomId}`, { replace: true });
      return;
    }
    setTicket((prev) => (prev?.participant.id === stored.participant.id ? prev : stored));
  }, [roomId, navigate]);

  const janusRoomId = ticket?.room.janusRoomId ?? "";
  const janusWsUrl = ticket?.janusWsUrl ?? "";
  const displayName = ticket?.participant.displayName ?? "";

  useEffect(() => {
    if (!ticket || !janusRoomId || !janusWsUrl || !displayName) return;

    let cancelled = false;
    const client = new JanusRoomClient({
      onLocalStream: (stream) => {
        if (!cancelled) setLocalStream(stream);
      },
      onRemoteFeedAdded: (feed) => {
        if (cancelled) return;
        setRemoteFeeds((prev) => {
          const next = new Map(prev);
          const existing = next.get(feed.publisherId);
          next.set(feed.publisherId, {
            displayName: feed.displayName,
            stream: mergeRemoteStream(existing?.stream ?? null, feed.stream),
          });
          return next;
        });
      },
      onRemoteFeedRemoved: (publisherId) => {
        if (cancelled) return;
        setRemoteFeeds((prev) => {
          const next = new Map(prev);
          next.delete(publisherId);
          return next;
        });
      },
      onOwnPublishedStreams: (streams) => {
        if (!cancelled) setOwnStreams(streams);
      },
      onError: (message) => {
        if (!cancelled) {
          setStatus("error");
          setStatusMessage(message);
        }
      },
      onDisconnected: () => {
        if (!cancelled) {
          setStatus("error");
          setStatusMessage("Disconnected from media server");
        }
      },
    });

    clientRef.current = client;

    (async () => {
      try {
        setStatus("loading");
        setStatusMessage("Connecting to Janus…");
        await client.connect(janusWsUrl, ticket.turn);
        await client.joinAsPublisher(janusRoomId, displayName, ticket.janusJoinPin ?? "");
        await client.publishLocalMedia({ audio: true, video: true });
        if (cancelled) return;
        setStatus("connected");
        setStatusMessage("Connected");
        void refreshParticipants();
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setStatusMessage(err instanceof Error ? err.message : "Failed to join media room");
        }
      }
    })();

    return () => {
      cancelled = true;
      client.destroy();
      clientRef.current = null;
    };
  }, [ticket, janusRoomId, janusWsUrl, displayName, refreshParticipants]);

  useRoomEvents(roomId, token, (evt) => {
    if (evt.type === "chat.message") {
      const data = evt.data as {
        displayName?: string;
        message?: string;
        at?: string;
        participantId?: string;
      };
      if (!data.message) return;
      const text = data.message;
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${data.participantId ?? "unknown"}-${data.at ?? Date.now()}`,
          displayName: data.displayName ?? "Guest",
          message: text,
          at: data.at ?? new Date().toISOString(),
        },
      ]);
    }
    if (evt.type === "participant.joined") {
      void refreshParticipants();
    }
    if (evt.type === "participant.kicked") {
      const data = evt.data as { participantId?: string };
      if (data.participantId === ticket?.participant.id) {
        clearTicket(roomId);
        navigate("/", { replace: true });
      } else {
        void refreshParticipants();
      }
    }
    if (evt.type === "room.ended") {
      setStatus("ended");
      clearTicket(roomId);
    }
    if (evt.type === "room.locked") {
      setTicket((prev) =>
        prev ? { ...prev, room: { ...prev.room, locked: Boolean(evt.data) } } : prev,
      );
    }
  });

  const tiles: GridTile[] = useMemo(() => {
    const result: GridTile[] = [];
    if (ticket) {
      result.push({
        id: "local",
        label: `${ticket.participant.displayName} (you)`,
        stream: localStream,
        muted: true,
        mirror: true,
      });
    }
    for (const [id, feed] of remoteFeeds) {
      result.push({
        id,
        label: feed.displayName,
        stream: feed.stream,
      });
    }
    return result;
  }, [ticket, localStream, remoteFeeds]);

  function toggleAudio() {
    const next = !audioEnabled;
    setAudioEnabled(next);
    clientRef.current?.setLocalAudioEnabled(next);
  }

  function toggleVideo() {
    const next = !videoEnabled;
    setVideoEnabled(next);
    clientRef.current?.setLocalVideoEnabled(next);
  }

  async function shareScreen() {
    try {
      await clientRef.current?.shareScreen();
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Screen share failed");
    }
  }

  function leaveRoom() {
    clientRef.current?.destroy();
    clearTicket(roomId);
    navigate("/", { replace: true });
  }

  function sendChat(text: string) {
    if (!ticket) return;
    try {
      sendRoomChat(roomId, ticket.participantToken, ticket.participant.displayName, text);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Chat send failed");
    }
  }

  async function toggleLock() {
    if (!ticket) return;
    setHostBusy(true);
    try {
      const next = !ticket.room.locked;
      await setRoomLocked(roomId, ticket.participantToken, next);
      const updated = { ...ticket, room: { ...ticket.room, locked: next } };
      setTicket(updated);
      saveTicket(updated);
    } finally {
      setHostBusy(false);
    }
  }

  async function endMeeting() {
    if (!ticket) return;
    setHostBusy(true);
    try {
      await endRoom(roomId, ticket.participantToken);
      clientRef.current?.destroy();
      clearTicket(roomId);
      navigate("/", { replace: true });
    } finally {
      setHostBusy(false);
    }
  }

  async function kick(participantId: string) {
    if (!ticket) return;
    setHostBusy(true);
    try {
      await kickParticipant(roomId, ticket.participantToken, participantId);
      void refreshParticipants();
    } finally {
      setHostBusy(false);
    }
  }

  async function startWebinarBroadcast() {
    if (!ticket || ownStreams.length === 0) return;
    setHostBusy(true);
    try {
      await forwardPublisherStreams(
        roomId,
        ticket.participantToken,
        ticket.participant.id,
        ownStreams,
      );
      setStatusMessage("Webinar stream forwarded to viewers");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to forward stream");
    } finally {
      setHostBusy(false);
    }
  }

  if (!ticket) {
    return (
      <div className="page room-page">
        <p>Loading session…</p>
      </div>
    );
  }

  return (
    <div className="page room-page">
      <header className="room-header">
        <div>
          <h1>Room {ticket.room.id}</h1>
          <p className="room-meta">
            {ticket.room.mode} · {statusMessage}
            {ticket.room.locked ? " · Locked" : ""}
          </p>
        </div>
        <div className="room-header-actions">
          {isWebinar && isHost && (
            <button type="button" className="btn btn-secondary" onClick={startWebinarBroadcast} disabled={hostBusy}>
              Broadcast to viewers
            </button>
          )}
          {isWebinar && (
            <Link className="btn btn-secondary" to={`/watch/${roomId}`}>
              Viewer link
            </Link>
          )}
          <span className="room-id">Share ID: {roomId}</span>
        </div>
      </header>

      <div className="room-layout">
        <main className="room-main">
          {status === "error" && <div className="banner error">{statusMessage}</div>}
          {status === "ended" && (
            <div className="banner info">
              Meeting ended. <Link to="/">Back home</Link>
            </div>
          )}
          <VideoGrid tiles={tiles} />
          <ControlBar
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onShareScreen={shareScreen}
            onLeave={leaveRoom}
          />
        </main>
        <div className="room-side">
          <ChatPanel messages={chatMessages} onSend={sendChat} disabled={status !== "connected"} />
          {isHost && (
            <HostPanel
              participants={participants}
              locked={ticket.room.locked}
              onToggleLock={toggleLock}
              onEndRoom={endMeeting}
              onKick={kick}
              busy={hostBusy}
            />
          )}
        </div>
      </div>
    </div>
  );
}
