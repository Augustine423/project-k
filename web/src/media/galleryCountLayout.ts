import type { ViewerViewportMode } from "../hooks/useViewerViewport";
import { GALLERY_PAGE_SIZE } from "./galleryVideoPolicy";

/** Freeze tile size at the 15-up pack (host + 14 sims); extra people scroll to 50. */
export const GALLERY_SIZE_LOCK = 15;

export type GalleryCountShape = "solo" | "pair" | "invert" | "quad" | "grid";

export type GalleryCountLayout = {
  count: number;
  cols: number;
  rows: number;
  /** Columns used to compute locked tile size (min(n, 16), with 3 treated as 4). */
  sizeCols: number;
  sizeRows: number;
  sizeN: number;
  shape: GalleryCountShape;
  sizeLocked: boolean;
  scroll: boolean;
};

export function galleryShapeForCount(n: number): GalleryCountShape {
  if (n <= 1) return "solo";
  if (n === 2) return "pair";
  if (n === 3) return "invert";
  if (n === 4) return "quad";
  return "grid";
}

export function galleryColsForCount(n: number, viewerMode?: ViewerViewportMode): number {
  const count = Math.max(1, n);
  if (viewerMode === "mobile-portrait") {
    return count <= 1 ? 1 : 2;
  }
  if (viewerMode === "mobile-landscape") {
    if (count <= 1) return 1;
    if (count <= 2) return 2;
    if (count <= 9) return 3;
    return 4;
  }
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

/**
 * Equal landscape cells fill the stage. 3 uses a 2×2 reverse-triangle
 * (same cell size as 4). 15-up (host + 14) locks tile size through 50.
 */
export function gallerySizeBasis(n: number): number {
  const count = Math.max(1, n);
  if (count === 3) return 4;
  return Math.min(count, GALLERY_SIZE_LOCK);
}

export function resolveGalleryCountLayout(
  tileCount: number,
  viewerMode?: ViewerViewportMode,
): GalleryCountLayout {
  const count = Math.max(1, Math.min(Math.round(tileCount), GALLERY_PAGE_SIZE));
  const shape = galleryShapeForCount(count);
  const cols = galleryColsForCount(count, viewerMode);
  const rows = Math.ceil(count / cols);
  const sizeN = gallerySizeBasis(count);
  const sizeCols = galleryColsForCount(sizeN, viewerMode);
  const sizeRows = Math.ceil(sizeN / sizeCols);
  const sizeLocked = count >= GALLERY_SIZE_LOCK;
  const scroll = count > GALLERY_SIZE_LOCK;

  return {
    count,
    cols,
    rows,
    sizeCols,
    sizeRows,
    sizeN,
    shape,
    sizeLocked,
    scroll,
  };
}
