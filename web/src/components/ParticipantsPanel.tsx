import { useMemo, useState } from "react";
import type { Participant } from "../api/types";
import { MicMutedSmall } from "./MediaIcons";

interface ParticipantsPanelProps {
  participants: Participant[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isHost?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onKick?: (participantId: string) => void;
  hostBusy?: boolean;
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

export function ParticipantsPanel({
  participants,
  collapsed = false,
  onToggleCollapse,
  isHost,
  locked,
  onToggleLock,
  onKick,
  hostBusy,
}: ParticipantsPanelProps) {
  const [query, setQuery] = useState("");

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

  return (
    <section className={`side-panel participants-panel ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="side-panel-header"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
      >
        <span className="side-panel-title">Participants ({participants.length})</span>
        <span className="side-panel-chevron" aria-hidden="true">
          {collapsed ? "▾" : "▴"}
        </span>
      </button>
      {!collapsed && (
        <div className="side-panel-body participants-panel-body">
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
