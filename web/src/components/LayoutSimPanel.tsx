import { useEffect, useState } from "react";
import { clampSimTotal } from "../media/layoutSimulation";

interface LayoutSimPanelProps {
  active: boolean;
  totalOnStage: number;
  realCount: number;
  onApply: (total: number) => void;
  onClear: () => void;
}

/**
 * Floating control to fake N people on the video stage for layout QA.
 * Enable with ?layoutSim=1 or in Vite DEV builds.
 */
export function LayoutSimPanel({
  active,
  totalOnStage,
  realCount,
  onApply,
  onClear,
}: LayoutSimPanelProps) {
  const [draft, setDraft] = useState(String(Math.max(totalOnStage, realCount, 1)));

  useEffect(() => {
    setDraft(String(Math.max(totalOnStage, realCount, 1)));
  }, [realCount, totalOnStage]);

  const apply = () => {
    const n = clampSimTotal(Number(draft));
    setDraft(String(n));
    onApply(n);
  };

  return (
    <div className="layout-sim-panel" role="region" aria-label="Layout simulator">
      <div className="layout-sim-panel-head">
        <strong>Layout sim</strong>
        <span className="layout-sim-panel-meta">
          real {realCount}
          {active ? ` · showing ${totalOnStage}` : ""}
        </span>
      </div>
      <div className="layout-sim-panel-row">
        <label className="layout-sim-field">
          <span className="sr-only">Total people on stage</span>
          <input
            type="number"
            min={1}
            max={50}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
            aria-label="Total people on stage"
          />
        </label>
        <button type="button" className="layout-sim-btn" onClick={apply}>
          Apply
        </button>
        <button
          type="button"
          className="layout-sim-btn layout-sim-btn-ghost"
          onClick={onClear}
          disabled={!active}
        >
          Clear
        </button>
      </div>
      <p className="layout-sim-hint">Try 1–50 to review the mosaic page. Fake users have no camera.</p>
    </div>
  );
}
