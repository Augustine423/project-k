// Mirrors the JSON shapes returned by the C# control plane API.

export type RoomMode = "interactive" | "webinar";
export type ParticipantRole = "host" | "cohost" | "participant";

export interface Room {
  id: string;
  mode: RoomMode;
  maxParticipants: number;
  maxPublishers: number;
  locked: boolean;
  modePinned?: boolean;
  createdAt: string;
  hostParticipantId: string;
}

export interface Participant {
  id: string;
  roomId: string;
  displayName: string;
  role: ParticipantRole;
  approved: boolean;
  joinedAt: string;
}

export interface TurnInfo {
  urls: string[];
  username: string;
  credential: string;
}

export interface DeviceBandwidthHint {
  uplinkKbps: number;
  downlinkKbps: number;
  batterySaver: boolean;
  isMobile: boolean;
  isPortrait: boolean;
}

export interface JoinTicket {
  room: Room;
  participant: Participant;
  /** Legacy LiveKit field names — always present from API today. */
  liveKitUrl: string;
  liveKitToken: string;
  /** Forward-compatible SFU fields (optional until API adds them explicitly). */
  mediaUrl?: string;
  mediaToken?: string;
  mediaProvider?: string;
  deviceHint?: DeviceBandwidthHint;
  participantToken: string;
  turn: TurnInfo;
}

export interface ApiError {
  error: string;
}
