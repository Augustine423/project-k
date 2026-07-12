import {
  ConnectionState,
  Room,
  type RoomConnectOptions,
} from "livekit-client";
import { JOIN_NEVER_FAILS_ROOM_OPTIONS } from "./joinOptions";

type SessionEntry = {
  room: Room;
  refs: number;
  connectTask: Promise<void> | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
};

const sessions = new Map<string, SessionEntry>();

/** Debounce teardown so React remounts / Vite HMR do not flap the SFU session. */
const RELEASE_DEBOUNCE_MS = 1500;

function getOrCreateEntry(sessionKey: string): SessionEntry {
  let entry = sessions.get(sessionKey);
  if (!entry) {
    entry = {
      room: new Room(JOIN_NEVER_FAILS_ROOM_OPTIONS),
      refs: 0,
      connectTask: null,
      releaseTimer: null,
    };
    sessions.set(sessionKey, entry);
  }
  return entry;
}

export async function acquireLiveKitSession(
  sessionKey: string,
  serverUrl: string,
  token: string,
  connectOptions: RoomConnectOptions,
): Promise<Room> {
  const entry = getOrCreateEntry(sessionKey);

  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }

  entry.refs += 1;

  if (entry.room.state === ConnectionState.Disconnected) {
    if (!entry.connectTask) {
      entry.connectTask = entry.room
        .connect(serverUrl, token, connectOptions)
        .finally(() => {
          entry.connectTask = null;
        });
    }
    await entry.connectTask;
  }

  return entry.room;
}

export function releaseLiveKitSession(sessionKey: string): void {
  const entry = sessions.get(sessionKey);
  if (!entry) return;

  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0) return;

  if (entry.releaseTimer) clearTimeout(entry.releaseTimer);

  entry.releaseTimer = setTimeout(() => {
    entry.releaseTimer = null;
    const current = sessions.get(sessionKey);
    if (!current || current.refs > 0) return;

    sessions.delete(sessionKey);
    if (current.room.state !== ConnectionState.Disconnected) {
      void current.room.disconnect(true);
    }
  }, RELEASE_DEBOUNCE_MS);
}

/** Force immediate leave (user clicked Leave). */
export async function forceDisconnectSession(sessionKey: string): Promise<void> {
  const entry = sessions.get(sessionKey);
  if (!entry) return;

  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }

  sessions.delete(sessionKey);
  if (entry.room.state !== ConnectionState.Disconnected) {
    await entry.room.disconnect(true);
  }
}
