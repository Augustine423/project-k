import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomMode, TurnInfo } from "../api/types";
import { reportMediaPresence } from "../api/client";
import { ControlBar } from "../components/ControlBar";
import { GalleryPagination } from "../components/GalleryPagination";
import { StreamVideoTile } from "../components/StreamVideoTile";
import { canAccessMediaDevices, mediaUnavailableReason } from "../media/secureContext";
import { JanusRoomClient, type GalleryLayoutInfo } from "./janusRoomClient";
import { sliceGalleryPage } from "./galleryVideoPolicy";

interface JanusConferenceProps {
  roomId: string;
  participantToken: string;
  roomMode: RoomMode;
  listenerOnly: boolean;
  janusWsUrl: string;
  janusRoomId: string;
  janusJoinPin?: string;
  turn: TurnInfo;
  displayName: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (message: string) => void;
  onStatus?: (message: string) => void;
  onLeave: () => void;
  participantCount?: number;
  chatBadge?: number | string;
  onFocusParticipants?: () => void;
  onFocusChat?: () => void;
}

type RemoteFeed = {
  displayName: string;
  stream: MediaStream;
  hasVideo: boolean;
  isSpeaking: boolean;
};

export function JanusConference({
  roomId,
  participantToken,
  roomMode,
  listenerOnly,
  janusWsUrl,
  janusRoomId,
  janusJoinPin = "",
  turn,
  displayName,
  onConnected,
  onDisconnected,
  onError,
  onStatus,
  onLeave,
  participantCount = 1,
  chatBadge,
  onFocusParticipants,
  onFocusChat,
}: JanusConferenceProps) {
  const clientRef = useRef<JanusRoomClient | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteFeeds, setRemoteFeeds] = useState<Map<string, RemoteFeed>>(new Map());
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
  const [galleryLayout, setGalleryLayout] = useState<GalleryLayoutInfo | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const mediaAvailable = canAccessMediaDevices();

  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onErrorRef = useRef(onError);
  const onStatusRef = useRef(onStatus);
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onErrorRef.current = onError;
  onStatusRef.current = onStatus;

  const syncMediaPresence = useCallback(
    (client: JanusRoomClient) => {
      const state = client.getMediaState();
      void reportMediaPresence(roomId, participantToken, state).catch(() => undefined);
    },
    [roomId, participantToken],
  );

  const turnKey = useMemo(
    () => `${turn.username}\0${turn.credential}\0${turn.urls.join("|")}`,
    [turn.credential, turn.username, turn.urls],
  );

  useEffect(() => {
    clientRef.current?.setParticipantCount(participantCount);
  }, [participantCount]);

  useEffect(() => {
    if (!mediaAvailable) {
      onErrorRef.current(mediaUnavailableReason());
      return;
    }

    let cancelled = false;
    const client = new JanusRoomClient({
      onLocalStream: (stream) => {
        if (!cancelled) setLocalStream(stream);
      },
      onRemoteFeedAdded: (feed) => {
        if (cancelled) return;
        setRemoteFeeds((prev) => {
          const next = new Map(prev);
          next.set(feed.publisherId, {
            displayName: feed.displayName,
            stream: feed.stream,
            hasVideo: feed.hasVideo ?? feed.stream.getVideoTracks().length > 0,
            isSpeaking: feed.isSpeaking ?? false,
          });
          return next;
        });
      },
      onRemoteFeedRemoved: (publisherId) => {
        if (cancelled) return;
        setRemoteFeeds((prev) => {
          const next = new Map(prev);
          next.delete(publisherId);
          return next;
        });
      },
      onOwnPublishedStreams: () => {
        if (!cancelled) syncMediaPresence(client);
      },
      onActiveSpeakersChanged: (ids) => {
        if (!cancelled) {
          setActiveSpeakers(ids);
          setRemoteFeeds((prev) => {
            const next = new Map(prev);
            for (const [id, feed] of next) {
              next.set(id, { ...feed, isSpeaking: ids.includes(id) });
            }
            return next;
          });
        }
      },
      onGalleryLayoutChanged: (layout) => {
        if (!cancelled) setGalleryLayout(layout);
      },
      onError: (message) => {
        if (!cancelled) onErrorRef.current(message);
      },
      onDisconnected: () => {
        if (!cancelled) {
          setConnected(false);
          onDisconnectedRef.current();
        }
      },
    });

    clientRef.current = client;
    client.setParticipantCount(participantCount);

    void (async () => {
      try {
        onStatusRef.current?.("Connecting to Janus…");
        await client.connect(janusWsUrl, turn);
        if (listenerOnly) {
          await client.joinAsListener(janusRoomId, displayName, janusJoinPin);
        } else {
          await client.joinAsPublisher(janusRoomId, displayName, janusJoinPin);
          await client.publishLocalMedia({ audio: true, video: true });
          client.setLocalVideoEnabled(false);
        }
        if (cancelled) return;
        setConnected(true);
        setAudioEnabled(!listenerOnly);
        setVideoEnabled(false);
        setGalleryLayout(client.getGalleryLayout());
        syncMediaPresence(client);
        onStatusRef.current?.(
          listenerOnly
            ? `Connected (webinar audience — ${roomMode} mode)`
            : "Connected — camera off until you enable it",
        );
        onConnectedRef.current();
      } catch (err) {
        if (!cancelled) {
          onErrorRef.current(err instanceof Error ? err.message : "Failed to join media room");
        }
      }
    })();

    return () => {
      cancelled = true;
      client.destroy();
      clientRef.current = null;
    };
  }, [
    janusWsUrl,
    janusRoomId,
    janusJoinPin,
    displayName,
    turnKey,
    mediaAvailable,
    listenerOnly,
    roomMode,
    syncMediaPresence,
  ]);

  const handleGalleryPage = useCallback((page: number) => {
    clientRef.current?.setGalleryPage(page);
  }, []);

  const toggleAudio = useCallback(() => {
    if (listenerOnly) return;
    const next = !audioEnabled;
    setAudioEnabled(next);
    clientRef.current?.setLocalAudioEnabled(next);
    if (clientRef.current) syncMediaPresence(clientRef.current);
  }, [audioEnabled, listenerOnly, syncMediaPresence]);

  const toggleVideo = useCallback(() => {
    if (listenerOnly) return;
    const next = !videoEnabled;
    setVideoEnabled(next);
    clientRef.current?.setLocalVideoEnabled(next);
    if (clientRef.current) syncMediaPresence(clientRef.current);
  }, [videoEnabled, listenerOnly, syncMediaPresence]);

  const shareScreen = useCallback(async () => {
    if (listenerOnly) return;
    try {
      await clientRef.current?.shareScreen();
      if (clientRef.current) syncMediaPresence(clientRef.current);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Screen share failed");
    }
  }, [listenerOnly, onError, syncMediaPresence]);

  const handleLeave = useCallback(() => {
    clientRef.current?.destroy();
    clientRef.current = null;
    onLeave();
  }, [onLeave]);

  const localDisplayStream = useMemo(() => {
    if (!localStream) return null;
    if (videoEnabled) return localStream;
    const audioOnly = new MediaStream();
    for (const track of localStream.getAudioTracks()) audioOnly.addTrack(track);
    return audioOnly.getTracks().length > 0 ? audioOnly : null;
  }, [localStream, videoEnabled]);

  const sortedRemoteIds = useMemo(() => {
    return [...remoteFeeds.entries()]
      .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
      .map(([id]) => id);
  }, [remoteFeeds]);

  const tiles = useMemo(() => {
    const tier = galleryLayout?.tier;
    const page = galleryLayout?.page ?? 1;
    const pageIds =
      tier && sortedRemoteIds.length > 0
        ? new Set(sliceGalleryPage(sortedRemoteIds, page, tier))
        : new Set(sortedRemoteIds);

    const result: {
      id: string;
      label: string;
      stream: MediaStream | null;
      mirror?: boolean;
      isSpeaking?: boolean;
      hasVideo?: boolean;
    }[] = [];

    if (!listenerOnly) {
      result.push({
        id: "local",
        label: `${displayName} (you)`,
        stream: localDisplayStream,
        mirror: true,
        hasVideo: videoEnabled,
      });
    }

    for (const id of sortedRemoteIds) {
      if (tier && tier.videosPerPage < sortedRemoteIds.length && !pageIds.has(id)) continue;
      const feed = remoteFeeds.get(id);
      if (!feed) continue;
      result.push({
        id,
        label: feed.displayName,
        stream: feed.stream,
        isSpeaking: activeSpeakers.includes(id) || feed.isSpeaking,
        hasVideo: feed.hasVideo,
      });
    }

    if (result.length === 0) {
      result.push({
        id: "placeholder",
        label: listenerOnly ? "Waiting for speakers…" : displayName,
        stream: null,
      });
    }
    return result;
  }, [
    activeSpeakers,
    displayName,
    galleryLayout,
    listenerOnly,
    localDisplayStream,
    remoteFeeds,
    sortedRemoteIds,
    videoEnabled,
  ]);

  const gridCount = Math.min(Math.max(tiles.length, 1), 25);

  return (
    <div className="conference-root">
      {!mediaAvailable && (
        <div className="join-banner warn">{mediaUnavailableReason()}</div>
      )}
      {listenerOnly && connected && (
        <div className="join-banner info">
          Webinar audience — watch the speaker stage. All attendees are listed in Participants →
        </div>
      )}
      {!connected && (
        <div className="join-banner info">Connecting to media server…</div>
      )}
      {galleryLayout && !listenerOnly && (
        <GalleryPagination
          page={galleryLayout.page}
          totalPages={galleryLayout.totalPages}
          onPageChange={handleGalleryPage}
        />
      )}
      <div className="video-stage" data-count={String(gridCount)}>
        {tiles.map((tile) => (
          <StreamVideoTile
            key={tile.id}
            stream={tile.stream}
            label={tile.label}
            muted={Boolean(tile.mirror)}
            mirror={tile.mirror}
            isSpeaking={tile.isSpeaking}
            hasVideo={tile.hasVideo}
          />
        ))}
      </div>
      <ControlBar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onShareScreen={() => void shareScreen()}
        onLeave={handleLeave}
        showScreenShare={!listenerOnly}
        showMediaControls={!listenerOnly}
        participantCount={participantCount}
        chatBadge={chatBadge}
        onFocusParticipants={onFocusParticipants}
        onFocusChat={onFocusChat}
      />
    </div>
  );
}
