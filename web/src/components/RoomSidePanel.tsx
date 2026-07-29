import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Participant } from "../api/types";
import { listParticipantsPage } from "../api/client";
import type { ChatMessage } from "./ChatPanel";
import { ChatIcon, MicMutedSmall, ParticipantsIcon } from "./MediaIcons";

export type SidePanelTab = "chat" | "people";

const PEOPLE_PAGE_SIZE = 50;

interface RoomSidePanelProps {
  roomId: string;
  participantCount: number;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  chatDisabled?: boolean;
  chatDisabledHint?: string;
  selfName?: string;
  /** Small rooms: incremental join/leave updates without refetch. */
  liveParticipants?: Participant[];
  isHost?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onKick?: (participantId: string) => void;
  hostBusy?: boolean;
  activeTab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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
  liveParticipants,
  isHost,
  locked,
  onToggleLock,
  onKick,
  hostBusy,
  activeTab,
  onTabChange,
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

  useEffect(() => {
    if (activeTab !== "chat") return;
    const el = messagesRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, activeTab]);

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

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
          <div className="chat-messages" ref={messagesRef}>
            {messages.length === 0 && <p className="chat-empty">No messages yet. Say hello!</p>}
            {messages.map((msg) => {
              const isSelf = selfName && msg.displayName === selfName;
              return (
                <div key={msg.id} className={`chat-bubble-row ${isSelf ? "self" : "other"}`}>
                  {!isSelf && (
                    <span className="chat-avatar" aria-hidden="true">
                      {avatarInitials(msg.displayName)}
                    </span>
                  )}
                  <div className="chat-bubble">
                    {!isSelf && <span className="chat-sender">{msg.displayName}</span>}
                    <p className="chat-text">{msg.message}</p>
                    <time className="chat-time" dateTime={msg.at}>
                      {formatTime(msg.at)}
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
              placeholder={chatDisabled ? (chatDisabledHint ?? "Chat unavailable") : "Type a message…"}
              disabled={chatDisabled}
              maxLength={500}
              aria-label="Chat message"
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
                placeholder="Search…"
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
              : `${participantCount} in meeting`}
          </p>
          <ul className="participants-list" role="list">
            {peopleLoading && displayedPeople.length === 0 && (
              <li className="participants-empty muted">Loading participants…</li>
            )}
            {!peopleLoading && displayedPeople.length === 0 && (
              <li className="participants-empty muted">No matching participants.</li>
            )}
            {displayedPeople.map((p) => (
              <li key={p.id} className="participant-row">
                <span className="participant-avatar" aria-hidden="true">
                  {avatarInitials(p.displayName)}
                </span>
                <span className="participant-name">
                  {p.displayName}
                  {roleLabel(p.role) && <em>{roleLabel(p.role)}</em>}
                </span>
                <span className="participant-status">
                  <MicMutedSmall className="muted-icon" />
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
            ))}
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
