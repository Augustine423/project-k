/**
 * Conference video stage (Grid button lives on the bottom control bar).
 *
 * - Gallery view — project-k/index1.html auto-fit gallery + right chat column
 * - Host stage — project-k/index.html large host + right sidebar
 */
import { StreamVideoTile } from "../StreamVideoTile";
import type { CSSProperties, ReactNode } from "react";
import {
  GALLERY_CHAT_COLUMN_PX,
  GALLERY_MIN_ROW_PX,
  GALLERY_MIN_TILE_PX,
  SIDEBAR_WIDTH_PX,
  filmstripLandscapeUnits,
  resolveStagePlan,
  type ConferenceLayoutMode,
  type FocusStagePlan,
  type LandscapePackSlot,
  type SidebarStagePlan,
  type SmallGroupStagePlan,
  type SoloStagePlan,
  type StageParticipantTile,
  type TileStagePlan,
} from "../../media/conferenceLayout";
import {
  layoutGalleryFreeformAbsolute,
  type GalleryFreeformPlacement,
} from "../../media/galleryFreeformLayout";
import type { ViewerViewportMode } from "../../hooks/useViewerViewport";
import { useMemo } from "react";

type CommonProps = {
  tiles: StageParticipantTile[];
  maxPerPage?: number;
  hostParticipantId?: string;
  viewerMode?: ViewerViewportMode;
  activeSpeakerIds?: readonly string[];
  localIdentity?: string;
  layoutMode: ConferenceLayoutMode;
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
      fit={tile.isScreenShare ? "contain" : "cover"}
      className={className}
    />
  );
}

function StageShell({
  layoutMode,
  children,
}: {
  layoutMode: ConferenceLayoutMode;
  children: ReactNode;
}) {
  return (
    <div className="video-stage-shell" data-layout={layoutMode}>
      {children}
    </div>
  );
}

function streamAspectAttr(tile: StageParticipantTile): string | undefined {
  if (tile.isScreenShare) return "landscape";
  if (tile.preferredAspect && tile.preferredAspect !== "unknown") return tile.preferredAspect;
  return undefined;
}

function MmSlot({
  slot,
  layoutMode,
  size = "grid",
  className = "mm-slot",
  style,
}: {
  slot: LandscapePackSlot | GalleryFreeformPlacement<StageParticipantTile>;
  layoutMode: ConferenceLayoutMode;
  size?: "grid" | "spotlight" | "strip";
  className?: string;
  style?: CSSProperties;
}) {
  if (slot.kind === "portrait-pair") {
    const [a, b] = slot.tiles;
    return (
      <div className={`${className} mm-slot--pair`} data-stream-aspect="landscape" style={style}>
        <div className="mm-pair">
          <div className="mm-pair__cell" data-stream-aspect="portrait">
            <Tile tile={a} layoutMode={layoutMode} size={size} />
          </div>
          <div className="mm-pair__cell" data-stream-aspect="portrait">
            <Tile tile={b} layoutMode={layoutMode} size={size} />
          </div>
        </div>
      </div>
    );
  }

  if (slot.kind === "freeform") {
    const aspect = slot.box === "portrait" ? "portrait" : "square";
    return (
      <div
        className={`${className} mm-slot--freeform mm-slot--box-${slot.box} free-tile`}
        data-kind={slot.tile.isScreenShare ? "screen" : "camera"}
        data-stream-aspect={aspect}
        data-box={slot.box}
        style={style}
      >
        <Tile tile={slot.tile} layoutMode={layoutMode} size={size} />
      </div>
    );
  }

  return (
    <div
      className={className}
      data-kind={slot.tile.isScreenShare ? "screen" : "camera"}
      data-stream-aspect={streamAspectAttr(slot.tile)}
      style={style}
    >
      <Tile tile={slot.tile} layoutMode={layoutMode} size={size} />
    </div>
  );
}

function slotKey(
  slot: LandscapePackSlot | GalleryFreeformPlacement<StageParticipantTile>,
): string {
  if (slot.kind === "portrait-pair") return `pair-${slot.tiles[0].id}`;
  return slot.tile.id;
}

function filmstripStyle(slots: LandscapePackSlot[]): CSSProperties {
  const stripUnits = Math.max(0.5, filmstripLandscapeUnits(slots));
  return {
    ["--strip-slots"]: String(slots.length),
    ["--strip-units"]: String(stripUnits),
  } as CSSProperties;
}

function SoloStage({ plan }: { plan: SoloStagePlan }) {
  const { tile, layoutMode, orientation } = plan;
  return (
    <StageShell layoutMode={layoutMode}>
      <div
        className="video-stage mm-stage mm-stage--solo"
        data-layout={layoutMode}
        data-count="1"
        data-orientation={orientation}
      >
        <div
          className="mm-stage__cell"
          data-kind={tile.isScreenShare ? "screen" : "camera"}
          data-stream-aspect={streamAspectAttr(tile) ?? orientation}
        >
          <Tile tile={tile} layoutMode={layoutMode} size="spotlight" />
        </div>
      </div>
    </StageShell>
  );
}

function SmallGroupStage({ plan }: { plan: SmallGroupStagePlan }) {
  const { layoutMode, count, slots, orientation, viewerMode, stripUnits } = plan;
  const bleed =
    viewerMode === "mobile-portrait" || viewerMode === "mobile-landscape";
  const isRow = orientation === "row";

  return (
    <StageShell layoutMode={layoutMode}>
      <div
        className={[
          "video-stage mm-stage mm-stage--small mm-stage--filmstrip",
          isRow ? "mm-stage--filmstrip-row" : "mm-stage--filmstrip-col",
          bleed ? "mm-stage--bleed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-layout={layoutMode}
        data-count={String(count)}
        data-viewer={viewerMode ?? "desktop"}
        data-strip={String(slots.length)}
      >
        <div
          className="mm-stage__filmstrip"
          aria-label="Participants"
          data-orientation={orientation}
          data-strip={String(slots.length)}
          data-strip-units={String(stripUnits)}
          style={filmstripStyle(slots)}
        >
          {slots.map((slot) => (
            <MmSlot
              key={slotKey(slot)}
              slot={slot}
              layoutMode={layoutMode}
              className="mm-slot mm-stage__peer"
            />
          ))}
        </div>
      </div>
    </StageShell>
  );
}

/** Gallery view — large→small by count; 15-up tile size then scroll (50/page). */
function TileStage({ plan }: { plan: TileStagePlan }) {
  const {
    layoutMode,
    count,
    cols,
    rows,
    density,
    sizeLocked,
    scroll,
    tiles,
    lockCols,
    viewportCap,
    portraitGrid,
    fillBleed,
    viewerMode,
    shape,
    sizeCols,
    sizeRows,
    sizeN,
  } = plan;

  const mobileFit =
    viewerMode === "mobile-portrait" || viewerMode === "mobile-landscape";
  const layout = useMemo(
    () => layoutGalleryFreeformAbsolute(tiles, { viewerMode, mobileFit }),
    [tiles, viewerMode, mobileFit],
  );

  const galleryStyle = {
    ["--lock-cols"]: String(lockCols),
    ["--lock-rows"]: String(sizeRows),
    ["--grid-cols"]: String(cols),
    ["--grid-rows"]: String(rows),
    ["--gallery-min-tile"]: `${GALLERY_MIN_TILE_PX}px`,
    ["--gallery-min-row"]: `${GALLERY_MIN_ROW_PX}px`,
    ["--gallery-chat-col"]: `${GALLERY_CHAT_COLUMN_PX}px`,
    ["--gallery-cols"]: String(cols),
    ["--gallery-size-cols"]: String(sizeCols),
    ["--gallery-size-rows"]: String(sizeRows),
    ["--gallery-size-n"]: String(sizeN),
    ["--gallery-rows"]: String(rows),
    ["--gallery-gap"]: count <= 2 ? "12px" : "10px",
  } as CSSProperties;

  return (
    <StageShell layoutMode={layoutMode}>
      <div
        className={[
          "video-stage mm-stage mm-stage--gallery mm-stage--index1 mm-stage--pretty",
          sizeLocked ? "mm-stage--locked" : "",
          scroll ? "mm-stage--scroll" : "",
          portraitGrid ? "mm-stage--portrait" : "",
          fillBleed ? "mm-stage--bleed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-layout="gallery"
        data-count={String(count)}
        data-shape={shape}
        data-density={density}
        data-cols={String(cols)}
        data-rows={String(rows)}
        data-viewer={viewerMode ?? "desktop"}
        data-size-lock={sizeLocked ? String(viewportCap) : undefined}
        data-scroll={scroll ? "1" : undefined}
        style={galleryStyle}
      >
        <div
          className="mm-stage__gallery mm-gallery-flow"
          aria-label="Participants"
          data-cols={String(cols)}
          data-shape={shape}
          data-scroll={scroll ? "1" : undefined}
        >
          {layout.placements.map((placement) => (
            <MmSlot
              key={slotKey(placement)}
              slot={placement}
              layoutMode={layoutMode}
              className="mm-slot mm-stage__cell free-tile"
            />
          ))}
        </div>
      </div>
    </StageShell>
  );
}

/** Gallery view + screen share — same chrome as Host stage (large share + right peer sidebar). */
function FocusStage({ plan }: { plan: FocusStagePlan }) {
  const {
    layoutMode,
    count,
    focus,
    filmstripSlots,
    sizeLocked,
    scroll,
    fillBleed,
    viewerMode,
  } = plan;

  const peerScroll = scroll || sizeLocked || filmstripSlots.length > 6;

  return (
    <StageShell layoutMode={layoutMode}>
      <div
        className={[
          "video-stage mm-stage mm-stage--sidebar mm-stage--gallery-share",
          fillBleed ? "mm-stage--bleed" : "",
          peerScroll ? "is-scroll" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-layout="gallery"
        data-count={String(count)}
        data-viewer={viewerMode ?? "desktop"}
        data-scroll={peerScroll ? "1" : undefined}
        style={
          {
            ["--sidebar-width"]: `${SIDEBAR_WIDTH_PX}px`,
            ["--meeting-sidebar-width"]: `${SIDEBAR_WIDTH_PX}px`,
          } as CSSProperties
        }
      >
        <div
          className="mm-stage__focus mm-stage__host-tile"
          data-kind={focus.isScreenShare ? "screen" : "host"}
          data-stream-aspect={streamAspectAttr(focus)}
        >
          <Tile tile={focus} layoutMode={layoutMode} size="spotlight" />
        </div>
        {filmstripSlots.length > 0 && (
          <div
            className="mm-stage__sidebar"
            aria-label="Participants"
            data-scroll={peerScroll ? "1" : undefined}
          >
            {filmstripSlots.map((slot) => (
              <MmSlot
                key={slotKey(slot)}
                slot={slot}
                layoutMode={layoutMode}
                className="mm-slot mm-stage__sidebar-tile"
              />
            ))}
          </div>
        )}
      </div>
    </StageShell>
  );
}

/**
 * project-k/index.html Host stage:
 * `.main-stage` → large host/share left + right participants sidebar (~300px).
 */
function SidebarStage({ plan }: { plan: SidebarStagePlan }) {
  const { layoutMode, count, focus, peerSlots, scroll, fillBleed, viewerMode } = plan;

  return (
    <StageShell layoutMode={layoutMode}>
      <div
        className={[
          "video-stage mm-stage mm-stage--sidebar",
          fillBleed ? "mm-stage--bleed" : "",
          scroll ? "is-scroll" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-layout="sidebar"
        data-count={String(count)}
        data-viewer={viewerMode ?? "desktop"}
        data-scroll={scroll ? "1" : undefined}
        style={
          {
            ["--sidebar-width"]: `${SIDEBAR_WIDTH_PX}px`,
            ["--meeting-sidebar-width"]: `${SIDEBAR_WIDTH_PX}px`,
          } as CSSProperties
        }
      >
        <div
          className="mm-stage__focus mm-stage__host-tile"
          data-kind={focus.isScreenShare ? "screen" : "host"}
          data-stream-aspect={streamAspectAttr(focus)}
        >
          <Tile tile={focus} layoutMode={layoutMode} size="spotlight" />
        </div>
        <div
          className="mm-stage__sidebar"
          aria-label="Participants"
          data-scroll={scroll ? "1" : undefined}
        >
          {peerSlots.map((slot) => (
            <MmSlot
              key={slotKey(slot)}
              slot={slot}
              layoutMode={layoutMode}
              className="mm-slot mm-stage__sidebar-tile"
            />
          ))}
        </div>
      </div>
    </StageShell>
  );
}

export function ConferenceVideoStage(props: CommonProps) {
  const plan = resolveStagePlan({
    tiles: props.tiles,
    layoutMode: props.layoutMode,
    viewerMode: props.viewerMode,
    hostParticipantId: props.hostParticipantId,
    maxPerPage: props.maxPerPage,
  });

  switch (plan.kind) {
    case "solo":
      return <SoloStage plan={plan} />;
    case "smallGroup":
      return <SmallGroupStage plan={plan} />;
    case "gallery":
      return <TileStage plan={plan} />;
    case "focus":
      return <FocusStage plan={plan} />;
    case "sidebar":
      return <SidebarStage plan={plan} />;
  }
}

/** @deprecated */
export const MosaicStage = ConferenceVideoStage;
/** @deprecated */
export const GalleryGridStage = ConferenceVideoStage;
