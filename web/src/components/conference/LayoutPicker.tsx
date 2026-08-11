import { useEffect, useId, useRef, useState } from "react";
import {
  LAYOUT_MODE_OPTIONS,
  type ConferenceLayoutMode,
} from "../../media/conferenceLayout";

type LayoutPickerProps = {
  layoutMode: ConferenceLayoutMode;
  onLayoutChange: (mode: ConferenceLayoutMode) => void;
  variant?: "float" | "dock";
};

function GridIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

/** Mini preview glyphs for Gallery view (index1.html) vs Host stage (index.html). */
function LayoutPreviewIcon({ mode }: { mode: ConferenceLayoutMode }) {
  switch (mode) {
    case "gallery":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="currentColor">
          <rect x="1" y="1" width="12" height="12" opacity="0.9" />
          <rect x="14" y="1" width="12" height="12" opacity="0.9" />
          <rect x="27" y="1" width="12" height="12" opacity="0.9" />
          <rect x="1" y="15" width="12" height="12" opacity="0.9" />
          <rect x="14" y="15" width="12" height="12" opacity="0.9" />
          <rect x="27" y="15" width="12" height="12" opacity="0.9" />
        </svg>
      );
    case "sidebar":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="currentColor">
          <rect x="1" y="1" width="26" height="26" opacity="0.95" />
          <rect x="29" y="1" width="10" height="7.5" opacity="0.75" />
          <rect x="29" y="10.25" width="10" height="7.5" opacity="0.75" />
          <rect x="29" y="19.5" width="10" height="7.5" opacity="0.75" />
        </svg>
      );
  }
}

/** Floating Grid button — named layouts (Gallery view / Host stage). */
export function LayoutPicker({ layoutMode, onLayoutChange, variant = "float" }: LayoutPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = LAYOUT_MODE_OPTIONS.find((o) => o.id === layoutMode);

  const dock = variant === "dock";

  return (
    <div
      className={`layout-picker${dock ? " layout-picker--dock" : ""}${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={dock ? `meeting-v2-ctrl-btn${open ? " is-active" : ""}` : "layout-picker-btn"}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        title={current ? `Layout: ${current.label}` : "Change layout"}
        onClick={() => setOpen((v) => !v)}
      >
        <GridIcon size={dock ? 22 : 20} />
        <span className={dock ? "meeting-v2-ctrl-label" : "layout-picker-btn-label"}>
          {dock ? "Grid" : (current?.label ?? "Grid")}
        </span>
      </button>
      {open && (
        <div className="layout-picker-menu" role="menu" id={menuId}>
          {LAYOUT_MODE_OPTIONS.map((opt) => {
            const selected = opt.id === layoutMode;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`layout-picker-option${selected ? " is-selected" : ""}`}
                onClick={() => {
                  onLayoutChange(opt.id);
                  setOpen(false);
                }}
              >
                <span className="layout-picker-preview">
                  <LayoutPreviewIcon mode={opt.id} />
                </span>
                <span className="layout-picker-copy">
                  <span className="layout-picker-label">{opt.label}</span>
                  <span className="layout-picker-desc">{opt.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
