import type { JoinTicket, TurnInfo } from "../api/types";

/** Provider-agnostic media session passed to the conference UI. */
export interface MediaSession {
  url: string;
  token: string;
  provider: string;
  turn: TurnInfo;
}

/** Normalize API ticket — supports legacy liveKit* and future media* fields. */
export function normalizeJoinTicket(ticket: JoinTicket): MediaSession {
  const url =
    ticket.mediaUrl ??
    ticket.liveKitUrl;
  const token =
    ticket.mediaToken ??
    ticket.liveKitToken;
  const provider = ticket.mediaProvider ?? "livekit";

  return { url, token, provider, turn: ticket.turn };
}
