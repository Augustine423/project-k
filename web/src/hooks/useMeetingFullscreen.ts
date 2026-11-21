import { useCallback, useEffect, useState, type RefObject } from "react";

type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

/**
 * Fullscreen for the meeting container. Falls back to a CSS "pseudo" fullscreen
 * (`is-pseudo-fullscreen`) where the API is missing, e.g. iPhone Safari.
 */
export function useMeetingFullscreen(ref: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    const doc = document as FullscreenDoc;
    const sync = () => {
      const el = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setNative(el !== null && el === ref.current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPseudo(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref]);

  const isFullscreen = native || pseudo;

  const toggle = useCallback(() => {
    const doc = document as FullscreenDoc;
    if (native) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return;
    }
    if (pseudo) {
      setPseudo(false);
      return;
    }
    const el = ref.current as FullscreenEl | null;
    const request = el?.requestFullscreen?.bind(el) ?? el?.webkitRequestFullscreen?.bind(el);
    if (!request) {
      setPseudo(true);
      return;
    }
    Promise.resolve(request()).catch(() => setPseudo(true));
  }, [native, pseudo, ref]);

  return { isFullscreen, isPseudo: pseudo, toggle };
}
