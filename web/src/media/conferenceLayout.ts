import type { ViewerViewportMode } from "../hooks/useViewerViewport";

/**
 * Single stage mode for host + client (web & mobile):
 * equal-priority “breathing mosaic” — no spotlight / filmstrip / stack.
 */
export type ConferenceLayoutMode = "mosaic";

export type StreamAspect = "portrait" | "landscape" | "square" | "unknown";

/** How a tile should render a stream inside its cell. */
export type TileFitMode = "cover" | "contain" | "contain-blur";

export type MosaicDensity = "roomy" | "cozy" | "dense";

/** Always mosaic — layout no longer branches on count or device. */
export function resolveConferenceLayout(
  _viewerMode?: ViewerViewportMode,
  _tileCount = 1,
): ConferenceLayoutMode {
  return "mosaic";
}

/**
 * Pick column count so the grid stays near-square and readable.
 * Mobile portrait caps columns; desktop can go wider up to 50 tiles.
 */
export function resolveMosaicColumns(
  tileCount: number,
  viewerMode?: ViewerViewportMode,
): number {
  const n = Math.max(1, Math.min(Math.round(tileCount), 50));
  if (n <= 1) return 1;

  // Portrait phones — fewer, larger tiles; scroll when dense.
  if (viewerMode === "mobile-portrait") {
    if (n <= 2) return 2;
    if (n <= 4) return 2;
    if (n <= 9) return 3;
    return 4;
  }

  // Landscape phones / small tablets.
  if (viewerMode === "mobile-landscape") {
    if (n === 2) return 2;
    if (n === 3) return 3;
    if (n <= 6) return 3;
    if (n <= 12) return 4;
    if (n <= 20) return 5;
    return 6;
  }

  // Desktop / host web — near-square presence (Meet-inspired packing).
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 2;
  if (n <= 6) return 3;
  if (n <= 9) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 4;
  if (n <= 20) return 5;
  if (n <= 25) return 5;
  if (n <= 30) return 6;
  if (n <= 36) return 6;
  if (n <= 42) return 7;
  if (n <= 49) return 7;
  return 8; // 50 → 8×7
}

export function resolveMosaicDensity(tileCount: number): MosaicDensity {
  const n = Math.max(1, tileCount);
  if (n <= 4) return "roomy";
  if (n <= 16) return "cozy";
  return "dense";
}

export function classifyStreamAspect(width: number, height: number): StreamAspect {
  if (width <= 0 || height <= 0) return "unknown";
  const ratio = width / height;
  if (ratio >= 0.92 && ratio <= 1.08) return "square";
  if (ratio < 0.92) return "portrait";
  return "landscape";
}

/**
 * Portrait / phone: cover inside the 9:16 tile (unchanged — mobile logic).
 * Laptop / tablet landscape: contain inside a 16:9 tile so the full camera is visible.
 */
export function resolveTileFit(opts: {
  streamAspect: StreamAspect;
  layout: ConferenceLayoutMode;
  size: "grid" | "spotlight" | "strip";
}): TileFitMode {
  if (opts.streamAspect === "portrait" || opts.streamAspect === "square") {
    return "cover";
  }
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
  /**
   * Publisher hint (mobile phone → portrait). Wins over decoded WxH for tile
   * chrome so phone cameras stay 9:16 on desktop viewers even if the browser
   * negotiated a landscape buffer.
   */
  preferredAspect?: StreamAspect;
};

/** Order mosaic tiles with host first, then self, then others (A–Z). */
export function orderMosaicTiles(
  tiles: StageParticipantTile[],
  opts: { hostParticipantId?: string; localId?: string } = {},
): StageParticipantTile[] {
  const { hostParticipantId, localId = "local" } = opts;
  const rank = (t: StageParticipantTile) => {
    if (t.isScreenShare) return 0;
    if (preferHost(t, hostParticipantId, localId)) return 1;
    if (t.id === localId) return 2;
    return 3;
  };
  return [...tiles].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.label.localeCompare(b.label);
  });
}

/** @deprecated alias — prefer orderMosaicTiles */
export const orderGalleryTiles = orderMosaicTiles;

function preferHost(
  tile: StageParticipantTile,
  hostParticipantId: string | undefined,
  localId: string,
): boolean {
  if (hostParticipantId && tile.id === hostParticipantId) return true;
  if (tile.id === localId && (tile.roleBadge === "Host" || tile.roleBadge === "Co-host")) return true;
  if (tile.roleBadge === "Host") return true;
  return false;
}

/** Visible mosaic count key (1–50) for CSS density / debugging. */
export function mosaicDataCount(tileCount: number, maxPerPage = 50): number {
  return Math.min(Math.max(tileCount, 1), maxPerPage);
}
