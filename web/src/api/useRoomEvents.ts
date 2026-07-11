import { useEffect, useRef } from "react";
import { wsUrlFor } from "./client";

export interface RoomEvent {
  type: string;
  data: unknown;
}

type Listener = (evt: RoomEvent) => void;

interface SharedSocket {
  ws: WebSocket;
  listeners: Set<Listener>;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

// One socket per room URL, shared across hook instances and StrictMode remounts.
const shared = new Map<string, SharedSocket>();

function scheduleClose(url: string, sock: SharedSocket) {
  if (sock.closeTimer) clearTimeout(sock.closeTimer);
  // Defer so React StrictMode's mount→unmount→mount cycle can re-subscribe
  // before we tear the socket down.
  sock.closeTimer = setTimeout(() => {
    sock.closeTimer = null;
    const current = shared.get(url);
    if (!current || current.listeners.size > 0) return;
    if (current.ws.readyState === WebSocket.OPEN) {
      current.ws.close();
    } else if (current.ws.readyState === WebSocket.CONNECTING) {
      current.ws.addEventListener(
        "open",
        () => {
          const live = shared.get(url);
          if (live && live.listeners.size === 0) live.ws.close();
        },
        { once: true },
      );
    }
    shared.delete(url);
  }, 0);
}

function acquire(url: string): SharedSocket {
  let sock = shared.get(url);
  if (sock && sock.ws.readyState <= WebSocket.OPEN) {
    if (sock.closeTimer) {
      clearTimeout(sock.closeTimer);
      sock.closeTimer = null;
    }
    return sock;
  }

  const ws = new WebSocket(url);
  sock = { ws, listeners: new Set(), closeTimer: null };
  shared.set(url, sock);

  ws.onmessage = (msg) => {
    try {
      const evt = JSON.parse(msg.data as string) as RoomEvent;
      for (const listener of sock!.listeners) listener(evt);
    } catch {
      // ignore malformed frames
    }
  };

  ws.onclose = () => {
    if (shared.get(url)?.ws === ws) shared.delete(url);
  };

  return sock;
}

/** Subscribes to the control plane's per-room event stream (presence, host
 * actions, chat) -- separate from the Janus WebSocket, which only carries
 * WebRTC signaling. See server/internal/wshub for the server side. */
export function useRoomEvents(roomId: string, token: string, onEvent: (evt: RoomEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!roomId || !token) return;

    const url = wsUrlFor(roomId, token);
    const sock = acquire(url);

    const listener: Listener = (evt) => onEventRef.current(evt);
    sock.listeners.add(listener);

    return () => {
      sock.listeners.delete(listener);
      if (sock.listeners.size === 0) scheduleClose(url, sock);
    };
  }, [roomId, token]);
}

/** Send a typed message to the control plane over the room WebSocket. */
export function sendRoomEvent(
  roomId: string,
  token: string,
  type: string,
  data: unknown,
): void {
  if (!roomId || !token) throw new Error("room not connected");
  const url = wsUrlFor(roomId, token);
  const sock = shared.get(url);
  if (!sock || sock.ws.readyState !== WebSocket.OPEN) {
    throw new Error("room WebSocket not connected");
  }
  sock.ws.send(JSON.stringify({ type, data }));
}

export function sendRoomChat(
  roomId: string,
  token: string,
  displayName: string,
  message: string,
): void {
  sendRoomEvent(roomId, token, "chat.send", { displayName, message });
}
