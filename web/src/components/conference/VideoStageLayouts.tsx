import type { ReactNode } from "react";
import { LocalSelfPip } from "../LocalSelfPip";
import { StreamVideoTile } from "../StreamVideoTile";
import {
  galleryDataCount,
  type ConferenceLayoutMode,
  type StageParticipantTile,
} from "../../media/conferenceLayout";

type CommonProps = {
  layoutMode: ConferenceLayoutMode;
  primaryId: string;
  tiles: StageParticipantTile[];
  maxPerPage?: number;
  /**
   * Host gallery: keep everyone (including self) in the equal grid.
   * Client / mobile layouts: remotes in stage, self as floating PiP.
   */
  selfInGrid?: boolean;
};

function Tile({
  tile,
  layoutMode,
  size,
  className,
  fit,
}: {
  tile: StageParticipantTile;
  layoutMode: ConferenceLayoutMode;
  size: "grid" | "spotlight" | "strip";
  className?: string;
  fit?: "cover" | "contain" | "contain-blur";
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
      className={className}
      fit={fit}
    />
  );
}

function findSelfTile(tiles: StageParticipantTile[]): StageParticipantTile | undefined {
  return tiles.find((t) => t.mirror) ?? tiles.find((t) => t.id === "local");
}

function othersOnly(tiles: StageParticipantTile[], selfId?: string): StageParticipantTile[] {
  if (!selfId) return tiles;
  return tiles.filter((t) => t.id !== selfId);
}

/** Stage shell: remote/grid content + optional floating self PiP. */
function StageWithPip({
  layout,
  self,
  showPip,
  children,
  count,
}: {
  layout: ConferenceLayoutMode | "gallery";
  self?: StageParticipantTile;
  showPip: boolean;
  children: ReactNode;
  count?: number;
}) {
  return (
    <div
      className="video-stage-shell"
      data-self-pip={showPip ? "on" : "off"}
      data-layout={layout}
    >
      <div
        className="video-stage"
        data-layout={layout === "gallery" ? "gallery" : layout}
        {...(count != null ? { "data-count": String(count) } : {})}
      >
        {children}
      </div>
      <LocalSelfPip
        stream={self?.stream ?? null}
        label={self?.label ?? "You"}
        hasVideo={Boolean(self?.hasVideo)}
        visible={showPip && Boolean(self)}
      />
    </div>
  );
}

function resolvePrimary(
  preferredId: string,
  candidates: StageParticipantTile[],
  fallback?: StageParticipantTile,
): StageParticipantTile | undefined {
  if (preferredId !== "local") {
    const hit = candidates.find((t) => t.id === preferredId);
    if (hit) return hit;
  }
  return candidates[0] ?? fallback;
}

/**
 * Equal participant grid.
 * Host: self + remotes all in grid (classic gallery).
 * Client desktop: remotes in grid + self PiP.
 */
export function GalleryGridStage({
  layoutMode,
  tiles,
  maxPerPage = 25,
  selfInGrid = false,
}: CommonProps) {
  const self = findSelfTile(tiles);
  const remotes = othersOnly(tiles, self?.id);

  const stageTiles = selfInGrid
    ? tiles.length > 0
      ? tiles
      : [{ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false }]
    : remotes.length > 0
      ? remotes
      : self
        ? [self]
        : [{ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false }];

  const showPip = !selfInGrid && remotes.length > 0;
  const count = galleryDataCount(stageTiles.length, maxPerPage);

  return (
    <StageWithPip layout="gallery" showPip={showPip} count={count} self={self}>
      {stageTiles.map((tile) => (
        <Tile key={tile.id} tile={tile} layoutMode={layoutMode} size="grid" />
      ))}
    </StageWithPip>
  );
}

/** Mobile portrait: active speaker + strip; self as corner PiP. */
export function ActiveSpeakerStage({ layoutMode, primaryId, tiles }: CommonProps) {
  const self = findSelfTile(tiles);
  const remotes = othersOnly(tiles, self?.id);
  const primary = resolvePrimary(primaryId, remotes, self);
  const strip = remotes.filter((t) => t.id !== primary?.id);
  const showPip = remotes.length > 0;

  return (
    <StageWithPip layout="active-speaker" showPip={showPip} self={self}>
      <div className="video-spotlight">
        {primary && <Tile tile={primary} layoutMode={layoutMode} size="spotlight" />}
      </div>
      {strip.length > 0 && (
        <div className="video-filmstrip" role="list" aria-label="Other participants">
          {strip.map((tile) => (
            <div key={tile.id} className="video-filmstrip-item" role="listitem">
              <Tile tile={tile} layoutMode={layoutMode} size="strip" />
            </div>
          ))}
        </div>
      )}
    </StageWithPip>
  );
}

/** Mobile landscape: full-screen primary + self PiP. */
export function LandscapeFocusStage({ layoutMode, primaryId, tiles }: CommonProps) {
  const self = findSelfTile(tiles);
  const remotes = othersOnly(tiles, self?.id);
  const primary = resolvePrimary(primaryId, remotes, self);
  const showPip = remotes.length > 0;

  return (
    <StageWithPip layout="landscape-focus" showPip={showPip} self={self}>
      <div className="video-host-full video-landscape-primary">
        {primary && <Tile tile={primary} layoutMode={layoutMode} size="spotlight" />}
      </div>
    </StageWithPip>
  );
}

export function ConferenceVideoStage(props: CommonProps) {
  switch (props.layoutMode) {
    case "active-speaker":
      return <ActiveSpeakerStage {...props} />;
    case "landscape-focus":
      return <LandscapeFocusStage {...props} />;
    case "gallery":
    default:
      return <GalleryGridStage {...props} />;
  }
}
