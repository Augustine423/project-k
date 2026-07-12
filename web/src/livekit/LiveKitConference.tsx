import {
  ParticipantTile,
  RoomAudioRenderer,
  RoomContext,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState, DisconnectReason, ParticipantEvent, RoomEvent, Track } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IceServer as ApiIceServer } from "../api/types";
import { ControlBar } from "../components/ControlBar";
import { canAccessMediaDevices, mediaUnavailableReason } from "../media/secureContext";
import { buildConnectOptions, shouldStartAudioOnly } from "./joinOptions";
import {
  acquireLiveKitSession,
  forceDisconnectSession,
  releaseLiveKitSession,
} from "./livekitSession";
import { useJoinResilience } from "./useJoinResilience";

interface LiveKitConferenceProps {
  sessionKey: string;
  serverUrl: string;
  token: string;
  iceServers?: ApiIceServer[];
  onConnected: () => void;
  onDisconnected: (reason?: DisconnectReason) => void;
  onError: (message: string) => void;
  onStatus?: (message: string) => void;
  onLeave: () => void;
}

function ConferenceControls({
  onLeave,
  audioOnly,
  mediaAvailable,
}: {
  onLeave: () => void;
  audioOnly: boolean;
  mediaAvailable: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);

  useEffect(() => {
    if (!localParticipant) return;

    const syncTracks = () => {
      setAudioEnabled(localParticipant.isMicrophoneEnabled);
      setVideoEnabled(localParticipant.isCameraEnabled);
    };

    syncTracks();
    localParticipant.on(ParticipantEvent.LocalTrackPublished, syncTracks);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, syncTracks);
    localParticipant.on(ParticipantEvent.TrackMuted, syncTracks);
    localParticipant.on(ParticipantEvent.TrackUnmuted, syncTracks);

    return () => {
      localParticipant.off(ParticipantEvent.LocalTrackPublished, syncTracks);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, syncTracks);
      localParticipant.off(ParticipantEvent.TrackMuted, syncTracks);
      localParticipant.off(ParticipantEvent.TrackUnmuted, syncTracks);
    };
  }, [localParticipant]);

  useEffect(() => {
    if (audioOnly) setVideoEnabled(false);
  }, [audioOnly]);

  const toggleAudio = useCallback(async () => {
    if (!mediaAvailable) return;
    const next = !audioEnabled;
    await localParticipant.setMicrophoneEnabled(next);
    setAudioEnabled(next);
  }, [audioEnabled, localParticipant, mediaAvailable]);

  const toggleVideo = useCallback(async () => {
    if (!mediaAvailable) return;
    const next = !videoEnabled;
    await localParticipant.setCameraEnabled(next);
    setVideoEnabled(next);
  }, [videoEnabled, localParticipant, mediaAvailable]);

  const shareScreen = useCallback(async () => {
    if (!mediaAvailable) return;
    await localParticipant.setScreenShareEnabled(true);
  }, [localParticipant, mediaAvailable]);

  return (
    <ControlBar
      audioEnabled={audioEnabled}
      videoEnabled={videoEnabled}
      onToggleAudio={() => void toggleAudio()}
      onToggleVideo={() => void toggleVideo()}
      onShareScreen={() => void shareScreen()}
      onLeave={onLeave}
      showScreenShare={!audioOnly}
    />
  );
}

function ConferenceGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const count = Math.max(tracks.length, 1);

  return (
    <div className="video-stage" data-count={String(Math.min(count, 9))}>
      {tracks.length === 0 ? (
        <div className="video-stage-empty">Waiting for video…</div>
      ) : (
        tracks.map((trackRef) => (
          <ParticipantTile
            key={`${trackRef.participant.identity}-${trackRef.source}-${trackRef.publication?.trackSid ?? "pending"}`}
            trackRef={trackRef}
            className="video-tile"
          />
        ))
      )}
    </div>
  );
}

function ConferenceInner({
  sessionKey,
  onStatus,
  onError,
  onLeave,
}: {
  sessionKey: string;
  onStatus?: (message: string) => void;
  onError: (message: string) => void;
  onLeave: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const { phase, statusLine } = useJoinResilience(localParticipant, onError);
  const mediaAvailable = canAccessMediaDevices();

  const handleLeave = useCallback(() => {
    void forceDisconnectSession(sessionKey).finally(onLeave);
  }, [sessionKey, onLeave]);

  useEffect(() => {
    onStatus?.(statusLine);
  }, [statusLine, onStatus]);

  useEffect(() => {
    if (!mediaAvailable) {
      onError(mediaUnavailableReason());
      return;
    }
    if (!localParticipant || phase === "connecting" || phase === "reconnecting") return;
    if (shouldStartAudioOnly() || phase === "audio-only") return;

    const timer = window.setTimeout(() => {
      void localParticipant.setCameraEnabled(true).catch(() => {
        onError("Could not start camera");
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [localParticipant, phase, mediaAvailable, onError]);

  return (
    <>
      {!mediaAvailable && (
        <div className="join-banner warn">{mediaUnavailableReason()}</div>
      )}
      {(phase === "reconnecting" || phase === "audio-only") && (
        <div className={`join-banner ${phase === "audio-only" ? "warn" : "info"}`}>{statusLine}</div>
      )}
      <RoomAudioRenderer />
      <ConferenceGrid />
      <ConferenceControls
        onLeave={handleLeave}
        audioOnly={phase === "audio-only"}
        mediaAvailable={mediaAvailable}
      />
    </>
  );
}

export function LiveKitConference({
  sessionKey,
  serverUrl,
  token,
  iceServers,
  onConnected,
  onDisconnected,
  onError,
  onStatus,
  onLeave,
}: LiveKitConferenceProps) {
  const iceKey = useMemo(() => JSON.stringify(iceServers ?? []), [iceServers]);
  const connectOptions = useMemo(() => buildConnectOptions(iceServers), [iceKey]);
  const connectOptionsRef = useRef(connectOptions);
  connectOptionsRef.current = connectOptions;

  const [room, setRoom] = useState<Awaited<ReturnType<typeof acquireLiveKitSession>> | null>(null);
  const connectedOnce = useRef(false);
  const startVideo = !shouldStartAudioOnly();

  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onErrorRef = useRef(onError);
  const onStatusRef = useRef(onStatus);
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onErrorRef.current = onError;
  onStatusRef.current = onStatus;

  useEffect(() => {
    let cancelled = false;
    let activeRoom: Awaited<ReturnType<typeof acquireLiveKitSession>> | null = null;
    const mediaAvailable = canAccessMediaDevices();

    const onConnectedEvent = () => {
      if (!connectedOnce.current) {
        connectedOnce.current = true;
        onConnectedRef.current();
      }
      if (!mediaAvailable) {
        onStatusRef.current?.(mediaUnavailableReason() || "Connected (listen only)");
        return;
      }
      void activeRoom?.localParticipant.setMicrophoneEnabled(true).catch(() => {
        onErrorRef.current("Could not start microphone");
      });
      if (startVideo) {
        void activeRoom?.localParticipant.setCameraEnabled(true).catch(() => {
          onErrorRef.current("Could not start camera");
        });
      }
    };

    const onDisconnectedEvent = (reason?: DisconnectReason) => {
      connectedOnce.current = false;
      if (
        reason === DisconnectReason.CLIENT_INITIATED ||
        reason === DisconnectReason.DUPLICATE_IDENTITY
      ) {
        return;
      }
      onDisconnectedRef.current(reason);
    };

    (async () => {
      try {
        activeRoom = await acquireLiveKitSession(
          sessionKey,
          serverUrl,
          token,
          connectOptionsRef.current,
        );
        if (cancelled) {
          releaseLiveKitSession(sessionKey);
          return;
        }

        activeRoom.on(RoomEvent.Connected, onConnectedEvent);
        activeRoom.on(RoomEvent.Disconnected, onDisconnectedEvent);

        setRoom(activeRoom);

        if (activeRoom.state === ConnectionState.Connected) {
          onConnectedEvent();
        }
      } catch (err) {
        if (!cancelled) {
          onErrorRef.current(err instanceof Error ? err.message : "Failed to connect");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeRoom) {
        activeRoom.off(RoomEvent.Connected, onConnectedEvent);
        activeRoom.off(RoomEvent.Disconnected, onDisconnectedEvent);
      }
      releaseLiveKitSession(sessionKey);
    };
    // Only reconnect when the participant session identity or credentials change.
  }, [sessionKey, serverUrl, token, startVideo]);

  if (!room) {
    return <div className="join-banner info">Connecting to media server…</div>;
  }

  return (
    <div className="lk-room-container" data-lk-theme="default">
      <RoomContext.Provider value={room}>
        <ConferenceInner sessionKey={sessionKey} onStatus={onStatus} onError={onError} onLeave={onLeave} />
      </RoomContext.Provider>
    </div>
  );
}
