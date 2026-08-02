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
 * Same-origin stacks (Vite dev, nginx compose prod, K8s Gateway) proxy /livekit.
 */
export function resolveJoinTicketMedia(
  ticket: JoinTicket,
): Pick<JoinTicket, "liveKitUrl" | "turn"> {
  const host = clientReachableHost();
  const useSameOriginProxy =
    typeof window !== "undefined" && !import.meta.env.VITE_API_URL;

  if (useSameOriginProxy) {
    const secure = window.location.protocol === "https:";
    const liveKitUrl = `${secure ? "wss" : "ws"}://${window.location.host}/livekit`;
    // Keep server-issued TURN host when it is already a public/LB IP (K8s coturn
    // is not on the web LoadBalancer). Only rewrite loopback/LAN for compose.
    const turnHost = isLoopbackHost(host) ? LOCAL_DEV_HOST : host;
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
