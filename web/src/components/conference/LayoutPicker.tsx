import { useEffect, useId, useRef, useState } from "react";
import {
  LAYOUT_MODE_OPTIONS,
  type ConferenceLayoutMode,
} from "../../media/conferenceLayout";

type LayoutPickerProps = {
  layoutMode: ConferenceLayoutMode;
  onLayoutChange: (mode: ConferenceLayoutMode) => void;
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

/** Mini preview glyphs for each layout option. */
function LayoutPreviewIcon({ mode }: { mode: ConferenceLayoutMode }) {
  switch (mode) {
    case "gallery":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="none">
          <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="14.5" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="28" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="15" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="14.5" y="15" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="28" y="15" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "standard":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="none">
          <rect x="2" y="2" width="16" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="22" y="2" width="16" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "extended":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="none">
          {[0, 1, 2, 3].flatMap((row) =>
            [0, 1, 2, 3].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={1.5 + col * 9.5}
                y={1.5 + row * 6.5}
                width="8"
                height="5.2"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            )),
          )}
        </svg>
      );
    case "jitsi":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="none">
          <rect x="1" y="1" width="18" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="21" y="1" width="18" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="15.5" width="18" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="21" y="15.5" width="18" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "activeSpeaker":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="none">
          <rect x="4" y="1" width="32" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="4" y="20" width="7" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="13" y="20" width="7" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="22" y="20" width="7" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="31" y="20" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "stage":
      return (
        <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" fill="none">
          <rect x="1" y="1" width="22" height="26" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="25" y="1" width="14" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
          <rect x="25" y="10.25" width="14" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
          <rect x="25" y="19.5" width="14" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
  }
}

/**
 * Floating stage-corner control: grid button opens a popover of layout icons.
 */
export function LayoutPicker({ layoutMode, onLayoutChange }: LayoutPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`layout-picker${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="layout-picker-btn"
        aria-label="Change video layout"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <GridIcon />
      </button>
      {open && (
        <div className="layout-picker-menu" role="listbox" id={listId} aria-label="Layout options">
          {LAYOUT_MODE_OPTIONS.map((opt) => {
            const selected = opt.id === layoutMode;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={selected}
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
