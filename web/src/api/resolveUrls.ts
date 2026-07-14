import type { JoinTicket } from "./types";

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function rewriteHost(url: string, targetHost: string): string {
  try {
    const parsed = new URL(url);
    if (isLoopbackHost(parsed.hostname)) {
      parsed.hostname = targetHost;
      return parsed.toString();
    }
  } catch {
    return url.replace(/localhost|127\.0\.0\.1/g, targetHost);
  }
  return url;
}

/** Hostname the browser can reach (LAN IP when opened from a phone on Wi‑Fi). */
export function clientReachableHost(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname;
}

function devProxiedJanusUrl(): string | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${window.location.host}/janus`;
}

/** Rewrite loopback Janus / TURN URLs so mobile clients on the LAN can connect. */
export function resolveJoinTicketMedia(
  ticket: JoinTicket,
): Pick<JoinTicket, "janusWsUrl" | "turn"> {
  const proxied = devProxiedJanusUrl();
  const host = clientReachableHost();

  if (proxied) {
    return {
      janusWsUrl: proxied,
      turn: isLoopbackHost(host)
        ? ticket.turn
        : {
            ...ticket.turn,
            urls: ticket.turn.urls.map((url) => rewriteHost(url, host)),
          },
    };
  }

  if (isLoopbackHost(host)) {
    return { janusWsUrl: ticket.janusWsUrl, turn: ticket.turn };
  }

  return {
    janusWsUrl: rewriteHost(ticket.janusWsUrl, host),
    turn: {
      ...ticket.turn,
      urls: ticket.turn.urls.map((url) => rewriteHost(url, host)),
    },
  };
}
