import type { ViewerViewportMode } from "../hooks/useViewerViewport";
import { GALLERY_PAGE_SIZE } from "./galleryVideoPolicy";
import {
  packGalleryFreeformSlots,
  galleryFreeformStripUnits,
  type GalleryBoxKind,
} from "./galleryFreeformLayout";
import {
  GALLERY_SIZE_LOCK,
  resolveGalleryCountLayout,
  type GalleryCountShape,
} from "./galleryCountLayout";
import {
  meetPackSlots,
  meetStripUnits,
  meetUseSingleRow,
  resolveMeetFilmstrip,
} from "./meetFilmstripLayout";

/**
 * MeetingMax conference layouts — user picks via Grid button.
 *
 * References (project-k):
 * - `gallery` — centered 1:1 / 9:16 pretty flex gallery (host + guest).
 * - `sidebar` — project-k/index.html main-stage: large host + right participant
 *   strip (chat/menu column width); chat overlays that strip.
 */

export type ConferenceLayoutMode = "gallery" | "sidebar";

export const LAYOUT_STORAGE_KEY = "mm.layoutMode";
export const DEFAULT_LAYOUT_MODE: ConferenceLayoutMode = "gallery";

export const LAYOUT_MODE_OPTIONS: ReadonlyArray<{
  id: ConferenceLayoutMode;
  label: string;
  description: string;
}> = [
  {
    id: "gallery",
    label: "Gallery view",
    description: "1:1 + 9:16 pretty gallery · web & mobile",
  },
  {
    id: "sidebar",
    label: "Host stage",
    description: "Large host + right sidebar · index.html",
  },
];

/** index1.html `.video-gallery` min tile width. */
export const GALLERY_MIN_TILE_PX = 260;
/** index1.html `.video-gallery` min tile row height. */
export const GALLERY_MIN_ROW_PX = 180;
/** index1.html workspace chat column / `.chat-sidebar` width. */
export const GALLERY_CHAT_COLUMN_PX = 340;

const LAYOUT_MODES = new Set<string>(LAYOUT_MODE_OPTIONS.map((o) => o.id));

/** Desktop tile-view lock (Jitsi-ish ~ visible tiles before scroll). */
export const VIEWPORT_TILE_CAP = 16;
/** @deprecated */
export const GRID_VIEWPORT_LOCK = VIEWPORT_TILE_CAP;

/** Desktop lock columns (Jitsi DEFAULT_MAX_COLUMNS prefers ~5; we use 4 for 4×4 lock). */
export const LOCK_COLS = 4;
/** @deprecated */
export const GRID_LOCK_COLS = LOCK_COLS;

/** Jitsi filmstrip / tile aspect. */
export const TILE_ASPECT_RATIO = 16 / 9;

/** Host-stage peer strip width — matches chat/menu column (`--meeting-sidebar-width`). */
export const SIDEBAR_WIDTH_PX = 340;

export type StreamAspect = "portrait" | "landscape" | "square" | "unknown";
export type TileFitMode = "cover" | "contain" | "contain-blur";
export type GridDensity = "roomy" | "cozy" | "dense";
/** @deprecated */
export type MosaicDensity = GridDensity;

export function lockColumnsForViewer(viewerMode?: ViewerViewportMode): number {
  if (viewerMode === "mobile-portrait") return 2;
  if (viewerMode === "mobile-landscape") return 4;
  return LOCK_COLS;
}

export function viewportTileCapForViewer(_viewerMode?: ViewerViewportMode): number {
  return GALLERY_SIZE_LOCK;
}

export function shouldLockGridSize(
  tileCount: number,
  _viewerMode?: ViewerViewportMode,
): boolean {
  return tileCount >= GALLERY_SIZE_LOCK;
}

export function layoutPageSize(_mode?: ConferenceLayoutMode): number {
  return GALLERY_PAGE_SIZE;
}

export function layoutRemotesPerPage(_mode?: ConferenceLayoutMode): number {
  return Math.max(1, layoutPageSize() - 1);
}

export function isConferenceLayoutMode(value: string): value is ConferenceLayoutMode {
  return LAYOUT_MODES.has(value);
}

/** Map legacy gallery/stage/focus/tile ids → gallery | sidebar. */
export function normalizeLayoutMode(mode?: string): ConferenceLayoutMode {
  if (
    mode === "sidebar" ||
    mode === "stage" ||
    mode === "focus" ||
    mode === "activeSpeaker" ||
    mode === "host"
  ) {
    return "sidebar";
  }
  // "tile" was the previous id for Gallery view
  return "gallery";
}

export function readStoredLayoutMode(): ConferenceLayoutMode {
  if (typeof window === "undefined") return DEFAULT_LAYOUT_MODE;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw && isConferenceLayoutMode(raw)) return raw;
    if (raw) return normalizeLayoutMode(raw);
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
  return normalizeLayoutMode(mode) === "gallery";
}

/** @deprecated */
export function isJitsiGridMode(_mode: ConferenceLayoutMode): boolean {
  return false;
}

export function resolveConferenceLayout(
  _viewerMode?: ViewerViewportMode,
  _tileCount = 1,
  preferred?: ConferenceLayoutMode,
): ConferenceLayoutMode {
  return preferred ? normalizeLayoutMode(preferred) : DEFAULT_LAYOUT_MODE;
}

export function resolveGridDensity(tileCount: number): GridDensity {
  const n = Math.max(1, tileCount);
  if (n <= 4) return "roomy";
  if (n <= VIEWPORT_TILE_CAP) return "cozy";
  return "dense";
}

/** @deprecated */
export function resolveMosaicDensity(tileCount: number): GridDensity {
  return resolveGridDensity(tileCount);
}

/**
 * Choose cols/rows that maximize equal 16:9 tile size in the stage
 * (Google Meet / Jitsi TILE_VIEW packing).
 */
export function resolveBalancedEqualGrid(
  slotCount: number,
  viewerMode?: ViewerViewportMode,
): { cols: number; rows: number } {
  const n = Math.max(1, Math.min(Math.round(slotCount), GALLERY_PAGE_SIZE));
  if (n <= 1) return { cols: 1, rows: 1 };

  // Approximate stage aspect by viewer (exact pixel measure happens in CSS via cqi/cqh).
  const stageAspect =
    viewerMode === "mobile-portrait"
      ? 9 / 16
      : viewerMode === "mobile-landscape"
        ? 18 / 9
        : 16 / 10;

  const maxCols =
    viewerMode === "mobile-portrait" ? Math.min(3, n) : viewerMode === "mobile-landscape" ? Math.min(5, n) : Math.min(6, n);

  let bestCols = 1;
  let bestRows = n;
  let bestScore = -1;

  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.ceil(n / cols);
    // Cell size in normalized stage units (width=stageAspect, height=1).
    const cellW = stageAspect / cols;
    const cellH = 1 / rows;
    // Largest 16:9 footprint that fits in the cell.
    const tileW = Math.min(cellW, cellH * (16 / 9));
    const tileH = tileW * (9 / 16);
    const area = tileW * tileH;
    const unused = cols * rows - n;
    const score = area * (1 - unused * 0.08);
    if (score > bestScore) {
      bestScore = score;
      bestCols = cols;
      bestRows = rows;
    }
  }

  return { cols: bestCols, rows: bestRows };
}

/**
 * Jitsi-style near-square columns (filmstrip `getNotResponsiveTileViewGridDimensions` idea).
 * Caps by viewer: phone 2–4, landscape phone 6, desktop up to 5–8 within a page.
 */
export function resolveTileColumns(
  tileCount: number,
  viewerMode?: ViewerViewportMode,
): number {
  return resolveBalancedEqualGrid(tileCount, viewerMode).cols;
}

/** @deprecated aliases */
export function resolveEqualGridColumns(
  tileCount: number,
  _mode?: ConferenceLayoutMode,
  viewerMode?: ViewerViewportMode,
): number {
  return resolveTileColumns(tileCount, viewerMode);
}

export function resolveMosaicColumns(
  tileCount: number,
  viewerMode?: ViewerViewportMode,
): number {
  return resolveTileColumns(tileCount, viewerMode);
}

export function resolveJitsiColumns(
  tileCount: number,
  viewerMode?: ViewerViewportMode,
): number {
  return resolveTileColumns(tileCount, viewerMode);
}

export function classifyStreamAspect(width: number, height: number): StreamAspect {
  if (width <= 0 || height <= 0) return "unknown";
  const ratio = width / height;
  if (ratio > 1.2) return "landscape";
  if (ratio < 0.85) return "portrait";
  return "square";
}

/** Tile + focus use cover; screen share overrides to contain in UI. */
export function resolveTileFit(opts: {
  streamAspect: StreamAspect;
  layout: ConferenceLayoutMode | string;
  size: "grid" | "spotlight" | "strip";
}): TileFitMode {
  void opts.streamAspect;
  void opts.layout;
  void opts.size;
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
  preferredAspect?: StreamAspect;
  /** Publisher device from mm.device — gallery 9:16 only when `mobile` + portrait. */
  sourceDevice?: "mobile" | "tablet" | "laptop" | string;
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

/** Prefer live screen (Meet/Jitsi auto-pin), else host. */
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

export function isPortraitTile(tile: StageParticipantTile): boolean {
  return (
    !tile.isScreenShare &&
    tile.preferredAspect === "portrait" &&
    (tile.sourceDevice === "mobile" || !tile.sourceDevice)
  );
}

export function isSmallGroupCount(tileCount: number): boolean {
  return tileCount === 2 || tileCount === 3;
}

export type LandscapePackSlot =
  | { kind: "single"; tile: StageParticipantTile }
  | { kind: "portrait-pair"; tiles: [StageParticipantTile, StageParticipantTile] }
  | { kind: "freeform"; tile: StageParticipantTile; box: GalleryBoxKind };

/** Pair consecutive portrait phones into one landscape-width slot (Meet dynamic row). */
export function packLandscapeSlots(tiles: StageParticipantTile[]): LandscapePackSlot[] {
  return meetPackSlots(tiles) as LandscapePackSlot[];
}

/** Host-stage / filmstrip: Meet portrait pairing. Gallery uses packGalleryFreeformSlots. */
export function packSlotsForViewer(
  tiles: StageParticipantTile[],
  viewerMode?: ViewerViewportMode,
): LandscapePackSlot[] {
  void viewerMode;
  return meetPackSlots(tiles) as LandscapePackSlot[];
}

/** Gallery freeform: individual 1:1 square + 9:16 portrait boxes. */
export function packGallerySlots(tiles: StageParticipantTile[]): LandscapePackSlot[] {
  return packGalleryFreeformSlots(tiles) as LandscapePackSlot[];
}

/** @deprecated use meetStripUnits */
export function filmstripLandscapeUnits(slots: readonly LandscapePackSlot[]): number {
  const meetSlots = slots
    .filter((s) => s.kind !== "freeform")
    .map((s) =>
      s.kind === "portrait-pair"
        ? s
        : { kind: "single" as const, tile: s.tile },
    );
  return meetStripUnits(meetSlots);
}

/** @deprecated use meetUseSingleRow */
export function shouldUseSingleTileRow(
  slots: readonly LandscapePackSlot[],
  viewerMode?: ViewerViewportMode,
  sizeLocked = false,
): boolean {
  const meetSlots = slots
    .filter((s) => s.kind !== "freeform")
    .map((s) =>
      s.kind === "portrait-pair"
        ? s
        : { kind: "single" as const, tile: s.tile },
    );
  return meetUseSingleRow(meetSlots, viewerMode, sizeLocked);
}

export function splitHostLargePeers(peers: StageParticipantTile[]): {
  side: StageParticipantTile[];
  bottom: StageParticipantTile[];
  sideCols: number;
  sideRows: number;
} {
  const n = peers.length;
  if (n <= 0) return { side: [], bottom: [], sideCols: 1, sideRows: 1 };
  const MAX_SIDE = 4;
  const MAX_BOTTOM = 8;
  if (n <= MAX_SIDE) {
    const sideCols = n <= 2 ? 1 : 2;
    return { side: peers, bottom: [], sideCols, sideRows: Math.max(1, Math.ceil(n / sideCols)) };
  }
  return {
    side: peers.slice(0, MAX_SIDE),
    bottom: peers.slice(MAX_SIDE, MAX_SIDE + MAX_BOTTOM),
    sideCols: 2,
    sideRows: 2,
  };
}

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
  for (const id of opts.activeSpeakerIds ?? []) {
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

export const orderMosaicTiles = orderStageTiles;
export const orderGalleryTiles = orderStageTiles;

export function layoutDataCount(tileCount: number, maxPerPage = GALLERY_PAGE_SIZE): number {
  return Math.min(Math.max(tileCount, 1), maxPerPage);
}

export function mosaicDataCount(tileCount: number, maxPerPage = GALLERY_PAGE_SIZE): number {
  return layoutDataCount(tileCount, maxPerPage);
}

/* -------------------------------------------------------------------------- */
/* Stage plan: Gallery view | Host stage (index.html) | auto focus on share      */
/* -------------------------------------------------------------------------- */

export type StagePlanKind = "solo" | "smallGroup" | "gallery" | "focus" | "sidebar" | "pip";

type StagePlanBase = {
  kind: StagePlanKind;
  layoutMode: ConferenceLayoutMode;
  viewerMode?: ViewerViewportMode;
  count: number;
  tiles: StageParticipantTile[];
};

export type SoloStagePlan = StagePlanBase & {
  kind: "solo";
  orientation: "portrait" | "landscape";
  tile: StageParticipantTile;
};

/**
 * 1:1 Meet-style layout — remote fills the video viewport; local camera is a
 * bottom-right PiP (16:9 or 9:16) anchored inside that viewport (not over chat).
 */
export type PipStagePlan = StagePlanBase & {
  kind: "pip";
  focus: StageParticipantTile;
  self: StageParticipantTile;
  fillBleed: boolean;
};

/** Local camera tile used for floating self-view (not screen share). */
export function isLocalSelfTile(
  tile: StageParticipantTile,
  localId = "local",
): boolean {
  if (tile.isScreenShare) return false;
  if (tile.id === localId || tile.id === "local") return true;
  return Boolean(tile.mirror);
}

/** Aspect box for the self-view PiP chrome (portrait camera → 9:16). */
export function selfPipAspect(tile: StageParticipantTile): "portrait" | "landscape" {
  return isPortraitTile(tile) || tile.preferredAspect === "portrait"
    ? "portrait"
    : "landscape";
}

/**
 * Pull local camera out of a peer list so it can float as PiP on the main pane.
 * Returns null when local is the focus (no duplicate) or missing.
 */
export function extractSelfPip(
  tiles: StageParticipantTile[],
  focus: StageParticipantTile,
  localId = "local",
): { self: StageParticipantTile; peers: StageParticipantTile[] } | null {
  const self = tiles.find((t) => isLocalSelfTile(t, localId));
  if (!self || self.id === focus.id) return null;
  return {
    self,
    peers: tiles.filter((t) => t.id !== focus.id && t.id !== self.id),
  };
}

export type SmallGroupStagePlan = StagePlanBase & {
  kind: "smallGroup";
  /** Packed slots — one horizontal row (desktop) or column (mobile portrait). */
  slots: LandscapePackSlot[];
  stripUnits: number;
  orientation: "row" | "column";
};

export type TileStagePlan = StagePlanBase & {
  kind: "gallery";
  cols: number;
  rows: number;
  density: GridDensity;
  sizeLocked: boolean;
  scroll: boolean;
  slots: LandscapePackSlot[];
  lockCols: number;
  viewportCap: number;
  portraitGrid: boolean;
  fillBleed: boolean;
  /** ≤4 landscape units in one Meet-style row (fixed footprints). */
  singleRow: boolean;
  stripUnits: number;
  shape: GalleryCountShape;
  sizeCols: number;
  sizeRows: number;
  sizeN: number;
};

/** @deprecated */
export type EqualGridStagePlan = TileStagePlan;

/** Auto focus filmstrip when screen-sharing inside Gallery view. */
export type FocusStagePlan = StagePlanBase & {
  kind: "focus";
  focus: StageParticipantTile;
  /** All camera tiles in one Meet-style horizontal strip (never side+bottom split). */
  filmstripSlots: LandscapePackSlot[];
  peerSlots: LandscapePackSlot[];
  /** Width budget in landscape footprints (2 portraits = 1). */
  stripUnits: number;
  sizeLocked: boolean;
  scroll: boolean;
  lockCols: number;
  viewportCap: number;
  fillBleed: boolean;
  /** Local camera PiP over the focus pane when self is not the focus. */
  selfPip?: StageParticipantTile;
};

/** @deprecated */
export type HostLargeStagePlan = FocusStagePlan;

/**
 * project-k/index.html Host stage:
 * large host left + vertical participants sidebar (~300px).
 */
export type SidebarStagePlan = StagePlanBase & {
  kind: "sidebar";
  focus: StageParticipantTile;
  peerSlots: LandscapePackSlot[];
  scroll: boolean;
  fillBleed: boolean;
  /** Local camera PiP over the host pane when self is not the focus. */
  selfPip?: StageParticipantTile;
};

export type StagePlan =
  | SoloStagePlan
  | SmallGroupStagePlan
  | TileStagePlan
  | FocusStagePlan
  | SidebarStagePlan
  | PipStagePlan;

export type ResolveStagePlanInput = {
  tiles: StageParticipantTile[];
  /** User Grid button choice: gallery | sidebar */
  layoutMode?: ConferenceLayoutMode | string;
  viewerMode?: ViewerViewportMode;
  hostParticipantId?: string;
  maxPerPage?: number;
  localId?: string;
};

function normalizeTiles(tiles: StageParticipantTile[]): StageParticipantTile[] {
  return tiles.length > 0
    ? tiles
    : [{ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false }];
}

function soloOrientation(viewerMode?: ViewerViewportMode): "portrait" | "landscape" {
  return viewerMode === "mobile-portrait" ? "portrait" : "landscape";
}

/** LiveKit Meet / Jitsi: pin screen into focus while in Gallery view. */
export function shouldUseFocusLayout(tiles: StageParticipantTile[]): boolean {
  return tiles.some((t) => t.isScreenShare && t.hasVideo);
}

function pickFocusTile(
  tiles: StageParticipantTile[],
  hostParticipantId?: string,
): StageParticipantTile {
  const featured = pickHostScreenFeatured(tiles, hostParticipantId);
  return featured[0] ?? tiles.find((t) => !t.isScreenShare) ?? tiles[0];
}

export function resolveStagePlan(input: ResolveStagePlanInput): StagePlan {
  const preferred = normalizeLayoutMode(input.layoutMode);
  const { viewerMode, hostParticipantId, localId = "local" } = input;
  const pageSize = input.maxPerPage ?? layoutPageSize(preferred);
  const tiles = orderStageTiles(normalizeTiles(input.tiles), {
    hostParticipantId,
    localId,
  });
  const count = layoutDataCount(tiles.length, pageSize);
  const fillBleed =
    viewerMode === "mobile-portrait" || viewerMode === "mobile-landscape";

  // 1) Solo — Host stage only. Gallery keeps the large→small count ladder (1 = large self-view).
  if (tiles.length === 1 && preferred !== "gallery") {
    return {
      kind: "solo",
      layoutMode: preferred,
      viewerMode,
      count: 1,
      tiles,
      orientation: soloOrientation(viewerMode),
      tile: tiles[0],
    };
  }

  // 2) Host stage (project-k/index.html) — large host + right sidebar
  //    Local camera floats as PiP on the host pane (not duplicated in the strip).
  if (preferred === "sidebar") {
    const focus = pickFocusTile(tiles, hostParticipantId);
    const split = extractSelfPip(tiles, focus, localId);
    const peers = split?.peers ?? tiles.filter((t) => t.id !== focus.id);
    const peerSlots = packSlotsForViewer(peers, viewerMode);
    return {
      kind: "sidebar",
      layoutMode: "sidebar",
      viewerMode,
      count,
      tiles,
      focus,
      peerSlots,
      scroll: peerSlots.length > 2,
      fillBleed,
      selfPip: split?.self,
    };
  }

  // 3) Gallery 1:1 — remote fills viewport; local is aspect-aware bottom-right PiP
  //    (self-view.png / index.html). Skip when either side is a screen share.
  if (
    preferred === "gallery" &&
    tiles.length === 2 &&
    !shouldUseFocusLayout(tiles)
  ) {
    const self = tiles.find((t) => isLocalSelfTile(t, localId));
    const other = self ? tiles.find((t) => t.id !== self.id) : undefined;
    if (self && other && !self.isScreenShare && !other.isScreenShare) {
      return {
        kind: "pip",
        layoutMode: "gallery",
        viewerMode,
        count: 2,
        tiles,
        focus: other,
        self,
        fillBleed,
      };
    }
  }

  // 4) Gallery view + screen share → Host-stage style (large share + right peer sidebar)
  if (shouldUseFocusLayout(tiles)) {
    const focus = pickFocusTile(tiles, hostParticipantId);
    const split = extractSelfPip(tiles, focus, localId);
    const peers = split?.peers ?? tiles.filter((t) => t.id !== focus.id);
    const meet = resolveMeetFilmstrip(peers, {
      viewerMode,
      sizeLocked: shouldLockGridSize(count, viewerMode),
      withPresentation: true,
    });
    const viewportCap = viewportTileCapForViewer(viewerMode);
    const lockCols = lockColumnsForViewer(viewerMode);
    const sizeLocked = shouldLockGridSize(count, viewerMode);

    return {
      kind: "focus",
      layoutMode: "gallery",
      viewerMode,
      count,
      tiles,
      focus,
      filmstripSlots: meet.slots as LandscapePackSlot[],
      peerSlots: meet.slots as LandscapePackSlot[],
      stripUnits: meet.stripUnits,
      sizeLocked,
      scroll: meet.scroll,
      lockCols,
      viewportCap,
      fillBleed,
      selfPip: split?.self,
    };
  }

  // 5) Default Gallery view — large→small by count; lock tile size at 16; scroll to 50/page
  const slots = packGallerySlots(tiles);
  const stripUnits = galleryFreeformStripUnits(
    slots.map((s) =>
      s.kind === "freeform"
        ? { box: s.box }
        : { box: "landscape" as GalleryBoxKind },
    ),
  );
  const pack = resolveGalleryCountLayout(tiles.length, viewerMode);
  const viewportCap = GALLERY_SIZE_LOCK;
  const lockCols = pack.sizeCols;

  return {
    kind: "gallery",
    layoutMode: "gallery",
    viewerMode,
    count: pack.count,
    tiles,
    cols: pack.cols,
    rows: pack.rows,
    density: resolveGridDensity(Math.min(pack.count, viewportCap)),
    sizeLocked: pack.sizeLocked,
    scroll: pack.scroll,
    slots,
    lockCols,
    viewportCap,
    portraitGrid: viewerMode === "mobile-portrait",
    fillBleed,
    singleRow: pack.shape === "pair",
    stripUnits,
    shape: pack.shape,
    sizeCols: pack.sizeCols,
    sizeRows: pack.sizeRows,
    sizeN: pack.sizeN,
  };
}
