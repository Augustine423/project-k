import { useEffect, useRef, useState } from "react";
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
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  intentionalClose: boolean;
}

const shared = new Map<string, SharedSocket>();

const CLOSE_DEBOUNCE_MS = 300;
const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 15000;
const MAX_RECONNECT_ATTEMPTS = 10;

function reconnectDelayMs(attempt: number): number {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}

function emit(sock: SharedSocket, evt: RoomEvent) {
  for (const listener of sock.listeners) listener(evt);
}

function wireSocket(url: string, sock: SharedSocket) {
  const { ws } = sock;

  ws.onmessage = (msg) => {
    try {
      const evt = JSON.parse(msg.data as string) as RoomEvent;
      emit(sock, evt);
    } catch {
      // ignore malformed frames
    }
  };

  ws.onopen = () => {
    emit(sock, { type: "ws.open", data: null });
  };

  ws.onerror = () => {
    emit(sock, { type: "ws.error", data: null });
  };

  ws.onclose = (ev) => {
    if (shared.get(url)?.ws !== ws) return;
    emit(sock, { type: "ws.close", data: { code: ev.code, reason: ev.reason } });

    if (sock.intentionalClose || sock.listeners.size === 0) {
      shared.delete(url);
      return;
    }

    let attempt = 0;
    const tryReconnect = () => {
      if (sock.intentionalClose || sock.listeners.size === 0) return;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) return;
      attempt += 1;

      sock.reconnectTimer = setTimeout(() => {
        if (sock.intentionalClose || sock.listeners.size === 0) return;
        if (sock.ws.readyState === WebSocket.OPEN) return;

        const next = new WebSocket(url);
        sock.ws = next;
        wireSocket(url, sock);
      }, reconnectDelayMs(attempt));
    };
    tryReconnect();
  };
}

function scheduleClose(url: string, sock: SharedSocket) {
  if (sock.closeTimer) clearTimeout(sock.closeTimer);
  sock.closeTimer = setTimeout(() => {
    sock.closeTimer = null;
    const current = shared.get(url);
    if (!current || current.listeners.size > 0) return;
    current.intentionalClose = true;
    if (current.reconnectTimer) {
      clearTimeout(current.reconnectTimer);
      current.reconnectTimer = null;
    }
    if (current.ws.readyState === WebSocket.OPEN) {
      current.ws.close(1000, "no listeners");
    } else if (current.ws.readyState === WebSocket.CONNECTING) {
      current.ws.addEventListener(
        "open",
        () => {
          const live = shared.get(url);
          if (live && live.listeners.size === 0) live.ws.close(1000, "no listeners");
        },
        { once: true },
      );
    }
    shared.delete(url);
  }, CLOSE_DEBOUNCE_MS);
}

function acquire(url: string): SharedSocket {
  let sock = shared.get(url);
  if (sock && sock.ws.readyState <= WebSocket.OPEN) {
    if (sock.closeTimer) {
      clearTimeout(sock.closeTimer);
      sock.closeTimer = null;
    }
    sock.intentionalClose = false;
    return sock;
  }

  const ws = new WebSocket(url);
  sock = {
    ws,
    listeners: new Set(),
    closeTimer: null,
    reconnectTimer: null,
    intentionalClose: false,
  };
  shared.set(url, sock);
  wireSocket(url, sock);
  return sock;
}

/** Subscribes to the control plane's per-room event stream (presence, host
 * actions, chat) -- separate from the LiveKit SFU session. */
export function useRoomEvents(roomId: string, token: string, onEvent: (evt: RoomEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [chatReady, setChatReady] = useState(false);

  useEffect(() => {
    if (!roomId || !token) {
      setChatReady(false);
      return;
    }

    const url = wsUrlFor(roomId, token);
    const sock = acquire(url);

    const listener: Listener = (evt) => {
      if (evt.type === "ws.open") setChatReady(true);
      if (evt.type === "ws.close" || evt.type === "ws.error") setChatReady(false);
      onEventRef.current(evt);
    };
    sock.listeners.add(listener);

    if (sock.ws.readyState === WebSocket.OPEN) setChatReady(true);

    return () => {
      sock.listeners.delete(listener);
      if (sock.listeners.size === 0) {
        setChatReady(false);
        scheduleClose(url, sock);
      }
    };
  }, [roomId, token]);

  return { chatReady };
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
