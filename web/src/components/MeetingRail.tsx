import type { SidePanelTab } from "./RoomSidePanel";
import { ChatIcon, ParticipantsIcon, ReactionsIcon } from "./MediaIcons";

interface MeetingRailProps {
  activeTab: SidePanelTab | null;
  panelOpen: boolean;
  chatBadge?: number | string;
  participantCount: number;
  onOpenChat: () => void;
  onOpenParticipants: () => void;
  onClosePanel: () => void;
}

export function MeetingRail({
  activeTab,
  panelOpen,
  chatBadge,
  participantCount,
  onOpenChat,
  onOpenParticipants,
  onClosePanel,
}: MeetingRailProps) {
  return (
    <nav className="meeting-rail" aria-label="Meeting tools">
      <button
        type="button"
        className={`meeting-rail-btn is-chat ${panelOpen && activeTab === "chat" ? "is-active" : ""}`}
        onClick={() => (panelOpen && activeTab === "chat" ? onClosePanel() : onOpenChat())}
        aria-pressed={panelOpen && activeTab === "chat"}
        aria-label="Chat"
        title="Chat"
      >
        <ChatIcon size={20} />
        {chatBadge !== undefined && chatBadge !== 0 && (
          <span className="meeting-rail-badge">
            {typeof chatBadge === "number" && chatBadge > 9 ? "9+" : chatBadge}
          </span>
        )}
      </button>
      <button
        type="button"
        className={`meeting-rail-btn is-participants ${panelOpen && activeTab === "participants" ? "is-active" : ""}`}
        onClick={() =>
          panelOpen && activeTab === "participants" ? onClosePanel() : onOpenParticipants()
        }
        aria-pressed={panelOpen && activeTab === "participants"}
        aria-label="Participants"
        title="Participants"
      >
        <ParticipantsIcon size={20} />
        <span className="meeting-rail-count">{participantCount}</span>
      </button>
      <button
        type="button"
        className="meeting-rail-btn is-reactions"
        aria-label="Reactions"
        title="Reactions — coming soon"
      >
        <ReactionsIcon size={20} />
      </button>
      <button
        type="button"
        className="meeting-rail-btn is-settings"
        aria-label="Settings"
        title="Settings — coming soon"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 3.5v2.2M12 18.3v2.2M4.9 7.1l1.6 1.6M17.5 15.3l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 16.9l1.6-1.6M17.5 8.7l1.6-1.6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </nav>
  );
}
