import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Participant } from "../api/types";
import { listParticipantsPage } from "../api/client";
import type { ChatMessage } from "./chatTypes";
import { avatarInitials, avatarTone, formatChatTime } from "./chatTypes";
import { ChatIcon, MicMutedSmall, ParticipantsIcon, RaiseHandIcon } from "./MediaIcons";

export type SidePanelTab = "chat" | "participants";

const PARTICIPANTS_PAGE_SIZE = 50;

export type RaisedHandInfo = {
  participantId: string;
  displayName: string;
  at: string;
};

export type DmPeer = {
  participantId: string;
  displayName: string;
};

interface RoomSidePanelProps {
  roomId: string;
  participantCount: number;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  chatDisabled?: boolean;
  chatDisabledHint?: string;
  selfName?: string;
  selfId?: string;
  liveParticipants?: Participant[];
  isHost?: boolean;
  locked?: boolean;
  roomMode?: "interactive" | "webinar";
  modePinned?: boolean;
  onSetMeetingMode?: (mode: "interactive" | "webinar") => void;
  onToggleLock?: () => void;
  onKick?: (participantId: string) => void;
  hostBusy?: boolean;
  activeTab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  raisedHands?: RaisedHandInfo[];
  showRaisedHands?: boolean;
  dmPeer: DmPeer | null;
  onDmPeerChange: (peer: DmPeer | null) => void;
  dmThreads: Record<string, ChatMessage[]>;
  openDmPeers: DmPeer[];
  dmUnreadByPeer?: Record<string, number>;
  onOpenDm: (peer: DmPeer) => void;
}

function roleLabel(role: string): string | null {
  if (role === "host") return "Host";
  if (role === "cohost") return "Co-host";
  return null;
}

export function RoomSidePanel({
  roomId,
  participantCount,
  messages,
  onSend,
  chatDisabled,
  chatDisabledHint,
  selfName,
  selfId,
  liveParticipants,
  isHost,
  locked,
  roomMode = "interactive",
  modePinned,
  onSetMeetingMode,
  onToggleLock,
  onKick,
  hostBusy,
  activeTab,
  onTabChange,
  raisedHands = [],
  showRaisedHands = false,
  dmPeer,
  onDmPeerChange,
  dmThreads,
  openDmPeers,
  dmUnreadByPeer = {},
  onOpenDm,
}: RoomSidePanelProps) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pageItems, setPageItems] = useState<Participant[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const useLiveList = Boolean(liveParticipants && participantCount <= 200 && !debouncedQuery);

  const loadParticipants = useCallback(
    async (offset: number, append: boolean) => {
      if (!roomId) return;
      setParticipantsLoading(true);
      try {
        const page = await listParticipantsPage(roomId, {
          offset,
          limit: PARTICIPANTS_PAGE_SIZE,
          q: debouncedQuery || undefined,
        });
        setPageOffset(offset);
        setHasMore(page.hasMore);
        setPageItems((prev) => (append ? [...prev, ...page.items] : page.items));
      } catch {
        if (!append) setPageItems([]);
      } finally {
        setParticipantsLoading(false);
      }
    },
    [roomId, debouncedQuery],
  );

  useEffect(() => {
    if (activeTab !== "participants" || useLiveList) return;
    void loadParticipants(0, false);
  }, [activeTab, useLiveList, loadParticipants]);

  const visibleMessages = dmPeer ? (dmThreads[dmPeer.participantId] ?? []) : messages;

  useEffect(() => {
    if (activeTab !== "chat") return;
    const el = messagesRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [visibleMessages, activeTab, dmPeer?.participantId]);

  useEffect(() => {
    setDraft("");
  }, [dmPeer?.participantId]);

  const displayedParticipants = useMemo(() => {
    if (useLiveList && liveParticipants) {
      const q = debouncedQuery.toLowerCase();
      return q
        ? liveParticipants.filter((p) => p.displayName.toLowerCase().includes(q))
        : liveParticipants;
    }
    return pageItems;
  }, [useLiveList, liveParticipants, debouncedQuery, pageItems]);

  const raisedById = useMemo(() => {
    const map = new Map<string, RaisedHandInfo>();
    for (const h of raisedHands) map.set(h.participantId, h);
    return map;
  }, [raisedHands]);

  const orderedRaisedHands = useMemo(
    () =>
      [...raisedHands].sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
      ),
    [raisedHands],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  function isSelfMessage(msg: ChatMessage): boolean {
    if (selfId && msg.participantId === selfId) return true;
    if (!msg.participantId && selfName && msg.displayName === selfName) return true;
    return false;
  }

  function openDmFromParticipant(p: Participant) {
    if (selfId && p.id === selfId) return;
    onOpenDm({ participantId: p.id, displayName: p.displayName });
  }

  function openDmFromChat(msg: ChatMessage) {
    if (!msg.participantId || isSelfMessage(msg)) return;
    onOpenDm({ participantId: msg.participantId, displayName: msg.displayName });
  }

  const composerPlaceholder = chatDisabled
    ? (chatDisabledHint ?? "Chat unavailable")
    : dmPeer
      ? `Write to ${dmPeer.displayName}…`
      : "Write to the room…";

  return (
    <section className="rsp">
      <header className="rsp-head">
        <div className="rsp-tabs" role="tablist" aria-label="Chat and participants">
          <button
            type="button"
            role="tab"
            id="tab-chat"
            aria-selected={activeTab === "chat"}
            aria-controls="panel-chat"
            className={`rsp-tab ${activeTab === "chat" ? "is-active" : ""}`}
            onClick={() => onTabChange("chat")}
          >
            <ChatIcon size={15} />
            <span>Your Chat</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-participants"
            aria-selected={activeTab === "participants"}
            aria-controls="panel-participants"
            className={`rsp-tab ${activeTab === "participants" ? "is-active" : ""}`}
            onClick={() => onTabChange("participants")}
          >
            <ParticipantsIcon size={15} />
            <span>Participants</span>
            <span className="rsp-tab-count">{participantCount}</span>
          </button>
        </div>
      </header>

      {activeTab === "chat" ? (
        <div
          className="rsp-body rsp-chat"
          role="tabpanel"
          id="panel-chat"
          aria-labelledby="tab-chat"
        >
          <nav className="rsp-lanes" aria-label="Chat destination">
            <button
              type="button"
              className={`rsp-lane ${dmPeer == null ? "is-active" : ""}`}
              onClick={() => onDmPeerChange(null)}
            >
              Room
            </button>
            {openDmPeers.map((peer) => {
              const unread = dmUnreadByPeer[peer.participantId] ?? 0;
              return (
                <button
                  key={peer.participantId}
                  type="button"
                  className={`rsp-lane ${dmPeer?.participantId === peer.participantId ? "is-active" : ""}`}
                  onClick={() => onDmPeerChange(peer)}
                  title={`Direct message with ${peer.displayName}`}
                >
                  <span
                    className="rsp-lane-mark"
                    style={{ background: avatarTone(peer.participantId) }}
                    aria-hidden="true"
                  >
                    {avatarInitials(peer.displayName).slice(0, 1)}
                  </span>
                  <span className="rsp-lane-label">{peer.displayName}</span>
                  {unread > 0 && (
                    <span className="rsp-lane-badge">{unread > 9 ? "9+" : unread}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {dmPeer && (
            <div className="rsp-dm-bar">
              <span
                className="rsp-face rsp-face-sm"
                style={{ background: avatarTone(dmPeer.participantId) }}
                aria-hidden="true"
              >
                {avatarInitials(dmPeer.displayName)}
              </span>
              <div className="rsp-dm-copy">
                <strong>{dmPeer.displayName}</strong>
                <span>Private · only the two of you</span>
              </div>
              <button type="button" className="rsp-text-btn" onClick={() => onDmPeerChange(null)}>
                Room chat
              </button>
            </div>
          )}

          <div className="rsp-feed" ref={messagesRef}>
            {visibleMessages.length === 0 && (
              <div className="rsp-empty">
                <p>
                  {dmPeer
                    ? `Start a private note with ${dmPeer.displayName}.`
                    : "Say hello — your message appears here."}
                </p>
              </div>
            )}
            {visibleMessages.map((msg) => {
              const self = isSelfMessage(msg);
              return (
                <article
                  key={msg.id}
                  className={`rsp-msg ${self ? "is-self" : "is-other"}`}
                >
                  {!self ? (
                    <button
                      type="button"
                      className="rsp-face"
                      style={{ background: avatarTone(msg.participantId || msg.displayName) }}
                      aria-label={`Message ${msg.displayName}`}
                      title={`Message ${msg.displayName}`}
                      onClick={() => openDmFromChat(msg)}
                      disabled={!msg.participantId}
                    >
                      {avatarInitials(msg.displayName)}
                    </button>
                  ) : (
                    <span className="rsp-face rsp-face-self" aria-hidden="true">
                      You
                    </span>
                  )}
                  <div className="rsp-msg-main">
                    <div className="rsp-msg-meta">
                      {!self ? (
                        <button
                          type="button"
                          className="rsp-msg-name"
                          onClick={() => openDmFromChat(msg)}
                          disabled={!msg.participantId}
                          title={msg.participantId ? `Message ${msg.displayName}` : undefined}
                        >
                          {msg.displayName}
                        </button>
                      ) : (
                        <span className="rsp-msg-name is-you">You</span>
                      )}
                      <time className="rsp-msg-time" dateTime={msg.at}>
                        {formatChatTime(msg.at)}
                      </time>
                    </div>
                    <p className="rsp-msg-body">{msg.message}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <form className="rsp-composer" onSubmit={submit}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={composerPlaceholder}
              disabled={chatDisabled}
              maxLength={500}
              aria-label={dmPeer ? "Direct message" : "Room chat message"}
            />
            <button type="submit" disabled={chatDisabled || !draft.trim()} aria-label="Send message">
              Send
            </button>
          </form>
        </div>
      ) : (
        <div
          className="rsp-body rsp-participants"
          role="tabpanel"
          id="panel-participants"
          aria-labelledby="tab-participants"
        >
          <div className="rsp-people-tools">
            <label className="rsp-search">
              <span className="sr-only">Search participants</span>
              <input
                type="search"
                placeholder="Find a participant…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {isHost && onSetMeetingMode && (
              <>
                <button
                  type="button"
                  className={`rsp-tool-btn ${roomMode === "interactive" ? "active" : ""}`}
                  onClick={() => onSetMeetingMode("interactive")}
                  disabled={hostBusy || roomMode === "interactive"}
                  title="Everyone can use camera (interactive)"
                >
                  Interactive
                </button>
                <button
                  type="button"
                  className={`rsp-tool-btn ${roomMode === "webinar" ? "active" : ""}`}
                  onClick={() => onSetMeetingMode("webinar")}
                  disabled={hostBusy || roomMode === "webinar"}
                  title="Host/co-host video; others listen (webinar)"
                >
                  Webinar
                </button>
              </>
            )}
            {isHost && onToggleLock && (
              <button
                type="button"
                className="rsp-tool-btn"
                onClick={onToggleLock}
                disabled={hostBusy}
                title={locked ? "Unlock room" : "Lock room"}
              >
                {locked ? "Unlock" : "Lock"}
              </button>
            )}
          </div>

          <p className="rsp-people-sum">
            {query.trim()
              ? `${displayedParticipants.length} match · ${participantCount} total`
              : `${participantCount} participants · tap a name to message`}
            {isHost && modePinned ? " · mode pinned" : ""}
          </p>

          {showRaisedHands && orderedRaisedHands.length > 0 && (
            <div className="rsp-queue" aria-label="Raised hands">
              <div className="rsp-queue-label">Hands up · {orderedRaisedHands.length}</div>
              <ol className="rsp-queue-list">
                {orderedRaisedHands.map((h, index) => (
                  <li key={h.participantId}>
                    <span className="rsp-queue-n">{index + 1}</span>
                    <button
                      type="button"
                      className="rsp-queue-name"
                      onClick={() =>
                        onOpenDm({ participantId: h.participantId, displayName: h.displayName })
                      }
                    >
                      {h.displayName}
                    </button>
                    <RaiseHandIcon size={15} />
                  </li>
                ))}
              </ol>
            </div>
          )}

          <ul className="rsp-dir" role="list">
            {participantsLoading && displayedParticipants.length === 0 && (
              <li className="rsp-dir-empty">Loading participants…</li>
            )}
            {!participantsLoading && displayedParticipants.length === 0 && (
              <li className="rsp-dir-empty">No matches.</li>
            )}
            {displayedParticipants.map((p) => {
              const isSelf = Boolean(selfId && p.id === selfId);
              const role = roleLabel(p.role);
              return (
                <li key={p.id} className={`rsp-person ${isSelf ? "is-self" : ""}`}>
                  <span
                    className="rsp-face"
                    aria-hidden="true"
                    style={{ background: avatarTone(p.id) }}
                  >
                    {avatarInitials(p.displayName)}
                  </span>
                  <div className="rsp-person-copy">
                    {isSelf ? (
                      <span className="rsp-person-name">
                        {p.displayName}
                        <em>You</em>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rsp-person-name"
                        onClick={() => openDmFromParticipant(p)}
                        title={`Message ${p.displayName}`}
                      >
                        {p.displayName}
                      </button>
                    )}
                    <div className="rsp-person-meta">
                      {role && <span className="rsp-role">{role}</span>}
                      {raisedById.has(p.id) && <span className="rsp-hand">Hand raised</span>}
                      {!isSelf && <span className="rsp-dm-cue">Message</span>}
                    </div>
                  </div>
                  <div className="rsp-person-actions">
                    {raisedById.has(p.id) ? (
                      <RaiseHandIcon className="rsp-status-icon is-hand" size={14} />
                    ) : (
                      <MicMutedSmall className="rsp-status-icon" />
                    )}
                    {isHost && p.role !== "host" && onKick && (
                      <button
                        type="button"
                        className="rsp-text-btn"
                        onClick={() => onKick(p.id)}
                        disabled={hostBusy}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {!useLiveList && hasMore && (
            <button
              type="button"
              className="rsp-more"
              disabled={participantsLoading}
              onClick={() => void loadParticipants(pageOffset + PARTICIPANTS_PAGE_SIZE, true)}
            >
              {participantsLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
