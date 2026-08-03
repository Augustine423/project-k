import {
  CameraIcon,
  ChatIcon,
  EndCallIcon,
  MicIcon,
  RaiseHandIcon,
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
  /** Show mic control (webinar attendees may unmute; interactive capacity may hide). */
  showAudioControl?: boolean;
  /** Show camera control (host/co-host in webinar; all publishers in interactive). */
  showVideoControl?: boolean;
  /** Webinar raise-hand signal (does not gate the mic). */
  showRaiseHand?: boolean;
  handRaised?: boolean;
  onToggleRaiseHand?: () => void;
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
  showAudioControl = true,
  showVideoControl = true,
  showRaiseHand = false,
  handRaised = false,
  onToggleRaiseHand,
  chatBadge,
  mediaBusy = false,
  onFocusChat,
}: ControlBarProps) {
  const hasMedia = showAudioControl || showVideoControl || showScreenShare;

  return (
    <div className="meeting-v2-control-bar-wrap">
      <div className="meeting-v2-control-bar" role="toolbar" aria-label="Meeting controls">
        {hasMedia && (
          <>
            {showAudioControl && (
              <button
                type="button"
                className={`meeting-v2-ctrl-btn ${audioEnabled ? "" : "is-off"}`}
                onClick={onToggleAudio}
                disabled={mediaBusy}
                aria-pressed={audioEnabled}
                aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                <MicIcon muted={!audioEnabled} size={22} />
              </button>
            )}

            {showVideoControl && (
              <button
                type="button"
                className={`meeting-v2-ctrl-btn ${videoEnabled ? "" : "is-off"}`}
                onClick={onToggleVideo}
                disabled={mediaBusy}
                aria-pressed={videoEnabled}
                aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
              >
                <CameraIcon off={!videoEnabled} size={22} />
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
              </button>
            )}

            <span className="meeting-v2-ctrl-divider" aria-hidden="true" />
          </>
        )}

        {showRaiseHand && onToggleRaiseHand && (
          <button
            type="button"
            className={`meeting-v2-ctrl-btn meeting-v2-ctrl-secondary ${handRaised ? "hand-raised" : ""}`}
            onClick={onToggleRaiseHand}
            aria-pressed={handRaised}
            aria-label={handRaised ? "Lower hand" : "Raise hand"}
            title={handRaised ? "Lower hand" : "Raise hand"}
          >
            <RaiseHandIcon size={22} />
          </button>
        )}

        <button
          type="button"
          className="meeting-v2-ctrl-btn meeting-v2-ctrl-secondary"
          onClick={onFocusChat}
          aria-label="Open chat and participants"
        >
          <ChatIcon size={22} />
          {chatBadge !== undefined && chatBadge !== 0 && (
            <Badge value={typeof chatBadge === "number" && chatBadge > 9 ? "9+" : chatBadge} />
          )}
        </button>

        <button
          type="button"
          className="meeting-v2-ctrl-btn meeting-v2-ctrl-secondary"
          aria-label="Reactions (coming soon)"
          title="Reactions — coming soon"
        >
          <ReactionsIcon size={22} />
        </button>

        <button type="button" className="meeting-v2-ctrl-btn meeting-v2-ctrl-end" onClick={onLeave} aria-label="End call">
          <EndCallIcon size={20} />
          <span className="meeting-v2-end-label">End Call</span>
        </button>
      </div>
    </div>
  );
}
