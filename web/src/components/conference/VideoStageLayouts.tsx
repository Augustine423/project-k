import { StreamVideoTile } from "../StreamVideoTile";
import { LayoutPicker } from "./LayoutPicker";
import type { CSSProperties, ReactNode } from "react";
import {
  isEqualGridMode,
  isJitsiGridMode,
  layoutDataCount,
  layoutPageSize,
  orderStageTiles,
  pickActiveSpeakerFeatured,
  pickHostScreenFeatured,
  resolveEqualGridColumns,
  resolveGridDensity,
  resolveJitsiColumns,
  type ConferenceLayoutMode,
  type StageParticipantTile,
} from "../../media/conferenceLayout";
import type { ViewerViewportMode } from "../../hooks/useViewerViewport";

type CommonProps = {
  layoutMode: ConferenceLayoutMode;
  onLayoutChange?: (mode: ConferenceLayoutMode) => void;
  tiles: StageParticipantTile[];
  maxPerPage?: number;
  hostParticipantId?: string;
  viewerMode?: ViewerViewportMode;
  /** Active speaker identities from LiveKit (for activeSpeaker layout). */
  activeSpeakerIds?: readonly string[];
  localIdentity?: string;
  primaryId?: string;
};

function Tile({
  tile,
  layoutMode,
  className,
  size = "grid",
}: {
  tile: StageParticipantTile;
  layoutMode: ConferenceLayoutMode;
  className?: string;
  size?: "grid" | "spotlight" | "strip";
}) {
  return (
    <StreamVideoTile
      stream={tile.stream}
      trackSignature={tile.trackSignature}
      label={tile.label}
      muted={Boolean(tile.mirror)}
      mirror={tile.mirror}
      hasVideo={tile.hasVideo}
      roleBadge={tile.roleBadge}
      isSpeaking={tile.isSpeaking}
      size={size}
      layoutMode={layoutMode}
      preferredAspect={tile.isScreenShare ? undefined : tile.preferredAspect}
      fit={tile.isScreenShare ? "contain" : undefined}
      className={className}
    />
  );
}

function StageShell({
  layoutMode,
  onLayoutChange,
  children,
}: {
  layoutMode: ConferenceLayoutMode;
  onLayoutChange?: (mode: ConferenceLayoutMode) => void;
  children: ReactNode;
}) {
  return (
    <div className="video-stage-shell" data-layout={layoutMode}>
      {onLayoutChange && (
        <LayoutPicker layoutMode={layoutMode} onLayoutChange={onLayoutChange} />
      )}
      {children}
    </div>
  );
}

function normalizeTiles(tiles: StageParticipantTile[]): StageParticipantTile[] {
  return tiles.length > 0
    ? tiles
    : [{ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false }];
}

/** Gallery / Standard / Extended — equal tiles with portrait/landscape aspect boxes. */
function EqualGridStage({
  layoutMode,
  tiles,
  maxPerPage,
  hostParticipantId,
  viewerMode,
  onLayoutChange,
}: CommonProps) {
  const pageSize = maxPerPage ?? layoutPageSize(layoutMode);
  const stageTiles = orderStageTiles(normalizeTiles(tiles), {
    hostParticipantId,
    localId: "local",
  });
  const count = layoutDataCount(stageTiles.length, pageSize);
  const cols = resolveEqualGridColumns(count, layoutMode, viewerMode);
  const rows = Math.max(1, Math.ceil(stageTiles.length / cols));
  const density = resolveGridDensity(stageTiles.length, layoutMode);

  return (
    <StageShell layoutMode={layoutMode} onLayoutChange={onLayoutChange}>
      <div
        className="video-stage equal-grid"
        data-layout={layoutMode}
        data-count={String(count)}
        data-density={density}
        data-cols={String(cols)}
        data-rows={String(rows)}
        style={
          {
            ["--grid-cols"]: String(cols),
            ["--grid-rows"]: String(rows),
            ["--mosaic-cols"]: String(cols),
            ["--mosaic-rows"]: String(rows),
          } as CSSProperties
        }
      >
        {stageTiles.map((tile) => (
          <div
            key={tile.id}
            className="grid-cell mosaic-cell"
            data-kind={tile.isScreenShare ? "screen" : "camera"}
            data-stream-aspect={
              tile.isScreenShare
                ? "landscape"
                : tile.preferredAspect && tile.preferredAspect !== "unknown"
                  ? tile.preferredAspect
                  : undefined
            }
          >
            <Tile tile={tile} layoutMode={layoutMode} />
          </div>
        ))}
      </div>
    </StageShell>
  );
}

/**
 * Jitsi-style tile view — equal CSS cells that fill the stage (web + mobile).
 * Video covers each cell; screen share still contains.
 */
function JitsiGridStage({
  layoutMode,
  tiles,
  maxPerPage,
  hostParticipantId,
  viewerMode,
  onLayoutChange,
}: CommonProps) {
  const pageSize = maxPerPage ?? layoutPageSize(layoutMode);
  const stageTiles = orderStageTiles(normalizeTiles(tiles), {
    hostParticipantId,
    localId: "local",
  });
  const count = layoutDataCount(stageTiles.length, pageSize);
  const cols = resolveJitsiColumns(count, viewerMode);
  const rows = Math.max(1, Math.ceil(stageTiles.length / cols));
  const density = resolveGridDensity(stageTiles.length, layoutMode);

  return (
    <StageShell layoutMode={layoutMode} onLayoutChange={onLayoutChange}>
      <div
        className="video-stage jitsi-grid"
        data-layout="jitsi"
        data-count={String(count)}
        data-density={density}
        data-cols={String(cols)}
        data-rows={String(rows)}
        style={
          {
            ["--grid-cols"]: String(cols),
            ["--grid-rows"]: String(rows),
          } as CSSProperties
        }
      >
        {stageTiles.map((tile) => (
          <div key={tile.id} className="jitsi-cell">
            <Tile tile={tile} layoutMode={layoutMode} />
          </div>
        ))}
      </div>
    </StageShell>
  );
}

function FeaturedDuoRow({
  featured,
  layoutMode,
}: {
  featured: StageParticipantTile[];
  layoutMode: ConferenceLayoutMode;
}) {
  if (featured.length === 0) return null;
  return (
    <div className="featured-row" data-count={String(featured.length)}>
      {featured.map((tile) => (
        <div
          key={tile.id}
          className="featured-cell"
          data-kind={tile.isScreenShare ? "screen" : "host"}
        >
          <Tile tile={tile} layoutMode={layoutMode} size="spotlight" />
        </div>
      ))}
    </div>
  );
}

const FILMSTRIP_VISIBLE_MAX = 12;

function Filmstrip({
  tiles,
  layoutMode,
  orientation = "bottom",
  onShowAll,
}: {
  tiles: StageParticipantTile[];
  layoutMode: ConferenceLayoutMode;
  orientation?: "bottom" | "side";
  onShowAll?: () => void;
}) {
  if (tiles.length === 0) return null;
  const overflow = tiles.length > FILMSTRIP_VISIBLE_MAX;
  const visible = overflow ? tiles.slice(0, FILMSTRIP_VISIBLE_MAX) : tiles;
  const hiddenCount = Math.max(0, tiles.length - visible.length);

  return (
    <div className={`video-filmstrip is-${orientation}`} data-count={String(tiles.length)}>
      {visible.map((tile) => (
        <div key={tile.id} className="filmstrip-cell">
          <Tile tile={tile} layoutMode={layoutMode} size="strip" />
        </div>
      ))}
      {overflow && onShowAll ? (
        <button
          type="button"
          className="peers-show-all"
          onClick={onShowAll}
          aria-label={`Show all ${tiles.length} participants`}
        >
          Show all · +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

/** Active speaker — large primary (or host+screen duo) + bottom filmstrip. */
function ActiveSpeakerStage({
  layoutMode,
  tiles,
  hostParticipantId,
  activeSpeakerIds,
  localIdentity,
  onLayoutChange,
}: CommonProps) {
  const stageTiles = orderStageTiles(normalizeTiles(tiles), {
    hostParticipantId,
    localId: "local",
  });
  const featured = pickActiveSpeakerFeatured(stageTiles, {
    hostParticipantId,
    activeSpeakerIds,
    localIdentity,
  });
  const featuredIds = new Set(featured.map((t) => t.id));
  const strip = stageTiles.filter((t) => !featuredIds.has(t.id));

  return (
    <StageShell layoutMode={layoutMode} onLayoutChange={onLayoutChange}>
      <div
        className="video-stage layout-active-speaker"
        data-layout={layoutMode}
        data-count={String(stageTiles.length)}
        data-featured={String(featured.length)}
      >
        <div className="spotlight-pane">
          <FeaturedDuoRow featured={featured} layoutMode={layoutMode} />
        </div>
        <Filmstrip
          tiles={strip}
          layoutMode={layoutMode}
          orientation="bottom"
          onShowAll={onLayoutChange ? () => onLayoutChange("gallery") : undefined}
        />
      </div>
    </StageShell>
  );
}

/** Stage — host (+ screen side-by-side) up front; peers in side strip on wide, bottom on narrow. */
function StageLayoutView({
  layoutMode,
  tiles,
  hostParticipantId,
  onLayoutChange,
  viewerMode,
}: CommonProps) {
  const stageTiles = orderStageTiles(normalizeTiles(tiles), {
    hostParticipantId,
    localId: "local",
  });
  let featured = pickHostScreenFeatured(stageTiles, hostParticipantId);
  if (featured.length === 0 && stageTiles.length > 1) {
    featured = [stageTiles.find((t) => !t.isScreenShare) ?? stageTiles[0]];
  }
  if (featured.length === 0) {
    featured = stageTiles.slice(0, 1);
  }
  const featuredIds = new Set(featured.map((t) => t.id));
  const strip = stageTiles.filter((t) => !featuredIds.has(t.id));
  const sideStrip =
    viewerMode !== "mobile-portrait" && strip.length > 0 && stageTiles.length > 1;

  return (
    <StageShell layoutMode={layoutMode} onLayoutChange={onLayoutChange}>
      <div
        className={`video-stage layout-stage${sideStrip ? " has-side-strip" : ""}`}
        data-layout={layoutMode}
        data-count={String(stageTiles.length)}
        data-featured={String(featured.length)}
      >
        <div className="spotlight-pane">
          <FeaturedDuoRow featured={featured} layoutMode={layoutMode} />
        </div>
        <Filmstrip
          tiles={strip}
          layoutMode={layoutMode}
          orientation={sideStrip ? "side" : "bottom"}
          onShowAll={onLayoutChange ? () => onLayoutChange("gallery") : undefined}
        />
      </div>
    </StageShell>
  );
}

export function ConferenceVideoStage(props: CommonProps) {
  const { layoutMode } = props;
  if (isJitsiGridMode(layoutMode)) {
    return <JitsiGridStage {...props} />;
  }
  if (isEqualGridMode(layoutMode)) {
    return <EqualGridStage {...props} />;
  }
  if (layoutMode === "activeSpeaker") {
    return <ActiveSpeakerStage {...props} />;
  }
  return <StageLayoutView {...props} />;
}

/** @deprecated */
export const MosaicStage = ConferenceVideoStage;
/** @deprecated */
export const GalleryGridStage = ConferenceVideoStage;
