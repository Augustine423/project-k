import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Participant } from "../api/types";
import { listParticipantsPage } from "../api/client";
import { copyInviteLink, inviteLinkForRoom } from "../api/inviteLink";
import type { ChatMessage } from "./chatTypes";
import { avatarInitials, avatarTone, formatChatTime } from "./chatTypes";
import {
  ChatIcon,
  MicMutedSmall,
  ParticipantsIcon,
  RaiseHandIcon,
  ShareScreenIcon,
} from "./MediaIcons";

export type SidePanelTab = "chat" | "participants" | "invite";

const PARTICIPANTS_PAGE_SIZE = 50;
const SUGGESTION_LIMIT = 8;

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
  /** Guests only (excludes host) — shown on the participants badge. */
  guestCount?: number;
  hostParticipantId?: string;
  messages: ChatMessage[];
  /** Return false to keep the draft when send fails. */
  onSend: (message: string) => boolean | void;
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
  onClose?: () => void;
  raisedHands?: RaisedHandInfo[];
  showRaisedHands?: boolean;
  dmPeer: DmPeer | null;
  onDmPeerChange: (peer: DmPeer | null) => void;
  dmThreads: Record<string, ChatMessage[]>;
  openDmPeers: DmPeer[];
  dmUnreadByPeer?: Record<string, number>;
  onOpenDm: (peer: DmPeer) => void;
  /** Shared with header search when provided. */
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

function roleLabel(role: string): string | null {
  if (role === "host") return "Host";
  if (role === "cohost") return "Co-host";
  return null;
}

function panelTitle(tab: SidePanelTab): string {
  if (tab === "chat") return "Chat";
  if (tab === "participants") return "Participants";
  return "Share";
}

export function RoomSidePanel({
  roomId,
  participantCount,
  guestCount,
  hostParticipantId,
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
  onClose,
  raisedHands = [],
  showRaisedHands = false,
  dmPeer,
  onDmPeerChange,
  dmThreads,
  openDmPeers,
  dmUnreadByPeer = {},
  onOpenDm,
  searchQuery,
  onSearchQueryChange,
}: RoomSidePanelProps) {
  const [draft, setDraft] = useState("");
  const [internalQuery, setInternalQuery] = useState("");
  const queryControlled = onSearchQueryChange != null;
  const query = queryControlled ? (searchQuery ?? "") : internalQuery;
  const setQuery = queryControlled ? onSearchQueryChange : setInternalQuery;
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pageItems, setPageItems] = useState<Participant[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const inviteLink = inviteLinkForRoom(roomId);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setSuggestionsOpen(false);
    setActiveSuggestion(0);
    // Keep shared header search when switching tabs; only clear local search.
    if (!queryControlled && activeTab !== "participants") {
      setInternalQuery("");
      setDebouncedQuery("");
    }
  }, [activeTab, queryControlled]);

  useEffect(() => {
    if (activeTab === "participants" && query.trim()) {
      setSuggestionsOpen(true);
      setActiveSuggestion(0);
    }
  }, [query, activeTab]);

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

  useEffect(() => {
    if (!suggestionsOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [suggestionsOpen]);

  const displayedParticipants = useMemo(() => {
    let list: Participant[];
    if (useLiveList && liveParticipants) {
      const q = debouncedQuery.toLowerCase();
      list = q
        ? liveParticipants.filter((p) => p.displayName.toLowerCase().includes(q))
        : liveParticipants;
    } else {
      list = pageItems;
    }
    // People panel lists guests only — host is not shown here.
    if (hostParticipantId) {
      list = list.filter((p) => p.id !== hostParticipantId && p.role !== "host");
    } else {
      list = list.filter((p) => p.role !== "host");
    }
    return list;
  }, [useLiveList, liveParticipants, debouncedQuery, pageItems, hostParticipantId]);

  const peopleCount = guestCount ?? Math.max(0, participantCount - (hostParticipantId ? 1 : 0));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pool =
      liveParticipants && liveParticipants.length > 0 ? liveParticipants : displayedParticipants;
    return pool
      .filter((p) => {
        if (hostParticipantId && p.id === hostParticipantId) return false;
        if (p.role === "host") return false;
        return p.displayName.toLowerCase().includes(q);
      })
      .slice(0, SUGGESTION_LIMIT);
  }, [query, liveParticipants, displayedParticipants, hostParticipantId]);

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

  async function copyInvite() {
    const ok = await copyInviteLink(roomId);
    if (!ok) return;
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 2000);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || chatDisabled) return;
    const ok = onSend(text);
    if (ok === false) return;
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

  function applySuggestion(p: Participant) {
    setQuery(p.displayName);
    setDebouncedQuery(p.displayName.trim());
    setSuggestionsOpen(false);
    setActiveSuggestion(0);
    const el = document.getElementById(`participant-row-${p.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = suggestions[activeSuggestion];
      if (pick) applySuggestion(pick);
    } else if (e.key === "Escape") {
      setSuggestionsOpen(false);
    }
  }

  const composerPlaceholder = chatDisabled
    ? (chatDisabledHint ?? "Chat unavailable")
    : dmPeer
      ? `Write to ${dmPeer.displayName}…`
      : "Write to the room…";

  const TitleIcon =
    activeTab === "chat"
      ? ChatIcon
      : activeTab === "participants"
        ? ParticipantsIcon
        : ShareScreenIcon;

  return (
    <section className={`rsp rsp-solo rsp-${activeTab}`}>
      <header className="rsp-head rsp-solo-head">
        <div className="rsp-solo-title">
          <TitleIcon size={16} />
          <h2>{panelTitle(activeTab)}</h2>
          {activeTab === "participants" && (
            <span className="rsp-tab-count">{peopleCount}</span>
          )}
        </div>
        {onClose && (
          <button type="button" className="rsp-close" onClick={onClose} aria-label="Close panel">
            ×
          </button>
        )}
      </header>

      {activeTab === "chat" && (
        <div className="rsp-body rsp-chat" role="region" aria-label="Chat">
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
      )}

      {activeTab === "participants" && (
        <div className="rsp-body rsp-participants" role="region" aria-label="Participants">
          <div className="rsp-people-tools">
            <div className="rsp-search-wrap" ref={searchWrapRef}>
              <label className="rsp-search">
                <span className="sr-only">Search participants</span>
                <input
                  type="search"
                  placeholder="Search people by name…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSuggestionsOpen(true);
                    setActiveSuggestion(0);
                  }}
                  onFocus={() => setSuggestionsOpen(true)}
                  onKeyDown={onSearchKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                  aria-autocomplete="list"
                  aria-expanded={suggestionsOpen && suggestions.length > 0}
                  aria-controls="rsp-search-suggestions"
                />
              </label>
              {suggestionsOpen && query.trim() && (
                <ul
                  id="rsp-search-suggestions"
                  className="rsp-suggest"
                  role="listbox"
                  aria-label="Participant suggestions"
                >
                  {suggestions.length === 0 && (
                    <li className="rsp-suggest-empty">No matches for “{query.trim()}”</li>
                  )}
                  {suggestions.map((p, index) => {
                    const isSelf = Boolean(selfId && p.id === selfId);
                    const role = roleLabel(p.role);
                    return (
                      <li key={p.id} role="option" aria-selected={index === activeSuggestion}>
                        <button
                          type="button"
                          className={`rsp-suggest-item ${index === activeSuggestion ? "is-active" : ""}`}
                          onMouseEnter={() => setActiveSuggestion(index)}
                          onClick={() => applySuggestion(p)}
                        >
                          <span
                            className="rsp-face rsp-face-sm"
                            style={{ background: avatarTone(p.id) }}
                            aria-hidden="true"
                          >
                            {avatarInitials(p.displayName)}
                          </span>
                          <span className="rsp-suggest-copy">
                            <strong>
                              {p.displayName}
                              {isSelf ? " (You)" : ""}
                            </strong>
                            {role && <em>{role}</em>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
              ? `${displayedParticipants.length} match · ${peopleCount} people`
              : `${peopleCount} people · tap a name to message`}
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
                <li
                  key={p.id}
                  id={`participant-row-${p.id}`}
                  className={`rsp-person ${isSelf ? "is-self" : ""}`}
                >
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

      {activeTab === "invite" && (
        <div className="rsp-body rsp-invite" role="region" aria-label="Share invite">
          <p className="rsp-invite-hint">Share this link so others can join the meeting.</p>
          <div className="rsp-invite-row">
            <input
              className="rsp-invite-input"
              type="text"
              readOnly
              value={inviteLink}
              onFocus={(e) => e.target.select()}
              aria-label="Meeting invitation link"
            />
            <button type="button" className="rsp-invite-copy" onClick={() => void copyInvite()}>
              {inviteCopied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="rsp-invite-room">
            Room ID <code>{roomId}</code>
          </p>
        </div>
      )}
    </section>
  );
}
