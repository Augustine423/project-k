export interface TilePack {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  ratio: number;
}

/** Wide first (Meet/Zoom style); squarer boxes are only chosen when they use the space clearly better. */
const RATIOS: ReadonlyArray<{ ratio: number; weight: number }> = [
  { ratio: 16 / 9, weight: 1 },
  { ratio: 4 / 3, weight: 0.93 },
  { ratio: 1, weight: 0.86 },
  { ratio: 3 / 4, weight: 0.8 },
];

/**
 * Largest equal-size tiles that fit `count` tiles in a width × height area with zero gap.
 * Tiles keep a natural video ratio instead of stretching to fill the stage; the pack is centered.
 */
export function packTiles(count: number, width: number, height: number): TilePack | null {
  if (count < 1 || width < 2 || height < 2) return null;
  let best: (TilePack & { score: number }) | null = null;
  for (const { ratio, weight } of RATIOS) {
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const tileW = Math.min(width / cols, (height / rows) * ratio);
      const tileH = tileW / ratio;
      // Prefer fuller last rows: penalise empty cells slightly.
      const fill = count / (cols * rows);
      const score = tileW * tileH * weight * (0.9 + 0.1 * fill);
      if (!best || score > best.score) best = { cols, rows, tileW, tileH, ratio, score };
    }
  }
  if (!best) return null;
  return {
    cols: best.cols,
    rows: best.rows,
    tileW: Math.floor(best.tileW),
    tileH: Math.floor(best.tileH),
    ratio: best.ratio,
  };
}
