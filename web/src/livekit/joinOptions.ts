import type { RoomConnectOptions, RoomOptions } from "livekit-client";
import type { IceServer as ApiIceServer } from "../api/types";

/** Phase A room defaults: ABR + dynacast to protect CPU/bandwidth on SFU path. */
export const JOIN_NEVER_FAILS_ROOM_OPTIONS: Partial<RoomOptions> = {
  adaptiveStream: true,
  dynacast: true,
  disconnectOnPageLeave: true,
};

export function mapIceServers(servers?: ApiIceServer[]): RTCIceServer[] | undefined {
  if (!servers?.length) return undefined;
  return servers.map((s) => ({
    urls: s.urls,
    username: s.username,
    credential: s.credential,
  }));
}

export function buildConnectOptions(iceServers?: ApiIceServer[]): RoomConnectOptions {
  const rtcIce = mapIceServers(iceServers);
  return {
    maxRetries: 12,
    peerConnectionTimeout: 15_000,
    websocketTimeout: 10_000,
    ...(rtcIce
      ? {
          rtcConfig: {
            iceServers: rtcIce,
            iceTransportPolicy: "all",
          },
        }
      : {}),
  };
}

/** Prefer audio-first on mobile or save-data connections. */
export function shouldStartAudioOnly(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  if (conn?.saveData) return true;
  const effective = conn?.effectiveType;
  return effective === "slow-2g" || effective === "2g" || effective === "3g";
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}
