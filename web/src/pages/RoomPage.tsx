import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  endRoom,
  getParticipantCount,
  kickParticipant,
  leaveRoom as leaveRoomApi,
  listParticipantsPage,
  MAX_CHAT_MESSAGES,
  setRoomLocked,
} from "../api/client";
import { sendRoomChat, useRoomEvents } from "../api/useRoomEvents";
import { clearTicket, getTicket, saveTicket } from "../api/ticketStore";
import type { JoinTicket, Participant, Room } from "../api/types";
import type { ChatMessage } from "../components/ChatPanel";
import { MeetingHeader } from "../components/MeetingChrome";
import { InviteLinkBar } from "../components/InviteLinkBar";
import { RoomSidePanel, type SidePanelTab } from "../components/RoomSidePanel";
import { resolveJoinTicketMedia } from "../api/resolveUrls";
import { LiveKitConference } from "../livekit/LiveKitConference";
import { forceDisconnectLiveKitRoom } from "../livekit/livekitRoomSession";
import { mediaUnavailableReason } from "../media/secureContext";

const SMALL_ROOM_LIVE_LIST = 200;

function isHostRole(role: string): boolean {
  return role === "host" || role === "cohost";
}

function appendChatMessage(prev: ChatMessage[], next: ChatMessage): ChatMessage[] {
  if (prev.some((m) => m.id === next.id)) return prev;
  const merged = [...prev, next];
  return merged.length > MAX_CHAT_MESSAGES ? merged.slice(-MAX_CHAT_MESSAGES) : merged;
}

export function RoomPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const sidePanelRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<JoinTicket | null>(() => getTicket(roomId));
  const [status, setStatus] = useState<"loading" | "connected" | "error" | "ended">("loading");
  const [statusMessage, setStatusMessage] = useState("Connecting…");
  const [participantCount, setParticipantCount] = useState(1);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hostBusy, setHostBusy] = useState(false);
  const [mediaWarning, setMediaWarning] = useState<string | null>(() => mediaUnavailableReason() || null);
  const [inviteCollapsed, setInviteCollapsed] = useState(true);
  const [chatReadCount, setChatReadCount] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sideTab, setSideTab] = useState<SidePanelTab>("chat");

  const token = ticket?.participantToken ?? "";
  const isHost = ticket ? isHostRole(ticket.participant.role) : false;
  const unreadChat = Math.max(0, chatMessages.length - chatReadCount);

  const refreshCount = useCallback(async () => {
    if (!roomId) return;
    try {
      const { count } = await getParticipantCount(roomId);
      setParticipantCount(Math.max(1, count));
    } catch {
      // non-fatal
    }
  }, [roomId]);

  const refreshLiveParticipants = useCallback(async () => {
    if (!roomId) return;
    try {
      const page = await listParticipantsPage(roomId, { offset: 0, limit: SMALL_ROOM_LIVE_LIST });
      setParticipants(page.items);
      setParticipantCount(Math.max(1, page.total));
    } catch {
      // non-fatal
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    void refreshCount();
    void refreshLiveParticipants();
  }, [roomId, refreshCount, refreshLiveParticipants]);

  useEffect(() => {
    if (!roomId) return;
    const stored = getTicket(roomId);
    if (!stored) {
      navigate(`/join/${roomId}`, { replace: true });
      return;
    }
    setTicket((prev) => (prev?.participant.id === stored.participant.id ? prev : stored));
  }, [roomId, navigate]);

  const focusSidePanel = useCallback(
    (tab: SidePanelTab = "chat") => {
      setSideTab(tab);
      setMobileSidebarOpen(true);
      if (tab === "chat") setChatReadCount(chatMessages.length);
      window.setTimeout(() => sidePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    },
    [chatMessages.length],
  );

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
        const id = `${data.participantId ?? "unknown"}-${data.at ?? Date.now()}`;
        setChatMessages((prev) =>
          appendChatMessage(prev, {
            id,
            displayName: data.displayName ?? "Guest",
            message: data.message!,
            at: data.at ?? new Date().toISOString(),
          }),
        );
      }
      if (evt.type === "room.participant_count") {
        const data = evt.data as { count?: number };
        if (typeof data.count === "number") setParticipantCount(Math.max(0, data.count));
        return;
      }
      if (evt.type === "participant.joined") {
        const joined = evt.data as Participant;
        if (joined?.id) {
          setParticipants((prev) => (prev.some((p) => p.id === joined.id) ? prev : [...prev, joined]));
          setParticipantCount((c) => c + 1);
        }
        return;
      }
      if (evt.type === "participant.left") {
        const data = evt.data as { participantId?: string };
        if (data.participantId) {
          setParticipants((prev) => prev.filter((p) => p.id !== data.participantId));
          setParticipantCount((c) => Math.max(0, c - 1));
        }
        return;
      }
      if (evt.type === "participant.kicked") {
        const data = evt.data as { participantId?: string };
        if (data.participantId === ticket?.participant.id) {
          clearTicket(roomId);
          navigate("/", { replace: true });
        } else if (data.participantId) {
          setParticipants((prev) => prev.filter((p) => p.id !== data.participantId));
          setParticipantCount((c) => Math.max(0, c - 1));
        }
      }
      if (evt.type === "room.ended") {
        setStatus("ended");
        clearTicket(roomId);
      }
      if (evt.type === "room.mode_changed") {
        const data = evt.data as { mode?: string; maxPublishers?: number };
        setTicket((prev) =>
          prev
            ? {
                ...prev,
                room: {
                  ...prev.room,
                  mode: (data.mode as Room["mode"]) ?? prev.room.mode,
                  maxPublishers: data.maxPublishers ?? prev.room.maxPublishers,
                },
              }
            : prev,
        );
        return;
      }
      if (evt.type === "room.locked") {
        setTicket((prev) =>
          prev ? { ...prev, room: { ...prev.room, locked: Boolean(evt.data) } } : prev,
        );
      }
    },
    [roomId, navigate, ticket?.participant.id],
  );

  const { chatReady } = useRoomEvents(roomId, token, onRoomEvent);

  useEffect(() => {
    if (sideTab === "chat" && mobileSidebarOpen) {
      setChatReadCount(chatMessages.length);
    }
  }, [sideTab, mobileSidebarOpen, chatMessages.length]);

  useEffect(() => {
    if (sideTab === "chat") {
      setChatReadCount(chatMessages.length);
    }
  }, [sideTab, chatMessages.length]);

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
      setParticipants((prev) => prev.filter((p) => p.id !== participantId));
      setParticipantCount((c) => Math.max(0, c - 1));
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

  const handleConnected = useCallback(() => {
    setStatus("connected");
    setStatusMessage("Connected");
    void refreshCount();
  }, [refreshCount]);

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

  const liveParticipantList =
    participants.length > 0
      ? participants
      : [
          {
            id: ticket.participant.id,
            roomId,
            displayName: ticket.participant.displayName,
            role: ticket.participant.role,
            approved: true,
            joinedAt: ticket.participant.joinedAt,
          } as Participant,
        ];

  const isLive = status === "connected";

  return (
    <div className="page meeting-shell">
      <MeetingHeader
        statusMessage={statusMessage}
        connected={isLive}
        live={isLive}
        viewerCount={participantCount}
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
              participantCount={participantCount}
              chatBadge={unreadChat > 0 ? (unreadChat === 1 ? "new" : unreadChat) : undefined}
              onFocusChat={() => focusSidePanel("chat")}
              roomMode={ticket.room.mode}
            />
          )}
        </main>

        <aside className={`meeting-sidebar ${mobileSidebarOpen ? "open" : ""}`}>
          <div ref={sidePanelRef} className="room-side-panel-wrap">
            <RoomSidePanel
              roomId={roomId}
              participantCount={participantCount}
              messages={chatMessages}
              onSend={sendChat}
              chatDisabled={!chatReady}
              chatDisabledHint={chatReady ? undefined : "Connecting chat…"}
              selfName={ticket.participant.displayName}
              liveParticipants={liveParticipantList}
              isHost={isHost}
              locked={ticket.room.locked}
              onToggleLock={toggleLock}
              onKick={kick}
              hostBusy={hostBusy}
              activeTab={sideTab}
              onTabChange={setSideTab}
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
        aria-label="Toggle chat and people"
      >
        ☰
      </button>
    </div>
  );
}
