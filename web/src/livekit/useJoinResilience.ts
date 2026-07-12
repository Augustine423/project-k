import { useRoomContext } from "@livekit/components-react";
import {
  ConnectionQuality,
  ConnectionState,
  RoomEvent,
  type LocalParticipant,
} from "livekit-client";
import { useEffect, useState } from "react";

export type JoinPhase = "connecting" | "connected" | "reconnecting" | "audio-only" | "error";

interface UseJoinResilienceResult {
  phase: JoinPhase;
  statusLine: string;
  connectionQuality: ConnectionQuality | null;
}

/** Monitors LiveKit connection state and downgrades to audio-only on poor links. */
export function useJoinResilience(
  localParticipant: LocalParticipant | undefined,
  onError: (message: string) => void,
): UseJoinResilienceResult {
  const room = useRoomContext();
  const [phase, setPhase] = useState<JoinPhase>("connecting");
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);

  useEffect(() => {
    if (!room) return;

    const syncPhase = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) setPhase("connected");
      else if (state === ConnectionState.Reconnecting) setPhase("reconnecting");
      else if (state === ConnectionState.Disconnected) setPhase("connecting");
    };

    // Session reuse can already be connected before listeners attach.
    syncPhase(room.state);

    const onState = (state: ConnectionState) => {
      syncPhase(state);
    };

    const onQuality = (quality: ConnectionQuality, participant: { isLocal: boolean }) => {
      if (!participant.isLocal) return;
      setConnectionQuality(quality);
      if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
        setPhase("audio-only");
        void localParticipant?.setCameraEnabled(false);
      }
    };

    const onMediaFailure = (error: Error) => {
      onError(error.message);
    };

    room.on(RoomEvent.ConnectionStateChanged, onState);
    room.on(RoomEvent.ConnectionQualityChanged, onQuality);
    room.on(RoomEvent.MediaDevicesError, onMediaFailure);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onState);
      room.off(RoomEvent.ConnectionQualityChanged, onQuality);
      room.off(RoomEvent.MediaDevicesError, onMediaFailure);
    };
  }, [room, localParticipant, onError]);

  const statusLine =
    phase === "reconnecting"
      ? "Reconnecting… keeping audio alive"
      : phase === "audio-only"
        ? "Low bandwidth — audio-only mode"
        : phase === "connected"
          ? "Connected"
          : "Connecting…";

  return { phase, statusLine, connectionQuality };
}
