import { useEffect, useState, type RefObject } from "react";

export interface StageSize {
  width: number;
  height: number;
}

/** Stage size from a ResizeObserver plus orientationchange, coalesced to one update per frame. */
export function useStageSize(ref: RefObject<HTMLElement | null>): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const width = Math.round(el.clientWidth);
      const height = Math.round(el.clientHeight);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("orientationchange", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);

  return size;
}
