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
  setRoomMode,
} from "../api/client";
import { sendRoomChat, sendDirectChat, raiseHand, lowerHand, syncRaisedHands, useRoomEvents } from "../api/useRoomEvents";
import { clearTicket, getTicket, saveTicket } from "../api/ticketStore";
import type { JoinTicket, Participant, Room } from "../api/types";
import type { ChatMessage } from "../components/chatTypes";
import { MeetingHeader } from "../components/MeetingChrome";
import { RoomSidePanel, type DmPeer, type SidePanelTab } from "../components/RoomSidePanel";
import { resolveJoinTicketMedia } from "../api/resolveUrls";
import { MediaConference } from "../media/MediaConference";
import { forceDisconnectLiveKitRoom } from "../livekit/livekitRoomSession";
import { mediaUnavailableReason } from "../media/secureContext";
import { useViewerViewport } from "../hooks/useViewerViewport";

const SMALL_ROOM_LIVE_LIST = 200;

export type RaisedHand = {
  participantId: string;
  displayName: string;
  at: string;
};

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
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sideTab, setSideTab] = useState<SidePanelTab>("chat");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeHideTimer = useRef<number | null>(null);
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);
  const [dmPeer, setDmPeer] = useState<DmPeer | null>(null);
  const [dmThreads, setDmThreads] = useState<Record<string, ChatMessage[]>>({});
  const [openDmPeers, setOpenDmPeers] = useState<DmPeer[]>([]);
  const [dmUnreadByPeer, setDmUnreadByPeer] = useState<Record<string, number>>({});
  const [roomChatReadCount, setRoomChatReadCount] = useState(0);

  const token = ticket?.participantToken ?? "";
  const selfId = ticket?.participant.id ?? "";
  const isHost = ticket ? isHostRole(ticket.participant.role) : false;
  const viewport = useViewerViewport();
  /** Auto-hide chrome on client views and whenever the phone is in landscape fullscreen mode. */
  const autoHideChrome = !isHost || viewport.mode === "mobile-landscape";
  const unreadRoomChat = Math.max(0, chatMessages.length - roomChatReadCount);
  const unreadDmTotal = Object.values(dmUnreadByPeer).reduce((a, b) => a + b, 0);
  const unreadChat = unreadRoomChat + unreadDmTotal;
  const selfHandRaised = Boolean(
    ticket && raisedHands.some((h) => h.participantId === ticket.participant.id),
  );
  const isWebinar = ticket?.room.mode === "webinar";
  const dmPeerRef = useRef(dmPeer);
  dmPeerRef.current = dmPeer;
  const sideTabRef = useRef(sideTab);
  sideTabRef.current = sideTab;
  const sidePanelOpenRef = useRef(sidePanelOpen);
  sidePanelOpenRef.current = sidePanelOpen;

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

  // Best-effort cleanup when the tab closes so Redis does not keep a ghost seat.
  useEffect(() => {
    if (!ticket?.participantToken || !roomId) return;
    const token = ticket.participantToken;
    const id = roomId;
    const onPageHide = () => {
      try {
        void fetch(`/api/rooms/${encodeURIComponent(id)}/leave`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [roomId, ticket?.participantToken]);

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
      setSidePanelOpen(true);
      if (tab === "chat") {
        setRoomChatReadCount(chatMessages.length);
        if (dmPeer) {
          setDmUnreadByPeer((prev) => ({ ...prev, [dmPeer.participantId]: 0 }));
        }
      }
      window.setTimeout(() => sidePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    },
    [chatMessages.length, dmPeer],
  );

  const toggleSidePanel = useCallback(
    (tab: SidePanelTab) => {
      if (sidePanelOpenRef.current && sideTabRef.current === tab) {
        setSidePanelOpen(false);
        return;
      }
      focusSidePanel(tab);
    },
    [focusSidePanel],
  );

  const closeSidePanel = useCallback(() => setSidePanelOpen(false), []);

  const handlePeopleSearchChange = useCallback(
    (q: string) => {
      setPeopleSearch(q);
      if (q.trim()) focusSidePanel("participants");
    },
    [focusSidePanel],
  );

  const handlePeopleSearchFocus = useCallback(() => {
    focusSidePanel("participants");
  }, [focusSidePanel]);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    if (autoHideChrome) {
      if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
      chromeHideTimer.current = window.setTimeout(() => {
        if (!sidePanelOpenRef.current) setChromeVisible(false);
      }, 3200);
    }
  }, [autoHideChrome]);

  useEffect(() => {
    if (!autoHideChrome) {
      setChromeVisible(true);
      if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
      return;
    }
    revealChrome();
    return () => {
      if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
    };
  }, [autoHideChrome, revealChrome]);

  useEffect(() => {
    if (sidePanelOpen) setChromeVisible(true);
  }, [sidePanelOpen]);

  const shareInvite = useCallback(() => {
    toggleSidePanel("invite");
  }, [toggleSidePanel]);

  const openDm = useCallback((peer: DmPeer) => {
    setOpenDmPeers((prev) =>
      prev.some((p) => p.participantId === peer.participantId) ? prev : [...prev, peer],
    );
    setDmPeer(peer);
    setSideTab("chat");
    setSidePanelOpen(true);
    setDmUnreadByPeer((prev) => ({ ...prev, [peer.participantId]: 0 }));
  }, []);

  const changeDmPeer = useCallback((peer: DmPeer | null) => {
    setDmPeer(peer);
    if (peer) {
      setDmUnreadByPeer((prev) => ({ ...prev, [peer.participantId]: 0 }));
    } else {
      setRoomChatReadCount((c) => Math.max(c, chatMessages.length));
    }
  }, [chatMessages.length]);

  const onRoomEvent = useCallback(
    (evt: { type: string; data: unknown }) => {
      if (evt.type === "ws.open") {
        if (roomId && token) {
          try {
            syncRaisedHands(roomId, token);
          } catch {
            // ws just opened; sync is best-effort
          }
        }
        return;
      }
      if (evt.type === "ws.close") return;

      if (evt.type === "chat.message") {
        const data = evt.data as {
          id?: string;
          displayName?: string;
          message?: string;
          at?: string;
          participantId?: string;
        };
        const text = typeof data.message === "string" ? data.message.trim() : "";
        if (!text) return;
        const at = typeof data.at === "string" && data.at ? data.at : new Date().toISOString();
        const id =
          (typeof data.id === "string" && data.id) ||
          `${data.participantId ?? "unknown"}-${at}`;
        setChatMessages((prev) =>
          appendChatMessage(prev, {
            id,
            participantId: data.participantId,
            displayName: data.displayName ?? "Guest",
            message: text,
            at,
          }),
        );
        return;
      }

      if (evt.type === "chat.dm") {
        const data = evt.data as {
          id?: string;
          displayName?: string;
          message?: string;
          at?: string;
          participantId?: string;
          toParticipantId?: string;
          toDisplayName?: string;
        };
        const text = typeof data.message === "string" ? data.message.trim() : "";
        if (!text || !data.participantId || !data.toParticipantId || !selfId) return;

        const peerId =
          data.participantId === selfId ? data.toParticipantId : data.participantId;
        const peerName =
          data.participantId === selfId
            ? (data.toDisplayName ?? "Guest")
            : (data.displayName ?? "Guest");

        const at = typeof data.at === "string" && data.at ? data.at : new Date().toISOString();
        const id =
          (typeof data.id === "string" && data.id) ||
          `dm-${data.participantId}-${data.toParticipantId}-${at}`;
        const nextMsg: ChatMessage = {
          id,
          participantId: data.participantId,
          displayName: data.displayName ?? "Guest",
          message: text,
          at,
          dm: true,
          toParticipantId: data.toParticipantId,
          toDisplayName: data.toDisplayName,
        };

        setOpenDmPeers((prev) =>
          prev.some((p) => p.participantId === peerId)
            ? prev
            : [...prev, { participantId: peerId, displayName: peerName }],
        );
        setDmThreads((prev) => ({
          ...prev,
          [peerId]: appendChatMessage(prev[peerId] ?? [], nextMsg),
        }));

        const viewingThisDm =
          sideTabRef.current === "chat" &&
          dmPeerRef.current?.participantId === peerId;
        if (!viewingThisDm && data.participantId !== selfId) {
          setDmUnreadByPeer((prev) => ({
            ...prev,
            [peerId]: (prev[peerId] ?? 0) + 1,
          }));
        }
        return;
      }

      if (evt.type === "hand.updated") {
        const data = evt.data as {
          raised?: { participantId?: string; displayName?: string; at?: string }[];
        };
        const next = (data.raised ?? [])
          .filter((h): h is { participantId: string; displayName: string; at: string } =>
            Boolean(h.participantId),
          )
          .map((h) => ({
            participantId: h.participantId,
            displayName: h.displayName || "Guest",
            at: h.at || new Date().toISOString(),
          }));
        setRaisedHands(next);
        return;
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
          void refreshCount();
        }
        return;
      }
      if (evt.type === "participant.left") {
        const data = evt.data as { participantId?: string };
        if (data.participantId) {
          setParticipants((prev) => prev.filter((p) => p.id !== data.participantId));
          setRaisedHands((prev) => prev.filter((h) => h.participantId !== data.participantId));
          void refreshCount();
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
          setRaisedHands((prev) => prev.filter((h) => h.participantId !== data.participantId));
        }
      }
      if (evt.type === "room.ended") {
        setStatus("ended");
        clearTicket(roomId);
      }
      if (evt.type === "room.mode_changed") {
        const data = evt.data as { mode?: string; maxPublishers?: number; modePinned?: boolean };
        setTicket((prev) =>
          prev
            ? {
                ...prev,
                room: {
                  ...prev.room,
                  mode: (data.mode as Room["mode"]) ?? prev.room.mode,
                  maxPublishers: data.maxPublishers ?? prev.room.maxPublishers,
                  modePinned: data.modePinned ?? prev.room.modePinned,
                },
              }
            : prev,
        );
        if (data.mode && data.mode !== "webinar") setRaisedHands([]);
        return;
      }
      if (evt.type === "room.locked") {
        setTicket((prev) =>
          prev ? { ...prev, room: { ...prev.room, locked: Boolean(evt.data) } } : prev,
        );
      }
    },
    [roomId, navigate, ticket?.participant.id, token, selfId, refreshCount],
  );

  const { chatReady } = useRoomEvents(roomId, token, onRoomEvent);

  useEffect(() => {
    if (sideTab === "chat" && sidePanelOpen) {
      if (dmPeer) {
        setDmUnreadByPeer((prev) => ({ ...prev, [dmPeer.participantId]: 0 }));
      } else {
        setRoomChatReadCount(chatMessages.length);
      }
    }
  }, [sideTab, sidePanelOpen, chatMessages.length, dmPeer]);

  useEffect(() => {
    if (sideTab !== "chat") return;
    if (dmPeer) {
      setDmUnreadByPeer((prev) => ({ ...prev, [dmPeer.participantId]: 0 }));
    } else {
      setRoomChatReadCount(chatMessages.length);
    }
  }, [sideTab, chatMessages.length, dmPeer]);

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

  function sendChat(text: string): boolean {
    if (!ticket) return false;
    const message = text.trim();
    if (!message) return false;
    try {
      if (dmPeer) {
        sendDirectChat(
          roomId,
          ticket.participantToken,
          ticket.participant.displayName,
          dmPeer.participantId,
          message,
        );
      } else {
        sendRoomChat(roomId, ticket.participantToken, ticket.participant.displayName, message);
      }
      return true;
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Chat send failed");
      return false;
    }
  }

  function toggleRaiseHand() {
    if (!ticket || !isWebinar) return;
    try {
      if (selfHandRaised) lowerHand(roomId, ticket.participantToken);
      else raiseHand(roomId, ticket.participantToken);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Raise hand failed");
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

  async function setMeetingMode(mode: "interactive" | "webinar") {
    if (!ticket) return;
    setHostBusy(true);
    try {
      const result = await setRoomMode(roomId, ticket.participantToken, mode, true);
      const updated = {
        ...ticket,
        room: {
          ...ticket.room,
          mode: result.mode as Room["mode"],
          maxPublishers: result.maxPublishers,
          modePinned: result.modePinned,
        },
      };
      setTicket(updated);
      saveTicket(updated);
      if (mode === "interactive") setRaisedHands([]);
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
      // Headcount comes from room.participant_count — do not ±1 locally.
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
  const hostParticipantId = ticket.room.hostParticipantId;
  /** Guests only (exclude host) — participants panel / people badge. */
  const guestParticipantCount = Math.max(
    0,
    participantCount - (hostParticipantId ? 1 : 0),
  );

  return (
    <div
      className={[
        "meeting-app meeting-v2 meeting-light",
        autoHideChrome && !chromeVisible ? "chrome-hidden" : "",
        isHost ? "is-host-view" : "is-client-view",
        `viewport-${viewport.mode}`,
        "layout-gallery",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={revealChrome}
      onKeyDown={revealChrome}
    >
      <MeetingHeader
        statusMessage={statusMessage}
        connected={isLive}
        displayName={ticket.participant.displayName}
        participantCount={participantCount}
        roomMode={ticket.room.mode}
        onShare={shareInvite}
        searchValue={peopleSearch}
        onSearchChange={handlePeopleSearchChange}
        onSearchFocus={handlePeopleSearchFocus}
      />

      {status === "error" && <div className="banner error">{statusMessage}</div>}
      {mediaWarning && <div className="banner warn">{mediaWarning}</div>}
      {status === "ended" && (
        <div className="banner info">
          Meeting ended. <Link to="/dashboard">Back to dashboard</Link>
        </div>
      )}

      <div className="meeting-body">
        <main className="meeting-stage">
          {status !== "ended" && (
            <MediaConference
              roomId={roomId}
              participantToken={token}
              session={mediaConfig}
              displayName={ticket.participant.displayName}
              onConnected={handleConnected}
              onStatus={setStatusMessage}
              onDisconnected={handleDisconnected}
              onError={handleMediaError}
              onLeave={leaveRoom}
              participantCount={participantCount}
              chatBadge={unreadChat > 0 ? (unreadChat === 1 ? "new" : unreadChat) : undefined}
              onFocusChat={() => toggleSidePanel("chat")}
              onFocusParticipants={() => toggleSidePanel("participants")}
              onFocusInvite={() => toggleSidePanel("invite")}
              activePanel={sidePanelOpen ? sideTab : null}
              roomMode={ticket.room.mode}
              participantRole={ticket.participant.role}
              hostParticipantId={ticket.room.hostParticipantId}
              peopleBadgeCount={guestParticipantCount}
              showRaiseHand={isWebinar}
              handRaised={selfHandRaised}
              onToggleRaiseHand={toggleRaiseHand}
            />
          )}
        </main>

        <aside
          ref={sidePanelRef}
          className={`meeting-sidebar ${sidePanelOpen ? "open" : ""}`}
          aria-hidden={!sidePanelOpen}
        >
          <div className="room-side-panel-wrap">
            <RoomSidePanel
              roomId={roomId}
              participantCount={participantCount}
              guestCount={guestParticipantCount}
              hostParticipantId={hostParticipantId}
              messages={chatMessages}
              onSend={sendChat}
              chatDisabled={!chatReady}
              chatDisabledHint={chatReady ? undefined : "Connecting chat…"}
              selfName={ticket.participant.displayName}
              selfId={ticket.participant.id}
              liveParticipants={liveParticipantList}
              isHost={isHost}
              locked={ticket.room.locked}
              roomMode={ticket.room.mode}
              modePinned={ticket.room.modePinned}
              onSetMeetingMode={setMeetingMode}
              onToggleLock={toggleLock}
              onKick={kick}
              hostBusy={hostBusy}
              activeTab={sideTab}
              onClose={closeSidePanel}
              raisedHands={raisedHands}
              showRaisedHands={isWebinar}
              dmPeer={dmPeer}
              onDmPeerChange={changeDmPeer}
              dmThreads={dmThreads}
              openDmPeers={openDmPeers}
              dmUnreadByPeer={dmUnreadByPeer}
              onOpenDm={openDm}
              searchQuery={peopleSearch}
              onSearchQueryChange={setPeopleSearch}
            />
          </div>
          {isHost && (
            <div className="host-end-row">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void endMeeting()} disabled={hostBusy}>
                End meeting for all
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
