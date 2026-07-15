import type { JoinTicket } from "./types";

const LOCAL_DEV_HOST = "localhost";

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

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

/** Hostname the browser can reach (LAN IP when opened from a phone on Wi‑Fi). */
export function clientReachableHost(): string {
  if (typeof window === "undefined") return LOCAL_DEV_HOST;
  return window.location.hostname;
}

function rewriteTurn(ticket: JoinTicket, turnHost: string): JoinTicket["turn"] {
  return {
    ...ticket.turn,
    urls: ticket.turn.urls.map((url) => rewriteHost(url, turnHost)),
  };
}

/**
 * Rewrite LiveKit / TURN so this browser can reach them.
 * Dev: signal via Vite same-origin `/livekit` proxy (works on phone LAN + HTTPS).
 */
export function resolveJoinTicketMedia(
  ticket: JoinTicket,
): Pick<JoinTicket, "liveKitUrl" | "turn"> {
  const host = clientReachableHost();

  if (import.meta.env.DEV && typeof window !== "undefined") {
    const secure = window.location.protocol === "https:";
    const liveKitUrl = `${secure ? "wss" : "ws"}://${window.location.host}/livekit`;
    // Phones must use the LAN host for TURN/STUN, not localhost.
    const turnHost = isLoopbackHost(host) ? LOCAL_DEV_HOST : host;
    // #region agent log
    fetch("/__agent_debug", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5d65c5" },
      body: JSON.stringify({
        sessionId: "5d65c5",
        runId: "mobile-fix",
        hypothesisId: "M1",
        location: "resolveUrls.ts:resolveJoinTicketMedia",
        message: "resolved LiveKit URL for client",
        data: {
          ticketUrl: ticket.liveKitUrl,
          resolvedUrl: liveKitUrl,
          turnHost,
          pageHost: window.location.host,
          pageProtocol: window.location.protocol,
          turnUrls: rewriteTurn(ticket, turnHost).urls,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => undefined);
    // #endregion
    return { liveKitUrl, turn: rewriteTurn(ticket, turnHost) };
  }

  if (isLoopbackHost(host)) {
    return { liveKitUrl: ticket.liveKitUrl, turn: ticket.turn };
  }

  return {
    liveKitUrl: rewriteHost(ticket.liveKitUrl, host),
    turn: rewriteTurn(ticket, host),
  };
}
