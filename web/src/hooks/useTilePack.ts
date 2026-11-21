import { useEffect, useState, type RefObject } from "react";
import { packTiles, type TilePack } from "../media/tilePack";

/** Tracks the element size with a ResizeObserver and returns the best zero-gap tile pack. */
export function useTilePack(ref: RefObject<HTMLElement | null>, count: number, enabled: boolean): TilePack | null {
  const [pack, setPack] = useState<TilePack | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      setPack(null);
      return;
    }
    const update = () => {
      const next = packTiles(count, el.clientWidth, el.clientHeight);
      setPack((prev) =>
        prev && next && prev.tileW === next.tileW && prev.tileH === next.tileH && prev.cols === next.cols
          ? prev
          : next,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, count, enabled]);

  return pack;
}
