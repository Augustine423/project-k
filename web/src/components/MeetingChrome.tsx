import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { ShareInvitePopover } from "./ShareInvitePopover";
import { getInitials } from "../hooks/useAuth";

interface MeetingHeaderProps {
  statusMessage: string;
  connected?: boolean;
  displayName?: string;
  participantCount?: number;
  roomMode?: string;
  roomId?: string;
  shareOpen?: boolean;
  onShare?: () => void;
  onCloseShare?: () => void;
  searchValue?: string;
  onSearchChange?: (query: string) => void;
  onSearchFocus?: () => void;
}

function useClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return time;
}

function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8.4 13.2l7.2 4.2M15.6 6.6l-7.2 4.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function MeetingHeader({
  statusMessage,
  connected = true,
  displayName = "Guest",
  participantCount,
  roomMode,
  roomId = "",
  shareOpen = false,
  onShare,
  onCloseShare,
  searchValue = "",
  onSearchChange,
  onSearchFocus,
}: MeetingHeaderProps) {
  const clock = useClock();

  return (
    <header className="meeting-v2-header">
      <div className="meeting-v2-header-left">
        <Link to="/dashboard" className="meeting-v2-brand" aria-label="Back to dashboard">
          <BrandLogo size={28} />
        </Link>
        <div className="meeting-v2-meta">
          <span className="meeting-v2-clock">{clock}</span>
          <span
            className={`meeting-v2-status-dot ${connected ? "online" : "offline"}`}
            title={statusMessage}
          />
          {roomMode && (
            <span className="meeting-v2-mode">{roomMode === "webinar" ? "Webinar" : "Meeting"}</span>
          )}
          {participantCount != null && (
            <span className="meeting-v2-count">{participantCount}</span>
          )}
        </div>
      </div>

      <div className="meeting-v2-header-right">
        <label className="meeting-v2-search">
          <span className="sr-only">Search participants</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search people…"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onFocus={() => onSearchFocus?.()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchFocus?.();
              }
            }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search people in this meeting"
          />
        </label>
        {onShare && (
          <div className="meeting-v2-share-wrap">
            <button
              type="button"
              className={`meeting-v2-share ${shareOpen ? "is-open" : ""}`}
              data-share-toggle
              onClick={onShare}
              aria-expanded={shareOpen}
              aria-haspopup="dialog"
            >
              <ShareIcon />
              <span className="meeting-v2-share-label">Share</span>
            </button>
            {roomId && (
              <ShareInvitePopover roomId={roomId} open={shareOpen} onClose={() => onCloseShare?.()} />
            )}
          </div>
        )}
        <span className="meeting-v2-user-name">{displayName}</span>
        <div className="meeting-v2-avatar" aria-hidden="true">
          {getInitials(displayName)}
        </div>
      </div>
    </header>
  );
}
