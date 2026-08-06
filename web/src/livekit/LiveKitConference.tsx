import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionQuality,
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type TrackPublication,
} from "livekit-client";
import type { Participant as RoomParticipant, TurnInfo } from "../api/types";
import { listParticipantsPage, reportMediaPresence, refreshTurnCredentials } from "../api/client";
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
import { canAccessMediaDevices, canShareScreenDisplay, mediaUnavailableReason } from "../media/secureContext";
import {
  galleryPageCount,
  MASS_ROOM_THRESHOLD,
  resolveGalleryTier,
  sliceGalleryPage,
} from "../media/galleryVideoPolicy";
import {
  applyParticipantSubscriptions,
  applySelectiveSubscriptions,
  buildSubscriptionTargets,
  shouldTrackRemoteParticipant,
  type SubscriptionTargets,
} from "./selectiveSubscription";
import {
  applyAudioProcessingConstraints,
  applyLocalUplinkVideoQuality,
  applyOrientationCaptureConstraints,
  applyRemoteSimulcastPreferences,
  buildLocalParticipantStream,
  cameraEnableCaptureOptions,
  collectRemoteMediaTracks,
  mediaToggleErrorMessage,
  microphoneEnableCaptureOptions,
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
  /** Guests-only count for the Participants dock badge (excludes host). */
  peopleBadgeCount?: number;
  chatBadge?: number | string;
  onFocusChat?: () => void;
  onFocusParticipants?: () => void;
  onFocusInvite?: () => void;
  activePanel?: "chat" | "participants" | "invite" | null;
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
  peopleBadgeCount,
  chatBadge,
  onFocusChat,
  onFocusParticipants,
  onFocusInvite,
  activePanel = null,
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
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    ConnectionQuality.Unknown,
  );
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

  const isMassRoom = participantCount > MASS_ROOM_THRESHOLD;
  const isMassRoomRef = useRef(isMassRoom);
  isMassRoomRef.current = isMassRoom;

  const [galleryPageParticipants, setGalleryPageParticipants] = useState<RoomParticipant[]>([]);
  const subscriptionTargetsRef = useRef<SubscriptionTargets>({
    video: new Set<string>(),
    audio: new Set<string>(),
  });

  const shouldTrackRemote = useCallback((participant: RemoteParticipant): boolean => {
    if (!isMassRoomRef.current) return true;
    return shouldTrackRemoteParticipant(participant, subscriptionTargetsRef.current);
  }, []);

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

    const onLocalTrackPublished = (_pub: LocalTrackPublication) => {
      onLocalMediaChange();
    };

    const onRemoteMediaChange = () => {
      if (cancelled) return;
      if (isMassRoomRef.current) {
        const targets = subscriptionTargetsRef.current;
        for (const p of room.remoteParticipants.values()) {
          applyParticipantSubscriptions(
            p,
            targets.video.has(p.identity),
            targets.audio.has(p.identity),
          );
          if (shouldTrackRemoteParticipant(p, targets)) upsertRemote(p);
        }
        return;
      }
      refreshRemotes(room);
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
      if (cancelled) return;
      if (isMassRoomRef.current) {
        const targets = subscriptionTargetsRef.current;
        applyParticipantSubscriptions(
          p,
          targets.video.has(p.identity),
          targets.audio.has(p.identity),
        );
        if (shouldTrackRemoteParticipant(p, targets)) upsertRemote(p);
        return;
      }
      if (shouldTrackRemote(p)) upsertRemote(p);
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

    const onConnectionQualityChanged = (quality: ConnectionQuality, participant: Participant) => {
      if (cancelled || !participant.isLocal) return;
      setConnectionQuality(quality);
      applyLocalUplinkVideoQuality(room, quality);
    };

    const finishConnected = () => {
      if (cancelled) return;
      setConnected(true);
      applyLocalStateRef.current(room);
      refreshRemotes(room);
      applyLocalUplinkVideoQuality(room, room.localParticipant.connectionQuality);
      setConnectionQuality(room.localParticipant.connectionQuality);
      onStatusRef.current?.("Connected — use the toolbar to turn on camera and mic");
      onConnectedRef.current();
    };

    room.on(RoomEvent.Connected, finishConnected);
    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
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
    room.on(RoomEvent.ConnectionQualityChanged, onConnectionQualityChanged);

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
            autoSubscribe: !isMassRoomRef.current,
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
      room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
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
      room.off(RoomEvent.ConnectionQualityChanged, onConnectionQualityChanged);
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
          const cam = lp.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
          await applyOrientationCaptureConstraints(cam);
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
          await lp.setMicrophoneEnabled(enabling, enabling ? microphoneEnableCaptureOptions() : undefined);
          if (enabling) {
            await waitForLocalTrack(lp, Track.Source.Microphone);
            const mic = lp.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
            await applyAudioProcessingConstraints(mic);
          }
        } else {
          await lp.setCameraEnabled(enabling, cameraEnableCaptureOptions());
          if (enabling) {
            await waitForLocalTrack(lp, Track.Source.Camera);
            const cam = lp.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
            await applyOrientationCaptureConstraints(cam);
            applyLocalUplinkVideoQuality(room, lp.connectionQuality);
          }
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
    if (!canShareScreenDisplay()) {
      onError("Screen share is not supported on this phone/browser. Use a desktop browser, or share camera instead.");
      return;
    }
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
      const msg = err instanceof Error ? err.message : "Screen share failed";
      if (/getDisplayMedia|not supported|NotSupported/i.test(msg)) {
        onError("Screen share is not supported on this phone/browser. Use a desktop browser, or share camera instead.");
      } else {
        onError(msg);
      }
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
  const remoteParticipantCount = Math.max(0, participantCount - 1);

  // Mass rooms: load participant roster page from control plane (not LiveKit memory).
  useEffect(() => {
    if (!isMassRoom || !roomId) return;
    let cancelled = false;
    const offset = (galleryPage - 1) * galleryTier.videosPerPage;
    void listParticipantsPage(roomId, { offset, limit: galleryTier.videosPerPage })
      .then((page) => {
        if (!cancelled) setGalleryPageParticipants(page.items);
      })
      .catch(() => {
        if (!cancelled) setGalleryPageParticipants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [galleryPage, galleryTier.videosPerPage, isMassRoom, roomId]);

  const sortedRemoteIds = useMemo(() => {
    if (isMassRoom) {
      return galleryPageParticipants
        .filter((p) => p.id !== localIdentity)
        .map((p) => p.id);
    }
    return [...remoteFeeds.entries()]
      .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
      .map(([id]) => id);
  }, [galleryPageParticipants, isMassRoom, localIdentity, remoteFeeds]);

  const paginatedRemoteIds = sortedRemoteIds;

  const totalGalleryPages = useMemo(
    () => galleryPageCount(isMassRoom ? remoteParticipantCount : paginatedRemoteIds.length, galleryTier),
    [galleryTier, isMassRoom, paginatedRemoteIds.length, remoteParticipantCount],
  );

  const visibleRemoteIds = useMemo(
    () => new Set(isMassRoom ? paginatedRemoteIds : sliceGalleryPage(paginatedRemoteIds, galleryPage, galleryTier)),
    [galleryPage, galleryTier, isMassRoom, paginatedRemoteIds],
  );

  const visibleRemoteOrder = useMemo(
    () => (isMassRoom ? paginatedRemoteIds : sliceGalleryPage(paginatedRemoteIds, galleryPage, galleryTier)),
    [galleryPage, galleryTier, isMassRoom, paginatedRemoteIds],
  );

  // Mass room: subscribe only to visible page video + capped audio (active speakers).
  useEffect(() => {
    if (!connected || !isMassRoom) return;
    const room = roomRef.current ?? getLiveKitRoom(sessionKey);
    if (!room) return;

    const targets = buildSubscriptionTargets({
      visibleIds: visibleRemoteOrder,
      activeSpeakerIds,
      hostParticipantId,
    });
    subscriptionTargetsRef.current = targets;
    applySelectiveSubscriptions(room, targets);
    applyRemoteSimulcastPreferences(room, visibleRemoteOrder, galleryTier, connectionQuality);

    for (const participant of room.remoteParticipants.values()) {
      if (!shouldTrackRemoteParticipant(participant, targets)) continue;
      upsertRemote(participant);
    }

    setRemoteFeeds((prev) => {
      const keep = new Set([...targets.video, ...targets.audio]);
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!keep.has(id)) {
          next.delete(id);
          remoteStreamsRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    activeSpeakerIds,
    connected,
    connectionQuality,
    galleryTier,
    hostParticipantId,
    isMassRoom,
    sessionKey,
    upsertRemote,
    visibleRemoteOrder,
  ]);

  // Small/medium rooms: simulcast layer prefs only (autoSubscribe stays on).
  useEffect(() => {
    if (!connected || isMassRoom) return;
    const room = roomRef.current ?? getLiveKitRoom(sessionKey);
    if (!room) return;
    applyRemoteSimulcastPreferences(room, visibleRemoteOrder, galleryTier, connectionQuality);
  }, [connected, connectionQuality, galleryTier, isMassRoom, remoteFeeds, sessionKey, visibleRemoteOrder]);

  useEffect(() => {
    if (galleryPage > totalGalleryPages) setGalleryPage(totalGalleryPages);
  }, [galleryPage, totalGalleryPages]);

  const speakingSet = useMemo(() => new Set(activeSpeakerIds), [activeSpeakerIds]);

  const localTile = useMemo<StageParticipantTile>(
    () => ({
      id: "local",
      label: displayName,
      stream: localStream,
      trackSignature: localStream
        ? localStream
            .getTracks()
            .map((t) => `${t.id}:${t.kind}:${t.readyState}`)
            .sort()
            .join("|")
        : "",
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
    const sourceIds = isMassRoom ? paginatedRemoteIds : sortedRemoteIds;

    for (const id of sourceIds) {
      const feed = remoteFeeds.get(id);
      const roster = isMassRoom ? galleryPageParticipants.find((p) => p.id === id) : undefined;
      const label = feed?.displayName ?? roster?.displayName ?? id;
      const isHostFeed = Boolean(hostParticipantId && id === hostParticipantId);
      remotes.push({
        id,
        label,
        stream: feed?.stream ?? null,
        trackSignature: feed?.trackSignature ?? "",
        hasVideo: feed?.hasVideo ?? false,
        isScreenShare: feed?.isScreenShare ?? false,
        isSpeaking: speakingSet.has(id),
        roleBadge: isHostFeed ? "Host" : roster?.role === "cohost" ? "Co-host" : undefined,
      });
    }
    remotes.sort((a, b) => {
      if (a.roleBadge === "Host") return -1;
      if (b.roleBadge === "Host") return 1;
      return a.label.localeCompare(b.label);
    });
    return [localTile, ...remotes];
  }, [galleryPageParticipants, hostParticipantId, isMassRoom, localTile, paginatedRemoteIds, remoteFeeds, sortedRemoteIds, speakingSet]);

  /** Visible page of remotes (+ local) for gallery / spotlight / mobile-stack. */
  const galleryTiles = useMemo<StageParticipantTile[]>(() => {
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
  }, [allStageTiles, localStream, localTile, paginatedRemoteIds, visibleRemoteIds]);

  const stageTiles = galleryTiles;

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

  const offPageCount = Math.max(
    0,
    (isMassRoom ? remoteParticipantCount : paginatedRemoteIds.length) - visibleRemoteIds.size,
  );

  return (
    <div
      className={`conference-root is-${layoutMode}`}
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
      {isMassRoom && connected && (
        <div className="join-banner info">
          Large meeting — showing {galleryTier.videosPerPage} videos per page. Everyone can use mic/cam; flip pages to see more.
        </div>
      )}
      {silenceNotice && connected && (
        <div className="join-banner info">{silenceNotice}</div>
      )}
      <ConferenceVideoStage
        layoutMode={layoutMode}
        primaryId={primaryId}
        tiles={stageTiles}
        maxPerPage={galleryTier.videosPerPage}
      />
      {(layoutMode === "gallery" || layoutMode === "spotlight" || layoutMode === "mobile-stack") && (
        <GalleryPagination
          page={galleryPage}
          totalPages={totalGalleryPages}
          onPageChange={setGalleryPage}
          totalParticipants={participantCount}
          offPageCount={offPageCount}
        />
      )}
      <div className="hide" aria-hidden>
        {sortedRemoteIds
          .filter((id) => {
            return !visibleRemoteIds.has(id) && !stageTiles.some((t) => t.id === id);
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
        showScreenShare={canPublishVideo && canShareScreenDisplay()}
        showAudioControl={canPublishAudio}
        showVideoControl={canPublishVideo}
        showRaiseHand={showRaiseHand}
        handRaised={handRaised}
        onToggleRaiseHand={onToggleRaiseHand}
        chatBadge={chatBadge}
        mediaBusy={mediaBusy}
        participantCount={participantCount}
        peopleBadgeCount={peopleBadgeCount}
        onFocusChat={onFocusChat}
        onFocusParticipants={onFocusParticipants}
        onFocusInvite={onFocusInvite}
        activePanel={activePanel}
      />
    </div>
  );
}
