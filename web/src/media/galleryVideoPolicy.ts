/**
 * Stable downstream video budget per gallery page (Zoom / Teams model).
 *
 * | Room size | Videos / page | HD slots | Medium | Low  | Stable download |
 * |-----------|---------------|----------|--------|------|-----------------|
 * | 1–4       | 4             | 4        | 0      | 0    | 2–6 Mbps        |
 * | 5–9       | 9             | 1        | 8      | 0    | 3–8 Mbps        |
 * | 10–25     | 25            | 1        | 8      | 16   | 4–12 Mbps       |
 * | 26–49     | 25            | 1        | 4      | 20   | 4–10 Mbps       |
 * | 50–200    | 50 max        | 1        | 8      | 41   | 4–18 Mbps       |
 * | 201–10k   | 50 max        | 1        | 8      | 41   | 4–18 Mbps       |
 *
 * Everyone may publish camera; each client only downloads video for the current page.
 * Off-page publishers remain audio-only until the user changes page.
 */
export interface GalleryVideoTier {
  /** Inclusive upper bound for room participant count. */
  maxRoomSize: number;
  /** Max simultaneous video downloads on one gallery page. */
  videosPerPage: number;
  /** Simulcast layer 2 (~1.5 Mbps) — active speaker + top tiles. */
  hdSlots: number;
  /** Simulcast layer 1 (~400 kbps). */
  mediumSlots: number;
  /** Simulcast layer 0 (~100 kbps). */
  lowSlots: number;
  estDownloadMbps: { min: number; max: number };
  label: string;
}

export const GALLERY_PAGE_SIZE = 50;

/** Rooms above this count use control-plane paging + manual LiveKit subscriptions. */
export const MASS_ROOM_THRESHOLD = 50;

export const GALLERY_VIDEO_TIERS: readonly GalleryVideoTier[] = [
  {
    maxRoomSize: 4,
    videosPerPage: 4,
    hdSlots: 4,
    mediumSlots: 0,
    lowSlots: 0,
    estDownloadMbps: { min: 2, max: 6 },
    label: "Small (≤4)",
  },
  {
    maxRoomSize: 9,
    videosPerPage: 9,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 0,
    estDownloadMbps: { min: 3, max: 8 },
    label: "Medium (5–9)",
  },
  {
    maxRoomSize: 25,
    videosPerPage: 25,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 16,
    estDownloadMbps: { min: 4, max: 12 },
    label: "Large (10–25)",
  },
  {
    maxRoomSize: 49,
    videosPerPage: 25,
    hdSlots: 1,
    mediumSlots: 4,
    lowSlots: 20,
    estDownloadMbps: { min: 4, max: 10 },
    label: "XL (26–49)",
  },
  {
    maxRoomSize: 200,
    videosPerPage: 50,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 41,
    estDownloadMbps: { min: 4, max: 18 },
    label: "Adaptive 50 (50–200)",
  },
  {
    maxRoomSize: 1000,
    videosPerPage: 50,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 41,
    estDownloadMbps: { min: 4, max: 18 },
    label: "Adaptive 50 (201–1k)",
  },
  {
    maxRoomSize: 10_000,
    videosPerPage: 50,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 41,
    estDownloadMbps: { min: 4, max: 18 },
    label: "Adaptive 50 (1k–10k)",
  },
] as const;

export function resolveGalleryTier(participantCount: number): GalleryVideoTier {
  const n = Math.max(1, participantCount);
  for (const tier of GALLERY_VIDEO_TIERS) {
    if (n <= tier.maxRoomSize) return tier;
  }
  return GALLERY_VIDEO_TIERS[GALLERY_VIDEO_TIERS.length - 1];
}

/** Layer preference index into LAYER_DIMS: 0=180, 1=360, 2=720, 3=1080. */
export function substreamForVideoSlot(slotIndex: number, tier: GalleryVideoTier): number {
  if (slotIndex < tier.hdSlots) return 3;
  if (slotIndex < tier.hdSlots + tier.mediumSlots) return 2;
  return 1;
}

export function galleryPageCount(remoteParticipantCount: number, tier: GalleryVideoTier): number {
  if (remoteParticipantCount <= 0) return 1;
  return Math.max(1, Math.ceil(remoteParticipantCount / tier.videosPerPage));
}

export function sliceGalleryPage(ids: string[], page: number, tier: GalleryVideoTier): string[] {
  const size = tier.videosPerPage;
  const start = Math.max(0, (page - 1) * size);
  return ids.slice(start, start + size);
}

export function formatBandwidthRange(tier: GalleryVideoTier): string {
  return `${tier.estDownloadMbps.min}–${tier.estDownloadMbps.max} Mbps`;
}
