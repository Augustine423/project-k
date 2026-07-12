import { CameraIcon, LeaveIcon, MicIcon, ShareScreenIcon } from "./MediaIcons";

interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onShareScreen: () => void;
  onLeave: () => void;
  showScreenShare?: boolean;
}

export function ControlBar({
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  onShareScreen,
  onLeave,
  showScreenShare = true,
}: ControlBarProps) {
  return (
    <div className="control-bar" role="toolbar" aria-label="Meeting controls">
      <button
        type="button"
        className={`control-btn ${audioEnabled ? "" : "off"}`}
        onClick={onToggleAudio}
        aria-pressed={audioEnabled}
        aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        <span className="control-icon" aria-hidden="true">
          <MicIcon muted={!audioEnabled} />
        </span>
        <span className="control-label">{audioEnabled ? "Mic on" : "Mic off"}</span>
      </button>
      <button
        type="button"
        className={`control-btn ${videoEnabled ? "" : "off"}`}
        onClick={onToggleVideo}
        aria-pressed={videoEnabled}
        aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
      >
        <span className="control-icon" aria-hidden="true">
          <CameraIcon off={!videoEnabled} />
        </span>
        <span className="control-label">{videoEnabled ? "Camera on" : "Camera off"}</span>
      </button>
      {showScreenShare && (
        <button
          type="button"
          className="control-btn"
          onClick={onShareScreen}
          aria-label="Share screen"
        >
          <span className="control-icon" aria-hidden="true">
            <ShareScreenIcon />
          </span>
          <span className="control-label">Share</span>
        </button>
      )}
      <button type="button" className="control-btn danger" onClick={onLeave} aria-label="Leave meeting">
        <span className="control-icon" aria-hidden="true">
          <LeaveIcon />
        </span>
        <span className="control-label">Leave</span>
      </button>
    </div>
  );
}
