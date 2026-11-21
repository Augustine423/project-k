import { useCallback, useEffect } from "react";
import { retryBlockedAudio, useAudioBlocked } from "../media/audioPlayback";

const GESTURES = ["pointerdown", "touchend", "keydown", "click"] as const;

/**
 * Unobtrusive prompt shown when the browser blocks audio autoplay. Any user gesture
 * (or tapping the pill) calls `startAudio` and retries blocked <audio> elements.
 */
export function AudioEnablePill({ startAudio }: { startAudio: () => Promise<void> | void }) {
  const blocked = useAudioBlocked();

  const unlock = useCallback(() => {
    retryBlockedAudio();
    void Promise.resolve(startAudio()).catch(() => undefined);
  }, [startAudio]);

  useEffect(() => {
    if (!blocked) return;
    for (const type of GESTURES) document.addEventListener(type, unlock, { capture: true });
    return () => {
      for (const type of GESTURES) document.removeEventListener(type, unlock, { capture: true });
    };
  }, [blocked, unlock]);

  if (!blocked) return null;
  return (
    <button type="button" className="audio-enable-pill" onClick={unlock} role="status">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
        <path
          d="M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7m2.5-9.5a9 9 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Click to enable audio</span>
    </button>
  );
}
