// Mirrors the JSON shapes returned by the C# control plane
// (server/internal/rooms/types.go and related handlers).

export type RoomMode = "interactive" | "webinar";
export type ParticipantRole = "host" | "cohost" | "participant";

export interface Room {
  id: string;
  mode: RoomMode;
  janusNodeId: string;
  janusRoomId: string;
  maxParticipants: number;
  maxPublishers: number;
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

export interface TurnInfo {
  urls: string[];
  username: string;
  credential: string;
}

export interface JoinTicket {
  room: Room;
  participant: Participant;
  janusWsUrl: string;
  participantToken: string;
  janusJoinPin?: string;
  turn: TurnInfo;
}

export interface ApiError {
  error: string;
}
