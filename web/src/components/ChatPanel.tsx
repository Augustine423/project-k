import { useEffect, useRef, useState } from "react";
import { ChatIcon } from "./MediaIcons";

export interface ChatMessage {
  id: string;
  displayName: string;
  message: string;
  at: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  disabled?: boolean;
  disabledHint?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  selfName?: string;
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

export function ChatPanel({
  messages,
  onSend,
  disabled,
  disabledHint,
  collapsed = false,
  onToggleCollapse,
  selfName,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el || collapsed) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, collapsed]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section className={`side-panel chat-panel ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="side-panel-header"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
      >
        <span className="side-panel-title">
          <ChatIcon size={18} />
          Chat
        </span>
        <span className="side-panel-chevron" aria-hidden="true">
          {collapsed ? "▾" : "▴"}
        </span>
      </button>
      {!collapsed && (
        <div className="side-panel-body chat-panel-body">
          <div className="chat-messages" ref={messagesRef}>
            {messages.length === 0 && <p className="chat-empty">No messages yet. Say hello!</p>}
            {messages.map((msg) => {
              const isSelf = selfName && msg.displayName === selfName;
              return (
                <div
                  key={msg.id}
                  className={`chat-bubble-row ${isSelf ? "self" : "other"}`}
                >
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
              placeholder={disabled ? (disabledHint ?? "Chat unavailable") : "Type a message…"}
              disabled={disabled}
              maxLength={500}
              aria-label="Chat message"
            />
            <button type="submit" disabled={disabled || !draft.trim()} aria-label="Send message">
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
