import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export type SelfPipOffset = { left: number; top: number };

const EDGE_PAD = 8;

function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, n));
}

function clampToParent(
  left: number,
  top: number,
  el: HTMLElement,
  parent: HTMLElement,
): SelfPipOffset {
  const maxL = Math.max(EDGE_PAD, parent.clientWidth - el.offsetWidth - EDGE_PAD);
  const maxT = Math.max(EDGE_PAD, parent.clientHeight - el.offsetHeight - EDGE_PAD);
  return {
    left: clamp(left, EDGE_PAD, maxL),
    top: clamp(top, EDGE_PAD, maxT),
  };
}

/**
 * Drag-and-hold for the self-view PiP.
 * Default stays CSS bottom-right (self-view.png) until the user moves it.
 */
export function useDraggableSelfPip(pipRef: RefObject<HTMLDivElement | null>): {
  style: CSSProperties | undefined;
  dragging: boolean;
  moved: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
} {
  const [offset, setOffset] = useState<SelfPipOffset | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);

  const reclamp = useCallback(() => {
    const el = pipRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent || !offset) return;
    const next = clampToParent(offset.left, offset.top, el, parent);
    if (next.left !== offset.left || next.top !== offset.top) setOffset(next);
  }, [offset, pipRef]);

  useEffect(() => {
    if (!offset) return;
    const el = pipRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!parent) return;

    const ro = new ResizeObserver(() => reclamp());
    ro.observe(parent);
    if (el) ro.observe(el);
    window.addEventListener("resize", reclamp);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", reclamp);
    };
  }, [offset, pipRef, reclamp]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const el = pipRef.current;
      const parent = el?.offsetParent as HTMLElement | null;
      if (!el || !parent) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const originLeft = offset?.left ?? rect.left - parentRect.left;
      const originTop = offset?.top ?? rect.top - parentRect.top;

      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originLeft,
        originTop,
      };
      setDragging(true);
      setOffset({ left: originLeft, top: originTop });
      el.setPointerCapture(e.pointerId);
    },
    [offset, pipRef],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const el = pipRef.current;
      const parent = el?.offsetParent as HTMLElement | null;
      if (!drag || drag.pointerId !== e.pointerId || !el || !parent) return;

      const next = clampToParent(
        drag.originLeft + (e.clientX - drag.startX),
        drag.originTop + (e.clientY - drag.startY),
        el,
        parent,
      );
      setOffset(next);
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      try {
        pipRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, pipRef]);

  const style: CSSProperties | undefined = offset
    ? {
        left: offset.left,
        top: offset.top,
        right: "auto",
        bottom: "auto",
      }
    : undefined;

  return {
    style,
    dragging,
    moved: offset !== null,
    onPointerDown,
  };
}
