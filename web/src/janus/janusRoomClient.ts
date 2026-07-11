// Thin wrapper around the official janus-gateway JS client, scoped to what
// this app needs from the VideoRoom plugin: join as a publisher, capture and
// publish local mic/cam (+ optional screen share), and auto-subscribe to
// every other publisher in the room using one subscriber handle per remote
// feed ("legacy" single-feed subscriptions -- simpler and more than enough
// for Phase 1; multiplexing several feeds onto one subscriber handle is a
// worthwhile optimization for very large galleries, left for Phase 2).
import type { TurnInfo } from "../api/types";
import Janus from "janus-gateway";
import { ensureJanusInit } from "./janusInit";

export interface RemoteFeed {
  publisherId: string;
  displayName: string;
  stream: MediaStream;
  audioMid?: string;
  videoMid?: string;
}

export interface JanusRoomClientCallbacks {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteFeedAdded: (feed: RemoteFeed) => void;
  onRemoteFeedRemoved: (publisherId: string) => void;
  onOwnPublishedStreams: (streams: { mid: string; type: "audio" | "video" }[]) => void;
  onError: (message: string) => void;
  onDisconnected: () => void;
}

type JanusHandle = any;

export class JanusRoomClient {
  private janus: any;
  private publisherHandle: JanusHandle | null = null;
  private janusRoomId: string | null = null;
  private privateId: number | null = null;
  private publisherJoined = false;
  private joinWaiters: { resolve: () => void; reject: (err: Error) => void } | null = null;
  private readonly subscriberHandles = new Map<string, JanusHandle>();
  private readonly callbacks: JanusRoomClientCallbacks;

  constructor(callbacks: JanusRoomClientCallbacks) {
    this.callbacks = callbacks;
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
              // Rooms created before the server fix may have an empty Janus pin;
              // sending "" satisfies that legacy case. New rooms omit pin entirely.
              pin: janusJoinPin,
            },
          });
        },
        error: (err: string) => {
          this.joinWaiters?.reject(new Error(err));
          this.joinWaiters = null;
        },
        onmessage: (msg: any, jsep: any) => this.handlePublisherMessage(msg, jsep),
        onlocaltrack: () => {
          // Local stream is surfaced from publishLocalMedia() after joined.
        },
        oncleanup: () => {
          /* publisher handle cleaned up server-side */
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
      this.joinWaiters?.resolve();
      this.joinWaiters = null;
      const existing = (msg.publishers ?? []) as any[];
      for (const p of existing) this.subscribeToFeed(p);
    } else if (event === "event") {
      if (msg.publishers) {
        for (const p of msg.publishers as any[]) this.subscribeToFeed(p);
      }
      if (msg.leaving || msg.unpublished) {
        const id = String(msg.leaving ?? msg.unpublished);
        this.removeFeed(id);
      }
      if (msg.error) {
        this.callbacks.onError(msg.error);
        if (!this.publisherJoined) {
          this.joinWaiters?.reject(new Error(msg.error));
          this.joinWaiters = null;
        }
      }
    }
    if (jsep && this.publisherJoined) {
      this.publisherHandle.handleRemoteJsep({ jsep });
    }
  }

  /** Captures mic/cam and starts publishing. Call only after joinAsPublisher resolves. */
  async publishLocalMedia(opts: { audio: boolean; video: boolean }): Promise<void> {
    if (!this.publisherHandle) throw new Error("not joined yet");
    if (!this.publisherJoined) throw new Error("publisher not configured yet");
    const handle = this.publisherHandle;

    return new Promise((resolve, reject) => {
      handle.createOffer({
        tracks: [
          { type: "audio", capture: opts.audio, recv: false },
          { type: "video", capture: opts.video, recv: false },
        ],
        success: (jsep: any) => {
          handle.send({
            message: { request: "publish", audio: opts.audio, video: opts.video },
            jsep,
            success: () => {
              const stream = new MediaStream(
                handle.webrtcStuff?.myStream?.getTracks?.() ?? [],
              );
              this.callbacks.onLocalStream(stream);
              const localTracks = (handle.getLocalTracks?.() ?? []) as { mid?: string; type?: string }[];
              const streams = localTracks
                .filter((t) => t.mid && (t.type === "audio" || t.type === "video"))
                .map((t) => ({ mid: t.mid as string, type: t.type as "audio" | "video" }));
              this.callbacks.onOwnPublishedStreams(streams);
              resolve();
            },
          });
        },
        error: (err: string) => reject(new Error(err)),
      });
    });
  }

  private subscribeToFeed(publisher: { id: string | number; display: string }) {
    const feedId = String(publisher.id);
    if (this.subscriberHandles.has(feedId)) return;

    this.janus.attach({
      plugin: "janus.plugin.videoroom",
      opaqueId: "subscriber-" + Janus.randomString(12),
      success: (handle: JanusHandle) => {
        this.subscriberHandles.set(feedId, handle);
        handle.send({
          message: {
            request: "join",
            ptype: "subscriber",
            room: this.janusRoomId,
            feed: publisher.id,
            private_id: this.privateId,
          },
        });
      },
      error: (err: string) => this.callbacks.onError(err),
      onmessage: (msg: any, jsep: any) => this.handleSubscriberMessage(feedId, publisher.display, msg, jsep),
      onremotetrack: (track: MediaStreamTrack, _mid: string, added: boolean) => {
        if (!added) return;
        const handle = this.subscriberHandles.get(feedId);
        if (!handle) return;
        const stream = new MediaStream([track]);
        this.callbacks.onRemoteFeedAdded({ publisherId: feedId, displayName: publisher.display, stream });
      },
      oncleanup: () => {
        /* handled explicitly via removeFeed */
      },
    });
  }

  private handleSubscriberMessage(feedId: string, _displayName: string, msg: any, jsep: any) {
    const handle = this.subscriberHandles.get(feedId);
    if (!handle) return;
    if (jsep) {
      handle.createAnswer({
        jsep,
        tracks: [
          { type: "audio", capture: false, recv: true },
          { type: "video", capture: false, recv: true },
        ],
        success: (answerJsep: any) => {
          handle.send({ message: { request: "start" }, jsep: answerJsep });
        },
        error: (err: string) => this.callbacks.onError(err),
      });
    }
    if (msg.videoroom === "event" && (msg.leaving || msg.unpublished)) {
      this.removeFeed(feedId);
    }
  }

  private removeFeed(feedId: string) {
    const handle = this.subscriberHandles.get(feedId);
    if (handle) {
      handle.hangup();
      handle.detach();
      this.subscriberHandles.delete(feedId);
    }
    this.callbacks.onRemoteFeedRemoved(feedId);
  }

  setLocalAudioEnabled(enabled: boolean) {
    if (!this.publisherHandle) return;
    if (enabled) this.publisherHandle.unmuteAudio();
    else this.publisherHandle.muteAudio();
  }

  setLocalVideoEnabled(enabled: boolean) {
    if (!this.publisherHandle) return;
    if (enabled) this.publisherHandle.unmuteVideo();
    else this.publisherHandle.muteVideo();
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
    for (const handle of this.subscriberHandles.values()) {
      handle.hangup();
      handle.detach();
    }
    this.subscriberHandles.clear();
    this.publisherHandle?.hangup();
    this.publisherHandle?.detach();
    this.janus?.destroy();
  }
}
