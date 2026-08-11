/**
 * Google Meet Auto (dynamic) layout — filmstrip row rules.
 *
 * Reference: https://support.google.com/meet/answer/10550593
 * Reference: https://support.google.com/meet/answer/15929512
 *
 * Meet behaviour we mirror:
 * - **With screen share / presentation**: shared content fills the stage; camera
 *   tiles sit in ONE horizontal strip (never a tall side column + second row).
 * - **Mixed devices**: mobile portrait tiles are narrow; laptop tiles are
 *   landscape 16:9. Two portrait slots share the same width as one landscape.
 * - **Sizing**: tile footprints shrink/grow with the available row width (browser
 *   size, chat panel open) — tiles never stretch into wide horizontal bars.
 * - **≤4 landscape units** in gallery: one centered row (Meet 2–4 person call).
 */

import type { ViewerViewportMode } from "../hooks/useViewerViewport";

/** Minimal tile fields needed for Meet packing (matches StageParticipantTile). */
export type MeetPackTile = {
  id: string;
  preferredAspect?: string;
  isScreenShare?: boolean;
};

export type MeetPackSlot =
  | { kind: "single"; tile: MeetPackTile }
  | { kind: "portrait-pair"; tiles: [MeetPackTile, MeetPackTile] };

/** One full landscape 16:9 footprint in the filmstrip row. */
export const MEET_LANDSCAPE_UNIT = 1;
/** Half footprint — lone mobile portrait tile. */
export const MEET_PORTRAIT_UNIT = 0.5;
/** Max landscape units before gallery falls back to multi-row grid. */
export const MEET_SINGLE_ROW_MAX_UNITS = 4;

export function isMeetPortraitTile(tile: MeetPackTile): boolean {
  // Gallery / filmstrip 9:16 only for mobile upright (preferredAspect=portrait).
  // Tablets/laptops publish square/landscape and never match.
  return !tile.isScreenShare && tile.preferredAspect === "portrait";
}

/**
 * Pair consecutive portrait phones into one landscape-width slot.
 * Examples (Meet dynamic row):
 * - 2× landscape + 1× portrait → 2.5 units, one row
 * - 1× landscape + 2× portrait → 2 units (paired), one row
 * - 2× landscape + 2× portrait → 3 units, one row
 */
export function meetPackSlots<T extends MeetPackTile>(tiles: readonly T[]): MeetPackSlot[] {
  const slots: MeetPackSlot[] = [];
  let pending: T | null = null;

  for (const tile of tiles) {
    if (isMeetPortraitTile(tile)) {
      if (pending) {
        slots.push({ kind: "portrait-pair", tiles: [pending, tile] });
        pending = null;
      } else {
        pending = tile;
      }
      continue;
    }
    if (pending) {
      slots.push({ kind: "single", tile: pending });
      pending = null;
    }
    slots.push({ kind: "single", tile });
  }

  if (pending) slots.push({ kind: "single", tile: pending });
  return slots;
}

/** Total row width in landscape footprints (2 portraits = 1 landscape). */
export function meetStripUnits(slots: readonly MeetPackSlot[]): number {
  let units = 0;
  for (const slot of slots) {
    if (slot.kind === "portrait-pair") {
      units += MEET_LANDSCAPE_UNIT;
    } else if (isMeetPortraitTile(slot.tile)) {
      units += MEET_PORTRAIT_UNIT;
    } else {
      units += MEET_LANDSCAPE_UNIT;
    }
  }
  return units;
}

/** Gallery / small call: one Meet row when units fit (desktop & landscape phone). */
export function meetUseSingleRow(
  slots: readonly MeetPackSlot[],
  viewerMode?: ViewerViewportMode,
  sizeLocked = false,
): boolean {
  if (sizeLocked || slots.length <= 0) return false;
  if (viewerMode === "mobile-portrait") return false;
  return meetStripUnits(slots) <= MEET_SINGLE_ROW_MAX_UNITS;
}

/**
 * Screen share filmstrip: always one row — scale tiles to fit.
 * Horizontal scroll only for locked mass-room pages (many peers).
 */
export function meetFilmstripScroll(
  slots: readonly MeetPackSlot[],
  sizeLocked: boolean,
): boolean {
  return sizeLocked && slots.length > 8;
}

export type MeetFilmstripMetrics = {
  slots: MeetPackSlot[];
  stripUnits: number;
  slotCount: number;
  singleRow: boolean;
  scroll: boolean;
};

export function resolveMeetFilmstrip<T extends MeetPackTile>(
  tiles: readonly T[],
  opts: {
    viewerMode?: ViewerViewportMode;
    sizeLocked?: boolean;
    /** true when a presentation / screen share is pinned above the strip */
    withPresentation?: boolean;
  } = {},
): MeetFilmstripMetrics {
  const slots = meetPackSlots(tiles);
  const stripUnits = meetStripUnits(slots);
  const sizeLocked = opts.sizeLocked ?? false;
  const singleRow =
    opts.withPresentation === true ||
    meetUseSingleRow(slots, opts.viewerMode, sizeLocked);

  return {
    slots,
    stripUnits,
    slotCount: slots.length,
    singleRow,
    scroll: meetFilmstripScroll(slots, sizeLocked),
  };
}
