import { useState } from "react";

type GallerySimBarProps = {
  webCount: number;
  mobileCount: number;
  addCount: number;
  onAddCountChange: (n: number) => void;
  onAddWeb: () => void;
  onAddMobile: () => void;
  onClear: () => void;
};

/** Local-only layout lab: inject fake web (5:6) and mobile (9:16) tiles. */
export function GallerySimBar({
  webCount,
  mobileCount,
  addCount,
  onAddCountChange,
  onAddWeb,
  onAddMobile,
  onClear,
}: GallerySimBarProps) {
  const [open, setOpen] = useState(false);
  const total = webCount + mobileCount;

  return (
    <div className={`gallery-sim${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="gallery-sim-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Simulate extra web / mobile participants"
      >
        Sim{total > 0 ? ` · ${total}` : ""}
      </button>
      {open && (
        <div className="gallery-sim-panel" role="group" aria-label="Layout simulation">
          <label className="gallery-sim-field">
            <span>Add</span>
            <input
              type="number"
              min={1}
              max={50}
              value={addCount}
              onChange={(e) => {
                const n = Number(e.target.value);
                onAddCountChange(Number.isFinite(n) ? Math.min(50, Math.max(1, Math.round(n))) : 1);
              }}
            />
          </label>
          <button type="button" className="gallery-sim-btn" onClick={onAddWeb}>
            + Web
          </button>
          <button type="button" className="gallery-sim-btn" onClick={onAddMobile}>
            + Mobile
          </button>
          <button
            type="button"
            className="gallery-sim-btn gallery-sim-btn--ghost"
            onClick={onClear}
            disabled={total === 0}
          >
            Clear
          </button>
          <p className="gallery-sim-meta">
            {webCount} web · {mobileCount} mobile · local only
          </p>
        </div>
      )}
    </div>
  );
}
