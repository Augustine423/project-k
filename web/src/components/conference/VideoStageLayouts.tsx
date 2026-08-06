import { StreamVideoTile } from "../StreamVideoTile";
import {
  galleryDataCount,
  splitPrimaryAndRest,
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

/**
 * Equal participant grid — used for solo / tiny rooms.
 */
export function GalleryGridStage({ layoutMode, tiles, maxPerPage = 25 }: CommonProps) {
  const stageTiles =
    tiles.length > 0
      ? tiles
      : [{ id: "placeholder", label: "Waiting…", stream: null, hasVideo: false }];
  const count = galleryDataCount(stageTiles.length, maxPerPage);

  return (
    <div className="video-stage-shell" data-layout="gallery">
      <div className="video-stage" data-layout="gallery" data-count={String(count)}>
        {stageTiles.map((tile) => (
          <Tile key={tile.id} tile={tile} layoutMode={layoutMode} size="grid" />
        ))}
      </div>
    </div>
  );
}

/**
 * Desktop Meet-style: large active speaker + horizontal filmstrip.
 * Matches video-grid-for-other.jpg
 */
export function SpotlightFilmstripStage({ layoutMode, primaryId, tiles }: CommonProps) {
  if (tiles.length <= 1) {
    return <GalleryGridStage layoutMode="gallery" primaryId={primaryId} tiles={tiles} />;
  }

  const { primary, rest } = splitPrimaryAndRest(tiles, primaryId);

  return (
    <div className="video-stage-shell" data-layout="spotlight">
      <div className="video-stage" data-layout="spotlight" data-count={String(tiles.length)}>
        <div className="video-spotlight">
          <Tile tile={primary} layoutMode={layoutMode} size="spotlight" />
        </div>
        {rest.length > 0 && (
          <div className="video-filmstrip" role="list" aria-label="Other participants">
            {rest.map((tile) => (
              <div key={tile.id} className="video-filmstrip-item" role="listitem">
                <Tile tile={tile} layoutMode={layoutMode} size="strip" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Mobile client stack: large primary on top, 2-column grid below.
 * Matches client-view-for-mobile.png
 */
export function MobileStackStage({ layoutMode, primaryId, tiles }: CommonProps) {
  if (tiles.length <= 1) {
    return <GalleryGridStage layoutMode="gallery" primaryId={primaryId} tiles={tiles} />;
  }

  const { primary, rest } = splitPrimaryAndRest(tiles, primaryId);

  return (
    <div className="video-stage-shell" data-layout="mobile-stack">
      <div className="video-stage" data-layout="mobile-stack" data-count={String(tiles.length)}>
        <div className="video-stack-primary">
          <Tile tile={primary} layoutMode={layoutMode} size="spotlight" />
        </div>
        {rest.length > 0 && (
          <div className="video-stack-grid" role="list" aria-label="Other participants">
            {rest.map((tile) => (
              <div key={tile.id} className="video-stack-cell" role="listitem">
                <Tile tile={tile} layoutMode={layoutMode} size="grid" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConferenceVideoStage(props: CommonProps) {
  if (props.layoutMode === "spotlight") {
    return <SpotlightFilmstripStage {...props} />;
  }
  if (props.layoutMode === "mobile-stack") {
    return <MobileStackStage {...props} />;
  }
  return <GalleryGridStage {...props} />;
}
