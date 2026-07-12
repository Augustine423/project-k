// Mirrors the JSON shapes returned by the Go control plane
// (server/internal/rooms/types.go and related handlers).

export type RoomMode = "interactive";
export type ParticipantRole = "host" | "cohost" | "participant";

export interface Room {
  id: string;
  mode: RoomMode;
  livekitRoomName: string;
  maxParticipants: number;
  locked: boolean;
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

export interface JoinTicket {
  room: Room;
  participant: Participant;
  livekitUrl: string;
  livekitToken: string;
  participantToken: string;
  iceServers?: IceServer[];
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface ApiError {
  error: string;
}
