import {
  CameraIcon,
  ChatIcon,
  EndCallIcon,
  MicIcon,
  ReactionsIcon,
  ShareScreenIcon,
} from "./MediaIcons";

interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onShareScreen: () => void;
  onLeave: () => void;
  showScreenShare?: boolean;
  /** Hide mic/camera when joined as webinar listener */
  showMediaControls?: boolean;
  chatBadge?: number | string;
  /** Disable mic/camera/screen while a device toggle is in progress. */
  mediaBusy?: boolean;
  onFocusChat?: () => void;
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
  showMediaControls = true,
  chatBadge,
  mediaBusy = false,
  onFocusChat,
}: ControlBarProps) {
  return (
    <div className="control-dock-wrap">
      <div className="control-dock" role="toolbar" aria-label="Meeting controls">
        {showMediaControls && (
          <>
            <button
              type="button"
              className={`dock-btn dock-btn-media ${audioEnabled ? "active" : "off"}`}
              onClick={onToggleAudio}
              disabled={mediaBusy}
              aria-pressed={audioEnabled}
              aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              <MicIcon muted={!audioEnabled} size={22} />
            </button>

            <button
              type="button"
              className={`dock-btn dock-btn-media ${videoEnabled ? "active" : "off"}`}
              onClick={onToggleVideo}
              disabled={mediaBusy}
              aria-pressed={videoEnabled}
              aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
            >
              <CameraIcon off={!videoEnabled} size={22} />
            </button>

            {showScreenShare && (
              <button
                type="button"
                className="dock-btn dock-btn-media active"
                onClick={onShareScreen}
                disabled={mediaBusy}
                aria-label="Share screen"
              >
                <ShareScreenIcon size={22} />
              </button>
            )}

            <span className="dock-divider" aria-hidden="true" />
          </>
        )}

        {!showMediaControls && showScreenShare && (
          <>
            <span className="dock-divider" aria-hidden="true" />
          </>
        )}

        <button
          type="button"
          className="dock-btn dock-btn-secondary"
          onClick={onFocusChat}
          aria-label="Open chat and people"
        >
          <ChatIcon size={22} />
          {chatBadge !== undefined && chatBadge !== 0 && (
            <Badge value={typeof chatBadge === "number" && chatBadge > 9 ? "9+" : chatBadge} />
          )}
        </button>

        <button
          type="button"
          className="dock-btn dock-btn-secondary"
          aria-label="Reactions (coming soon)"
          title="Reactions — coming soon"
        >
          <ReactionsIcon size={22} />
        </button>

        <button type="button" className="dock-btn dock-btn-end" onClick={onLeave} aria-label="Leave meeting">
          <EndCallIcon size={24} />
        </button>
      </div>
    </div>
  );
}
