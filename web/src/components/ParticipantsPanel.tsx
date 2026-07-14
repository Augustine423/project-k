import { useMemo, useState } from "react";
import type { Participant } from "../api/types";
import { MicMutedSmall } from "./MediaIcons";
import { VirtualScrollList } from "./VirtualScrollList";

/** Matches .participant-row virtual scroll slot height in style.css */
export const PARTICIPANT_ROW_HEIGHT = 48;

interface ParticipantsPanelProps {
  participants: Participant[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isHost?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onKick?: (participantId: string) => void;
  hostBusy?: boolean;
  /** Webinar audience UI — emphasize name list over video gallery. */
  webinarMode?: boolean;
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
  webinarMode = false,
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

  const speakers = useMemo(
    () => sorted.filter((p) => p.role === "host" || p.role === "cohost"),
    [sorted],
  );

  return (
    <section className={`side-panel participants-panel ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="side-panel-header"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
      >
        <span className="side-panel-title">
          Participants ({participants.length})
          {webinarMode && participants.length > 50 && (
            <span className="participants-webinar-badge">Webinar</span>
          )}
        </span>
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
              : webinarMode && speakers.length > 0
                ? `${speakers.length} speakers · ${participants.length} total`
                : `${participants.length} in meeting`}
          </p>
          <VirtualScrollList
            items={filtered}
            rowHeight={PARTICIPANT_ROW_HEIGHT}
            rowKey={(p) => p.id}
            className="participants-virtual-list"
            empty={<p className="muted participants-empty">No matching participants.</p>}
            renderRow={(p) => (
              <div className="participant-row">
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
              </div>
            )}
          />
        </div>
      )}
    </section>
  );
}
