// Janus VideoRoom client — multistream subscriber, active speaker detection,
// selective video subscription, simulcast layers, and gallery pagination.
// Each client downloads video only for the current gallery page; see galleryVideoPolicy.ts.
import type { TurnInfo } from "../api/types";
import Janus from "janus-gateway";
import { ensureJanusInit } from "./janusInit";
import { buildPublishConfigure, buildPublisherTracks } from "./janusVideo";
import {
  galleryPageCount,
  resolveGalleryTier,
  sliceGalleryPage,
  substreamForVideoSlot,
  type GalleryVideoTier,
} from "./galleryVideoPolicy";

/** Simulcast substream levels: 0=low (~100kbps), 1=medium (~400kbps), 2=high (~1.5Mbps) */
const SUBSTREAM_ACTIVE_SPEAKER = 2;

/** How long (ms) a publisher must be silent before losing "active speaker" status. */
const SPEAKER_LINGER_MS = 3000;

export interface RemoteFeed {
  publisherId: string;
  displayName: string;
  stream: MediaStream;
  audioMid?: string;
  videoMid?: string;
  /** Whether this feed currently has video subscribed (not audio-only) */
  hasVideo?: boolean;
  /** Whether Janus reported this publisher as currently talking */
  isSpeaking?: boolean;
}

export interface JanusRoomClientCallbacks {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteFeedAdded: (feed: RemoteFeed) => void;
  onRemoteFeedRemoved: (publisherId: string) => void;
  onOwnPublishedStreams: (streams: { mid: string; type: "audio" | "video" }[]) => void;
  onError: (message: string) => void;
  onDisconnected: () => void;
  /** Fired when active speaker list changes so UI can highlight tiles */
  onActiveSpeakersChanged?: (speakerIds: string[]) => void;
  /** Gallery tier / page / bandwidth info for pagination UI */
  onGalleryLayoutChanged?: (layout: GalleryLayoutInfo) => void;
}

export interface GalleryLayoutInfo {
  page: number;
  totalPages: number;
  videosPerPage: number;
  tier: GalleryVideoTier;
  bandwidthLabel: string;
  remotePublisherCount: number;
}

type JanusHandle = any;

type PublisherStream = {
  id: string | number;
  display: string;
  type: "audio" | "video" | string;
  mid: string;
  mindex?: number;
  codec?: string;
  disabled?: boolean;
};

type FeedState = {
  id: string;
  display: string;
  streams: PublisherStream[];
};

type SubStreamMeta = {
  feed_id: string | number;
  mid: string;
  type?: string;
};

export class JanusRoomClient {
  private janus: any;
  private publisherHandle: JanusHandle | null = null;
  private subscriberHandle: JanusHandle | null = null;
  private creatingSubscription = false;

  private janusRoomId: string | null = null;
  private privateId: number | null = null;
  private ownPublisherId: string | null = null;
  private publisherJoined = false;
  private joinWaiters: { resolve: () => void; reject: (err: Error) => void } | null = null;

  private readonly feedStreams = new Map<string, FeedState>();
  /** publisherId -> mid -> subscribed */
  private readonly subscriptions = new Map<string, Map<string, boolean>>();
  /** subscriber mid -> publisher metadata from Janus */
  private readonly subStreams = new Map<string, SubStreamMeta>();
  /** publisherId -> mid -> track (merged for UI per feed) */
  private readonly remoteTracksByFeed = new Map<string, Map<string, MediaStreamTrack>>();
  /** One stable MediaStream per remote publisher — demo-style, avoids srcObject churn. */
  private readonly remoteStreams = new Map<string, MediaStream>();
  private localMergedStream: MediaStream | null = null;
  private readonly localTracks = new Map<string, MediaStream>();
  private localVideoEnabled = false;
  private localAudioEnabled = false;
  private listenerOnly = false;
  private readonly callbacks: JanusRoomClientCallbacks;

  // ── Active speaker engine ──────────────────────────────────────────────────
  /** publisherId -> timestamp of last "talking" event from Janus */
  private readonly speakerActivity = new Map<string, number>();
  /** publisherId -> linger timer handle (clears speaking state after silence) */
  private readonly speakerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Current ordered list of active speakers (most recent first) */
  private activeSpeakers: string[] = [];
  /** Which publisherIds currently have video subscribed */
  private readonly videoSubscribed = new Set<string>();
  private participantCount = 1;
  private galleryPage = 1;
  private autoFollowActiveSpeaker = true;
  // ──────────────────────────────────────────────────────────────────────────

  constructor(callbacks: JanusRoomClientCallbacks) {
    this.callbacks = callbacks;
  }

  /** Room size drives videos-per-page tier (see galleryVideoPolicy.ts). */
  setParticipantCount(count: number): void {
    const next = Math.max(1, count);
    if (next === this.participantCount) return;
    this.participantCount = next;
    this.clampGalleryPage();
    this.rebalanceVideoSubscriptions();
    this.emitGalleryLayout();
  }

  setGalleryPage(page: number): void {
    const p = Math.max(1, page);
    if (p === this.galleryPage) return;
    this.galleryPage = p;
    this.autoFollowActiveSpeaker = false;
    this.rebalanceVideoSubscriptions();
    this.emitGalleryLayout();
  }

  getGalleryLayout(): GalleryLayoutInfo {
    return this.buildGalleryLayout();
  }

  private currentTier() {
    return resolveGalleryTier(this.participantCount);
  }

  private remoteFeedIds(): string[] {
    return [...this.feedStreams.keys()]
      .filter((id) => id !== this.ownPublisherId)
      .sort((a, b) => {
        const da = this.feedStreams.get(a)?.display ?? "";
        const db = this.feedStreams.get(b)?.display ?? "";
        return da.localeCompare(db) || a.localeCompare(b);
      });
  }

  private clampGalleryPage(): void {
    const tier = this.currentTier();
    const total = galleryPageCount(this.remoteFeedIds().length, tier);
    if (this.galleryPage > total) this.galleryPage = total;
    if (this.galleryPage < 1) this.galleryPage = 1;
  }

  private pageFeedIds(tier = this.currentTier()): string[] {
    return sliceGalleryPage(this.remoteFeedIds(), this.galleryPage, tier);
  }

  private buildGalleryLayout(): GalleryLayoutInfo {
    const tier = this.currentTier();
    const remotePublisherCount = this.remoteFeedIds().length;
    const totalPages = galleryPageCount(remotePublisherCount, tier);
    return {
      page: this.galleryPage,
      totalPages,
      videosPerPage: tier.videosPerPage,
      tier,
      bandwidthLabel: `${tier.estDownloadMbps.min}–${tier.estDownloadMbps.max} Mbps`,
      remotePublisherCount,
    };
  }

  private emitGalleryLayout(): void {
    this.callbacks.onGalleryLayoutChanged?.(this.buildGalleryLayout());
  }

  private maybeFollowActiveSpeaker(): void {
    if (!this.autoFollowActiveSpeaker || this.activeSpeakers.length === 0) return;
    const speakerId = this.activeSpeakers[0];
    const tier = this.currentTier();
    const ids = this.remoteFeedIds();
    const idx = ids.indexOf(speakerId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / tier.videosPerPage) + 1;
    if (targetPage !== this.galleryPage) {
      this.galleryPage = targetPage;
      this.emitGalleryLayout();
    }
  }

  async connect(wsUrl: string, turn?: TurnInfo): Promise<void> {
    await ensureJanusInit();
    const iceServers: RTCIceServer[] = turn
      ? turn.urls.map((url) => ({
          urls: url,
          username: turn.username,
          credential: turn.credential,
        }))
      : [{ urls: "stun:stun.l.google.com:19302" }];

    await new Promise<void>((resolve, reject) => {
      this.janus = new Janus({
        server: wsUrl,
        iceServers,
        success: () => resolve(),
        error: (err: string) => reject(new Error(err)),
        destroyed: () => this.callbacks.onDisconnected(),
      });
    });
  }

  /** Join to receive streams only — no mic/camera publish (webinar audience). */
  async joinAsListener(janusRoomId: string, displayName: string, janusJoinPin = ""): Promise<void> {
    this.listenerOnly = true;
    await this.joinAsPublisher(janusRoomId, displayName, janusJoinPin);
  }

  async joinAsPublisher(janusRoomId: string, displayName: string, janusJoinPin = ""): Promise<void> {
    this.janusRoomId = janusRoomId;
    this.publisherJoined = false;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (!this.publisherJoined) {
          this.joinWaiters = null;
          reject(new Error("Timed out joining VideoRoom"));
        }
      }, 15000);

      this.joinWaiters = {
        resolve: () => {
          window.clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          window.clearTimeout(timeout);
          reject(err);
        },
      };

      this.janus.attach({
        plugin: "janus.plugin.videoroom",
        opaqueId: "publisher-" + Janus.randomString(12),
        success: (handle: JanusHandle) => {
          this.publisherHandle = handle;
          handle.send({
            message: {
              request: "join",
              room: janusRoomId,
              ptype: "publisher",
              display: displayName,
              pin: janusJoinPin,
            },
          });
        },
        error: (err: string) => {
          this.joinWaiters?.reject(new Error(err));
          this.joinWaiters = null;
        },
        onmessage: (msg: any, jsep: any) => this.handlePublisherMessage(msg, jsep),
        onlocaltrack: (track: MediaStreamTrack, on: boolean) => this.handleLocalTrack(track, on),
        webrtcState: (on: boolean) => {
          if (on && this.publisherHandle) this.schedulePublisherQualityTuning(this.publisherHandle);
        },
        oncleanup: () => {
          this.localTracks.clear();
          this.localMergedStream = null;
        },
      });
    });
  }

  private handlePublisherMessage(msg: any, jsep: any) {
    if (msg.error && !this.publisherJoined) {
      this.callbacks.onError(msg.error);
      this.joinWaiters?.reject(new Error(msg.error));
      this.joinWaiters = null;
      return;
    }

    const event = msg.videoroom;
    if (event === "joined") {
      this.publisherJoined = true;
      this.privateId = msg.private_id;
      if (msg.id != null) this.ownPublisherId = String(msg.id);
      this.joinWaiters?.resolve();
      this.joinWaiters = null;
      if (msg.publishers) this.ingestPublishers(msg.publishers);
    } else if (event === "event") {
      if (msg.streams) {
        this.storeOwnStreams(msg.streams);
      } else if (msg.publishers) {
        this.ingestPublishers(msg.publishers);
      }
      if (msg.leaving) {
        this.unsubscribeFrom(String(msg.leaving));
      }
      if (msg.unpublished) {
        if (msg.unpublished === "ok") {
          this.publisherHandle?.hangup();
          return;
        }
        this.unsubscribeFrom(String(msg.unpublished));
      }
      if (msg.error) {
        this.callbacks.onError(msg.error);
        if (!this.publisherJoined) {
          this.joinWaiters?.reject(new Error(msg.error));
          this.joinWaiters = null;
        }
      }
    } else if (event === "talking") {
      // Janus fires this when audiolevel_event=true and a publisher starts talking
      if (msg.id != null) {
        const speakerId = String(msg.id);
        if (speakerId !== this.ownPublisherId) {
          this.onPublisherTalking(speakerId);
        }
      }
    } else if (event === "stopped-talking") {
      if (msg.id != null) {
        const speakerId = String(msg.id);
        if (speakerId !== this.ownPublisherId) {
          this.onPublisherStoppedTalking(speakerId);
        }
      }
    }
    if (jsep && this.publisherJoined) {
      this.publisherHandle.handleRemoteJsep({ jsep });
    }
  }

  private ingestPublishers(list: any[]) {
    const sources: PublisherStream[][] = [];
    for (const pub of list) {
      if (pub.dummy) continue;
      const id = String(pub.id);
      if (id === this.ownPublisherId) continue;
      const display = pub.display ?? "Guest";
      const streams = (pub.streams ?? []) as PublisherStream[];
      for (const stream of streams) {
        stream.id = pub.id;
        stream.display = display;
      }
      this.feedStreams.set(id, { id, display, streams });
      sources.push(streams);
    }
    if (sources.length > 0) {
      this.clampGalleryPage();
      this.emitGalleryLayout();
      this.subscribeTo(sources);
      this.rebalanceVideoSubscriptions();
    }
  }

  private storeOwnStreams(streams: PublisherStream[]) {
    if (!this.ownPublisherId) return;
    for (const stream of streams) {
      stream.id = this.ownPublisherId!;
    }
    this.feedStreams.set(this.ownPublisherId, {
      id: this.ownPublisherId,
      display: "",
      streams,
    });
  }

  /** mvideoroom.js publishOwnFeed: native capture, configure, no simulcast by default. */
  async publishLocalMedia(opts: { audio: boolean; video: boolean }): Promise<void> {
    if (!this.publisherHandle) throw new Error("not joined yet");
    if (!this.publisherJoined) throw new Error("publisher not configured yet");
    const handle = this.publisherHandle;

    return new Promise((resolve, reject) => {
      // simulcast=true sends three spatial layers (low/medium/high) in parallel.
      // Janus then forwards only the layer that fits each subscriber's bandwidth
      // rather than sending the full-resolution stream to everyone. Without
      // simulcast, a subscriber on a weak connection receives the full stream
      // and drops/freezes instead of degrading gracefully.
      const tracks = buildPublisherTracks({ ...opts, simulcast: true });

      handle.createOffer({
        tracks,
        success: (jsep: any) => {
          handle.send({
            message: buildPublishConfigure(opts.audio, opts.video),
            jsep,
            success: () => {
              this.schedulePublisherQualityTuning(handle);
              const localTracks = (handle.getLocalTracks?.() ?? []) as { mid?: string; type?: string }[];
              const streams = localTracks
                .filter((t) => t.mid && (t.type === "audio" || t.type === "video"))
                .map((t) => ({ mid: t.mid as string, type: t.type as "audio" | "video" }));
              this.localAudioEnabled = opts.audio;
              this.localVideoEnabled = opts.video;
              this.callbacks.onOwnPublishedStreams(streams);
              resolve();
            },
          });
        },
        error: (err: string) => reject(new Error(err)),
      });
    });
  }

  /** Whether this client is sending any unmuted media. */
  isPublishing(): boolean {
    if (this.listenerOnly) return false;
    return this.localAudioEnabled || this.localVideoEnabled;
  }

  getMediaState(): { publishing: boolean; audio: boolean; video: boolean } {
    return {
      publishing: this.isPublishing(),
      audio: this.localAudioEnabled,
      video: this.localVideoEnabled,
    };
  }

  /** Re-apply after ICE/DTLS — encodings are not always ready on first configure. */
  private schedulePublisherQualityTuning(handle: JanusHandle) {
    const apply = () => this.applyPublisherQualityTuning(handle);
    apply();
    for (const delayMs of [250, 1000, 3000]) window.setTimeout(apply, delayMs);
  }

  /** Browser-side encoder tuning (demo-style clarity, no artificial downscale). */
  private applyPublisherQualityTuning(handle: JanusHandle) {
    const pc = handle.webrtcStuff?.pc as RTCPeerConnection | undefined;
    if (!pc) return;
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) continue;
      for (const raw of params.encodings) {
        const enc = raw as RTCRtpEncodingParameters & {
          degradationPreference?: RTCDegradationPreference;
        };
        // Set a 2 Mbps ceiling so the browser's congestion control (GCC/REMB)
        // has a stable upper bound to work against. Deleting maxBitrate (the
        // previous behaviour) lets the encoder overshoot and then stall the
        // entire connection when the network complains.
        enc.maxBitrate = 2_000_000;
        // Prefer dropping framerate over resolution when bandwidth is tight.
        // The viewer sees a slightly slower but sharp picture rather than a
        // blurry low-resolution one.
        enc.degradationPreference = "maintain-resolution";
        if (enc.scaleResolutionDownBy == null) enc.scaleResolutionDownBy = 1;
      }
      void sender.setParameters(params).catch(() => undefined);
    }
  }

  private handleLocalTrack(track: MediaStreamTrack, on: boolean) {
    const trackKey = track.id.replace(/[{}]/g, "");
    if (!on) {
      this.localTracks.delete(trackKey);
      this.emitLocalStream();
      return;
    }
    if (this.localTracks.has(trackKey)) return;
    this.localTracks.set(trackKey, new MediaStream([track]));
    if (track.kind === "video" && this.publisherHandle) {
      this.schedulePublisherQualityTuning(this.publisherHandle);
    }
    this.emitLocalStream();
  }

  private emitLocalStream() {
    if (!this.localMergedStream) this.localMergedStream = new MediaStream();
    const merged = this.localMergedStream;
    const nextTracks = new Map<string, MediaStreamTrack>();
    for (const stream of this.localTracks.values()) {
      for (const t of stream.getTracks()) nextTracks.set(t.id, t);
    }
    for (const t of merged.getTracks()) {
      if (!nextTracks.has(t.id)) merged.removeTrack(t);
    }
    for (const t of nextTracks.values()) {
      if (!merged.getTracks().includes(t)) merged.addTrack(t);
    }
    if (merged.getTracks().length > 0) this.callbacks.onLocalStream(merged);
  }

  private remoteStreamFor(feedId: string): MediaStream {
    let stream = this.remoteStreams.get(feedId);
    if (!stream) {
      stream = new MediaStream();
      this.remoteStreams.set(feedId, stream);
    }
    return stream;
  }

  private syncRemoteStream(feedId: string, tracks: Map<string, MediaStreamTrack>) {
    const stream = this.remoteStreamFor(feedId);
    for (const t of stream.getTracks()) {
      if (!tracks.has(t.id) && !tracks.has(t.kind)) stream.removeTrack(t);
    }
    for (const t of tracks.values()) {
      const dup = stream.getTracks().find((x) => x.kind === t.kind);
      if (dup && dup.id !== t.id) stream.removeTrack(dup);
      if (!stream.getTracks().includes(t)) stream.addTrack(t);
    }
    return stream;
  }

  private subscribeTo(sources: PublisherStream[][]) {
    if (this.creatingSubscription) {
      window.setTimeout(() => this.subscribeTo(sources), 300);
      return;
    }

    if (this.subscriberHandle) {
      this.updateSubscription(sources);
      return;
    }

    this.creatingSubscription = true;
    this.janus.attach({
      plugin: "janus.plugin.videoroom",
      opaqueId: "multistream-sub-" + Janus.randomString(12),
      success: (handle: JanusHandle) => {
        this.subscriberHandle = handle;
        const subscription = this.buildSubscriptionList(sources, false);
        if (subscription.length === 0) {
          this.creatingSubscription = false;
          handle.detach();
          this.subscriberHandle = null;
          return;
        }
        handle.send({
          message: {
            request: "join",
            room: this.janusRoomId,
            ptype: "subscriber",
            streams: subscription,
            private_id: this.privateId,
          },
        });
      },
      error: (err: string) => {
        this.creatingSubscription = false;
        this.callbacks.onError(err);
      },
      onmessage: (msg: any, jsep: any) => this.handleSubscriberMessage(msg, jsep),
      onremotetrack: (track: MediaStreamTrack, mid: string, on: boolean) => {
        this.handleRemoteTrack(track, mid, on);
      },
      oncleanup: () => {
        this.subStreams.clear();
      },
    });
  }

  private updateSubscription(sources: PublisherStream[][]) {
    const handle = this.subscriberHandle;
    if (!handle) return;

    const added: { feed: string | number; mid: string }[] = [];
    const removed: { feed: string | number; mid: string }[] = [];

    for (const streams of sources) {
      for (const stream of streams) {
        const feedId = String(stream.id);
        if (stream.disabled) {
          if (this.isSubscribed(feedId, stream.mid)) {
            removed.push({ feed: stream.id, mid: stream.mid });
            this.markSubscribed(feedId, stream.mid, false);
          }
          continue;
        }
        if (this.isSubscribed(feedId, stream.mid)) continue;
        added.push({ feed: stream.id, mid: stream.mid });
        this.markSubscribed(feedId, stream.mid, true);
      }
    }

    if (added.length === 0 && removed.length === 0) return;
    const update: Record<string, unknown> = { request: "update" };
    if (added.length > 0) update.subscribe = added;
    if (removed.length > 0) update.unsubscribe = removed;
    handle.send({ message: update });
  }

  private buildSubscriptionList(sources: PublisherStream[][], allowAlreadySubscribed: boolean) {
    const subscription: { feed: string | number; mid: string }[] = [];
    for (const streams of sources) {
      for (const stream of streams) {
        if (stream.disabled) continue;
        const feedId = String(stream.id);
        if (!allowAlreadySubscribed && this.isSubscribed(feedId, stream.mid)) continue;

        // Skip video for publishers outside the current video window.
        // They'll get video added later if they become an active speaker.
        if (stream.type === "video" && !this.videoSubscribed.has(feedId)) continue;

        subscription.push({ feed: stream.id, mid: stream.mid });
        this.markSubscribed(feedId, stream.mid, true);
      }
    }
    return subscription;
  }

  private isSubscribed(feedId: string, mid: string) {
    return this.subscriptions.get(feedId)?.get(mid) === true;
  }

  private markSubscribed(feedId: string, mid: string, on: boolean) {
    if (on) {
      let mids = this.subscriptions.get(feedId);
      if (!mids) {
        mids = new Map();
        this.subscriptions.set(feedId, mids);
      }
      mids.set(mid, true);
    } else {
      this.subscriptions.get(feedId)?.delete(mid);
    }
  }

  private handleSubscriberMessage(msg: any, jsep: any) {
    const handle = this.subscriberHandle;
    if (!handle) return;

    if (msg.videoroom === "attached") {
      this.creatingSubscription = false;
    }

    if (msg.streams) {
      for (const s of msg.streams as SubStreamMeta[]) {
        if (s.mid) this.subStreams.set(s.mid, s);
      }
    }

    if (jsep) {
      handle.createAnswer({
        jsep,
        tracks: [{ type: "data" }],
        success: (answerJsep: any) => {
          handle.send({ message: { request: "start", room: this.janusRoomId }, jsep: answerJsep });
        },
        error: (err: string) => this.callbacks.onError(err),
      });
    }
  }

  private handleRemoteTrack(track: MediaStreamTrack, mid: string, on: boolean) {
    const sub = this.subStreams.get(mid);
    const feedId = sub?.feed_id != null ? String(sub.feed_id) : null;
    if (!feedId) return;

    const feed = this.feedStreams.get(feedId);
    const displayName = feed?.display ?? "Guest";

    if (!on) {
      this.remoteTracksByFeed.get(feedId)?.delete(mid);
      const tracks = this.remoteTracksByFeed.get(feedId);
      if (!tracks || tracks.size === 0) {
        this.remoteTracksByFeed.delete(feedId);
        this.remoteStreams.delete(feedId);
        this.callbacks.onRemoteFeedRemoved(feedId);
      } else {
        this.emitRemoteFeed(feedId, displayName);
      }
      return;
    }

    let tracks = this.remoteTracksByFeed.get(feedId);
    if (!tracks) {
      tracks = new Map();
      this.remoteTracksByFeed.set(feedId, tracks);
    }
    tracks.set(mid, track);
    this.emitRemoteFeed(feedId, displayName);
  }

  private emitRemoteFeed(feedId: string, displayName: string) {
    const tracks = this.remoteTracksByFeed.get(feedId);
    if (!tracks || tracks.size === 0) return;
    const stream = this.syncRemoteStream(feedId, tracks);
    let audioMid: string | undefined;
    let videoMid: string | undefined;
    for (const [mid, t] of tracks) {
      if (t.kind === "audio") audioMid = mid;
      if (t.kind === "video") videoMid = mid;
    }
    this.callbacks.onRemoteFeedAdded({
      publisherId: feedId,
      displayName,
      stream,
      audioMid,
      videoMid,
      hasVideo: this.videoSubscribed.has(feedId),
      isSpeaking: this.activeSpeakers.includes(feedId),
    });
  }

  private unsubscribeFrom(publisherId: string) {
    const feed = this.feedStreams.get(publisherId);
    if (!feed) return;

    // Clean up active speaker state
    const timer = this.speakerTimers.get(publisherId);
    if (timer) clearTimeout(timer);
    this.speakerTimers.delete(publisherId);
    this.speakerActivity.delete(publisherId);
    this.activeSpeakers = this.activeSpeakers.filter((id) => id !== publisherId);
    this.videoSubscribed.delete(publisherId);

    this.remoteTracksByFeed.delete(publisherId);
    this.remoteStreams.delete(publisherId);
    this.subscriptions.delete(publisherId);
    this.feedStreams.delete(publisherId);

    if (this.subscriberHandle) {
      this.subscriberHandle.send({
        message: {
          request: "unsubscribe",
          streams: [{ feed: publisherId }],
        },
      });
    }
    this.callbacks.onRemoteFeedRemoved(publisherId);

    // Rebalance so a new publisher can fill the freed video slot
    this.rebalanceVideoSubscriptions();
  }

  // ── Active speaker engine ────────────────────────────────────────────────

  /** Called when Janus fires a "talking" event for a remote publisher. */
  private onPublisherTalking(publisherId: string) {
    // Clear any pending silence timer
    const timer = this.speakerTimers.get(publisherId);
    if (timer) clearTimeout(timer);
    this.speakerTimers.delete(publisherId);

    this.speakerActivity.set(publisherId, Date.now());

    // Move to front of active speakers list
    this.activeSpeakers = [
      publisherId,
      ...this.activeSpeakers.filter((id) => id !== publisherId),
    ];

    this.rebalanceVideoSubscriptions();
    const tier = this.currentTier();
    this.callbacks.onActiveSpeakersChanged?.(this.activeSpeakers.slice(0, tier.videosPerPage));
  }

  /** Called when Janus fires a "stopped-talking" event for a remote publisher. */
  private onPublisherStoppedTalking(publisherId: string) {
    // Keep them as "speaking" for SPEAKER_LINGER_MS so the video doesn't
    // flash away the instant they stop — same behaviour as Zoom.
    const timer = setTimeout(() => {
      this.speakerTimers.delete(publisherId);
      this.speakerActivity.delete(publisherId);
      this.activeSpeakers = this.activeSpeakers.filter((id) => id !== publisherId);
      this.rebalanceVideoSubscriptions();
      const tier = this.currentTier();
      this.callbacks.onActiveSpeakersChanged?.(this.activeSpeakers.slice(0, tier.videosPerPage));
    }, SPEAKER_LINGER_MS);
    this.speakerTimers.set(publisherId, timer);
  }

  /**
   * Video on current gallery page only (see galleryVideoPolicy.ts).
   * Active speaker is HD; other slots use medium/low simulcast layers.
   */
  private rebalanceVideoSubscriptions() {
    const allFeedIds = this.remoteFeedIds();
    if (allFeedIds.length === 0) return;

    this.clampGalleryPage();
    this.maybeFollowActiveSpeaker();

    const tier = this.currentTier();
    const pageIds = new Set(this.pageFeedIds(tier));

    const prioritised = [
      ...this.activeSpeakers.filter((id) => pageIds.has(id)),
      ...[...pageIds].filter((id) => !this.activeSpeakers.includes(id)),
    ];

    const videoSlotOrder = prioritised.slice(0, tier.videosPerPage);
    const videoSlots = new Set(videoSlotOrder);
    const handle = this.subscriberHandle;
    if (!handle) return;

    const toSubscribeVideo: { feed: string; mid: string }[] = [];
    const toUnsubscribeVideo: { feed: string; mid: string }[] = [];
    const layerUpdates: { mid: string; substream: number }[] = [];

    for (const feedId of allFeedIds) {
      const feed = this.feedStreams.get(feedId);
      if (!feed) continue;
      const videoStream = feed.streams.find((s) => s.type === "video");
      if (!videoStream) continue;

      const wantsVideo = videoSlots.has(feedId);
      const hasVideo = this.videoSubscribed.has(feedId);

      if (wantsVideo && !hasVideo) {
        toSubscribeVideo.push({ feed: feedId, mid: videoStream.mid });
        this.videoSubscribed.add(feedId);
      } else if (!wantsVideo && hasVideo) {
        toUnsubscribeVideo.push({ feed: feedId, mid: videoStream.mid });
        this.videoSubscribed.delete(feedId);
      }
    }

    for (let i = 0; i < videoSlotOrder.length; i++) {
      const feedId = videoSlotOrder[i];
      if (!this.videoSubscribed.has(feedId)) continue;
      const substream =
        feedId === this.activeSpeakers[0] ? SUBSTREAM_ACTIVE_SPEAKER : substreamForVideoSlot(i, tier);
      for (const [subMid, meta] of this.subStreams) {
        if (String(meta.feed_id) === feedId && meta.type === "video") {
          layerUpdates.push({ mid: subMid, substream });
        }
      }
    }

    if (toSubscribeVideo.length > 0 || toUnsubscribeVideo.length > 0) {
      const update: Record<string, unknown> = { request: "update" };
      if (toSubscribeVideo.length > 0) {
        update.subscribe = toSubscribeVideo.map((s) => ({ feed: s.feed, mid: s.mid }));
        this.markSubscribed2(toSubscribeVideo, true);
      }
      if (toUnsubscribeVideo.length > 0) {
        update.unsubscribe = toUnsubscribeVideo.map((s) => ({ feed: s.feed, mid: s.mid }));
        this.markSubscribed2(toUnsubscribeVideo, false);
      }
      handle.send({ message: update });
    }

    if (layerUpdates.length > 0) {
      handle.send({
        message: {
          request: "configure",
          streams: layerUpdates,
        },
      });
    }

    for (const feedId of allFeedIds) {
      const feed = this.feedStreams.get(feedId);
      if (feed) this.emitRemoteFeed(feedId, feed.display);
    }

    this.emitGalleryLayout();
  }

  private markSubscribed2(items: { feed: string; mid: string }[], on: boolean) {
    for (const { feed, mid } of items) {
      this.markSubscribed(feed, mid, on);
    }
  }

  // ────────────────────────────────────────────────────────────────────────

  setLocalAudioEnabled(enabled: boolean) {
    if (!this.publisherHandle || this.listenerOnly) return;
    if (enabled) this.publisherHandle.unmuteAudio();
    else this.publisherHandle.muteAudio();
    this.localAudioEnabled = enabled;
  }

  setLocalVideoEnabled(enabled: boolean) {
    if (!this.publisherHandle || this.listenerOnly) return;
    if (enabled) this.publisherHandle.unmuteVideo();
    else this.publisherHandle.muteVideo();
    this.localVideoEnabled = enabled;
  }

  async shareScreen(): Promise<void> {
    if (!this.publisherHandle) throw new Error("not joined yet");
    const handle = this.publisherHandle;
    return new Promise((resolve, reject) => {
      handle.createOffer({
        tracks: [{ type: "screen", capture: true, recv: false, add: true }],
        success: (jsep: any) => {
          handle.send({ message: { request: "configure" }, jsep, success: () => resolve() });
        },
        error: (err: string) => reject(new Error(err)),
      });
    });
  }

  destroy() {
    if (this.publisherHandle && this.publisherJoined) {
      try {
        this.publisherHandle.send({ message: { request: "unpublish" } });
        this.publisherHandle.send({ message: { request: "leave" } });
      } catch {
        /* best-effort */
      }
    }
    // Clear all speaker linger timers
    for (const timer of this.speakerTimers.values()) clearTimeout(timer);
    this.speakerTimers.clear();
    this.speakerActivity.clear();
    this.activeSpeakers = [];
    this.videoSubscribed.clear();

    this.subscriberHandle?.hangup();
    this.subscriberHandle?.detach();
    this.subscriberHandle = null;
    this.publisherHandle?.hangup();
    this.publisherHandle?.detach();
    this.publisherHandle = null;
    this.publisherJoined = false;
    this.creatingSubscription = false;
    this.feedStreams.clear();
    this.subscriptions.clear();
    this.subStreams.clear();
    this.remoteTracksByFeed.clear();
    this.remoteStreams.clear();
    this.localTracks.clear();
    this.localMergedStream = null;
    this.localVideoEnabled = false;
    this.localAudioEnabled = false;
    this.listenerOnly = false;
    this.janus?.destroy();
    this.janus = null;
  }
}
