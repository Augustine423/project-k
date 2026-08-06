import type { ViewerViewportMode } from "../hooks/useViewerViewport";

/**
 * Stage presentation:
 * - gallery — equal grid (solo / fallback)
 * - spotlight — desktop Meet style: primary + bottom filmstrip
 * - mobile-stack — mobile client: primary on top + 2-col grid below
 */
export type ConferenceLayoutMode = "gallery" | "spotlight" | "mobile-stack";

export type StreamAspect = "portrait" | "landscape" | "square" | "unknown";

/** How a tile should render a stream inside its cell. `cover` kept for API compat but unused. */
export type TileFitMode = "cover" | "contain" | "contain-blur";

export function resolveConferenceLayout(viewerMode?: ViewerViewportMode): ConferenceLayoutMode {
  if (viewerMode === "mobile-portrait" || viewerMode === "mobile-landscape") {
    return "mobile-stack";
  }
  return "spotlight";
}

export function classifyStreamAspect(width: number, height: number): StreamAspect {
  if (width <= 0 || height <= 0) return "unknown";
  const ratio = width / height;
  if (ratio >= 0.92 && ratio <= 1.08) return "square";
  if (ratio < 0.92) return "portrait";
  return "landscape";
}

/**
 * Preserve source camera aspect with dark letterbox — never crop.
 */
export function resolveTileFit(_opts: {
  streamAspect: StreamAspect;
  layout: ConferenceLayoutMode;
  size: "grid" | "spotlight" | "strip";
}): TileFitMode {
  return "contain";
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
 * Prefer screen share, then (for hosts) self large, then loudest active speaker,
 * then room host feed, then first remote, then local.
 */
export function pickPrimaryTileId(opts: {
  tiles: StageParticipantTile[];
  activeSpeakerIds: string[];
  hostParticipantId?: string;
  localId?: string;
  /** Host/room-creator viewer: keep self as the large primary tile. */
  preferLocalSelf?: boolean;
}): string {
  const {
    tiles,
    activeSpeakerIds,
    hostParticipantId,
    localId = "local",
    preferLocalSelf = false,
  } = opts;
  if (!tiles.length) return localId;

  const byId = new Map(tiles.map((t) => [t.id, t]));
  const remotes = tiles.filter((t) => t.id !== localId);

  const screen =
    remotes.find((t) => t.isScreenShare && t.hasVideo) ??
    tiles.find((t) => t.isScreenShare && t.hasVideo);
  if (screen) return screen.id;

  // Host UI: self stays large; clients sit in the filmstrip / 2-col grid.
  if (preferLocalSelf && byId.has(localId)) {
    return localId;
  }

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

/** Split primary vs secondary tiles for spotlight / mobile-stack. */
export function splitPrimaryAndRest(
  tiles: StageParticipantTile[],
  primaryId: string,
): { primary: StageParticipantTile; rest: StageParticipantTile[] } {
  const primary =
    tiles.find((t) => t.id === primaryId) ??
    tiles[0] ??
    ({ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false } satisfies StageParticipantTile);
  const rest = tiles.filter((t) => t.id !== primary.id);
  return { primary, rest };
}
