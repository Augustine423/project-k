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
}: {
  tile: StageParticipantTile;
  layoutMode: ConferenceLayoutMode;
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
    />
  );
}

/**
 * Equal participant grid for host and client.
 * Self is a normal grid tile (no PiP). Portrait/landscape fit comes from each source stream.
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
          <Tile key={tile.id} tile={tile} layoutMode={layoutMode} />
        ))}
      </div>
    </div>
  );
}

export function ConferenceVideoStage(props: CommonProps) {
  return <GalleryGridStage {...props} />;
}
