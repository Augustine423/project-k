import {
  CameraIcon,
  ChatIcon,
  EndCallIcon,
  MicIcon,
  NoiseCancelIcon,
  ParticipantsIcon,
  RaiseHandIcon,
  ReactionsIcon,
  ShareScreenIcon,
} from "./MediaIcons";
import type { SidePanelTab } from "./RoomSidePanel";
import { LayoutPicker } from "./conference/LayoutPicker";
import type { ConferenceLayoutMode } from "../media/conferenceLayout";

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
  /** Enhanced NC (DTLN) — Meet Krisp / Jitsi noise-suppress analogue. */
  showNoiseCancel?: boolean;
  noiseCancelEnabled?: boolean;
  onToggleNoiseCancel?: () => void;
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
  inviteOpen?: boolean;
  activePanel?: MeetingPanel | null;
  layoutMode?: ConferenceLayoutMode;
  onLayoutChange?: (mode: ConferenceLayoutMode) => void;
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
  showNoiseCancel = false,
  noiseCancelEnabled = false,
  onToggleNoiseCancel,
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
  inviteOpen = false,
  activePanel = null,
  layoutMode,
  onLayoutChange,
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

          {showAudioControl && showNoiseCancel && onToggleNoiseCancel && (
            <button
              type="button"
              className={`meeting-v2-ctrl-btn ${noiseCancelEnabled ? "is-active" : ""}`}
              onClick={onToggleNoiseCancel}
              disabled={mediaBusy}
              aria-pressed={noiseCancelEnabled}
              aria-label={
                noiseCancelEnabled
                  ? "Disable extra noise suppression"
                  : "Extra noise suppression"
              }
              title={
                noiseCancelEnabled
                  ? "Disable extra noise suppression"
                  : "Extra noise suppression"
              }
            >
              {/* Jitsi: full bars when off; slashed bars when on (toggledIcon). */}
              <NoiseCancelIcon off={noiseCancelEnabled} size={22} />
              <span className="meeting-v2-ctrl-label">
                {noiseCancelEnabled ? "Noise On" : "Noise Off"}
              </span>
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

          {layoutMode && onLayoutChange && (
            <LayoutPicker
              layoutMode={layoutMode}
              onLayoutChange={onLayoutChange}
              variant="dock"
            />
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
              className={`meeting-v2-ctrl-btn ${inviteOpen ? "is-active" : ""}`}
              onClick={onFocusInvite}
              aria-pressed={inviteOpen}
              aria-label={inviteOpen ? "Hide share" : "Share meeting link"}
              data-share-toggle
            >
              <InviteIcon size={22} />
              <span className="meeting-v2-ctrl-label">Share</span>
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
