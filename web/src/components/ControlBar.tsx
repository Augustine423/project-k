import {
  CameraIcon,
  ChatIcon,
  EndCallIcon,
  MicIcon,
  ParticipantsIcon,
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
  participantCount?: number;
  chatBadge?: number | string;
  onFocusParticipants?: () => void;
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
  participantCount = 0,
  chatBadge,
  onFocusParticipants,
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
              aria-pressed={audioEnabled}
              aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              <MicIcon muted={!audioEnabled} size={22} />
            </button>

            <button
              type="button"
              className={`dock-btn dock-btn-media ${videoEnabled ? "active" : "off"}`}
              onClick={onToggleVideo}
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
          onClick={onFocusParticipants}
          aria-label={`Participants, ${participantCount} in meeting`}
        >
          <ParticipantsIcon size={22} />
          {participantCount > 0 && <Badge value={participantCount} />}
        </button>

        <button
          type="button"
          className="dock-btn dock-btn-secondary"
          onClick={onFocusChat}
          aria-label="Open chat"
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
