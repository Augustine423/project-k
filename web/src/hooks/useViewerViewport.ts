import { useEffect, useState } from "react";

/** How the local viewer is watching — drives stage layout adaptation. */
export type ViewerViewportMode = "desktop" | "mobile-portrait" | "mobile-landscape";

export type ViewerViewport = {
  mode: ViewerViewportMode;
  isMobile: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  width: number;
  height: number;
};

const MOBILE_MAX_WIDTH = 900;

function readViewport(): ViewerViewport {
  if (typeof window === "undefined") {
    return {
      mode: "desktop",
      isMobile: false,
      isPortrait: false,
      isLandscape: true,
      width: 1280,
      height: 720,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  // Width-first: don't treat touchscreen laptops as "mobile" or hosts lose the grid.
  const isMobile = width <= MOBILE_MAX_WIDTH && (coarse || width <= 720);

  let isPortrait = height >= width;
  const type = window.screen?.orientation?.type;
  if (typeof type === "string") {
    if (type.startsWith("portrait")) isPortrait = true;
    else if (type.startsWith("landscape")) isPortrait = false;
  } else if (typeof window.matchMedia === "function") {
    isPortrait = window.matchMedia("(orientation: portrait)").matches;
  }

  const mode: ViewerViewportMode = !isMobile
    ? "desktop"
    : isPortrait
      ? "mobile-portrait"
      : "mobile-landscape";

  return {
    mode,
    isMobile,
    isPortrait,
    isLandscape: !isPortrait,
    width,
    height,
  };
}

/** Tracks desktop vs mobile portrait/landscape for conference layout switching. */
export function useViewerViewport(): ViewerViewport {
  const [viewport, setViewport] = useState<ViewerViewport>(() => readViewport());

  useEffect(() => {
    const update = () => setViewport(readViewport());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const mqPortrait = window.matchMedia("(orientation: portrait)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");
    mqPortrait.addEventListener?.("change", update);
    mqCoarse.addEventListener?.("change", update);
    window.screen?.orientation?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      mqPortrait.removeEventListener?.("change", update);
      mqCoarse.removeEventListener?.("change", update);
      window.screen?.orientation?.removeEventListener?.("change", update);
    };
  }, []);

  return viewport;
}
