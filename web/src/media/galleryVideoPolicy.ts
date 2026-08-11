/**
 * Scale model for large meetings (up to 10k+ participants):
 *
 * 1) **Page** — each client only renders / downloads ≤ {@link GALLERY_PAGE_SIZE} people
 *    (self + remotes). Flip pages for everyone else (control-plane roster + selective
 *    LiveKit subscribe). Backend `PARTICIPANTS_PAGE_SIZE` defaults to the same 50.
 *
 * 2) **Within a page** — Immersive/Stage freeze tile size at 16 (4×4) and scroll;
 *    tiles never shrink as the page fills toward 50.
 *
 * Simulcast slots scale with how dense the current page is (room size proxy).
 */
export interface GalleryVideoTier {
  /** Inclusive upper bound for room participant count. */
  maxRoomSize: number;
  /** Max simultaneous video downloads on one gallery page (always ≤ 50). */
  videosPerPage: number;
  /** Simulcast layer 3 (~3 Mbps) — host + large / active speaker tiles (1080p). */
  hdSlots: number;
  /** Simulcast layer 1 (~400 kbps). */
  mediumSlots: number;
  /** Simulcast layer 0 (~100 kbps). */
  lowSlots: number;
  estDownloadMbps: { min: number; max: number };
  label: string;
}

/** Hard cap per video page (self + remotes). Intentional size for 10k-scale rooms. */
export const GALLERY_PAGE_SIZE = 50;

/** Rooms above this use control-plane paging + selective LiveKit subscriptions. */
export const MASS_ROOM_THRESHOLD = GALLERY_PAGE_SIZE;

/**
 * Remotes per page so local + remotes ≤ GALLERY_PAGE_SIZE.
 * (Self is always pinned on the stage.)
 */
export const REMOTES_PER_PAGE = GALLERY_PAGE_SIZE - 1;

export const GALLERY_VIDEO_TIERS: readonly GalleryVideoTier[] = [
  {
    maxRoomSize: 9,
    videosPerPage: REMOTES_PER_PAGE,
    hdSlots: 4,
    mediumSlots: 5,
    lowSlots: 0,
    estDownloadMbps: { min: 2, max: 8 },
    label: "Mosaic (≤9)",
  },
  {
    maxRoomSize: 25,
    videosPerPage: REMOTES_PER_PAGE,
    hdSlots: 2,
    mediumSlots: 8,
    lowSlots: 15,
    estDownloadMbps: { min: 3, max: 12 },
    label: "Mosaic (10–25)",
  },
  {
    maxRoomSize: 50,
    videosPerPage: REMOTES_PER_PAGE,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 40,
    estDownloadMbps: { min: 4, max: 16 },
    label: "Mosaic (26–50)",
  },
  {
    maxRoomSize: 200,
    videosPerPage: REMOTES_PER_PAGE,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 40,
    estDownloadMbps: { min: 4, max: 18 },
    label: "Mosaic pages (50–200) · 50/page",
  },
  {
    maxRoomSize: 1000,
    videosPerPage: REMOTES_PER_PAGE,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 40,
    estDownloadMbps: { min: 4, max: 18 },
    label: "Mosaic pages (201–1k) · 50/page",
  },
  {
    maxRoomSize: 10_000,
    videosPerPage: REMOTES_PER_PAGE,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 40,
    estDownloadMbps: { min: 4, max: 18 },
    label: "Paged (1k–10k) · 50/page",
  },
  {
    // Guard if room cap is raised above 10k — still 50 videos per client page.
    maxRoomSize: Number.MAX_SAFE_INTEGER,
    videosPerPage: REMOTES_PER_PAGE,
    hdSlots: 1,
    mediumSlots: 8,
    lowSlots: 40,
    estDownloadMbps: { min: 4, max: 18 },
    label: "Paged (10k+) · 50/page",
  },
] as const;

export function resolveGalleryTier(participantCount: number): GalleryVideoTier {
  const n = Math.max(1, participantCount);
  for (const tier of GALLERY_VIDEO_TIERS) {
    if (n <= tier.maxRoomSize) return tier;
  }
  return GALLERY_VIDEO_TIERS[GALLERY_VIDEO_TIERS.length - 1];
}

/** Layer preference index into LAYER_DIMS: 0=180, 1=360, 2=720, 3=1080p 16:9. */
export function substreamForVideoSlot(slotIndex: number, tier: GalleryVideoTier): number {
  if (slotIndex < tier.hdSlots) return 3; // host-large / HD tiles → 1080p
  if (slotIndex < tier.hdSlots + tier.mediumSlots) return 2; // medium → 720p
  return 0;
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
