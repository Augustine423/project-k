import type { ReactNode } from "react";
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
};

function Tile({
  tile,
  layoutMode,
  size,
  className,
}: {
  tile: StageParticipantTile;
  layoutMode: ConferenceLayoutMode;
  size: "grid" | "spotlight" | "strip";
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
      size={size}
      layoutMode={layoutMode}
      className={className}
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

/**
 * Floating mirrored self-view for host and client.
 * Hidden when alone so you don't get a duplicate preview of yourself.
 */
function SelfViewPip({
  self,
  othersCount,
  layoutMode,
}: {
  self?: StageParticipantTile;
  othersCount: number;
  layoutMode: ConferenceLayoutMode;
}) {
  if (!self || othersCount === 0) return null;

  return (
    <div className="video-self-pip" aria-label="Your video (picture-in-picture)">
      <Tile tile={self} layoutMode={layoutMode} size="strip" className="video-self-pip-tile" />
    </div>
  );
}

/** Stage shell: grid/spotlight content + overlay PiP (PiP is not a grid cell). */
function StageWithPip({
  layout,
  selfPip,
  alone,
  children,
  count,
}: {
  layout: ConferenceLayoutMode | "gallery";
  selfPip: ReactNode;
  alone: boolean;
  children: ReactNode;
  count?: number;
}) {
  return (
    <div
      className="video-stage-shell"
      data-self-pip={alone ? "off" : "on"}
      data-layout={layout}
    >
      <div
        className="video-stage"
        data-layout={layout === "gallery" ? "gallery" : layout}
        {...(count != null ? { "data-count": String(count) } : {})}
      >
        {children}
      </div>
      {selfPip}
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

/** Desktop: remote grid + floating self PiP (host and client). */
export function GalleryGridStage({ layoutMode, tiles, maxPerPage = 25 }: CommonProps) {
  const self = findSelfTile(tiles);
  const remotes = othersOnly(tiles, self?.id);
  const stageTiles =
    remotes.length > 0
      ? remotes
      : self
        ? [self]
        : [{ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false }];
  const alone = remotes.length === 0;
  const count = galleryDataCount(stageTiles.length, maxPerPage);

  return (
    <StageWithPip
      layout="gallery"
      alone={alone}
      count={count}
      selfPip={<SelfViewPip self={self} othersCount={remotes.length} layoutMode={layoutMode} />}
    >
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
  const alone = remotes.length === 0;

  return (
    <StageWithPip
      layout="active-speaker"
      alone={alone}
      selfPip={<SelfViewPip self={self} othersCount={remotes.length} layoutMode={layoutMode} />}
    >
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
  const alone = remotes.length === 0;

  return (
    <StageWithPip
      layout="landscape-focus"
      alone={alone}
      selfPip={<SelfViewPip self={self} othersCount={remotes.length} layoutMode={layoutMode} />}
    >
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
