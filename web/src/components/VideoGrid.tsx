import type { ReactNode } from "react";
import { VideoTile } from "./VideoTile";

export interface GridTile {
  id: string;
  label: string;
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
}

interface VideoGridProps {
  tiles: GridTile[];
  emptyMessage?: ReactNode;
}

export function VideoGrid({ tiles, emptyMessage }: VideoGridProps) {
  if (tiles.length === 0) {
    return <div className="video-grid empty">{emptyMessage ?? "Waiting for participants…"}</div>;
  }

  return (
    <div className={`video-grid count-${Math.min(tiles.length, 9)}`}>
      {tiles.map((tile) => (
        <VideoTile
          key={tile.id}
          stream={tile.stream}
          label={tile.label}
          muted={tile.muted}
          mirror={tile.mirror}
        />
      ))}
    </div>
  );
}
