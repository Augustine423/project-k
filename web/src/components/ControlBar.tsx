import {
  CameraIcon,
  ChatIcon,
  EndCallIcon,
  MicIcon,
  ParticipantsIcon,
  RaiseHandIcon,
  ReactionsIcon,
  SettingsIcon,
  ShareScreenIcon,
} from "./MediaIcons";
import type { SidePanelTab } from "./RoomSidePanel";

export type MeetingPanel = SidePanelTab;

interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onShareScreen: () => void;
  onLeave: () => void;
  showScreenShare?: boolean;
  showAudioControl?: boolean;
  showVideoControl?: boolean;
  showRaiseHand?: boolean;
  handRaised?: boolean;
  onToggleRaiseHand?: () => void;
  chatBadge?: number | string;
  participantCount?: number;
  /** Guests only (excludes host). Falls back to participantCount. */
  peopleBadgeCount?: number;
  mediaBusy?: boolean;
  onFocusChat?: () => void;
  onFocusParticipants?: () => void;
  onFocusInvite?: () => void;
  activePanel?: MeetingPanel | null;
}

function Badge({ value }: { value: number | string }) {
  return <span className="dock-badge">{value}</span>;
}

function InviteIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
      <path
        d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ControlBar({
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  onShareScreen,
  onLeave,
  showScreenShare = true,
  showAudioControl = true,
  showVideoControl = true,
  showRaiseHand = false,
  handRaised = false,
  onToggleRaiseHand,
  chatBadge,
  participantCount,
  peopleBadgeCount,
  mediaBusy = false,
  onFocusChat,
  onFocusParticipants,
  onFocusInvite,
  activePanel = null,
}: ControlBarProps) {
  const peopleBadge = peopleBadgeCount ?? participantCount;
  return (
    <div className="meeting-v2-control-bar-wrap">
      <div className="meeting-v2-control-bar" role="toolbar" aria-label="Meeting controls">
        {/* Desktop: display:contents → one horizontal row, End Call last.
            Mobile: this row stays horizontal; End Call sits centered underneath. */}
        <div className="meeting-v2-ctrl-main">
          {showAudioControl && (
            <button
              type="button"
              className={`meeting-v2-ctrl-btn ${audioEnabled ? "" : "is-off"}`}
              onClick={onToggleAudio}
              disabled={mediaBusy}
              aria-pressed={audioEnabled}
              aria-label={audioEnabled ? "Mute" : "Unmute"}
            >
              <MicIcon muted={!audioEnabled} size={22} />
              <span className="meeting-v2-ctrl-label">{audioEnabled ? "Mute" : "Unmute"}</span>
            </button>
          )}

          {showVideoControl && (
            <button
              type="button"
              className={`meeting-v2-ctrl-btn ${videoEnabled ? "is-on" : "is-off"}`}
              onClick={onToggleVideo}
              disabled={mediaBusy}
              aria-pressed={videoEnabled}
              aria-label={videoEnabled ? "Stop video" : "Start video"}
            >
              <CameraIcon off={!videoEnabled} size={22} />
              <span className="meeting-v2-ctrl-label">{videoEnabled ? "Stop Video" : "Start Video"}</span>
            </button>
          )}

          {showScreenShare && (
            <button
              type="button"
              className="meeting-v2-ctrl-btn"
              onClick={onShareScreen}
              disabled={mediaBusy}
              aria-label="Share screen"
            >
              <ShareScreenIcon size={22} />
              <span className="meeting-v2-ctrl-label">Share Screen</span>
            </button>
          )}

          {showRaiseHand && onToggleRaiseHand && (
            <button
              type="button"
              className={`meeting-v2-ctrl-btn ${handRaised ? "hand-raised is-active" : ""}`}
              onClick={onToggleRaiseHand}
              aria-pressed={handRaised}
              aria-label={handRaised ? "Lower hand" : "Raise hand"}
            >
              <RaiseHandIcon size={22} />
              <span className="meeting-v2-ctrl-label">Raise Hand</span>
            </button>
          )}

          {onFocusParticipants && (
            <button
              type="button"
              data-panel-toggle="participants"
              className={`meeting-v2-ctrl-btn ${activePanel === "participants" ? "is-active" : ""}`}
              onClick={onFocusParticipants}
              aria-pressed={activePanel === "participants"}
              aria-label={activePanel === "participants" ? "Hide participants" : "Show participants"}
            >
              <ParticipantsIcon size={22} />
              {peopleBadge != null && peopleBadge > 0 && (
                <Badge value={peopleBadge > 99 ? "99+" : peopleBadge} />
              )}
              <span className="meeting-v2-ctrl-label">Participants</span>
            </button>
          )}

          {onFocusChat && (
            <button
              type="button"
              data-panel-toggle="chat"
              className={`meeting-v2-ctrl-btn ${activePanel === "chat" ? "is-active" : ""}`}
              onClick={onFocusChat}
              aria-pressed={activePanel === "chat"}
              aria-label={activePanel === "chat" ? "Hide chat" : "Show chat"}
            >
              <ChatIcon size={22} />
              {chatBadge !== undefined && chatBadge !== 0 && (
                <Badge value={typeof chatBadge === "number" && chatBadge > 9 ? "9+" : chatBadge} />
              )}
              <span className="meeting-v2-ctrl-label">Chat</span>
            </button>
          )}

          {onFocusInvite && (
            <button
              type="button"
              data-panel-toggle="invite"
              className={`meeting-v2-ctrl-btn ${activePanel === "invite" ? "is-active" : ""}`}
              onClick={onFocusInvite}
              aria-pressed={activePanel === "invite"}
              aria-label={activePanel === "invite" ? "Hide invite" : "Share invite link"}
            >
              <InviteIcon size={22} />
              <span className="meeting-v2-ctrl-label">Invite</span>
            </button>
          )}

          <button
            type="button"
            className="meeting-v2-ctrl-btn"
            aria-label="Reactions"
            title="Reactions — coming soon"
          >
            <ReactionsIcon size={22} />
            <span className="meeting-v2-ctrl-label">React</span>
          </button>

          <button
            type="button"
            className="meeting-v2-ctrl-btn"
            aria-label="Settings"
            title="Settings — coming soon"
          >
            <SettingsIcon size={22} />
            <span className="meeting-v2-ctrl-label">Settings</span>
          </button>
        </div>

        <div className="meeting-v2-ctrl-end-row">
          <button
            type="button"
            className="meeting-v2-ctrl-btn meeting-v2-ctrl-end"
            onClick={onLeave}
            aria-label="End call"
          >
            <EndCallIcon size={20} />
            <span className="meeting-v2-ctrl-label meeting-v2-end-label">End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
