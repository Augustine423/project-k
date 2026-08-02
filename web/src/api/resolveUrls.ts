import type { JoinTicket } from "./types";
import { normalizeJoinTicket, type MediaSession } from "../media/normalizeJoinTicket";
import { clientReachableHost, isLoopbackHost } from "./resolveUrlsHost";

export { clientReachableHost };

function isPrivateLanHost(host: string): boolean {
  if (isLoopbackHost(host)) return false;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(host);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function rewriteHost(url: string, targetHost: string): string {
  try {
    const parsed = new URL(url);
    if (isLoopbackHost(parsed.hostname) || isPrivateLanHost(parsed.hostname)) {
      parsed.hostname = targetHost;
      return parsed.toString();
    }
  } catch {
    return url.replace(/localhost|127\.0\.0\.1|192\.168\.\d+\.\d+/g, targetHost);
  }
  return url;
}

function rewriteTurn(ticket: JoinTicket, turnHost: string): JoinTicket["turn"] {
  return {
    ...ticket.turn,
    urls: ticket.turn.urls.map((url) => rewriteHost(url, turnHost)),
  };
}

/**
 * Rewrite SFU / TURN URLs for this browser. Same-origin stacks proxy /livekit.
 */
export function resolveJoinTicketMedia(ticket: JoinTicket): MediaSession {
  const base = normalizeJoinTicket(ticket);
  const host = clientReachableHost();
  const useSameOriginProxy =
    typeof window !== "undefined" && !import.meta.env.VITE_API_URL;

  if (useSameOriginProxy) {
    const secure = window.location.protocol === "https:";
    const url = `${secure ? "wss" : "ws"}://${window.location.host}/livekit`;
    const turnHost = isLoopbackHost(host) ? "localhost" : host;
    return { ...base, url, turn: rewriteTurn(ticket, turnHost) };
  }

  if (isLoopbackHost(host)) {
    return base;
  }

  return {
    ...base,
    url: rewriteHost(base.url, host),
    turn: rewriteTurn(ticket, host),
  };
}
