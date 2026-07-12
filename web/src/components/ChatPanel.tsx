import { useState } from "react";

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
}

export function ChatPanel({ messages, onSend, disabled, disabledHint }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <aside className="chat-panel">
      <h3>Chat</h3>
      <div className="chat-messages">
        {messages.length === 0 && <p className="chat-empty">No messages yet.</p>}
        {messages.map((msg) => (
          <div key={msg.id} className="chat-message">
            <strong>{msg.displayName}:</strong> {msg.message}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? (disabledHint ?? "Chat unavailable") : "Type a message"}
          disabled={disabled}
          maxLength={500}
        />
        <button type="submit" disabled={disabled || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
