// Persists a JoinTicket in sessionStorage keyed by room ID, so a page
// refresh inside the room doesn't lose the participant's token/turn creds
// (re-joining would mint a new participant identity, which we want to avoid
// for the common "accidentally hit refresh" case).
import type { JoinTicket, Participant } from "./types";

function key(roomId: string): string {
  return `projectk.ticket.${roomId}`;
}

function rosterKey(roomId: string): string {
  return `projectk.roster.${roomId}`;
}

export type CachedRoster = {
  total: number;
  items: Participant[];
};

export function saveCachedRoster(roomId: string, roster: CachedRoster): void {
  if (!roomId) return;
  try {
    sessionStorage.setItem(
      rosterKey(roomId),
      JSON.stringify({
        total: Math.max(1, roster.total),
        items: roster.items.slice(0, 200),
      }),
    );
  } catch {
    // quota / private mode
  }
}

export function getCachedRoster(roomId: string): CachedRoster | null {
  if (!roomId) return null;
  const raw = sessionStorage.getItem(rosterKey(roomId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedRoster;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      total: Math.max(1, Number(parsed.total) || parsed.items.length || 1),
      items: parsed.items.filter((p) => p && typeof p.id === "string"),
    };
  } catch {
    return null;
  }
}

export function saveTicket(ticket: JoinTicket): void {
  sessionStorage.setItem(key(ticket.room.id), JSON.stringify(ticket));
}

export function getTicket(roomId: string): JoinTicket | null {
  const raw = sessionStorage.getItem(key(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JoinTicket;
  } catch {
    return null;
  }
}

export function clearTicket(roomId: string): void {
  sessionStorage.removeItem(key(roomId));
  sessionStorage.removeItem(rosterKey(roomId));
}
