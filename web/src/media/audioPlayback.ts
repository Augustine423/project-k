import { useSyncExternalStore } from "react";

/**
 * Tracks browser autoplay blocks for audio we render ourselves (<audio> bound to
 * MediaStreams) and for LiveKit's own playback status. Safari/mobile reject play()
 * until a user gesture, so the UI shows one "Enable audio" prompt and retries all.
 */
const blockedElements = new Set<HTMLMediaElement>();
let roomBlocked = false;
const listeners = new Set<() => void>();
let snapshot = false;

function recompute() {
  const next = roomBlocked || blockedElements.size > 0;
  if (next === snapshot) return;
  snapshot = next;
  for (const l of listeners) l();
}

export function setRoomAudioBlocked(blocked: boolean): void {
  roomBlocked = blocked;
  recompute();
}

/** Play an audio element; remember it for a retry when the browser blocks autoplay. */
export function playAudioElement(el: HTMLMediaElement): void {
  el.play().then(
    () => {
      blockedElements.delete(el);
      recompute();
    },
    (err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      blockedElements.add(el);
      recompute();
    },
  );
}

export function forgetAudioElement(el: HTMLMediaElement): void {
  if (blockedElements.delete(el)) recompute();
}

/** Retry every blocked element; call from a user gesture. */
export function retryBlockedAudio(): void {
  for (const el of [...blockedElements]) {
    if (!el.isConnected || !el.srcObject) {
      blockedElements.delete(el);
      continue;
    }
    playAudioElement(el);
  }
  recompute();
}

export function useAudioBlocked(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => false,
  );
}
