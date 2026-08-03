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
  onShare?: () => void;
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

export function MeetingHeader({
  statusMessage,
  connected = true,
  displayName = "Guest",
  participantCount,
  roomMode,
  onShare,
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
          <span className="sr-only">Search</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input type="search" placeholder="Search" disabled title="Coming soon" />
        </label>
        {onShare && (
          <button type="button" className="meeting-v2-share" onClick={onShare}>
            Share
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
