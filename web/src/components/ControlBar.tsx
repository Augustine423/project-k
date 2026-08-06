import {
  CameraIcon,
  ChatIcon,
  EndCallIcon,
  MicIcon,
  ParticipantsIcon,
  RaiseHandIcon,
  ReactionsIcon,
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
  mediaBusy?: boolean;
  onFocusChat?: () => void;
  onFocusParticipants?: () => void;
  onFocusInvite?: () => void;
  activePanel?: MeetingPanel | null;
}

function Badge({ value }: { value: number | string }) {
  return <span className="dock-badge">{value}</span>;
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
  mediaBusy = false,
  onFocusChat,
  onFocusParticipants,
  onFocusInvite,
  activePanel = null,
}: ControlBarProps) {
  return (
    <div className="meeting-v2-control-bar-wrap">
      <div className="meeting-v2-control-bar" role="toolbar" aria-label="Meeting controls">
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

        <button type="button" className="meeting-v2-ctrl-btn meeting-v2-ctrl-end" onClick={onLeave} aria-label="End call">
          <EndCallIcon size={20} />
          <span className="meeting-v2-ctrl-label meeting-v2-end-label">End Call</span>
        </button>

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
            aria-label={activePanel === "invite" ? "Hide share" : "Share invite"}
          >
            <ShareScreenIcon size={22} />
            <span className="meeting-v2-ctrl-label">Share</span>
          </button>
        )}

        <button
          type="button"
          className="meeting-v2-ctrl-btn"
          aria-label="More options"
          title="More — coming soon"
        >
          <ReactionsIcon size={22} />
          <span className="meeting-v2-ctrl-label">More</span>
        </button>
      </div>
    </div>
  );
}
