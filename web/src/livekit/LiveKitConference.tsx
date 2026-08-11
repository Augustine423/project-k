import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
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
import { GallerySimBar } from "../components/conference/GallerySimBar";
import { StreamVideoTile } from "../components/StreamVideoTile";
import { useViewerViewport } from "../hooks/useViewerViewport";
import {
  layoutPageSize,
  layoutRemotesPerPage,
  persistLayoutMode,
  readStoredLayoutMode,
  type ConferenceLayoutMode,
  type StageParticipantTile,
  type StreamAspect,
} from "../media/conferenceLayout";
import { canAccessMediaDevices, canShareScreenDisplay, mediaUnavailableReason } from "../media/secureContext";
import { preferredAspectForCaptureDevice, localDeviceAttributes, readPreferredVideoAspect, readSourceDevice } from "../media/participantDevice";
import { detectCaptureDeviceClass } from "../media/deviceCapture";
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
  buildLocalCameraStream,
  buildLocalScreenStream,
  cameraEnableCaptureOptions,
  collectRemoteMediaTracks,
  collectRemoteScreenTrack,
  mediaToggleErrorMessage,
  microphoneEnableCaptureOptions,
  participantHasVideo,
  remoteTrackSignature,
  screenShareCaptureOptions,
  syncMediaStreamTracks,
  waitForLocalTrack,
} from "./livekitVideoSettings";
import {
  persistEnhancedNoiseCancelEnabled,
  readEnhancedNoiseCancelEnabled,
  syncNoiseCancellation,
} from "./livekitAudioProcessor";
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
  seedParticipants?: RoomParticipant[];
  selfParticipantId?: string;
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
  screenStream: MediaStream | null;
  screenTrackSignature: string;
  hasVideo: boolean;
  hasScreenShare: boolean;
  preferredAspect?: StreamAspect;
  sourceDevice?: string;
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
  seedParticipants = [],
  selfParticipantId,
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
  const remoteScreenStreamsRef = useRef(new Map<string, MediaStream>());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteFeeds, setRemoteFeeds] = useState<Map<string, RemoteFeed>>(new Map());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  /** Enhanced NC (DTLN) — Meet Krisp / Jitsi rnnoise analogue; browser AEC always on. */
  const [noiseCancelEnabled, setNoiseCancelEnabled] = useState(() =>
    readEnhancedNoiseCancelEnabled(),
  );
  const noiseCancelEnabledRef = useRef(noiseCancelEnabled);
  noiseCancelEnabledRef.current = noiseCancelEnabled;
  const [connected, setConnected] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [galleryPage, setGalleryPage] = useState(1);
  const [simAddCount, setSimAddCount] = useState(4);
  const [simSpecs, setSimSpecs] = useState<Array<{ id: string; kind: "web" | "mobile" }>>([]);
  const simSeqRef = useRef(1);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    ConnectionQuality.Unknown,
  );
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [localScreenShare, setLocalScreenShare] = useState(false);
  const [layoutMode, setLayoutMode] = useState<ConferenceLayoutMode>(() => readStoredLayoutMode());
  /** Local gallery box: mobile upright → portrait 9:16; else → square 1:1 (updates on rotate). */
  const [localPublishAspect, setLocalPublishAspect] = useState(() => preferredAspectForCaptureDevice());
  const [localSourceDevice, setLocalSourceDevice] = useState(() => detectCaptureDeviceClass());
  const [localIdentity, setLocalIdentity] = useState("");
  const isHostRole = participantRole === "host" || participantRole === "cohost";
  const isWebinar = roomMode === "webinar";
  const [canPublishAudio, setCanPublishAudio] = useState(true);
  const [canPublishVideo, setCanPublishVideo] = useState(() => isHostRole || roomMode !== "webinar");
  const [silenceNotice, setSilenceNotice] = useState<string | null>(null);
  const mediaAvailable = canAccessMediaDevices();
  const viewport = useViewerViewport();

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

    const screenTrack = collectRemoteScreenTrack(participant);
    let screenStream = remoteScreenStreamsRef.current.get(participant.identity) ?? null;
    if (screenTrack) {
      if (!screenStream) {
        screenStream = new MediaStream();
        remoteScreenStreamsRef.current.set(participant.identity, screenStream);
      }
      syncMediaStreamTracks(screenStream, [screenTrack]);
    } else if (screenStream) {
      syncMediaStreamTracks(screenStream, []);
      remoteScreenStreamsRef.current.delete(participant.identity);
      screenStream = null;
    }

    return {
      displayName: participant.name || participant.identity,
      stream,
      trackSignature: remoteTrackSignature(tracks),
      screenStream,
      screenTrackSignature: screenTrack ? remoteTrackSignature([screenTrack]) : "",
      hasVideo: participantHasVideo(participant),
      hasScreenShare: Boolean(screenTrack),
      preferredAspect: readPreferredVideoAspect(participant.attributes),
      sourceDevice: readSourceDevice(participant.attributes),
    };
  }, []);

  const refreshLocalUi = useCallback((room: Room) => {
    const lp = room.localParticipant;
    setAudioEnabled(lp.isMicrophoneEnabled);
    setVideoEnabled(lp.isCameraEnabled);
    setLocalScreenShare(lp.isScreenShareEnabled);
    setLocalIdentity(lp.identity);
    setLocalStream(buildLocalCameraStream(lp));
    setLocalScreenStream(buildLocalScreenStream(lp));
  }, []);

  const applyPublishCaps = useCallback(
    async (
      room: Room,
      caps: { canPublishAudio: boolean; canPublishVideo: boolean },
    ) => {
      // Host/co-host always keep media controls (server may briefly return None
      // if the seat was raced during refresh).
      const audio = isHostRole ? true : caps.canPublishAudio;
      const video = isHostRole ? true : isWebinar ? false : caps.canPublishVideo;
      setCanPublishAudio(audio);
      setCanPublishVideo(video);
      const lp = room.localParticipant;
      if (!audio && lp.isMicrophoneEnabled) {
        await lp.setMicrophoneEnabled(false);
      }
      if (!video) {
        if (lp.isCameraEnabled) await lp.setCameraEnabled(false);
        if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
      }
      // UI only — do not re-report media presence (avoids sync loops).
      refreshLocalUi(room);
    },
    [isHostRole, isWebinar, refreshLocalUi],
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
        .catch(() => {
          // Network blip after refresh — keep role-based defaults, don't hide controls.
          void applyPublishCaps(room, {
            canPublishAudio: true,
            canPublishVideo: isHostRole || !isWebinar,
          });
        });
    },
    [applyPublishCaps, isHostRole, isWebinar, roomId, participantToken],
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
    remoteScreenStreamsRef.current.delete(identity);
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

    const onDisconnected = (reason?: DisconnectReason) => {
      if (cancelled) return;
      setConnected(false);

      // Another tab/device claimed this LiveKit identity (often guest joined with host name).
      if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
        onStatusRef.current?.(
          "This seat was taken by another session. Refresh the page or rejoin with a unique name.",
        );
        onErrorRef.current(
          "Disconnected: another session joined with the same seat. Close the other tab, then refresh.",
        );
        return;
      }

      // Ignore intentional leave / remount races — LiveKit may reconnect on its own.
      if (
        reason === DisconnectReason.CLIENT_INITIATED ||
        reason === DisconnectReason.USER_UNAVAILABLE
      ) {
        return;
      }
      onStatusRef.current?.("Reconnecting to media server…");
      onDisconnectedRef.current();

      // If LiveKit leaves us fully disconnected (no auto-reconnect), try once more.
      window.setTimeout(() => {
        if (cancelled) return;
        if (room.state !== ConnectionState.Disconnected) return;
        onStatusRef.current?.("Connecting to media server…");
        const t = turnRef.current;
        const iceServers: RTCIceServer[] = t.urls.length
          ? t.urls.map((url) => ({
              urls: url,
              username: t.username,
              credential: t.credential,
            }))
          : [{ urls: "stun:stun.l.google.com:19302" }];
        void room
          .connect(liveKitUrlRef.current, liveKitTokenRef.current, {
            rtcConfig: { iceServers },
            autoSubscribe: !isMassRoomRef.current,
          })
          .then(() => {
            if (!cancelled) finishConnected();
          })
          .catch((err) => {
            if (!cancelled) {
              onErrorRef.current(
                err instanceof Error ? err.message : "Failed to reconnect to media room",
              );
            }
          });
      }, 1200);
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
        publishLocalDeviceAttrs();
        applyLocalStateRef.current(room);
        refreshRemotes(room);
        setConnected(true);
        onStatusRef.current?.("Connected");
        onConnectedRef.current();
      }
    };

    const onConnectionStateChanged = (state: ConnectionState) => {
      if (cancelled) return;
      if (state === ConnectionState.Connected) {
        finishConnected();
      } else if (state === ConnectionState.Connecting || state === ConnectionState.Reconnecting) {
        setConnected(false);
        onStatusRef.current?.("Connecting to media server…");
      } else if (state === ConnectionState.Disconnected) {
        setConnected(false);
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

    const onParticipantAttributesChanged = (
      _changed: Record<string, string>,
      participant: Participant,
    ) => {
      if (cancelled || participant.isLocal) return;
      if (participant instanceof Object && "identity" in participant) {
        upsertRemote(participant as RemoteParticipant);
      }
    };

    const publishLocalDeviceAttrs = () => {
      setLocalPublishAspect(preferredAspectForCaptureDevice());
      setLocalSourceDevice(detectCaptureDeviceClass());
      void room.localParticipant.setAttributes(localDeviceAttributes()).catch(() => undefined);
    };

    const finishConnected = () => {
      if (cancelled) return;
      setConnected(true);
      publishLocalDeviceAttrs();
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
    room.on(RoomEvent.ParticipantAttributesChanged, onParticipantAttributesChanged);
    room.on(RoomEvent.Reconnected, onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
    room.on(RoomEvent.ConnectionQualityChanged, onConnectionQualityChanged);

    if (room.state === ConnectionState.Connected) {
      finishConnected();
    } else if (
      room.state === ConnectionState.Connecting ||
      room.state === ConnectionState.Reconnecting
    ) {
      onStatusRef.current?.("Connecting to media server…");
      // connect() already in flight from a prior mount — wait for Connected.
    } else {
      void (async () => {
        try {
          onStatusRef.current?.("Connecting to media server…");
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
      room.off(RoomEvent.ParticipantAttributesChanged, onParticipantAttributesChanged);
      room.off(RoomEvent.Reconnected, onReconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
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

  // Phones: re-publish orientation attrs + restart camera; drive local gallery box (9:16 ↔ 1:1).
  useEffect(() => {
    if (!connected) return;

    let busy = false;
    const syncOrientation = () => {
      setLocalPublishAspect(preferredAspectForCaptureDevice());
      setLocalSourceDevice(detectCaptureDeviceClass());

      const room = roomRef.current ?? getLiveKitRoom(sessionKey);
      if (!room) return;
      void room.localParticipant.setAttributes(localDeviceAttributes()).catch(() => undefined);

      if (!videoEnabled || !canPublishVideo || busy || mediaBusyRef.current) return;
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
    const onChange = () => syncOrientation();
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
          const enhancedNc = noiseCancelEnabledRef.current;
          await lp.setMicrophoneEnabled(
            enabling,
            enabling ? microphoneEnableCaptureOptions({ enhancedNoiseCancel: enhancedNc }) : undefined,
          );
          if (enabling) {
            await waitForLocalTrack(lp, Track.Source.Microphone);
            const micPub = lp.getTrackPublication(Track.Source.Microphone);
            const mic = micPub?.track?.mediaStreamTrack;
            await applyAudioProcessingConstraints(mic, { enhancedNoiseCancel: enhancedNc });
            // Browser AEC/AGC stay on; optional DTLN replaces browser NS (Meet Krisp path).
            await syncNoiseCancellation(room, enhancedNc);
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

  const toggleNoiseCancel = useCallback(async () => {
    const next = !noiseCancelEnabledRef.current;
    setNoiseCancelEnabled(next);
    persistEnhancedNoiseCancelEnabled(next);

    const room = roomRef.current ?? getLiveKitRoom(sessionKey);
    if (!room || room.state !== ConnectionState.Connected) return;
    roomRef.current = room;
    const lp = room.localParticipant;
    if (!lp.isMicrophoneEnabled) return;

    mediaBusyRef.current = true;
    setMediaBusy(true);
    try {
      const micPub = lp.getTrackPublication(Track.Source.Microphone);
      const mic = micPub?.track?.mediaStreamTrack;
      await applyAudioProcessingConstraints(mic, { enhancedNoiseCancel: next });
      const ok = await syncNoiseCancellation(room, next);
      if (next && !ok) {
        setNoiseCancelEnabled(false);
        persistEnhancedNoiseCancelEnabled(false);
        onErrorRef.current(
          "Enhanced noise cancellation is not supported in this browser — using echo/noise controls only.",
        );
      }
    } catch {
      setNoiseCancelEnabled(false);
      persistEnhancedNoiseCancelEnabled(false);
      onErrorRef.current("Could not change noise cancellation — try toggling your mic.");
    } finally {
      mediaBusyRef.current = false;
      setMediaBusy(false);
    }
  }, [sessionKey]);

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
      await room.localParticipant.setScreenShareEnabled(true, screenShareCaptureOptions());
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
  const layoutTier = useMemo(
    () => ({
      ...galleryTier,
      videosPerPage: layoutRemotesPerPage(layoutMode),
    }),
    [galleryTier, layoutMode],
  );
  const pageSize = layoutPageSize(layoutMode);
  const remoteParticipantCount = Math.max(0, participantCount - 1);
  const selfId = selfParticipantId || localIdentity;

  const seedById = useMemo(() => {
    const map = new Map<string, RoomParticipant>();
    for (const p of seedParticipants) {
      if (p?.id) map.set(p.id, p);
    }
    return map;
  }, [seedParticipants]);

  const seedRemoteIds = useMemo(
    () => seedParticipants.filter((p) => p.id && p.id !== selfId).map((p) => p.id),
    [seedParticipants, selfId],
  );

  // Mass rooms: load participant roster page from control plane (not LiveKit memory).
  useEffect(() => {
    if (!isMassRoom || !roomId) return;
    let cancelled = false;
    const offset = ((simSpecs.length > 0 ? 1 : galleryPage) - 1) * layoutTier.videosPerPage;
    void listParticipantsPage(roomId, { offset, limit: layoutTier.videosPerPage })
      .then((page) => {
        if (!cancelled) setGalleryPageParticipants(page.items);
      })
      .catch(() => {
        if (!cancelled) setGalleryPageParticipants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [galleryPage, layoutTier.videosPerPage, isMassRoom, roomId, simSpecs.length]);

  const sortedRemoteIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    const push = (id: string) => {
      if (!id || id === selfId || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };

    if (isMassRoom) {
      for (const p of galleryPageParticipants) push(p.id);
      if (ids.length === 0) {
        for (const id of seedRemoteIds) push(id);
      }
      return ids;
    }

    for (const id of seedRemoteIds) push(id);
    const live = [...remoteFeeds.entries()].sort(([, a], [, b]) =>
      a.displayName.localeCompare(b.displayName),
    );
    for (const [id] of live) push(id);

    const need = Math.max(0, remoteParticipantCount - ids.length);
    for (let i = 0; i < need; i += 1) push(`pending-${i}`);
    return ids;
  }, [
    galleryPageParticipants,
    isMassRoom,
    remoteFeeds,
    remoteParticipantCount,
    seedRemoteIds,
    selfId,
  ]);

  const paginatedRemoteIds = sortedRemoteIds;
  const simActive = simSpecs.length > 0;

  const remoteGalleryPages = useMemo(
    () =>
      galleryPageCount(
        isMassRoom ? remoteParticipantCount : paginatedRemoteIds.length,
        layoutTier,
      ),
    [isMassRoom, layoutTier, paginatedRemoteIds.length, remoteParticipantCount],
  );

  const liveKitGalleryPage = simActive ? 1 : galleryPage;

  const visibleRemoteIds = useMemo(
    () =>
      new Set(
        isMassRoom
          ? paginatedRemoteIds
          : sliceGalleryPage(paginatedRemoteIds, liveKitGalleryPage, layoutTier),
      ),
    [isMassRoom, layoutTier, liveKitGalleryPage, paginatedRemoteIds],
  );

  const visibleRemoteOrder = useMemo(
    () =>
      isMassRoom
        ? paginatedRemoteIds
        : sliceGalleryPage(paginatedRemoteIds, liveKitGalleryPage, layoutTier),
    [isMassRoom, layoutTier, liveKitGalleryPage, paginatedRemoteIds],
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
    applyRemoteSimulcastPreferences(room, visibleRemoteOrder, galleryTier, connectionQuality, {
      hostParticipantId,
    });

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
    applyRemoteSimulcastPreferences(room, visibleRemoteOrder, galleryTier, connectionQuality, {
      hostParticipantId,
    });
  }, [connected, connectionQuality, galleryTier, isMassRoom, remoteFeeds, sessionKey, visibleRemoteOrder]);

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
      hasVideo: videoEnabled,
      isScreenShare: false,
      preferredAspect: localPublishAspect,
      sourceDevice: localSourceDevice,
      isSpeaking: Boolean(localIdentity && speakingSet.has(localIdentity)),
      roleBadge: isHostRole ? (participantRole === "cohost" ? "Co-host" : "Host") : "You",
    }),
    [
      displayName,
      isHostRole,
      localIdentity,
      localPublishAspect,
      localSourceDevice,
      localStream,
      participantRole,
      speakingSet,
      videoEnabled,
    ],
  );

  const localScreenTile = useMemo<StageParticipantTile | null>(() => {
    if (!localScreenShare || !localScreenStream) return null;
    return {
      id: "local:screen",
      label: `${displayName} (Screen)`,
      stream: localScreenStream,
      trackSignature: localScreenStream
        .getTracks()
        .map((t) => `${t.id}:${t.kind}:${t.readyState}`)
        .sort()
        .join("|"),
      mirror: false,
      hasVideo: true,
      isScreenShare: true,
      preferredAspect: undefined,
      isSpeaking: false,
      roleBadge: isHostRole ? (participantRole === "cohost" ? "Co-host" : "Host") : undefined,
    };
  }, [displayName, isHostRole, localScreenShare, localScreenStream, participantRole]);

  const allStageTiles = useMemo<StageParticipantTile[]>(() => {
    const remotes: StageParticipantTile[] = [];
    const sourceIds = isMassRoom ? paginatedRemoteIds : sortedRemoteIds;

    for (const id of sourceIds) {
      const feed = remoteFeeds.get(id);
      const roster =
        (isMassRoom ? galleryPageParticipants.find((p) => p.id === id) : undefined) ??
        seedById.get(id);
      const pending = id.startsWith("pending-");
      const label = feed?.displayName ?? roster?.displayName ?? (pending ? "Connecting…" : id);
      const isHostFeed = Boolean(hostParticipantId && id === hostParticipantId);
      const roleBadge = isHostFeed ? "Host" : roster?.role === "cohost" ? "Co-host" : undefined;
      // While screen sharing, show only the share tile (hide camera duplicate).
      if (feed?.hasScreenShare && feed.screenStream) {
        remotes.push({
          id: `${id}:screen`,
          label: `${label} (Screen)`,
          stream: feed.screenStream,
          trackSignature: feed.screenTrackSignature,
          hasVideo: true,
          isScreenShare: true,
          preferredAspect: undefined,
          isSpeaking: speakingSet.has(id),
          roleBadge,
        });
      } else {
        remotes.push({
          id,
          label,
          stream: feed?.stream ?? null,
          trackSignature: feed?.trackSignature ?? "",
          hasVideo: feed?.hasVideo ?? false,
          isScreenShare: false,
          preferredAspect: feed?.preferredAspect,
          sourceDevice: feed?.sourceDevice,
          isSpeaking: speakingSet.has(id),
          roleBadge,
        });
      }
    }
    remotes.sort((a, b) => {
      if (a.isScreenShare !== b.isScreenShare) return a.isScreenShare ? -1 : 1;
      if (a.roleBadge === "Host") return -1;
      if (b.roleBadge === "Host") return 1;
      return a.label.localeCompare(b.label);
    });
    const self = localScreenTile ? [localScreenTile] : [localTile];
    return [...self, ...remotes];
  }, [
    galleryPageParticipants,
    hostParticipantId,
    isMassRoom,
    localScreenTile,
    localTile,
    paginatedRemoteIds,
    remoteFeeds,
    seedById,
    sortedRemoteIds,
    speakingSet,
  ]);

  /** Visible page: self (or screen-only while sharing) + remotes. */
  const galleryTiles = useMemo<StageParticipantTile[]>(() => {
    const result: StageParticipantTile[] = localScreenTile ? [localScreenTile] : [localTile];
    for (const id of paginatedRemoteIds) {
      if (!visibleRemoteIds.has(id)) continue;
      const screen = allStageTiles.find((t) => t.id === `${id}:screen`);
      if (screen) {
        result.push(screen);
        continue;
      }
      const camera = allStageTiles.find((t) => t.id === id);
      if (camera) result.push(camera);
    }
    // Keep id "local" even before the stream attaches — swapping to "placeholder"
    // remounts the tile and causes a visible resize flash on join/create.
    return result;
  }, [allStageTiles, localScreenTile, localTile, paginatedRemoteIds, visibleRemoteIds]);

  const simTiles = useMemo<StageParticipantTile[]>(
    () =>
      simSpecs.map((spec) => ({
        id: spec.id,
        label: spec.kind === "mobile" ? `Mobile ${spec.id.slice(spec.id.lastIndexOf("-") + 1)}` : `Web ${spec.id.slice(spec.id.lastIndexOf("-") + 1)}`,
        stream: null,
        hasVideo: false,
        roleBadge: spec.kind === "mobile" ? "Mobile" : "Web",
        preferredAspect: spec.kind === "mobile" ? "portrait" : "square",
        sourceDevice: spec.kind === "mobile" ? "mobile" : "laptop",
      })),
    [simSpecs],
  );

  const addSimKind = useCallback((kind: "web" | "mobile") => {
    const room = Math.max(0, 200 - simSpecs.length);
    const n = Math.min(simAddCount, room);
    if (n <= 0) return;
    const next: Array<{ id: string; kind: "web" | "mobile" }> = [];
    for (let i = 0; i < n; i += 1) {
      next.push({ id: `sim-${kind}-${simSeqRef.current++}`, kind });
    }
    setSimSpecs((prev) => [...prev, ...next]);
    setGalleryPage(1);
  }, [simAddCount, simSpecs.length]);

  const clearSims = useCallback(() => {
    setSimSpecs([]);
    setGalleryPage(1);
  }, []);

  const combinedLayoutTiles = useMemo(() => {
    if (simTiles.length === 0) return galleryTiles;
    const seen = new Set<string>();
    const out: StageParticipantTile[] = [];
    for (const tile of [...galleryTiles, ...simTiles]) {
      if (seen.has(tile.id)) continue;
      seen.add(tile.id);
      out.push(tile);
    }
    return out;
  }, [galleryTiles, simTiles]);

  const realStageTiles = useMemo(() => {
    if (simTiles.length === 0) return galleryTiles;
    const start = (galleryPage - 1) * pageSize;
    return combinedLayoutTiles.slice(start, start + pageSize);
  }, [combinedLayoutTiles, galleryPage, galleryTiles, pageSize, simTiles.length]);

  const totalGalleryPages = useMemo(() => {
    if (simTiles.length > 0) {
      return Math.max(1, Math.ceil(combinedLayoutTiles.length / pageSize));
    }
    return remoteGalleryPages;
  }, [combinedLayoutTiles.length, pageSize, remoteGalleryPages, simTiles.length]);

  useEffect(() => {
    if (galleryPage > totalGalleryPages) setGalleryPage(totalGalleryPages);
  }, [galleryPage, totalGalleryPages]);

  const handleLayoutChange = useCallback((mode: ConferenceLayoutMode) => {
    setLayoutMode(mode);
    persistLayoutMode(mode);
    setGalleryPage(1);
  }, []);

  const offPageCount = Math.max(
    0,
    simTiles.length > 0
      ? combinedLayoutTiles.length - realStageTiles.length
      : (isMassRoom ? remoteParticipantCount : paginatedRemoteIds.length) - visibleRemoteIds.size,
  );

  return (
    <div className={`conference-root is-${layoutMode}`} data-layout={layoutMode}>
      {!mediaAvailable && (
        <div className="join-banner warn">{mediaUnavailableReason()}</div>
      )}
      {!connected && (
        <div className="join-banner info">Connecting to media server…</div>
      )}
      {isWebinar && !isHostRole && connected && (
        <div className="join-banner info">Webinar — raise hand to get the host’s attention.</div>
      )}
      <GallerySimBar
        webCount={simSpecs.filter((s) => s.kind === "web").length}
        mobileCount={simSpecs.filter((s) => s.kind === "mobile").length}
        addCount={simAddCount}
        onAddCountChange={setSimAddCount}
        onAddWeb={() => addSimKind("web")}
        onAddMobile={() => addSimKind("mobile")}
        onClear={clearSims}
      />
      {participantCount > pageSize && connected && (
        <div className="join-banner info">
          Large meeting ({participantCount.toLocaleString()} people) — {pageSize} per page
          for scale (10k+). Use page controls to move through the room; tiles keep a fixed
          size and scroll within each page.
        </div>
      )}
      {silenceNotice && connected && (
        <div className="join-banner info">{silenceNotice}</div>
      )}
      <ConferenceVideoStage
        layoutMode={layoutMode}
        tiles={realStageTiles}
        maxPerPage={pageSize}
        hostParticipantId={hostParticipantId}
        viewerMode={viewport.mode}
        activeSpeakerIds={activeSpeakerIds}
        localIdentity={localIdentity || undefined}
      />
      <GalleryPagination
        page={galleryPage}
        totalPages={totalGalleryPages}
        onPageChange={setGalleryPage}
        totalParticipants={participantCount + simTiles.length}
        offPageCount={offPageCount}
      />
      <div hidden aria-hidden>
        {sortedRemoteIds
          .filter((id) => {
            return !visibleRemoteIds.has(id) && !realStageTiles.some((t) => t.id === id);
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
        showNoiseCancel={canPublishAudio}
        noiseCancelEnabled={noiseCancelEnabled}
        onToggleNoiseCancel={() => void toggleNoiseCancel()}
        showRaiseHand={showRaiseHand}
        handRaised={handRaised}
        onToggleRaiseHand={onToggleRaiseHand}
        chatBadge={chatBadge}
        mediaBusy={mediaBusy}
        participantCount={participantCount}
        peopleBadgeCount={peopleBadgeCount}
        onFocusChat={onFocusChat}
        onFocusParticipants={isHostRole ? onFocusParticipants : undefined}
        onFocusInvite={isHostRole ? onFocusInvite : undefined}
        activePanel={activePanel}
        layoutMode={layoutMode}
        onLayoutChange={handleLayoutChange}
      />
    </div>
  );
}
