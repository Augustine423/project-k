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
    <div className="control-bar">
      <button
        type="button"
        className={`control-btn ${audioEnabled ? "" : "off"}`}
        onClick={onToggleAudio}
        title={audioEnabled ? "Mute" : "Unmute"}
      >
        {audioEnabled ? "Mic on" : "Mic off"}
      </button>
      <button
        type="button"
        className={`control-btn ${videoEnabled ? "" : "off"}`}
        onClick={onToggleVideo}
        title={videoEnabled ? "Stop video" : "Start video"}
      >
        {videoEnabled ? "Cam on" : "Cam off"}
      </button>
      {showScreenShare && (
        <button type="button" className="control-btn" onClick={onShareScreen} title="Share screen">
          Share
        </button>
      )}
      <button type="button" className="control-btn danger" onClick={onLeave} title="Leave">
        Leave
      </button>
    </div>
  );
}
