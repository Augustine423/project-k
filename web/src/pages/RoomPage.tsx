import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { endRoom, kickParticipant, leaveRoom as leaveRoomApi, listParticipants, setRoomLocked } from "../api/client";
import { sendRoomChat, useRoomEvents } from "../api/useRoomEvents";
import { clearTicket, getTicket, saveTicket } from "../api/ticketStore";
import type { JoinTicket, Participant, RoomMode } from "../api/types";
import { ChatPanel, type ChatMessage } from "../components/ChatPanel";
import { MeetingHeader } from "../components/MeetingChrome";
import { InviteLinkBar } from "../components/InviteLinkBar";
import { ParticipantsPanel } from "../components/ParticipantsPanel";
import { resolveJoinTicketMedia } from "../api/resolveUrls";
import { JanusConference } from "../janus/JanusConference";
import { mediaUnavailableReason } from "../media/secureContext";

function isHostRole(role: string): boolean {
  return role === "host" || role === "cohost";
}

export function RoomPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<JoinTicket | null>(() => getTicket(roomId));
  const [status, setStatus] = useState<"loading" | "connected" | "error" | "ended">("loading");
  const [statusMessage, setStatusMessage] = useState("Connecting…");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hostBusy, setHostBusy] = useState(false);
  const [mediaWarning, setMediaWarning] = useState<string | null>(() => mediaUnavailableReason() || null);
  const [participantsCollapsed, setParticipantsCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [inviteCollapsed, setInviteCollapsed] = useState(false);
  const [chatReadCount, setChatReadCount] = useState(0);
  const [listenerOnly, setListenerOnly] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const token = ticket?.participantToken ?? "";
  const isHost = ticket ? isHostRole(ticket.participant.role) : false;
  const isSpeakerRole = isHost;
  const unreadChat = Math.max(0, chatMessages.length - chatReadCount);

  useEffect(() => {
    if (!ticket) return;
    setListenerOnly(ticket.room.mode === "webinar" && !isSpeakerRole);
  }, [ticket, isSpeakerRole]);

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

  const focusChat = useCallback(() => {
    setChatCollapsed(false);
    setMobileSidebarOpen(true);
    setChatReadCount(chatMessages.length);
    window.setTimeout(() => chatPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [chatMessages.length]);

  const focusParticipants = useCallback(() => {
    setParticipantsCollapsed(false);
    setMobileSidebarOpen(true);
  }, []);

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
      if (evt.type === "participant.left") {
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
      if (evt.type === "room.mode_changed") {
        const data = evt.data as { mode?: RoomMode; maxPublishers?: number };
        if (!data.mode) return;
        setTicket((prev) => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            room: {
              ...prev.room,
              mode: data.mode!,
              maxPublishers: data.maxPublishers ?? prev.room.maxPublishers,
            },
          };
          saveTicket(updated);
          return updated;
        });
        setListenerOnly(data.mode === "webinar" && !isSpeakerRole);
        setStatusMessage(
          data.mode === "webinar"
            ? "Switched to webinar mode — audience listens, speakers publish"
            : "Switched to interactive mode",
        );
      }
    },
    [roomId, navigate, ticket?.participant.id, refreshParticipants, isSpeakerRole],
  );

  const { chatReady } = useRoomEvents(roomId, token, onRoomEvent);

  useEffect(() => {
    if (!chatCollapsed && mobileSidebarOpen) {
      setChatReadCount(chatMessages.length);
    }
  }, [chatCollapsed, mobileSidebarOpen, chatMessages.length]);

  function leaveRoom() {
    const t = ticket?.participantToken;
    const id = roomId;
    void (async () => {
      if (t && id) {
        try {
          await leaveRoomApi(id, t);
        } catch {
          // still navigate away
        }
      }
      clearTicket(id);
      navigate("/", { replace: true });
    })();
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
      <div className="page meeting-shell">
        <p className="muted">Loading session…</p>
      </div>
    );
  }

  const mediaConfig = useMemo(
    () => resolveJoinTicketMedia(ticket),
    [
      ticket.janusWsUrl,
      ticket.janusJoinPin,
      ticket.turn.credential,
      ticket.turn.username,
      ticket.turn.urls.join("|"),
    ],
  );
  const { janusWsUrl, turn } = mediaConfig;
  const janusRoomId = ticket.room.janusRoomId;
  const sessionKey = `${ticket.participant.id}-${ticket.room.mode}-${listenerOnly ? "listen" : "pub"}`;

  const handleConnected = useCallback(() => {
    setStatus("connected");
    setStatusMessage("Connected");
    void refreshParticipants();
  }, [refreshParticipants]);

  const handleDisconnected = useCallback(() => {
    setStatus("error");
    setStatusMessage("Disconnected from media server");
  }, []);

  const handleMediaError = useCallback((message: string) => {
    setMediaWarning(message);
  }, []);

  const participantList =
    participants.length > 0
      ? participants
      : [
          {
            id: ticket.participant.id,
            displayName: ticket.participant.displayName,
            role: ticket.participant.role,
          } as Participant,
        ];

  return (
    <div className="page meeting-shell">
      <MeetingHeader
        statusMessage={statusMessage}
        connected={status === "connected"}
      />


      {status === "error" && <div className="banner error">{statusMessage}</div>}
      {mediaWarning && <div className="banner warn">{mediaWarning}</div>}
      {status === "ended" && (
        <div className="banner info">
          Meeting ended. <Link to="/">Back home</Link>
        </div>
      )}

      <div className="meeting-body">
        <main className="meeting-stage">
          {status !== "ended" && (
            <JanusConference
              key={sessionKey}
              roomId={roomId}
              participantToken={token}
              roomMode={ticket.room.mode}
              listenerOnly={listenerOnly}
              janusWsUrl={janusWsUrl}
              janusRoomId={janusRoomId}
              janusJoinPin={ticket.janusJoinPin}
              turn={turn}
              displayName={ticket.participant.displayName}
              onConnected={handleConnected}
              onStatus={setStatusMessage}
              onDisconnected={handleDisconnected}
              onError={handleMediaError}
              onLeave={leaveRoom}
              participantCount={participantList.length}
              chatBadge={unreadChat > 0 ? (unreadChat === 1 ? "new" : unreadChat) : undefined}
              onFocusParticipants={focusParticipants}
              onFocusChat={focusChat}
            />
          )}
        </main>

        <aside className={`meeting-sidebar ${mobileSidebarOpen ? "open" : ""}`}>
          <ParticipantsPanel
            participants={participantList}
            collapsed={participantsCollapsed}
            onToggleCollapse={() => setParticipantsCollapsed((v) => !v)}
            isHost={isHost}
            locked={ticket.room.locked}
            onToggleLock={toggleLock}
            onKick={kick}
            hostBusy={hostBusy}
            webinarMode={ticket.room.mode === "webinar"}
          />
          <div ref={chatPanelRef}>
            <ChatPanel
              messages={chatMessages}
              onSend={sendChat}
              disabled={!chatReady}
              disabledHint={chatReady ? undefined : "Connecting chat…"}
              collapsed={chatCollapsed}
              onToggleCollapse={() => setChatCollapsed((v) => !v)}
              selfName={ticket.participant.displayName}
            />
          </div>
          <InviteLinkBar
            roomId={roomId}
            collapsed={inviteCollapsed}
            onToggleCollapse={() => setInviteCollapsed((v) => !v)}
          />
          {isHost && (
            <div className="host-end-row">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void endMeeting()} disabled={hostBusy}>
                End meeting for all
              </button>
            </div>
          )}
        </aside>
      </div>

      <button
        type="button"
        className="mobile-sidebar-toggle"
        onClick={() => setMobileSidebarOpen((v) => !v)}
        aria-label="Toggle participants and chat"
      >
        ☰
      </button>
    </div>
  );
}
