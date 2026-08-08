import { StreamVideoTile } from "../StreamVideoTile";
import type { CSSProperties } from "react";
import {
  mosaicDataCount,
  orderMosaicTiles,
  resolveMosaicColumns,
  resolveMosaicDensity,
  type ConferenceLayoutMode,
  type StageParticipantTile,
} from "../../media/conferenceLayout";
import type { ViewerViewportMode } from "../../hooks/useViewerViewport";

type CommonProps = {
  layoutMode: ConferenceLayoutMode;
  tiles: StageParticipantTile[];
  maxPerPage?: number;
  hostParticipantId?: string;
  viewerMode?: ViewerViewportMode;
  /** Kept for API compat; mosaic does not use a primary spotlight. */
  primaryId?: string;
};

function Tile({
  tile,
  layoutMode,
  className,
}: {
  tile: StageParticipantTile;
  layoutMode: ConferenceLayoutMode;
  className?: string;
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
      size="grid"
      layoutMode={layoutMode}
      preferredAspect={tile.isScreenShare ? undefined : tile.preferredAspect}
      fit={tile.isScreenShare ? "contain" : undefined}
      className={className}
    />
  );
}

/**
 * Breathing Mosaic — one equal-priority grid for host & client (web + mobile).
 * Column count adapts to tile count + viewport; portrait/landscape stay per-tile.
 */
export function MosaicStage({
  layoutMode,
  tiles,
  maxPerPage = 50,
  hostParticipantId,
  viewerMode,
}: CommonProps) {
  const raw =
    tiles.length > 0
      ? tiles
      : [{ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false }];
  const stageTiles = orderMosaicTiles(raw, { hostParticipantId, localId: "local" });
  const count = mosaicDataCount(stageTiles.length, maxPerPage);
  const cols = resolveMosaicColumns(count, viewerMode);
  const rows = Math.max(1, Math.ceil(count / cols));
  const density = resolveMosaicDensity(count);

  return (
    <div className="video-stage-shell" data-layout="mosaic">
      <div
        className="video-stage"
        data-layout="mosaic"
        data-count={String(count)}
        data-density={density}
        data-cols={String(cols)}
        data-rows={String(rows)}
        style={
          {
            ["--mosaic-cols"]: String(cols),
            ["--mosaic-rows"]: String(rows),
          } as CSSProperties
        }
      >
        {stageTiles.map((tile) => (
          <div key={tile.id} className="mosaic-cell">
            <Tile tile={tile} layoutMode={layoutMode} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** @deprecated — mosaic is the only stage */
export const GalleryGridStage = MosaicStage;

export function ConferenceVideoStage(props: CommonProps) {
  return <MosaicStage {...props} />;
}
