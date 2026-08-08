import type { ViewerViewportMode } from "../hooks/useViewerViewport";

/**
 * Meet-like + Jitsi tile layouts — user picks via floating Grid button.
 * gallery / standard / extended = aspect mosaic; jitsi = fill-cell tile view;
 * activeSpeaker / stage = featured + strip.
 */
export type ConferenceLayoutMode =
  | "gallery"
  | "standard"
  | "extended"
  | "jitsi"
  | "activeSpeaker"
  | "stage";

export const LAYOUT_STORAGE_KEY = "mm.layoutMode";
export const DEFAULT_LAYOUT_MODE: ConferenceLayoutMode = "gallery";

export const LAYOUT_MODE_OPTIONS: ReadonlyArray<{
  id: ConferenceLayoutMode;
  label: string;
  description: string;
}> = [
  { id: "gallery", label: "Gallery", description: "Equal tiles, balanced" },
  { id: "standard", label: "Standard", description: "Fewer, larger tiles" },
  { id: "extended", label: "Extended", description: "More people on screen" },
  { id: "jitsi", label: "Jitsi grid", description: "Fill-the-stage equal tiles" },
  { id: "activeSpeaker", label: "Active speaker", description: "Focus on who’s talking" },
  { id: "stage", label: "Stage", description: "Host & share up front" },
];

export type StreamAspect = "portrait" | "landscape" | "square" | "unknown";

/** How a tile should render a stream inside its cell. */
export type TileFitMode = "cover" | "contain" | "contain-blur";

export type GridDensity = "roomy" | "cozy" | "dense";

/** @deprecated use GridDensity */
export type MosaicDensity = GridDensity;

const LAYOUT_MODES = new Set<string>(LAYOUT_MODE_OPTIONS.map((o) => o.id));

export function isConferenceLayoutMode(value: string): value is ConferenceLayoutMode {
  return LAYOUT_MODES.has(value);
}

export function readStoredLayoutMode(): ConferenceLayoutMode {
  if (typeof window === "undefined") return DEFAULT_LAYOUT_MODE;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw === "mosaic") return DEFAULT_LAYOUT_MODE;
    if (raw && isConferenceLayoutMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT_MODE;
}

export function persistLayoutMode(mode: ConferenceLayoutMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function isEqualGridMode(mode: ConferenceLayoutMode): boolean {
  return mode === "gallery" || mode === "standard" || mode === "extended";
}

export function isJitsiGridMode(mode: ConferenceLayoutMode): boolean {
  return mode === "jitsi";
}

/** Max tiles per page (local + remotes). */
export function layoutPageSize(mode: ConferenceLayoutMode): number {
  switch (mode) {
    case "standard":
      return 16;
    case "gallery":
      return 25;
    case "extended":
    case "jitsi":
      return 50;
    case "activeSpeaker":
    case "stage":
      return 50;
  }
}

/** Remotes allowed on one page so local + remotes ≤ page size. */
export function layoutRemotesPerPage(mode: ConferenceLayoutMode): number {
  return Math.max(1, layoutPageSize(mode) - 1);
}

/**
 * Prefer stored / explicit user choice. Legacy callers without a mode get Gallery.
 */
export function resolveConferenceLayout(
  _viewerMode?: ViewerViewportMode,
  _tileCount = 1,
  preferred?: ConferenceLayoutMode,
): ConferenceLayoutMode {
  return preferred ?? DEFAULT_LAYOUT_MODE;
}

export function resolveGridDensity(
  tileCount: number,
  mode: ConferenceLayoutMode,
): GridDensity {
  if (mode === "standard") return "roomy";
  if (mode === "extended" || mode === "jitsi") return "dense";
  const n = Math.max(1, tileCount);
  if (n <= 4) return "roomy";
  if (n <= 16) return "cozy";
  return "dense";
}

/** @deprecated use resolveGridDensity */
export function resolveMosaicDensity(tileCount: number): GridDensity {
  return resolveGridDensity(tileCount, "gallery");
}

/**
 * Column count for equal grids — Standard fewer cols, Extended denser, Gallery balanced.
 */
export function resolveEqualGridColumns(
  tileCount: number,
  mode: ConferenceLayoutMode,
  viewerMode?: ViewerViewportMode,
): number {
  const pageCap = layoutPageSize(mode);
  const n = Math.max(1, Math.min(Math.round(tileCount), pageCap));
  if (n <= 1) return 1;

  if (mode === "standard") {
    if (viewerMode === "mobile-portrait") {
      if (n <= 2) return 1;
      if (n <= 4) return 2;
      return 2;
    }
    if (n <= 2) return 2;
    if (n <= 4) return 2;
    if (n <= 9) return 3;
    return 4;
  }

  if (mode === "extended") {
    if (viewerMode === "mobile-portrait") {
      if (n <= 2) return 2;
      if (n <= 6) return 3;
      return 4;
    }
    if (viewerMode === "mobile-landscape") {
      if (n <= 4) return 4;
      if (n <= 12) return 5;
      return 6;
    }
    if (n <= 4) return 2;
    if (n <= 9) return 3;
    if (n <= 16) return 4;
    if (n <= 25) return 5;
    if (n <= 36) return 6;
    if (n <= 49) return 7;
    return 8;
  }

  // gallery (default balanced)
  return resolveMosaicColumns(n, viewerMode);
}

/**
 * Jitsi-style columns: near-square packing that fills the stage.
 * Mobile portrait stays 1–2 cols; landscape/desktop scale with count.
 */
export function resolveJitsiColumns(
  tileCount: number,
  viewerMode?: ViewerViewportMode,
): number {
  const n = Math.max(1, Math.min(Math.round(tileCount), 50));
  if (n <= 1) return 1;

  if (viewerMode === "mobile-portrait") {
    if (n === 2) return 1;
    if (n <= 4) return 2;
    if (n <= 9) return 3;
    return 3;
  }

  if (viewerMode === "mobile-landscape") {
    if (n === 2) return 2;
    if (n <= 4) return 2;
    if (n <= 6) return 3;
    if (n <= 12) return 4;
    return 5;
  }

  // Desktop / tablet — classic Jitsi sqrt packing
  if (n === 2) return 2;
  if (n === 3) return 2;
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
  return 8;
}

/**
 * Pick column count so the grid stays near-square and readable.
 * Used by Gallery and as a shared helper.
 */
export function resolveMosaicColumns(
  tileCount: number,
  viewerMode?: ViewerViewportMode,
): number {
  const n = Math.max(1, Math.min(Math.round(tileCount), 50));
  if (n <= 1) return 1;

  if (viewerMode === "mobile-portrait") {
    if (n <= 2) return 2;
    if (n <= 4) return 2;
    if (n <= 9) return 3;
    return 4;
  }

  if (viewerMode === "mobile-landscape") {
    if (n === 2) return 2;
    if (n === 3) return 3;
    if (n <= 6) return 3;
    if (n <= 12) return 4;
    if (n <= 20) return 5;
    return 6;
  }

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
  return 8;
}

export function classifyStreamAspect(width: number, height: number): StreamAspect {
  if (width <= 0 || height <= 0) return "unknown";
  const ratio = width / height;
  if (ratio >= 0.92 && ratio <= 1.08) return "square";
  if (ratio < 0.92) return "portrait";
  return "landscape";
}

/**
 * Camera tiles use contain-blur so faces/content are never cropped.
 * A blurred cover layer fills letterbox bars (Meet-style).
 * Screen share still uses plain contain via fit override.
 */
export function resolveTileFit(opts: {
  streamAspect: StreamAspect;
  layout: ConferenceLayoutMode;
  size: "grid" | "spotlight" | "strip";
}): TileFitMode {
  void opts.streamAspect;
  void opts.layout;
  void opts.size;
  return "contain-blur";
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
  preferredAspect?: StreamAspect;
};

export function isHostTile(
  tile: StageParticipantTile,
  hostParticipantId?: string,
  localId = "local",
): boolean {
  if (tile.isScreenShare) return false;
  if (hostParticipantId && tile.id === hostParticipantId) return true;
  if (tile.id === localId) {
    return tile.roleBadge === "Host" || tile.roleBadge === "Co-host";
  }
  return tile.roleBadge === "Host" || tile.roleBadge === "Co-host";
}

/** Prefer screen share alone when present (no camera+share duo). Else host. */
export function pickHostScreenFeatured(
  tiles: StageParticipantTile[],
  hostParticipantId?: string,
): StageParticipantTile[] {
  if (tiles.length <= 1) return [];
  const screen = tiles.find((t) => t.isScreenShare && t.hasVideo) ?? null;
  if (screen) return [screen];
  const host = tiles.find((t) => isHostTile(t, hostParticipantId)) ?? null;
  if (host) return [host];
  return [];
}

/**
 * Active speaker primary: screen alone if sharing; else speaking / host / first camera.
 */
export function pickActiveSpeakerFeatured(
  tiles: StageParticipantTile[],
  opts: {
    hostParticipantId?: string;
    activeSpeakerIds?: readonly string[];
    localIdentity?: string;
    localId?: string;
  } = {},
): StageParticipantTile[] {
  const screen = tiles.find((t) => t.isScreenShare && t.hasVideo);
  if (screen) return [screen];

  const localId = opts.localId ?? "local";
  const speakers = opts.activeSpeakerIds ?? [];
  for (const id of speakers) {
    if (opts.localIdentity && id === opts.localIdentity) {
      const local = tiles.find((t) => t.id === localId && !t.isScreenShare);
      if (local) return [local];
    }
    const byId = tiles.find((t) => !t.isScreenShare && t.id === id);
    if (byId) return [byId];
  }

  const host = tiles.find((t) => isHostTile(t, opts.hostParticipantId));
  if (host) return [host];
  const firstCam = tiles.find((t) => !t.isScreenShare);
  return firstCam ? [firstCam] : tiles.slice(0, 1);
}

/** Order tiles with screen first, then host, then self, then others. */
export function orderStageTiles(
  tiles: StageParticipantTile[],
  opts: { hostParticipantId?: string; localId?: string } = {},
): StageParticipantTile[] {
  const { hostParticipantId, localId = "local" } = opts;
  const rank = (t: StageParticipantTile) => {
    if (t.isScreenShare) return 0;
    if (isHostTile(t, hostParticipantId, localId)) return 1;
    if (t.id === localId) return 2;
    return 3;
  };
  return [...tiles].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.label.localeCompare(b.label);
  });
}

/** @deprecated alias */
export const orderMosaicTiles = orderStageTiles;
/** @deprecated alias */
export const orderGalleryTiles = orderStageTiles;

export function layoutDataCount(tileCount: number, maxPerPage = 50): number {
  return Math.min(Math.max(tileCount, 1), maxPerPage);
}

/** @deprecated use layoutDataCount */
export function mosaicDataCount(tileCount: number, maxPerPage = 50): number {
  return layoutDataCount(tileCount, maxPerPage);
}
