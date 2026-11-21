export type LayoutMode = "gallery-uniform" | "gallery-mixed" | "speaker" | "call";
export type Corner = "tl" | "tr" | "bl" | "br";

export interface LayoutParticipant {
  id: string;
  /** width / height of the camera source; defaults to 16:9 */
  aspect?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  gap: number;
  participants: LayoutParticipant[];
  mode: LayoutMode;
  pinnedId?: string | null;
  selfId?: string | null;
  corner?: Corner;
}

export interface LayoutResult {
  rects: Record<string, Rect>;
  /** Speaker mode: participants collapsed into the "+N" tile. */
  overflow: { ids: string[]; rect: Rect } | null;
}

export const MAX_SPEAKER_SLOTS = 4;
const DEFAULT_ASPECT = 16 / 9;
const PIP_MARGIN = 12;

const aspectOf = (p: LayoutParticipant) =>
  p.aspect && Number.isFinite(p.aspect) && p.aspect > 0 ? p.aspect : DEFAULT_ASPECT;

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** Places rows of equally sized tiles, each row centered; returns rects in input order. */
function centerRows(rows: { items: number[]; w: number[]; h: number }[], W: number, H: number, gap: number): Rect[] {
  const totalH = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1);
  let y = (H - totalH) / 2;
  const out: Rect[] = [];
  for (const row of rows) {
    const rowW = row.w.reduce((s, w) => s + w, 0) + gap * (row.w.length - 1);
    let x = (W - rowW) / 2;
    row.w.forEach((w) => {
      out.push({ x, y, w, h: row.h });
      x += w + gap;
    });
    y += row.h + gap;
  }
  return out;
}

export function layoutUniform(W: number, H: number, gap: number, n: number): Rect[] {
  if (n < 1) return [];
  const ratio = W >= H ? 16 / 9 : 3 / 4;
  let best: { cols: number; w: number } | null = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (W - gap * (cols - 1)) / cols;
    const ch = (H - gap * (rows - 1)) / rows;
    const w = Math.min(cw, ch * ratio);
    if (w > 0 && (!best || w > best.w + 1e-6)) best = { cols, w };
  }
  if (!best) return [];
  const { cols, w } = best;
  const h = w / ratio;
  const rows: { items: number[]; w: number[]; h: number }[] = [];
  for (let i = 0; i < n; i += cols) {
    const count = Math.min(cols, n - i);
    rows.push({ items: [], w: Array<number>(count).fill(w), h });
  }
  return centerRows(rows, W, H, gap);
}

/** Splits aspects into k contiguous rows with balanced cumulative aspect ratio. */
function splitRows(aspects: number[], k: number): number[][] {
  const total = aspects.reduce((s, a) => s + a, 0);
  const rows: number[][] = Array.from({ length: k }, () => []);
  let cum = 0;
  aspects.forEach((a, i) => {
    const row = Math.min(k - 1, Math.floor(((cum + a / 2) / total) * k));
    rows[row].push(i);
    cum += a;
  });
  return rows.filter((r) => r.length > 0);
}

export function layoutMixed(W: number, H: number, gap: number, aspects: number[]): Rect[] {
  const n = aspects.length;
  if (n < 1) return [];
  let best: { area: number; rows: { items: number[]; w: number[]; h: number }[] } | null = null;
  for (let k = 1; k <= n; k++) {
    const split = splitRows(aspects, k);
    const heights = split.map((items) => {
      const sumA = items.reduce((s, i) => s + aspects[i], 0);
      return (W - gap * (items.length - 1)) / sumA;
    });
    const vGaps = gap * (split.length - 1);
    const sumH = heights.reduce((s, h) => s + h, 0);
    const scale = sumH + vGaps > H ? Math.max(0, (H - vGaps) / sumH) : 1;
    const rows = split.map((items, r) => {
      const h = heights[r] * scale;
      return { items, w: items.map((i) => aspects[i] * h), h };
    });
    const area = rows.reduce((s, r) => s + r.w.reduce((a, w) => a + w * r.h, 0), 0);
    if (!best || area > best.area + 1e-6) best = { area, rows };
  }
  if (!best || best.area <= 0) return [];
  const placed = centerRows(best.rows, W, H, gap);
  const out: Rect[] = new Array<Rect>(n);
  best.rows.flatMap((r) => r.items).forEach((idx, pos) => {
    out[idx] = placed[pos];
  });
  return out;
}

export function layoutSpeaker(input: LayoutInput): LayoutResult {
  const { width: W, height: H, gap, participants, pinnedId } = input;
  const rects: Record<string, Rect> = {};
  if (participants.length === 0) return { rects, overflow: null };
  const spot = participants.find((p) => p.id === pinnedId) ?? participants[0];
  const others = participants.filter((p) => p !== spot);
  if (others.length === 0) {
    rects[spot.id] = round({ x: 0, y: 0, w: W, h: H });
    return { rects, overflow: null };
  }
  const tooMany = others.length > MAX_SPEAKER_SLOTS;
  const thumbs = tooMany ? others.slice(0, MAX_SPEAKER_SLOTS - 1) : others;
  const hidden = tooMany ? others.slice(MAX_SPEAKER_SLOTS - 1) : [];
  const slots = thumbs.length + (hidden.length ? 1 : 0);
  const landscape = W >= H;
  const slotRects: Rect[] = [];
  let main: Rect;

  if (landscape) {
    const stripW = Math.min(190, Math.max(120, W * 0.2));
    const cellH = (H - gap * (slots - 1)) / slots;
    const tw = Math.min(stripW, cellH * (16 / 9));
    const th = tw / (16 / 9);
    const total = th * slots + gap * (slots - 1);
    for (let i = 0; i < slots; i++) {
      slotRects.push({ x: W - stripW + (stripW - tw) / 2, y: (H - total) / 2 + i * (th + gap), w: tw, h: th });
    }
    main = { x: 0, y: 0, w: W - stripW - gap, h: H };
  } else {
    const stripH = Math.min(120, Math.max(80, H * 0.16));
    const cellW = (W - gap * (slots - 1)) / slots;
    const th = Math.min(stripH, cellW / (4 / 3));
    const tw = th * (4 / 3);
    const total = tw * slots + gap * (slots - 1);
    for (let i = 0; i < slots; i++) {
      slotRects.push({ x: (W - total) / 2 + i * (tw + gap), y: H - stripH + (stripH - th) / 2, w: tw, h: th });
    }
    main = { x: 0, y: 0, w: W, h: H - stripH - gap };
  }

  rects[spot.id] = round(main);
  thumbs.forEach((p, i) => (rects[p.id] = round(slotRects[i])));
  const overflow = hidden.length ? { ids: hidden.map((p) => p.id), rect: round(slotRects[slots - 1]) } : null;
  return { rects, overflow };
}

export function layoutCall(input: LayoutInput): LayoutResult {
  const { width: W, height: H, participants, selfId } = input;
  const rects: Record<string, Rect> = {};
  const self = participants.find((p) => p.id === selfId) ?? participants[participants.length - 1];
  const remote = participants.find((p) => p !== self) ?? self;
  rects[remote.id] = round({ x: 0, y: 0, w: W, h: H });
  if (self && self !== remote) {
    const landscape = W >= H;
    const ratio = self.aspect ? aspectOf(self) : landscape ? 16 / 9 : 3 / 4;
    const boxW = landscape ? Math.min(W * 0.22, 220) : Math.min(W * 0.3, 130);
    const boxH = boxW / (landscape ? 16 / 9 : 3 / 4);
    const w = Math.min(boxW, boxH * ratio);
    const h = w / ratio;
    rects[self.id] = round(pipRect(W, H, w, h, input.corner ?? "br"));
  }
  return { rects, overflow: null };
}

function pipRect(W: number, H: number, w: number, h: number, corner: Corner): Rect {
  const x = corner === "tl" || corner === "bl" ? PIP_MARGIN : W - w - PIP_MARGIN;
  const y = corner === "tl" || corner === "tr" ? PIP_MARGIN : H - h - PIP_MARGIN;
  return { x, y, w, h };
}

/** Snaps a dropped self-view center to the nearest stage corner. */
export function nearestCorner(cx: number, cy: number, W: number, H: number): Corner {
  return `${cy < H / 2 ? "t" : "b"}${cx < W / 2 ? "l" : "r"}` as Corner;
}

const CORNER_KEY = "projectk.selfCorner";
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

export function loadCorner(storage: Pick<Storage, "getItem"> = localStorage): Corner {
  try {
    const v = storage.getItem(CORNER_KEY) as Corner | null;
    return v && CORNERS.includes(v) ? v : "br";
  } catch {
    return "br";
  }
}

export function saveCorner(corner: Corner, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(CORNER_KEY, corner);
  } catch {
    /* storage unavailable */
  }
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const { width: W, height: H, gap, participants, mode } = input;
  if (W <= 0 || H <= 0 || participants.length === 0) return { rects: {}, overflow: null };
  if (mode === "call" && participants.length === 2) return layoutCall(input);
  if (mode === "speaker") return layoutSpeaker(input);

  const list =
    mode === "gallery-uniform"
      ? layoutUniform(W, H, gap, participants.length)
      : layoutMixed(W, H, gap, participants.map(aspectOf));
  const rects: Record<string, Rect> = {};
  participants.forEach((p, i) => {
    if (list[i]) rects[p.id] = round(list[i]);
  });
  return { rects, overflow: null };
}
