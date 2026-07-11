// Persists a JoinTicket in sessionStorage keyed by room ID, so a page
// refresh inside the room doesn't lose the participant's token/turn creds
// (re-joining would mint a new participant identity, which we want to avoid
// for the common "accidentally hit refresh" case).
import type { JoinTicket } from "./types";

function key(roomId: string): string {
  return `projectk.ticket.${roomId}`;
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
}
