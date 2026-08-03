import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { getInitials } from "../hooks/useAuth";
import { MoreIcon } from "./MediaIcons";

interface MeetingHeaderProps {
  statusMessage: string;
  connected?: boolean;
  displayName?: string;
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
}: MeetingHeaderProps) {
  const clock = useClock();

  return (
    <header className="meeting-v2-header">
      <div className="meeting-v2-header-left">
        <Link to="/dashboard" className="meeting-v2-brand">
          <BrandLogo size={32} variant="light" />
        </Link>
        <span className="meeting-v2-clock">{clock}</span>
        <span
          className={`meeting-v2-status-dot ${connected ? "online" : "offline"}`}
          title={statusMessage}
        />
      </div>

      <div className="meeting-v2-header-right">
        <span className="meeting-v2-status-text">{statusMessage}</span>
        <button type="button" className="meeting-v2-icon-btn" aria-label="More options">
          <MoreIcon size={20} />
        </button>
        <span className="meeting-v2-user-name">{displayName}</span>
        <div className="meeting-v2-avatar" aria-hidden="true">
          {getInitials(displayName)}
        </div>
      </div>
    </header>
  );
}
