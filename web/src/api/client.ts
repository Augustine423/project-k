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

/** Max chat rows kept in meeting UI memory (large webinar safety). */
export const MAX_CHAT_MESSAGES = 500;

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

export interface AuthUserDto {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  needsUsername: boolean;
}

export interface AuthSessionDto {
  token: string;
  user: AuthUserDto;
}

/** Normalize C# PascalCase or camelCase auth payloads. */
function normalizeAuthUser(raw: Record<string, unknown>): AuthUserDto {
  const id = String(raw.id ?? raw.Id ?? "");
  const email = String(raw.email ?? raw.Email ?? "");
  const usernameRaw = raw.username ?? raw.Username;
  const fullNameRaw = raw.fullName ?? raw.FullName;
  const username = usernameRaw == null || usernameRaw === "" ? null : String(usernameRaw);
  const fullName = fullNameRaw == null || fullNameRaw === "" ? null : String(fullNameRaw);
  const needs =
    typeof raw.needsUsername === "boolean"
      ? raw.needsUsername
      : typeof raw.NeedsUsername === "boolean"
        ? (raw.NeedsUsername as boolean)
        : !username;
  return { id, email, username, fullName, needsUsername: needs };
}

function normalizeAuthSession(raw: Record<string, unknown>): AuthSessionDto {
  const token = String(raw.token ?? raw.Token ?? "");
  const userRaw = (raw.user ?? raw.User ?? {}) as Record<string, unknown>;
  return { token, user: normalizeAuthUser(userRaw) };
}

export function signUpAccount(input: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<AuthSessionDto> {
  return request<Record<string, unknown>>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      displayName: input.fullName,
    }),
  }).then(normalizeAuthSession);
}

export function loginAccount(input: { email: string; password: string }): Promise<AuthSessionDto> {
  return request<Record<string, unknown>>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeAuthSession);
}

export function fetchAuthMe(token: string): Promise<AuthUserDto> {
  return request<Record<string, unknown>>("/api/auth/me", {
    headers: authHeader(token),
  }).then(normalizeAuthUser);
}

export function setAuthUsername(token: string, username: string): Promise<AuthUserDto> {
  return request<Record<string, unknown>>("/api/auth/username", {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ username }),
  }).then(normalizeAuthUser);
}

export function checkAuthAccountExists(email: string): Promise<{ email: string; found: boolean }> {
  return request<Record<string, unknown>>("/api/auth/exists", {
    method: "POST",
    body: JSON.stringify({ email }),
  }).then((raw) => ({
    email: String(raw.email ?? raw.Email ?? email).toLowerCase(),
    found: Boolean(raw.found ?? raw.Found),
  }));
}

export function resetAuthPassword(email: string, newPassword: string): Promise<void> {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, newPassword }),
  });
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

export interface ParticipantsPage {
  items: Participant[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export function listParticipantsPage(
  roomId: string,
  params?: { offset?: number; limit?: number; q?: string },
): Promise<ParticipantsPage> {
  const search = new URLSearchParams();
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  return request(`/api/rooms/${roomId}/participants${qs ? `?${qs}` : ""}`);
}

/** @deprecated Prefer listParticipantsPage for large rooms. */
export async function listParticipants(roomId: string): Promise<Participant[]> {
  const page = await listParticipantsPage(roomId, { offset: 0, limit: 200 });
  return page.items;
}

export function getParticipantCount(roomId: string): Promise<{ count: number }> {
  return request(`/api/rooms/${roomId}/participants/count`);
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

export function setRoomMode(
  roomId: string,
  token: string,
  mode: "interactive" | "webinar",
  pin = true,
): Promise<{ mode: string; maxPublishers: number; modePinned: boolean }> {
  return request(`/api/rooms/${roomId}/mode`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ mode, pin }),
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
): Promise<{
  mode: string;
  listenerOnly: boolean;
  canPublishAudio: boolean;
  canPublishVideo: boolean;
}> {
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
