import { useEffect, useRef } from "react";
import { forgetAudioElement, playAudioElement } from "../media/audioPlayback";

/** Audio-only playback for off-page speakers: no video element, no layout, no timers. */
export function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  const track = stream.getAudioTracks()[0] ?? null;

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    el.srcObject = new MediaStream([track]);
    playAudioElement(el);
    const onEnded = () => {
      el.srcObject = null;
    };
    track.addEventListener("ended", onEnded);
    return () => {
      track.removeEventListener("ended", onEnded);
      forgetAudioElement(el);
      el.srcObject = null;
    };
  }, [track]);

  return <audio ref={ref} hidden autoPlay playsInline aria-hidden />;
}
