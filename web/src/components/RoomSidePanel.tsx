import { useEffect, useMemo, useRef, useState } from "react";
import type { Participant } from "../api/types";
import type { ChatMessage } from "./ChatPanel";
import { ChatIcon, MicMutedSmall, ParticipantsIcon } from "./MediaIcons";

export type SidePanelTab = "chat" | "people";

interface RoomSidePanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  chatDisabled?: boolean;
  chatDisabledHint?: string;
  selfName?: string;
  participants: Participant[];
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

function roleRank(role: string): number {
  if (role === "host") return 0;
  if (role === "cohost") return 1;
  return 2;
}

function roleLabel(role: string): string | null {
  if (role === "host") return "Host";
  if (role === "cohost") return "Co-host";
  return null;
}

export function RoomSidePanel({
  messages,
  onSend,
  chatDisabled,
  chatDisabledHint,
  selfName,
  participants,
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
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab !== "chat") return;
    const el = messagesRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, activeTab]);

  const sorted = useMemo(() => {
    return [...participants].sort((a, b) => {
      const rd = roleRank(a.role) - roleRank(b.role);
      if (rd !== 0) return rd;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [participants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [sorted, query]);

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
          <span className="room-side-tab-count">{participants.length}</span>
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
              ? `${filtered.length} of ${participants.length}`
              : `${participants.length} in meeting`}
          </p>
          <ul className="participants-list" role="list">
            {filtered.length === 0 && (
              <li className="participants-empty muted">No matching participants.</li>
            )}
            {filtered.map((p) => (
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
        </div>
      )}
    </section>
  );
}
