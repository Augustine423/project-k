import type { MeetingPanel } from "../components/ControlBar";
import type { Participant } from "../api/types";
import { LiveKitConference } from "../livekit/LiveKitConference";
import type { MediaSession } from "./normalizeJoinTicket";

export interface MediaConferenceProps {
  roomId: string;
  participantToken: string;
  session: MediaSession;
  displayName: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (message: string) => void;
  onStatus?: (message: string) => void;
  onLeave: () => void;
  participantCount?: number;
  /** Control-plane roster — seeds gallery boxes on refresh before LiveKit remotes arrive. */
  seedParticipants?: Participant[];
  selfParticipantId?: string;
  /** Guests-only count for the Participants dock badge (excludes host). */
  peopleBadgeCount?: number;
  chatBadge?: number | string;
  onFocusChat?: () => void;
  onFocusParticipants?: () => void;
  onFocusInvite?: () => void;
  activePanel?: MeetingPanel | null;
  roomMode?: string;
  participantRole?: string;
  hostParticipantId?: string;
  showRaiseHand?: boolean;
  handRaised?: boolean;
  onToggleRaiseHand?: () => void;
}

/**
 * Media conference entry — dispatches to the configured SFU client.
 * LiveKit today; add branches here when a second provider is wired.
 */
export function MediaConference(props: MediaConferenceProps) {
  const { session, ...rest } = props;

  switch (session.provider) {
    case "livekit":
    default:
      return (
        <LiveKitConference
          {...rest}
          liveKitUrl={session.url}
          liveKitToken={session.token}
          turn={session.turn}
        />
      );
  }
}
