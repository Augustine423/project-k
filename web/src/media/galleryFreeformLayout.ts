/**
 * Pretty gallery packing — balanced square (1:1) + mobile portrait (9:16) tiles.
 *
 * Uses a CSS flex/grid flow (not absolute free-canvas) so rows look even
 * on desktop and mobile for both host and guest.
 *
 * - Desktop / tablet / mobile-landscape → 1:1 square box
 * - Mobile phone upright → 9:16 portrait box (half a square unit)
 * - Two portraits ≈ one square width
 */

export type GalleryBoxKind = "landscape" | "portrait";

export type GalleryFreeformTile = {
  id: string;
  preferredAspect?: string;
  sourceDevice?: string;
  isScreenShare?: boolean;
};

export const GALLERY_FREEFORM_COLS = 3;
export const GALLERY_LANDSCAPE_UNIT = 1;
export const GALLERY_PORTRAIT_UNIT = 0.5;

/** @deprecated design px kept for callers that still read them */
export const FF_SQ_W = 457;
export const FF_SQ_H = 395;
export const FF_PT_W = 220;
export const FF_PT_H = 357;
export const FF_GAP = 12;

export function galleryBoxForTile(tile: GalleryFreeformTile): GalleryBoxKind {
  if (tile.isScreenShare) return "landscape";
  const isMobile =
    tile.sourceDevice === "mobile" ||
    (!tile.sourceDevice && tile.preferredAspect === "portrait");
  if (isMobile && tile.preferredAspect === "portrait") return "portrait";
  return "landscape";
}

export function galleryBoxUnit(box: GalleryBoxKind): number {
  return box === "portrait" ? GALLERY_PORTRAIT_UNIT : GALLERY_LANDSCAPE_UNIT;
}

export type GalleryFreeformSlot<T extends GalleryFreeformTile = GalleryFreeformTile> = {
  kind: "freeform";
  tile: T;
  box: GalleryBoxKind;
};

/** Flow placement — CSS sizes the tile; we only order + assign box kind. */
export type GalleryFreeformPlacement<T extends GalleryFreeformTile = GalleryFreeformTile> =
  GalleryFreeformSlot<T>;

export type GalleryFreeformLayoutResult<T extends GalleryFreeformTile = GalleryFreeformTile> = {
  placements: GalleryFreeformPlacement<T>[];
  /** Ideal square columns for the flow (1–4). */
  cols: number;
  fitSingleRow: boolean;
  stripUnits: number;
  /** True when every tile is a square (uniform grid). */
  uniform: boolean;
};

export function packGalleryFreeformSlots<T extends GalleryFreeformTile>(
  tiles: readonly T[],
): GalleryFreeformSlot<T>[] {
  return tiles.map((tile) => ({
    kind: "freeform" as const,
    tile,
    box: galleryBoxForTile(tile),
  }));
}

export function galleryFreeformStripUnits(
  slots: readonly { box: GalleryBoxKind }[],
): number {
  return slots.reduce((sum, s) => sum + galleryBoxUnit(s.box), 0);
}

/**
 * Choose column count for a balanced, pretty grid.
 * Prefers near-square overall composition (Meet / Zoom style).
 */
export function resolvePrettyGalleryCols(
  squareUnits: number,
  viewerMode?: string,
): number {
  const n = Math.max(1, Math.ceil(squareUnits - 1e-9));
  if (viewerMode === "mobile-portrait") {
    if (n <= 1) return 1;
    if (n <= 4) return 2;
    return 2;
  }
  if (viewerMode === "mobile-landscape") {
    if (n <= 2) return 2;
    if (n <= 6) return 3;
    return 3;
  }
  // Desktop — aim for ~sqrt columns, clamp 1–4
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

/**
 * Pretty gallery layout — ordered slots + column hint for CSS flow.
 * Portraits are kept as individual 9:16 boxes (no landscape pairing).
 */
export function layoutGalleryFreeformAbsolute<T extends GalleryFreeformTile>(
  tiles: readonly T[],
  opts: {
    cols?: number;
    mobileFit?: boolean;
    viewerMode?: string;
  } = {},
): GalleryFreeformLayoutResult<T> {
  const slots = packGalleryFreeformSlots(tiles);
  const stripUnits = galleryFreeformStripUnits(slots);
  const viewerHint =
    opts.viewerMode ??
    (opts.mobileFit ? "mobile-portrait" : undefined);
  const cols = Math.max(
    1,
    opts.cols ?? resolvePrettyGalleryCols(stripUnits, viewerHint),
  );
  const fitSingleRow =
    Boolean(opts.mobileFit) &&
    slots.length > 0 &&
    stripUnits <= cols + 1e-6;
  const uniform = slots.length > 0 && slots.every((s) => s.box === "landscape");

  return {
    placements: slots,
    cols,
    fitSingleRow,
    stripUnits,
    uniform,
  };
}

export function galleryFreeformColsForViewer(
  viewerMode?: string,
  tileCount = 1,
): number {
  return resolvePrettyGalleryCols(Math.max(1, tileCount), viewerMode);
}
