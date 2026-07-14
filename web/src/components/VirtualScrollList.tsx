import { useEffect, useRef, useState, type ReactNode } from "react";

const DEFAULT_OVERSCAN = 6;

export interface VirtualScrollListProps<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  rowKey: (item: T, index: number) => string;
  className?: string;
  empty?: ReactNode;
}

/**
 * Fixed-row-height virtual list — renders only visible rows (+ overscan).
 * Keeps 1000+ participant names smooth without extra dependencies.
 */
export function VirtualScrollList<T>({
  items,
  rowHeight,
  renderRow,
  rowKey,
  className = "",
  empty = null,
}: VirtualScrollListProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(240);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const sync = () => setViewportHeight(el.clientHeight || 240);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (scrollTop > Math.max(0, items.length * rowHeight - viewportHeight)) {
      el.scrollTop = 0;
      setScrollTop(0);
    }
  }, [items.length, rowHeight, scrollTop, viewportHeight]);

  if (items.length === 0) {
    return <div className={`virtual-scroll-viewport ${className}`}>{empty}</div>;
  }

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - DEFAULT_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + DEFAULT_OVERSCAN * 2;
  const end = Math.min(items.length, start + visibleCount);
  const offsetY = start * rowHeight;
  const totalHeight = items.length * rowHeight;

  return (
    <div
      ref={viewportRef}
      className={`virtual-scroll-viewport ${className}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      role="list"
    >
      <div className="virtual-scroll-spacer" style={{ height: totalHeight }}>
        <div className="virtual-scroll-window" style={{ transform: `translateY(${offsetY}px)` }}>
          {items.slice(start, end).map((item, i) => {
            const index = start + i;
            return (
              <div
                key={rowKey(item, index)}
                className="virtual-scroll-row"
                style={{ height: rowHeight }}
                role="listitem"
              >
                {renderRow(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
