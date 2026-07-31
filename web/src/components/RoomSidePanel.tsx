import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Participant } from "../api/types";
import { listParticipantsPage } from "../api/client";
import type { ChatMessage } from "./chatTypes";
import { avatarInitials, avatarTone, formatChatTime } from "./chatTypes";
import { ChatIcon, MicMutedSmall, ParticipantsIcon, RaiseHandIcon } from "./MediaIcons";

export type SidePanelTab = "chat" | "people";

const PEOPLE_PAGE_SIZE = 50;

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
  /** Small rooms: incremental join/leave updates without refetch. */
  liveParticipants?: Participant[];
  isHost?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onKick?: (participantId: string) => void;
  hostBusy?: boolean;
  activeTab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  raisedHands?: RaisedHandInfo[];
  showRaisedHands?: boolean;
  /** null = room-wide Everyone chat; otherwise active DM peer. */
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
  const [peopleLoading, setPeopleLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const useLiveList = Boolean(liveParticipants && participantCount <= 200 && !debouncedQuery);

  const loadPeople = useCallback(
    async (offset: number, append: boolean) => {
      if (!roomId) return;
      setPeopleLoading(true);
      try {
        const page = await listParticipantsPage(roomId, {
          offset,
          limit: PEOPLE_PAGE_SIZE,
          q: debouncedQuery || undefined,
        });
        setPageOffset(offset);
        setHasMore(page.hasMore);
        setPageItems((prev) => (append ? [...prev, ...page.items] : page.items));
      } catch {
        if (!append) setPageItems([]);
      } finally {
        setPeopleLoading(false);
      }
    },
    [roomId, debouncedQuery],
  );

  useEffect(() => {
    if (activeTab !== "people" || useLiveList) return;
    void loadPeople(0, false);
  }, [activeTab, useLiveList, loadPeople]);

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

  const displayedPeople = useMemo(() => {
    if (useLiveList && liveParticipants) {
      const q = debouncedQuery.toLowerCase();
      const list = q
        ? liveParticipants.filter((p) => p.displayName.toLowerCase().includes(q))
        : liveParticipants;
      return list;
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
      ? `Message ${dmPeer.displayName}…`
      : "Message everyone…";

  return (
    <section className="side-panel room-side-panel">
      <div className="room-side-tabs" role="tablist" aria-label="Chat and people">
        <button
          type="button"
          role="tab"
          id="tab-chat"
          aria-selected={activeTab === "chat"}
          aria-controls="panel-chat"
          className={`room-side-tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => onTabChange("chat")}
        >
          <ChatIcon size={16} />
          Chat
        </button>
        <button
          type="button"
          role="tab"
          id="tab-people"
          aria-selected={activeTab === "people"}
          aria-controls="panel-people"
          className={`room-side-tab ${activeTab === "people" ? "active" : ""}`}
          onClick={() => onTabChange("people")}
        >
          <ParticipantsIcon size={16} />
          People
          <span className="room-side-tab-count">{participantCount}</span>
        </button>
      </div>

      {activeTab === "chat" ? (
        <div
          className="side-panel-body chat-panel-body"
          role="tabpanel"
          id="panel-chat"
          aria-labelledby="tab-chat"
        >
          <div className="chat-scope-bar" role="tablist" aria-label="Chat destination">
            <button
              type="button"
              className={`chat-scope-chip ${dmPeer == null ? "active" : ""}`}
              onClick={() => onDmPeerChange(null)}
            >
              Everyone
            </button>
            {openDmPeers.map((peer) => {
              const unread = dmUnreadByPeer[peer.participantId] ?? 0;
              return (
                <button
                  key={peer.participantId}
                  type="button"
                  className={`chat-scope-chip ${dmPeer?.participantId === peer.participantId ? "active" : ""}`}
                  onClick={() => onDmPeerChange(peer)}
                  title={`Direct message with ${peer.displayName}`}
                >
                  <span
                    className="chat-scope-avatar"
                    style={{ background: avatarTone(peer.participantId) }}
                    aria-hidden="true"
                  >
                    {avatarInitials(peer.displayName)}
                  </span>
                  <span className="chat-scope-name">{peer.displayName}</span>
                  {unread > 0 && <span className="chat-scope-unread">{unread > 9 ? "9+" : unread}</span>}
                </button>
              );
            })}
          </div>

          {dmPeer && (
            <div className="chat-dm-banner">
              <span
                className="chat-avatar chat-avatar-sm"
                style={{ background: avatarTone(dmPeer.participantId) }}
                aria-hidden="true"
              >
                {avatarInitials(dmPeer.displayName)}
              </span>
              <div className="chat-dm-banner-text">
                <strong>{dmPeer.displayName}</strong>
                <span>Private message · only you two can see this</span>
              </div>
              <button type="button" className="link-btn" onClick={() => onDmPeerChange(null)}>
                Back
              </button>
            </div>
          )}

          <div className="chat-messages" ref={messagesRef}>
            {visibleMessages.length === 0 && (
              <p className="chat-empty">
                {dmPeer
                  ? `No messages yet with ${dmPeer.displayName}. Say hello!`
                  : "No messages yet. Say hello to everyone!"}
              </p>
            )}
            {visibleMessages.map((msg) => {
              const self = isSelfMessage(msg);
              return (
                <div key={msg.id} className={`chat-bubble-row ${self ? "self" : "other"}`}>
                  {!self && (
                    <button
                      type="button"
                      className="chat-avatar"
                      style={{ background: avatarTone(msg.participantId || msg.displayName) }}
                      aria-label={`Message ${msg.displayName}`}
                      title={`Message ${msg.displayName}`}
                      onClick={() => openDmFromChat(msg)}
                      disabled={!msg.participantId}
                    >
                      {avatarInitials(msg.displayName)}
                    </button>
                  )}
                  <div className="chat-bubble">
                    {!self && (
                      <button
                        type="button"
                        className="chat-sender"
                        onClick={() => openDmFromChat(msg)}
                        disabled={!msg.participantId}
                        title={msg.participantId ? `Message ${msg.displayName}` : undefined}
                      >
                        {msg.displayName}
                      </button>
                    )}
                    {self && dmPeer && <span className="chat-sender chat-sender-self">You</span>}
                    <p className="chat-text">{msg.message}</p>
                    <time className="chat-time" dateTime={msg.at}>
                      {formatChatTime(msg.at)}
                    </time>
                  </div>
                </div>
              );
            })}
          </div>
          <form className="chat-form" onSubmit={submit}>
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
          className="side-panel-body participants-panel-body room-people-body"
          role="tabpanel"
          id="panel-people"
          aria-labelledby="tab-people"
        >
          <div className="participants-toolbar">
            <label className="participants-search-wrap">
              <span className="sr-only">Search participants</span>
              <input
                type="search"
                className="participants-search"
                placeholder="Search people…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {isHost && onToggleLock && (
              <button
                type="button"
                className="btn btn-ghost btn-sm participants-lock-btn"
                onClick={onToggleLock}
                disabled={hostBusy}
                title={locked ? "Unlock room" : "Lock room"}
              >
                {locked ? "Unlock" : "Lock"}
              </button>
            )}
          </div>
          <p className="participants-count-line muted">
            {query.trim()
              ? `${displayedPeople.length} shown · ${participantCount} in meeting`
              : `${participantCount} in meeting · click a name to message`}
          </p>
          {showRaisedHands && orderedRaisedHands.length > 0 && (
            <div className="raised-hands-queue" aria-label="Raised hands">
              <p className="raised-hands-title">Raised hands ({orderedRaisedHands.length})</p>
              <ol className="raised-hands-list">
                {orderedRaisedHands.map((h, index) => (
                  <li key={h.participantId} className="raised-hand-row">
                    <span className="raised-hand-rank">{index + 1}</span>
                    <button
                      type="button"
                      className="raised-hand-name linkish"
                      onClick={() =>
                        onOpenDm({ participantId: h.participantId, displayName: h.displayName })
                      }
                    >
                      {h.displayName}
                    </button>
                    <RaiseHandIcon size={16} />
                  </li>
                ))}
              </ol>
            </div>
          )}
          <ul className="participants-list" role="list">
            {peopleLoading && displayedPeople.length === 0 && (
              <li className="participants-empty muted">Loading participants…</li>
            )}
            {!peopleLoading && displayedPeople.length === 0 && (
              <li className="participants-empty muted">No matching participants.</li>
            )}
            {displayedPeople.map((p) => {
              const isSelf = Boolean(selfId && p.id === selfId);
              const role = roleLabel(p.role);
              return (
                <li key={p.id} className="participant-row">
                  <span
                    className="participant-avatar"
                    aria-hidden="true"
                    style={{ background: avatarTone(p.id) }}
                  >
                    {avatarInitials(p.displayName)}
                  </span>
                  <div className="participant-meta">
                    {isSelf ? (
                      <span className="participant-name">
                        {p.displayName}
                        <em>You</em>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="participant-name participant-name-btn"
                        onClick={() => openDmFromParticipant(p)}
                        title={`Message ${p.displayName}`}
                      >
                        {p.displayName}
                      </button>
                    )}
                    <div className="participant-subline">
                      {role && <span className="participant-role-pill">{role}</span>}
                      {raisedById.has(p.id) && (
                        <span className="hand-raised-label">Hand raised</span>
                      )}
                      {!isSelf && <span className="participant-dm-hint">Message</span>}
                    </div>
                  </div>
                  <span className="participant-status">
                    {raisedById.has(p.id) ? (
                      <RaiseHandIcon className="hand-raised-icon" size={14} />
                    ) : (
                      <MicMutedSmall className="muted-icon" />
                    )}
                    {isHost && p.role !== "host" && onKick && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => onKick(p.id)}
                        disabled={hostBusy}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {!useLiveList && hasMore && (
            <button
              type="button"
              className="btn btn-ghost btn-sm participants-load-more"
              disabled={peopleLoading}
              onClick={() => void loadPeople(pageOffset + PEOPLE_PAGE_SIZE, true)}
            >
              {peopleLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
