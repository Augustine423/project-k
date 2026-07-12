import { useCallback, useEffect, useState } from "react";
import { DisconnectReason } from "livekit-client";
import { Link, useNavigate, useParams } from "react-router-dom";
import { endRoom, kickParticipant, listParticipants, setRoomLocked } from "../api/client";
import { sendRoomChat, useRoomEvents } from "../api/useRoomEvents";
import { clearTicket, getTicket, saveTicket } from "../api/ticketStore";
import type { JoinTicket, Participant } from "../api/types";
import { ChatPanel, type ChatMessage } from "../components/ChatPanel";
import { HostPanel } from "../components/HostPanel";
import { resolveJoinTicketMedia } from "../api/resolveUrls";
import { LiveKitConference } from "../livekit/LiveKitConference";
import { mediaUnavailableReason } from "../media/secureContext";

function isHostRole(role: string): boolean {
  return role === "host" || role === "cohost";
}

export function RoomPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<JoinTicket | null>(() => getTicket(roomId));
  const [status, setStatus] = useState<"loading" | "connected" | "error" | "ended">("loading");
  const [statusMessage, setStatusMessage] = useState("Connecting…");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hostBusy, setHostBusy] = useState(false);
  const [mediaWarning, setMediaWarning] = useState<string | null>(() => mediaUnavailableReason() || null);

  const token = ticket?.participantToken ?? "";
  const isHost = ticket ? isHostRole(ticket.participant.role) : false;

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

  const onRoomEvent = useCallback(
    (evt: { type: string; data: unknown }) => {
      if (evt.type === "ws.open" || evt.type === "ws.close") return;

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
    },
    [roomId, navigate, ticket?.participant.id, refreshParticipants],
  );

  const { chatReady } = useRoomEvents(roomId, token, onRoomEvent);

  function leaveRoom() {
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

  if (!ticket) {
    return (
      <div className="page room-page">
        <p>Loading session…</p>
      </div>
    );
  }

  const { livekitUrl, iceServers } = resolveJoinTicketMedia(ticket);
  const livekitToken = ticket.livekitToken;
  const sessionKey = ticket.participant.id;

  const handleConnected = useCallback(() => {
    setStatus("connected");
    setStatusMessage("Connected");
    void refreshParticipants();
  }, [refreshParticipants]);

  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    if (
      reason === DisconnectReason.DUPLICATE_IDENTITY ||
      reason === DisconnectReason.CLIENT_INITIATED
    ) {
      setStatusMessage("Reconnecting…");
      return;
    }
    setStatus("error");
    setStatusMessage("Disconnected from media server");
  }, []);

  const handleMediaError = useCallback((message: string) => {
    setMediaWarning(message);
  }, []);

  return (
    <div className="page room-page">
      <header className="room-header">
        <div>
          <h1>Room {ticket.room.id}</h1>
          <p className="room-meta">
            Multiparty · up to {ticket.room.maxParticipants} participants · {statusMessage}
            {ticket.room.locked ? " · Locked" : ""}
          </p>
        </div>
        <div className="room-header-actions">
          <span className="room-id">Share ID: {roomId}</span>
        </div>
      </header>

      <div className="room-layout">
        <main className="room-main">
          {status === "error" && <div className="banner error">{statusMessage}</div>}
          {mediaWarning && <div className="banner warn">{mediaWarning}</div>}
          {status === "ended" && (
            <div className="banner info">
              Meeting ended. <Link to="/">Back home</Link>
            </div>
          )}
          {status !== "ended" && (
            <LiveKitConference
              key={sessionKey}
              sessionKey={sessionKey}
              serverUrl={livekitUrl}
              token={livekitToken}
              iceServers={iceServers}
              onConnected={handleConnected}
              onStatus={setStatusMessage}
              onDisconnected={handleDisconnected}
              onError={handleMediaError}
              onLeave={leaveRoom}
            />
          )}
        </main>
        <div className="room-side">
          <ChatPanel
            messages={chatMessages}
            onSend={sendChat}
            disabled={!chatReady}
            disabledHint={chatReady ? undefined : "Connecting chat…"}
          />
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
