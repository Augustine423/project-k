import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
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
  searchValue?: string;
  onSearchChange?: (query: string) => void;
  onSearchFocus?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
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

function useElapsed() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const total = Math.floor((now - start) / 1000);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
}

function FullscreenIcon({ exit, size = 16 }: { exit: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
      <path
        d={exit ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  searchValue = "",
  onSearchChange,
  onSearchFocus,
  isFullscreen = false,
  onToggleFullscreen,
}: MeetingHeaderProps) {
  const clock = useClock();
  const elapsed = useElapsed();

  return (
    <header className="meeting-v2-header">
      <div className="meeting-v2-header-left">
        <Link to="/dashboard" className="meeting-v2-brand" aria-label="Back to dashboard">
          <BrandLogo size={28} />
        </Link>
        <div className="meeting-v2-meta">
          <span className="meeting-v2-title">Meeting{roomId ? ` · ${roomId.slice(0, 8)}` : ""}</span>
          <span className="meeting-v2-clock" title={`Local time ${clock}`}>{elapsed}</span>
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
              aria-controls="meeting-invite"
            >
              <ShareIcon />
              <span className="meeting-v2-share-label">Share</span>
            </button>
          </div>
        )}
        {onToggleFullscreen && (
          <button
            type="button"
            className="meeting-v2-fullscreen"
            onClick={onToggleFullscreen}
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            <FullscreenIcon exit={isFullscreen} />
          </button>
        )}
        <span className="meeting-v2-user-name">{displayName}</span>
        <div className="meeting-v2-avatar" aria-hidden="true">
          {getInitials(displayName)}
        </div>
      </div>
    </header>
  );
}
