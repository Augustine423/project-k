// Read-only client for the webinar/broadcast viewer path: subscribes to a
// Streaming-plugin mountpoint (see server/internal/webinar) instead of
// joining a VideoRoom, so viewer scale never touches publish/subscribe
// VideoRoom capacity on the stage node.
import Janus from "janus-gateway";
import { ensureJanusInit } from "./janusInit";

export interface JanusViewerCallbacks {
  onStream: (stream: MediaStream) => void;
  onError: (message: string) => void;
  onDisconnected: () => void;
}

export class JanusViewerClient {
  private janus: any;
  private handle: any;
  private readonly callbacks: JanusViewerCallbacks;

  constructor(callbacks: JanusViewerCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(wsUrl: string): Promise<void> {
    await ensureJanusInit();
    await new Promise<void>((resolve, reject) => {
      this.janus = new Janus({
        server: wsUrl,
        success: () => resolve(),
        error: (err: string) => reject(new Error(err)),
        destroyed: () => this.callbacks.onDisconnected(),
      });
    });
  }

  async watch(mountpointId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.janus.attach({
        plugin: "janus.plugin.streaming",
        opaqueId: "viewer-" + Janus.randomString(12),
        success: (handle: any) => {
          this.handle = handle;
          handle.send({ message: { request: "watch", id: mountpointId } });
          resolve();
        },
        error: (err: string) => reject(new Error(err)),
        onmessage: (msg: any, jsep: any) => {
          if (msg.error) this.callbacks.onError(msg.error);
          if (jsep) {
            this.handle.createAnswer({
              jsep,
              tracks: [
                { type: "audio", capture: false, recv: true },
                { type: "video", capture: false, recv: true },
              ],
              success: (answerJsep: any) => {
                this.handle.send({ message: { request: "start" }, jsep: answerJsep });
              },
              error: (err: string) => this.callbacks.onError(err),
            });
          }
        },
        onremotetrack: (track: MediaStreamTrack, _mid: string, added: boolean) => {
          if (!added) return;
          this.callbacks.onStream(new MediaStream([track]));
        },
      });
    });
  }

  destroy() {
    this.handle?.hangup();
    this.handle?.detach();
    this.janus?.destroy();
  }
}
