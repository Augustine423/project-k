import type { ViewerViewportMode } from "../hooks/useViewerViewport";

/** Stage presentation — equal grid for every viewer (host and client). */
export type ConferenceLayoutMode = "gallery";

export type StreamAspect = "portrait" | "landscape" | "square" | "unknown";

/** How a tile should render a stream inside its cell. */
export type TileFitMode = "cover" | "contain" | "contain-blur";

export function resolveConferenceLayout(_viewerMode?: ViewerViewportMode): ConferenceLayoutMode {
  return "gallery";
}

export function classifyStreamAspect(width: number, height: number): StreamAspect {
  if (width <= 0 || height <= 0) return "unknown";
  const ratio = width / height;
  if (ratio >= 0.92 && ratio <= 1.08) return "square";
  if (ratio < 0.92) return "portrait";
  return "landscape";
}

/**
 * Fit from *source camera* aspect. Viewers never stretch portrait↔landscape.
 * Bandwidth only changes which simulcast layer is downloaded — not the aspect.
 */
export function resolveTileFit(opts: {
  streamAspect: StreamAspect;
  layout: ConferenceLayoutMode;
  size: "grid" | "spotlight" | "strip";
}): TileFitMode {
  const { streamAspect } = opts;

  if (streamAspect === "portrait") return "contain-blur";
  if (streamAspect === "square") return "contain";
  return "cover";
}

export type StageParticipantTile = {
  id: string;
  label: string;
  stream: MediaStream | null;
  trackSignature?: string;
  mirror?: boolean;
  hasVideo?: boolean;
  roleBadge?: string;
  isSpeaking?: boolean;
  isScreenShare?: boolean;
};

/**
 * Prefer screen share, then loudest active speaker, then host, then first remote, then local.
 */
export function pickPrimaryTileId(opts: {
  tiles: StageParticipantTile[];
  activeSpeakerIds: string[];
  hostParticipantId?: string;
  localId?: string;
}): string {
  const { tiles, activeSpeakerIds, hostParticipantId, localId = "local" } = opts;
  if (!tiles.length) return localId;

  const byId = new Map(tiles.map((t) => [t.id, t]));
  const remotes = tiles.filter((t) => t.id !== localId);

  const screen =
    remotes.find((t) => t.isScreenShare && t.hasVideo) ??
    tiles.find((t) => t.isScreenShare && t.hasVideo);
  if (screen) return screen.id;

  for (const id of activeSpeakerIds) {
    if (id !== localId && byId.has(id)) return id;
  }

  if (hostParticipantId && hostParticipantId !== localId && byId.has(hostParticipantId)) {
    return hostParticipantId;
  }

  if (remotes[0]) return remotes[0].id;
  return tiles[0].id;
}

/** CSS data-count for gallery: clamp to a sensible grid key (1–25). */
export function galleryDataCount(tileCount: number, maxPerPage: number): number {
  return Math.min(Math.max(tileCount, 1), maxPerPage + 1, 25);
}
