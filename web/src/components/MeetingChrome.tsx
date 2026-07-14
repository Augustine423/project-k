import { useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { MoreIcon, SettingsIcon, SignalIcon } from "../components/MediaIcons";

interface MeetingHeaderProps {
  statusMessage: string;
  connected?: boolean;
  onSettings?: () => void;
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

export function MeetingHeader({ statusMessage, connected = true, onSettings }: MeetingHeaderProps) {
  const clock = useClock();

  return (
    <header className="meeting-header">
      <div className="meeting-header-left">
        <BrandLogo size={34} />
        <span className="meeting-clock">{clock}</span>
        <span className={`meeting-signal ${connected ? "online" : "offline"}`} title={statusMessage}>
          <SignalIcon size={16} />
        </span>
      </div>
      <div className="meeting-header-right">
        <span className="meeting-status">{statusMessage}</span>
        <button type="button" className="icon-btn" aria-label="More options">
          <MoreIcon size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings}>
          <SettingsIcon size={20} />
        </button>
      </div>
    </header>
  );
}
