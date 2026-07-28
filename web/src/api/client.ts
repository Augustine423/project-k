import type { ApiError, JoinTicket, Participant, Room, TurnInfo } from "./types";

/** Same-origin in dev (Vite proxy) so phones on the LAN hit the PC, not phone-localhost. */
function apiBase(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (!configured) return "";
  if (/localhost|127\.0\.0\.1/i.test(configured)) return "";
  const base = configured.replace(/\/$/, "");
  // HTTPS UI (Vite basicSsl) cannot call plain http:// API — browser blocks mixed content.
  if (typeof window !== "undefined" && window.location.protocol === "https:" && base.startsWith("http:")) {
    return "";
  }
  return base;
}

const API_URL = apiBase();

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
  displayName: string;
  maxUsers?: number;
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

export function kickParticipant(roomId: string, token: string, participantId: string): Promise<void> {
  return request(`/api/rooms/${roomId}/participants/${participantId}/kick`, {
    method: "POST",
    headers: authHeader(token),
  });
}

export function leaveRoom(roomId: string, token: string): Promise<void> {
  return request(`/api/rooms/${roomId}/leave`, {
    method: "POST",
    headers: authHeader(token),
  });
}

export interface MediaPresenceInput {
  publishing: boolean;
  audio: boolean;
  video: boolean;
}

export function reportMediaPresence(
  roomId: string,
  token: string,
  state: MediaPresenceInput,
): Promise<{ mode: string; listenerOnly: boolean }> {
  return request(`/api/rooms/${roomId}/media`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify(state),
  });
}

export function refreshTurnCredentials(roomId: string, token: string): Promise<TurnInfo> {
  return request(`/api/rooms/${roomId}/turn`, { headers: authHeader(token) });
}

export function wsUrlFor(roomId: string, token: string): string {
  if (!API_URL) {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${window.location.host}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`;
  }
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`;
}
