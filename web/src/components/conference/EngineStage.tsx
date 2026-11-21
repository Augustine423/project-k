import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { StreamVideoTile } from "../StreamVideoTile";
import { RemoteAudio } from "../RemoteAudio";
import { useStageSize } from "../../hooks/useStageSize";
import { isHostTile, type ConferenceLayoutMode, type StageParticipantTile } from "../../media/conferenceLayout";
import {
  computeLayout,
  loadCorner,
  saveCorner,
  type Corner,
  type LayoutMode,
  type Rect,
} from "../../media/tileLayout";

/** Above this many tiles the legacy paged/scrolling stage is used instead. */
export const ENGINE_MAX_TILES = 25;

const CORNER_ORDER: Corner[] = ["br", "bl", "tl", "tr"];
const GAP_DESKTOP = 10;
const GAP_PHONE = 6;
const PHONE_STAGE_WIDTH = 520;

type Props = {
  tiles: StageParticipantTile[];
  layoutMode: ConferenceLayoutMode;
  hostParticipantId?: string;
  localId?: string;
  onHiddenChange?: (ids: string[]) => void;
};

function EngineSlot({
  tile,
  rect,
  pinned,
  isPip,
  onActivate,
  onSourceRatio,
  size,
}: {
  tile: StageParticipantTile;
  rect: Rect;
  pinned: boolean;
  isPip: boolean;
  onActivate: (id: string) => void;
  onSourceRatio: (id: string, ratio: number) => void;
  size: "grid" | "spotlight" | "strip";
}) {
  const report = useCallback((ratio: number) => onSourceRatio(tile.id, ratio), [onSourceRatio, tile.id]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate(tile.id);
    }
  };
  const style = {
    width: rect.w,
    height: rect.h,
    transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
  } as CSSProperties;

  return (
    <div
      className={["te-slot", pinned ? "is-pinned" : "", isPip ? "is-pip" : ""].filter(Boolean).join(" ")}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`${tile.label}${isPip ? ", self view, tap to move" : pinned ? ", spotlighted" : ""}`}
      aria-pressed={isPip ? undefined : pinned}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, [role='menu']")) return;
        onActivate(tile.id);
      }}
      onKeyDown={onKeyDown}
    >
      <StreamVideoTile
        stream={tile.stream}
        trackSignature={tile.trackSignature}
        label={tile.label}
        muted={Boolean(tile.mirror)}
        mirror={tile.mirror}
        hasVideo={tile.hasVideo}
        roleBadge={tile.roleBadge}
        isSpeaking={tile.isSpeaking}
        micMuted={tile.micMuted}
        networkQuality={tile.networkQuality}
        size={size}
        layoutMode="gallery"
        preferredAspect={tile.isScreenShare ? undefined : tile.preferredAspect}
        fit={tile.isScreenShare ? "contain" : undefined}
        onSourceRatio={report}
      />
    </div>
  );
}

/** Geometry comes from tileLayout.ts; each tile is positioned with a transform so layout changes never remount video. */
export function EngineStage({ tiles, layoutMode, hostParticipantId, localId = "local", onHiddenChange }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { width, height } = useStageSize(stageRef);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [corner, setCorner] = useState<Corner>(() => loadCorner());

  const onSourceRatio = useCallback((id: string, ratio: number) => {
    const next = Math.round(ratio * 100) / 100;
    setRatios((prev) => (prev[id] === next ? prev : { ...prev, [id]: next }));
  }, []);

  const share = tiles.find((t) => t.isScreenShare);
  const selfTile = tiles.find((t) => t.id === localId || t.mirror);
  const livePinned = pinnedId && tiles.some((t) => t.id === pinnedId) ? pinnedId : null;

  const { mode, spotlightId } = useMemo((): { mode: LayoutMode; spotlightId?: string } => {
    if (livePinned) return { mode: "speaker", spotlightId: livePinned };
    if (share) return { mode: "speaker", spotlightId: share.id };
    if (layoutMode === "sidebar") {
      const host = tiles.find((t) => isHostTile(t, hostParticipantId, localId)) ?? tiles[0];
      return { mode: "speaker", spotlightId: host?.id };
    }
    if (tiles.length === 2 && selfTile) return { mode: "call" };
    return { mode: "gallery-mixed" };
  }, [livePinned, share, layoutMode, tiles, hostParticipantId, localId, selfTile]);

  const gap = width > 0 && width < PHONE_STAGE_WIDTH ? GAP_PHONE : GAP_DESKTOP;

  const layout = useMemo(
    () =>
      computeLayout({
        width,
        height,
        gap,
        mode,
        pinnedId: spotlightId,
        selfId: selfTile?.id,
        corner,
        participants: tiles.map((t) => {
          const ratio = t.isScreenShare ? undefined : ratios[t.id];
          return { id: t.id, aspect: ratio };
        }),
      }),
    [width, height, gap, mode, spotlightId, selfTile?.id, corner, tiles, ratios],
  );

  const activate = useCallback(
    (id: string) => {
      if (mode === "call" && id === selfTile?.id) {
        setCorner((c) => {
          const next = CORNER_ORDER[(CORNER_ORDER.indexOf(c) + 1) % CORNER_ORDER.length];
          saveCorner(next);
          return next;
        });
        return;
      }
      setPinnedId((p) => (p === id ? null : id));
    },
    [mode, selfTile?.id],
  );

  const hiddenIds = new Set(layout.overflow?.ids ?? []);
  const hiddenTiles = tiles.filter((t) => hiddenIds.has(t.id));
  const hiddenKey = [...hiddenIds].sort().join("|");
  useEffect(() => {
    onHiddenChange?.(hiddenKey ? hiddenKey.split("|") : []);
    return () => onHiddenChange?.([]);
  }, [hiddenKey, onHiddenChange]);

  return (
    <div className="video-stage-shell te-shell" data-layout={layoutMode}>
      <div ref={stageRef} className="te-stage" data-mode={mode} data-count={String(tiles.length)}>
        {tiles.map((tile) => {
          const rect = layout.rects[tile.id];
          if (!rect) return null;
          const isSpotlight = mode === "speaker" && tile.id === spotlightId;
          return (
            <EngineSlot
              key={tile.id}
              tile={tile}
              rect={rect}
              pinned={isSpotlight && Boolean(livePinned)}
              isPip={mode === "call" && tile.id === selfTile?.id}
              onActivate={activate}
              onSourceRatio={onSourceRatio}
              size={isSpotlight || mode === "call" ? "spotlight" : mode === "speaker" ? "strip" : "grid"}
            />
          );
        })}
        {layout.overflow && (
          <div
            className="te-slot te-more"
            style={{
              width: layout.overflow.rect.w,
              height: layout.overflow.rect.h,
              transform: `translate3d(${layout.overflow.rect.x}px, ${layout.overflow.rect.y}px, 0)`,
            }}
            role="img"
            aria-label={`${layout.overflow.ids.length} more participants`}
          >
            <span>+{layout.overflow.ids.length}</span>
          </div>
        )}
        {hiddenTiles.map((t) => (t.stream ? <RemoteAudio key={`audio-${t.id}`} stream={t.stream} /> : null))}
      </div>
    </div>
  );
}
