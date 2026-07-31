import { useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { MoreIcon, SettingsIcon, SignalIcon } from "../components/MediaIcons";

interface MeetingHeaderProps {
  statusMessage: string;
  connected?: boolean;
  live?: boolean;
  viewerCount?: number;
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

function formatViewerCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function MeetingHeader({
  statusMessage,
  connected = true,
  live = false,
  viewerCount = 0,
  onSettings,
}: MeetingHeaderProps) {
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

      <div className="meeting-header-center" aria-live="polite">
        <span className={`live-badge ${live ? "is-live" : "is-offline"}`} title={live ? "Live" : statusMessage}>
          <span className="live-badge-dot" aria-hidden="true" />
          LIVE
        </span>
        {viewerCount > 0 && (
          <span className="live-viewer-count" title={`${viewerCount} watching`}>
            <svg className="live-viewer-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 5c-7.6 0-10 7-10 7s2.4 7 10 7 10-7 10-7-2.4-7-10-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-7.2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4Z"
              />
            </svg>
            <strong>{formatViewerCount(viewerCount)}</strong>
            <span className="live-viewer-label">watching</span>
          </span>
        )}
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
