import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { endRoom, kickParticipant, leaveRoom as leaveRoomApi, listParticipants, setRoomLocked } from "../api/client";
import { sendRoomChat, useRoomEvents } from "../api/useRoomEvents";
import { clearTicket, getTicket, saveTicket } from "../api/ticketStore";
import type { JoinTicket, Participant } from "../api/types";
import { ChatPanel, type ChatMessage } from "../components/ChatPanel";
import { MeetingHeader } from "../components/MeetingChrome";
import { InviteLinkBar } from "../components/InviteLinkBar";
import { ParticipantsPanel } from "../components/ParticipantsPanel";
import { resolveJoinTicketMedia } from "../api/resolveUrls";
import { LiveKitConference } from "../livekit/LiveKitConference";
import { forceDisconnectLiveKitRoom } from "../livekit/livekitRoomSession";
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
  const [inviteCollapsed, setInviteCollapsed] = useState(true);
  const [chatReadCount, setChatReadCount] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const token = ticket?.participantToken ?? "";
  const isHost = ticket ? isHostRole(ticket.participant.role) : false;
  const unreadChat = Math.max(0, chatMessages.length - chatReadCount);

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
      if (evt.type === "ws.open") {
        void refreshParticipants();
        return;
      }
      if (evt.type === "ws.close") return;

      if (evt.type === "chat.message") {
        const data = evt.data as {
          displayName?: string;
          message?: string;
          at?: string;
          participantId?: string;
        };
        if (!data.message) return;
        const id = `${data.participantId ?? "unknown"}-${data.at ?? Date.now()}`;
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev;
          return [
            ...prev,
            {
              id,
              displayName: data.displayName ?? "Guest",
              message: data.message!,
              at: data.at ?? new Date().toISOString(),
            },
          ];
        });
      }
      if (evt.type === "participant.joined" || evt.type === "participant.left") {
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

  useEffect(() => {
    if (!chatCollapsed && mobileSidebarOpen) {
      setChatReadCount(chatMessages.length);
    }
  }, [chatCollapsed, mobileSidebarOpen, chatMessages.length]);

  useEffect(() => {
    if (!chatCollapsed) {
      setChatReadCount(chatMessages.length);
    }
  }, [chatCollapsed, chatMessages.length]);

  function leaveRoom() {
    const t = ticket?.participantToken;
    const id = roomId;
    if (t && id) forceDisconnectLiveKitRoom(`${id}:${t}`);
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

  const mediaConfig = useMemo(
    () => (ticket ? resolveJoinTicketMedia(ticket) : null),
    [
      ticket?.liveKitUrl,
      ticket?.liveKitToken,
      ticket?.turn.credential,
      ticket?.turn.username,
      ticket?.turn?.urls.join("|"),
    ],
  );

  // #region agent log
  useEffect(() => {
    fetch("/__agent_debug", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5d65c5" },
      body: JSON.stringify({
        sessionId: "5d65c5",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "RoomPage.tsx:mount",
        message: "RoomPage mounted",
        data: {
          roomId,
          hasTicket: Boolean(ticket),
          hasMediaConfig: Boolean(mediaConfig),
          liveKitUrl: mediaConfig?.liveKitUrl ?? null,
          hasLiveKitToken: Boolean(ticket?.liveKitToken),
          secure: typeof window !== "undefined" ? window.isSecureContext : null,
          href: typeof window !== "undefined" ? window.location.href : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => undefined);
  }, [roomId, ticket, mediaConfig]);
  // #endregion

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

  if (!ticket || !mediaConfig) {
    return (
      <div className="page meeting-shell">
        <p className="muted">Loading session…</p>
      </div>
    );
  }

  const { liveKitUrl, turn } = mediaConfig;
  const liveKitToken = ticket.liveKitToken;

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
      <MeetingHeader statusMessage={statusMessage} connected={status === "connected"} />

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
            <LiveKitConference
              roomId={roomId}
              participantToken={token}
              liveKitUrl={liveKitUrl}
              liveKitToken={liveKitToken}
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
          />
          <div ref={chatPanelRef} className="chat-panel-wrap">
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
