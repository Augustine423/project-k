import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type TrackPublication,
} from "livekit-client";
import type { TurnInfo } from "../api/types";
import { reportMediaPresence, refreshTurnCredentials } from "../api/client";
import { ControlBar } from "../components/ControlBar";
import { GalleryPagination } from "../components/GalleryPagination";
import { ConferenceVideoStage } from "../components/conference/VideoStageLayouts";
import { StreamVideoTile } from "../components/StreamVideoTile";
import { useViewerViewport } from "../hooks/useViewerViewport";
import {
  pickPrimaryTileId,
  resolveConferenceLayout,
  type StageParticipantTile,
} from "../media/conferenceLayout";
import { canAccessMediaDevices, mediaUnavailableReason } from "../media/secureContext";
import {
  galleryPageCount,
  resolveGalleryTier,
  sliceGalleryPage,
} from "../media/galleryVideoPolicy";
import {
  applyRemoteSimulcastPreferences,
  buildLocalParticipantStream,
  cameraEnableCaptureOptions,
  collectRemoteMediaTracks,
  mediaToggleErrorMessage,
  participantHasVideo,
  remoteTrackSignature,
  syncMediaStreamTracks,
  waitForLocalTrack,
} from "./livekitVideoSettings";
import {
  forceDisconnectLiveKitRoom,
  getLiveKitRoom,
  releaseLiveKitRoom,
  retainLiveKitRoom,
} from "./livekitRoomSession";

interface LiveKitConferenceProps {
  roomId: string;
  participantToken: string;
  liveKitUrl: string;
  liveKitToken: string;
  turn: TurnInfo;
  displayName: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (message: string) => void;
  onStatus?: (message: string) => void;
  onLeave: () => void;
  participantCount?: number;
  chatBadge?: number | string;
  onFocusChat?: () => void;
  onFocusParticipants?: () => void;
  roomMode?: string;
  /** host | cohost | participant — drives webinar camera rights while media API syncs. */
  participantRole?: string;
  /** Control-plane host identity — used for attendee spotlight layout. */
  hostParticipantId?: string;
  showRaiseHand?: boolean;
  handRaised?: boolean;
  onToggleRaiseHand?: () => void;
}

/** Auto-mute webinar mics left open without speech (accidental unmute mitigation). */
const WEBINAR_SILENCE_AUTOMUTE_MS = 30_000;
const SPEECH_LEVEL_THRESHOLD = 0.025;

type RemoteFeed = {
  displayName: string;
  stream: MediaStream;
  trackSignature: string;
  hasVideo: boolean;
  isScreenShare: boolean;
};

export function LiveKitConference({
  roomId,
  participantToken,
  liveKitUrl,
  liveKitToken,
  turn,
  displayName,
  onConnected,
  onDisconnected,
  onError,
  onStatus,
  onLeave,
  participantCount = 1,
  chatBadge,
  onFocusChat,
  onFocusParticipants,
  roomMode,
  participantRole = "participant",
  hostParticipantId,
  showRaiseHand = false,
  handRaised = false,
  onToggleRaiseHand,
}: LiveKitConferenceProps) {
  const sessionKey = `${roomId}:${participantToken}`;
  const roomRef = useRef<Room | null>(null);
  const mediaBusyRef = useRef(false);
  /** Stable MediaStreams per remote — recreating them restarts audio and sounds like echo. */
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteFeeds, setRemoteFeeds] = useState<Map<string, RemoteFeed>>(new Map());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [galleryPage, setGalleryPage] = useState(1);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [localScreenShare, setLocalScreenShare] = useState(false);
  const [localIdentity, setLocalIdentity] = useState("");
  const isHostRole = participantRole === "host" || participantRole === "cohost";
  const isWebinar = roomMode === "webinar";
  const [canPublishAudio, setCanPublishAudio] = useState(true);
  const [canPublishVideo, setCanPublishVideo] = useState(() => isHostRole || roomMode !== "webinar");
  const [silenceNotice, setSilenceNotice] = useState<string | null>(null);
  const mediaAvailable = canAccessMediaDevices();
  const viewport = useViewerViewport();
  const layoutMode = resolveConferenceLayout(viewport.mode);

  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onErrorRef = useRef(onError);
  const onStatusRef = useRef(onStatus);
  const liveKitUrlRef = useRef(liveKitUrl);
  const liveKitTokenRef = useRef(liveKitToken);
  const turnRef = useRef(turn);
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onErrorRef.current = onError;
  onStatusRef.current = onStatus;
  liveKitUrlRef.current = liveKitUrl;
  liveKitTokenRef.current = liveKitToken;
  turnRef.current = turn;

  const isLargeRoom = participantCount > 200;

  const shouldTrackRemote = useCallback(
    (participant: RemoteParticipant): boolean => {
      if (!isLargeRoom) return true;
      return participant.trackPublications.size > 0;
    },
    [isLargeRoom],
  );

  const syncRemoteFeed = useCallback((participant: RemoteParticipant): RemoteFeed => {
    let stream = remoteStreamsRef.current.get(participant.identity);
    if (!stream) {
      stream = new MediaStream();
      remoteStreamsRef.current.set(participant.identity, stream);
    }
    const tracks = collectRemoteMediaTracks(participant);
    syncMediaStreamTracks(stream, tracks);
    const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
    const isScreenShare = Boolean(screenPub?.track && !screenPub.isMuted);
    return {
      displayName: participant.name || participant.identity,
      stream,
      trackSignature: remoteTrackSignature(tracks),
      hasVideo: participantHasVideo(participant) || isScreenShare,
      isScreenShare,
    };
  }, []);

  const refreshLocalUi = useCallback((room: Room) => {
    const lp = room.localParticipant;
    setAudioEnabled(lp.isMicrophoneEnabled);
    setVideoEnabled(lp.isCameraEnabled);
    setLocalScreenShare(lp.isScreenShareEnabled);
    setLocalIdentity(lp.identity);
    setLocalStream(buildLocalParticipantStream(lp));
  }, []);

  const applyPublishCaps = useCallback(
    async (
      room: Room,
      caps: { canPublishAudio: boolean; canPublishVideo: boolean },
    ) => {
      setCanPublishAudio(caps.canPublishAudio);
      setCanPublishVideo(caps.canPublishVideo);
      const lp = room.localParticipant;
      if (!caps.canPublishAudio && lp.isMicrophoneEnabled) {
        await lp.setMicrophoneEnabled(false);
      }
      if (!caps.canPublishVideo) {
        if (lp.isCameraEnabled) await lp.setCameraEnabled(false);
        if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
      }
      // UI only — do not re-report media presence (avoids sync loops).
      refreshLocalUi(room);
    },
    [refreshLocalUi],
  );

  const syncMediaPresence = useCallback(
    (room: Room) => {
      const lp = room.localParticipant;
      void reportMediaPresence(roomId, participantToken, {
        publishing: lp.isMicrophoneEnabled || lp.isCameraEnabled,
        audio: lp.isMicrophoneEnabled,
        video: lp.isCameraEnabled,
      })
        .then((res) => {
          const audio = res.canPublishAudio ?? !res.listenerOnly;
          const video = res.canPublishVideo ?? !res.listenerOnly;
          void applyPublishCaps(room, { canPublishAudio: audio, canPublishVideo: video });
        })
        .catch(() => undefined);
    },
    [applyPublishCaps, roomId, participantToken],
  );

  const syncMediaPresenceRef = useRef(syncMediaPresence);
  syncMediaPresenceRef.current = syncMediaPresence;

  const applyLocalState = useCallback(
    (room: Room) => {
      refreshLocalUi(room);
      syncMediaPresenceRef.current(room);
    },
    [refreshLocalUi],
  );

  const applyLocalStateRef = useRef(applyLocalState);
  applyLocalStateRef.current = applyLocalState;

  const applyVideoRestricted = useCallback(
    async (room: Room) => {
      const lp = room.localParticipant;
      if (lp.isCameraEnabled) await lp.setCameraEnabled(false);
      if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
      refreshLocalUi(room);
      syncMediaPresenceRef.current(room);
    },
    [refreshLocalUi],
  );

  const upsertRemote = useCallback(
    (participant: RemoteParticipant) => {
      if (participant.identity === roomRef.current?.localParticipant.identity) return;
      if (!shouldTrackRemote(participant)) return;
      setRemoteFeeds((prev) => {
        const next = new Map(prev);
        next.set(participant.identity, syncRemoteFeed(participant));
        return next;
      });
    },
    [shouldTrackRemote, syncRemoteFeed],
  );

  const removeRemote = useCallback((identity: string) => {
    remoteStreamsRef.current.delete(identity);
    setRemoteFeeds((prev) => {
      if (!prev.has(identity)) return prev;
      const next = new Map(prev);
      next.delete(identity);
      return next;
    });
  }, []);

  const refreshRemotes = useCallback(
    (room: Room) => {
      for (const p of room.remoteParticipants.values()) {
        if (shouldTrackRemote(p)) upsertRemote(p);
      }
    },
    [shouldTrackRemote, upsertRemote],
  );

  // One SFU session per room+token — never disconnect on React remount.
  useEffect(() => {
    if (!mediaAvailable) {
      onErrorRef.current(mediaUnavailableReason());
      return;
    }

    let cancelled = false;
    const room = retainLiveKitRoom(sessionKey);
    roomRef.current = room;

    const onLocalMediaChange = () => {
      if (!cancelled) applyLocalStateRef.current(room);
    };

    const onRemoteMediaChange = () => {
      if (!cancelled) refreshRemotes(room);
    };

    const onDisconnected = () => {
      if (cancelled) return;
      setConnected(false);
      onDisconnectedRef.current();
    };

    const onTrackMuted = (pub: TrackPublication) => {
      if (pub.isLocal) onLocalMediaChange();
      else onRemoteMediaChange();
    };

    const onTrackUnmuted = (pub: TrackPublication) => {
      if (pub.isLocal) onLocalMediaChange();
      else onRemoteMediaChange();
    };

    const onParticipantConnected = (p: RemoteParticipant) => {
      if (!cancelled && shouldTrackRemote(p)) upsertRemote(p);
    };

    const onParticipantDisconnected = (p: RemoteParticipant) => {
      if (!cancelled) removeRemote(p.identity);
    };

    const onReconnected = () => {
      if (!cancelled) {
        applyLocalStateRef.current(room);
        refreshRemotes(room);
        setConnected(true);
        onStatusRef.current?.("Reconnected to media server");
      }
    };

    const onActiveSpeakersChanged = (speakers: { identity: string }[]) => {
      if (cancelled) return;
      setActiveSpeakerIds(speakers.map((s) => s.identity));
    };

    const finishConnected = () => {
      if (cancelled) return;
      setConnected(true);
      applyLocalStateRef.current(room);
      refreshRemotes(room);
      onStatusRef.current?.("Connected — use the toolbar to turn on camera and mic");
      onConnectedRef.current();
    };

    room.on(RoomEvent.Connected, finishConnected);
    room.on(RoomEvent.LocalTrackPublished, onLocalMediaChange);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalMediaChange);
    room.on(RoomEvent.TrackMuted, onTrackMuted);
    room.on(RoomEvent.TrackUnmuted, onTrackUnmuted);
    room.on(RoomEvent.TrackSubscribed, onRemoteMediaChange);
    room.on(RoomEvent.TrackUnsubscribed, onRemoteMediaChange);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.Reconnected, onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);

    if (room.state === ConnectionState.Connected) {
      finishConnected();
    } else if (room.state === ConnectionState.Connecting) {
      onStatusRef.current?.("Connecting to LiveKit…");
    } else {
      void (async () => {
        try {
          onStatusRef.current?.("Connecting to LiveKit…");
          const t = turnRef.current;
          const iceServers: RTCIceServer[] = t.urls.length
            ? t.urls.map((url) => ({
                urls: url,
                username: t.username,
                credential: t.credential,
              }))
            : [{ urls: "stun:stun.l.google.com:19302" }];

          await room.connect(liveKitUrlRef.current, liveKitTokenRef.current, {
            rtcConfig: { iceServers },
          });
          if (!cancelled) finishConnected();
        } catch (err) {
          if (!cancelled) {
            onErrorRef.current(err instanceof Error ? err.message : "Failed to join media room");
          }
        }
      })();
    }

    return () => {
      cancelled = true;
      room.off(RoomEvent.Connected, finishConnected);
      room.off(RoomEvent.LocalTrackPublished, onLocalMediaChange);
      room.off(RoomEvent.LocalTrackUnpublished, onLocalMediaChange);
      room.off(RoomEvent.TrackMuted, onTrackMuted);
      room.off(RoomEvent.TrackUnmuted, onTrackUnmuted);
      room.off(RoomEvent.TrackSubscribed, onRemoteMediaChange);
      room.off(RoomEvent.TrackUnsubscribed, onRemoteMediaChange);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.Reconnected, onReconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
      releaseLiveKitRoom(sessionKey);
      if (roomRef.current === room) roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable SFU session; props read via refs
  }, [sessionKey, mediaAvailable]);

  // Refresh TURN credentials before the 24h coturn TTL expires (long webinars).
  useEffect(() => {
    if (!connected) return;
    const intervalMs = 12 * 60 * 60 * 1000;
    const timer = window.setInterval(() => {
      void refreshTurnCredentials(roomId, participantToken)
        .then((next) => {
          turnRef.current = next;
        })
        .catch(() => undefined);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [connected, participantToken, roomId]);

  // When the control plane switches to webinar, keep mic but stop camera/screen for non-hosts.
  useEffect(() => {
    const room = roomRef.current ?? getLiveKitRoom(sessionKey);
    if (!room || room.state !== ConnectionState.Connected) return;
    if (isWebinar && !isHostRole) {
      setCanPublishVideo(false);
      setCanPublishAudio(true);
      void applyVideoRestricted(room);
    } else {
      syncMediaPresenceRef.current(room);
    }
  }, [applyVideoRestricted, isHostRole, isWebinar, sessionKey]);

  // Accidental unmute: auto-mute local mic after sustained silence in webinar.
  useEffect(() => {
    if (!connected || !isWebinar || !audioEnabled) {
      setSilenceNotice(null);
      return;
    }

    let lastSpeechAt = Date.now();
    const timer = window.setInterval(() => {
      const room = roomRef.current ?? getLiveKitRoom(sessionKey);
      if (!room || room.state !== ConnectionState.Connected) return;
      const lp = room.localParticipant;
      if (!lp.isMicrophoneEnabled) return;

      const speaking = lp.isSpeaking || lp.audioLevel >= SPEECH_LEVEL_THRESHOLD;
      if (speaking) {
        lastSpeechAt = Date.now();
        return;
      }

      if (Date.now() - lastSpeechAt < WEBINAR_SILENCE_AUTOMUTE_MS) return;
      if (mediaBusyRef.current) return;

      mediaBusyRef.current = true;
      setMediaBusy(true);
      void lp
        .setMicrophoneEnabled(false)
        .then(() => {
          applyLocalStateRef.current(room);
          setSilenceNotice("Mic muted — no speech detected");
          onStatusRef.current?.("Mic muted — no speech detected");
        })
        .catch(() => undefined)
        .finally(() => {
          mediaBusyRef.current = false;
          setMediaBusy(false);
        });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [audioEnabled, connected, isWebinar, sessionKey]);

  useEffect(() => {
    if (!silenceNotice) return;
    const t = window.setTimeout(() => setSilenceNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [silenceNotice]);

  // Phones: re-apply capture constraints when rotating so portrait/landscape FOV isn't cropped.
  useEffect(() => {
    if (!connected || !videoEnabled || !canPublishVideo) return;

    let busy = false;
    const restartForOrientation = () => {
      const room = roomRef.current ?? getLiveKitRoom(sessionKey);
      if (!room || busy || mediaBusyRef.current) return;
      const lp = room.localParticipant;
      if (!lp.isCameraEnabled) return;
      busy = true;
      void (async () => {
        try {
          await lp.setCameraEnabled(false);
          await lp.setCameraEnabled(true, cameraEnableCaptureOptions());
          await waitForLocalTrack(lp, Track.Source.Camera);
          applyLocalStateRef.current(room);
        } catch {
          // keep previous track if restart fails
        } finally {
          busy = false;
        }
      })();
    };

    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = () => restartForOrientation();
    mq.addEventListener?.("change", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      mq.removeEventListener?.("change", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, [canPublishVideo, connected, sessionKey, videoEnabled]);

  const runMediaToggle = useCallback(
    async (kind: "audio" | "video") => {
      const room = roomRef.current ?? getLiveKitRoom(sessionKey);
      if (!room || mediaBusyRef.current) return;
      if (kind === "audio" && !canPublishAudio) return;
      if (kind === "video" && !canPublishVideo) return;
      roomRef.current = room;
      if (room.state === ConnectionState.Connecting || room.state === ConnectionState.Reconnecting) {
        onErrorRef.current("Media server is still connecting — wait a moment and try again.");
        return;
      }
      if (room.state !== ConnectionState.Connected) {
        onErrorRef.current("Not connected to media server — refresh and try again.");
        return;
      }

      mediaBusyRef.current = true;
      setMediaBusy(true);
      const lp = room.localParticipant;
      const enabling = kind === "audio" ? !lp.isMicrophoneEnabled : !lp.isCameraEnabled;

      try {
        if (kind === "audio") {
          await lp.setMicrophoneEnabled(enabling);
          if (enabling) await waitForLocalTrack(lp, Track.Source.Microphone);
        } else {
          await lp.setCameraEnabled(enabling, cameraEnableCaptureOptions());
          if (enabling) await waitForLocalTrack(lp, Track.Source.Camera);
        }
        applyLocalState(room);
      } catch (err) {
        applyLocalState(room);
        onErrorRef.current(mediaToggleErrorMessage(kind, err));
      } finally {
        mediaBusyRef.current = false;
        setMediaBusy(false);
      }
    },
    [applyLocalState, canPublishAudio, canPublishVideo, sessionKey],
  );

  const shareScreen = useCallback(async () => {
    const room = roomRef.current ?? getLiveKitRoom(sessionKey);
    if (!room || mediaBusyRef.current || !canPublishVideo) return;
    roomRef.current = room;
    if (room.state !== ConnectionState.Connected) {
      onError("Not connected to media server — open this page over HTTPS and refresh.");
      return;
    }
    mediaBusyRef.current = true;
    setMediaBusy(true);
    try {
      await room.localParticipant.setScreenShareEnabled(true);
      applyLocalState(room);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Screen share failed");
    } finally {
      mediaBusyRef.current = false;
      setMediaBusy(false);
    }
  }, [applyLocalState, canPublishVideo, onError, sessionKey]);

  const handleLeave = useCallback(() => {
    forceDisconnectLiveKitRoom(sessionKey);
    roomRef.current = null;
    onLeave();
  }, [onLeave, sessionKey]);

  const galleryTier = useMemo(() => resolveGalleryTier(participantCount), [participantCount]);

  const sortedRemoteIds = useMemo(
    () =>
      [...remoteFeeds.entries()]
        .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
        .map(([id]) => id),
    [remoteFeeds],
  );

  /** Equal gallery grid for everyone (same tile size as host view). */
  const paginatedRemoteIds = sortedRemoteIds;

  const totalGalleryPages = useMemo(
    () => galleryPageCount(paginatedRemoteIds.length, galleryTier),
    [paginatedRemoteIds.length, galleryTier],
  );

  const visibleRemoteIds = useMemo(
    () => new Set(sliceGalleryPage(paginatedRemoteIds, galleryPage, galleryTier)),
    [paginatedRemoteIds, galleryPage, galleryTier],
  );

  const visibleRemoteOrder = useMemo(
    () => sliceGalleryPage(paginatedRemoteIds, galleryPage, galleryTier),
    [paginatedRemoteIds, galleryPage, galleryTier],
  );

  // Request best simulcast layer per gallery slot; LiveKit still adapts down on weak links.
  useEffect(() => {
    const room = roomRef.current ?? getLiveKitRoom(sessionKey);
    if (!room || !connected) return;
    applyRemoteSimulcastPreferences(room, visibleRemoteOrder, galleryTier);
  }, [connected, galleryTier, remoteFeeds, sessionKey, visibleRemoteOrder]);

  useEffect(() => {
    if (galleryPage > totalGalleryPages) setGalleryPage(totalGalleryPages);
  }, [galleryPage, totalGalleryPages]);

  const speakingSet = useMemo(() => new Set(activeSpeakerIds), [activeSpeakerIds]);

  const localTile = useMemo<StageParticipantTile>(
    () => ({
      id: "local",
      label: displayName,
      stream: localStream,
      mirror: true,
      hasVideo: videoEnabled || localScreenShare,
      isScreenShare: localScreenShare,
      isSpeaking: Boolean(localIdentity && speakingSet.has(localIdentity)),
      roleBadge: isHostRole ? (participantRole === "cohost" ? "Co-host" : "Host") : "You",
    }),
    [
      displayName,
      isHostRole,
      localIdentity,
      localScreenShare,
      localStream,
      participantRole,
      speakingSet,
      videoEnabled,
    ],
  );

  const allStageTiles = useMemo<StageParticipantTile[]>(() => {
    const remotes: StageParticipantTile[] = [];
    for (const id of sortedRemoteIds) {
      const feed = remoteFeeds.get(id);
      if (!feed) continue;
      const isHostFeed = Boolean(hostParticipantId && id === hostParticipantId);
      remotes.push({
        id,
        label: feed.displayName,
        stream: feed.stream,
        trackSignature: feed.trackSignature,
        hasVideo: feed.hasVideo,
        isScreenShare: feed.isScreenShare,
        isSpeaking: speakingSet.has(id),
        roleBadge: isHostFeed ? "Host" : undefined,
      });
    }
    remotes.sort((a, b) => {
      if (a.roleBadge === "Host") return -1;
      if (b.roleBadge === "Host") return 1;
      return a.label.localeCompare(b.label);
    });
    return [localTile, ...remotes];
  }, [hostParticipantId, localTile, remoteFeeds, sortedRemoteIds, speakingSet]);

  /** Gallery only downloads the current page of remotes (+ local). */
  const galleryTiles = useMemo<StageParticipantTile[]>(() => {
    if (layoutMode !== "gallery") return allStageTiles;
    const result: StageParticipantTile[] = [localTile];
    for (const id of paginatedRemoteIds) {
      if (!visibleRemoteIds.has(id)) continue;
      const tile = allStageTiles.find((t) => t.id === id);
      if (tile) result.push(tile);
    }
    if (result.length === 1 && !localStream) {
      return [{ ...localTile, id: "placeholder", hasVideo: false, stream: null }];
    }
    return result;
  }, [
    allStageTiles,
    layoutMode,
    localStream,
    localTile,
    paginatedRemoteIds,
    visibleRemoteIds,
  ]);

  const stageTiles = layoutMode === "gallery" ? galleryTiles : allStageTiles;

  const primaryId = useMemo(
    () =>
      pickPrimaryTileId({
        tiles: stageTiles,
        activeSpeakerIds,
        hostParticipantId,
        localId: "local",
      }),
    [activeSpeakerIds, hostParticipantId, stageTiles],
  );

  const offPageCount = Math.max(0, paginatedRemoteIds.length - visibleRemoteIds.size);

  return (
    <div
      className={`conference-root is-${layoutMode}`}
      data-viewer={viewport.mode}
      data-layout={layoutMode}
    >
      {!mediaAvailable && (
        <div className="join-banner warn">{mediaUnavailableReason()}</div>
      )}
      {!connected && (
        <div className="join-banner info">Connecting to media server…</div>
      )}
      {isWebinar && !isHostRole && connected && (
        <div className="join-banner info">Webinar — raise hand to get the host’s attention.</div>
      )}
      {silenceNotice && connected && (
        <div className="join-banner info">{silenceNotice}</div>
      )}
      {layoutMode === "gallery" && (
        <GalleryPagination
          page={galleryPage}
          totalPages={totalGalleryPages}
          onPageChange={setGalleryPage}
          totalParticipants={participantCount}
          offPageCount={offPageCount}
        />
      )}
      <ConferenceVideoStage
        layoutMode={layoutMode}
        primaryId={primaryId}
        tiles={stageTiles}
        maxPerPage={galleryTier.videosPerPage}
      />
      <div className="hide" aria-hidden>
        {sortedRemoteIds
          .filter((id) => {
            if (layoutMode === "gallery") return !visibleRemoteIds.has(id);
            // Spotlight layouts still need off-primary audio if tile isn't mounted with audio.
            // Primary + strip/pip cover most tiles; keep safety net for any missed remote.
            return !stageTiles.some((t) => t.id === id);
          })
          .map((id) => {
            const feed = remoteFeeds.get(id);
            if (!feed?.stream.getAudioTracks().length) return null;
            return (
              <StreamVideoTile
                key={`audio-${id}`}
                stream={feed.stream}
                trackSignature={feed.trackSignature}
                label={feed.displayName}
                hasVideo={false}
                showStats={false}
                layoutMode={layoutMode}
              />
            );
          })}
      </div>
      <ControlBar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        onToggleAudio={() => void runMediaToggle("audio")}
        onToggleVideo={() => void runMediaToggle("video")}
        onShareScreen={() => void shareScreen()}
        onLeave={handleLeave}
        showScreenShare={canPublishVideo}
        showAudioControl={canPublishAudio}
        showVideoControl={canPublishVideo}
        showRaiseHand={showRaiseHand}
        handRaised={handRaised}
        onToggleRaiseHand={onToggleRaiseHand}
        chatBadge={chatBadge}
        mediaBusy={mediaBusy}
        onFocusChat={onFocusChat}
        onFocusParticipants={onFocusParticipants}
      />
    </div>
  );
}
