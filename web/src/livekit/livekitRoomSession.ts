import { ConnectionState, Room } from "livekit-client";
import { createLiveKitRoomOptions } from "./livekitVideoSettings";

type Session = {
  room: Room;
  refCount: number;
};

const sessions = new Map<string, Session>();

/** Keep one SFU Room per session key for the whole page visit. */
export function retainLiveKitRoom(sessionKey: string): Room {
  const existing = sessions.get(sessionKey);
  if (existing && existing.room.state !== ConnectionState.Disconnected) {
    existing.refCount += 1;
    return existing.room;
  }
  const room = new Room(createLiveKitRoomOptions());
  sessions.set(sessionKey, { room, refCount: 1 });
  return room;
}

/** Drop a UI subscriber — does NOT disconnect (avoids cam/mic flicker on React remount). */
export function releaseLiveKitRoom(sessionKey: string): void {
  const sess = sessions.get(sessionKey);
  if (!sess) return;
  sess.refCount = Math.max(0, sess.refCount - 1);
}

export function forceDisconnectLiveKitRoom(sessionKey: string): void {
  const sess = sessions.get(sessionKey);
  if (!sess) return;
  sessions.delete(sessionKey);
  sess.room.removeAllListeners();
  if (sess.room.state !== ConnectionState.Disconnected) {
    void sess.room.disconnect(true);
  }
}

export function getLiveKitRoom(sessionKey: string): Room | null {
  return sessions.get(sessionKey)?.room ?? null;
}
