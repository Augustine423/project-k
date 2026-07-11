import type { ApiError, JoinTicket, Participant, Room, ViewerJoinInfo } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    throw new ApiRequestError(res.status, body.error ?? `request failed (${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface CreateRoomInput {
  mode: "interactive" | "webinar";
  displayName: string;
  maxPublishers?: number;
  pin?: string;
}

export function createRoom(input: CreateRoomInput): Promise<JoinTicket> {
  return request("/api/rooms", { method: "POST", body: JSON.stringify(input) });
}

export interface JoinRoomInput {
  displayName: string;
  pin?: string;
}

export function joinRoom(roomId: string, input: JoinRoomInput): Promise<JoinTicket> {
  return request(`/api/rooms/${roomId}/join`, { method: "POST", body: JSON.stringify(input) });
}

export function getRoom(roomId: string): Promise<Room> {
  return request(`/api/rooms/${roomId}`);
}

export function listParticipants(roomId: string): Promise<Participant[]> {
  return request(`/api/rooms/${roomId}/participants`);
}

export function getViewerInfo(roomId: string): Promise<ViewerJoinInfo> {
  return request(`/api/rooms/${roomId}/webinar/viewer-info`);
}

export function endRoom(roomId: string, token: string): Promise<void> {
  return request(`/api/rooms/${roomId}/end`, { method: "POST", headers: authHeader(token) });
}

export function setRoomLocked(roomId: string, token: string, locked: boolean): Promise<void> {
  return request(`/api/rooms/${roomId}/lock`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ locked }),
  });
}

export function muteParticipant(
  roomId: string,
  token: string,
  participantId: string,
  mid: string,
  mute: boolean,
): Promise<void> {
  return request(`/api/rooms/${roomId}/participants/${participantId}/mute`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ mid, mute }),
  });
}

export function kickParticipant(roomId: string, token: string, participantId: string): Promise<void> {
  return request(`/api/rooms/${roomId}/participants/${participantId}/kick`, {
    method: "POST",
    headers: authHeader(token),
  });
}

export function forwardPublisherStreams(
  roomId: string,
  token: string,
  participantId: string,
  streams: { mid: string; type: "audio" | "video" }[],
): Promise<void> {
  return request(`/api/rooms/${roomId}/webinar/publishers/${participantId}/forward`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ streams }),
  });
}

export function sendChatMessage(
  roomId: string,
  token: string,
  displayName: string,
  message: string,
): Promise<void> {
  return request(`/api/rooms/${roomId}/chat`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ displayName, message }),
  });
}

export function wsUrlFor(roomId: string, token: string): string {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`;
}
