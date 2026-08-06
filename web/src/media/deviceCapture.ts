/**
 * Detect capture device class before getUserMedia so we request
 * portrait (mobile/tablet) vs landscape (laptop) resolutions.
 */

export type CaptureDeviceClass = "mobile" | "tablet" | "laptop";

/** Mobile/tablet upright target — 720×1280 (9:16). */
export const PORTRAIT_CAPTURE = { width: 720, height: 1280 } as const;

/** Laptop / landscape target — 1280×720 (16:9). */
export const LANDSCAPE_CAPTURE = { width: 1280, height: 720 } as const;

function hasCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function uaHints(): { mobile: boolean; tablet: boolean } {
  if (typeof navigator === "undefined") return { mobile: false, tablet: false };
  const ua = navigator.userAgent || "";
  const uaData = (
    navigator as Navigator & {
      userAgentData?: { mobile?: boolean };
    }
  ).userAgentData;

  const mobileUa =
    Boolean(uaData?.mobile) ||
    /iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry/i.test(ua);
  const tabletUa =
    /iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(ua) ||
    // iPadOS 13+ may report as Mac with touch.
    (/Macintosh/i.test(ua) && hasCoarsePointer() && (navigator.maxTouchPoints ?? 0) > 1);

  return { mobile: mobileUa && !tabletUa, tablet: tabletUa };
}

/**
 * Classify the local device for camera constraints.
 * Width + UA + coarse pointer — touchscreen laptops stay "laptop".
 */
export function detectCaptureDeviceClass(): CaptureDeviceClass {
  if (typeof window === "undefined") return "laptop";

  const { mobile, tablet } = uaHints();
  if (tablet) return "tablet";
  if (mobile) return "mobile";

  const width = window.innerWidth;
  const coarse = hasCoarsePointer();
  // Small touch screens without clear UA → treat as phone/tablet.
  if (coarse && width <= 900) {
    return width <= 600 ? "mobile" : "tablet";
  }
  return "laptop";
}

export function isHandheldCaptureDevice(device = detectCaptureDeviceClass()): boolean {
  return device === "mobile" || device === "tablet";
}

/** Current screen orientation (for handheld rotate). */
export function isPortraitOrientation(): boolean {
  if (typeof window === "undefined") return false;
  const type = window.screen?.orientation?.type;
  if (typeof type === "string") {
    if (type.startsWith("portrait")) return true;
    if (type.startsWith("landscape")) return false;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(orientation: portrait)").matches;
  }
  return window.innerHeight >= window.innerWidth;
}

/**
 * Capture size for this device:
 * - Laptop → always landscape 1280×720
 * - Mobile/tablet → portrait 720×1280 when upright; landscape 1280×720 when sideways
 */
export function resolveCaptureDimensions(device = detectCaptureDeviceClass()): {
  width: number;
  height: number;
  portrait: boolean;
  aspectRatio: number;
  device: CaptureDeviceClass;
} {
  if (!isHandheldCaptureDevice(device)) {
    return {
      width: LANDSCAPE_CAPTURE.width,
      height: LANDSCAPE_CAPTURE.height,
      portrait: false,
      aspectRatio: 16 / 9,
      device,
    };
  }

  const portrait = isPortraitOrientation();
  if (portrait) {
    return {
      width: PORTRAIT_CAPTURE.width,
      height: PORTRAIT_CAPTURE.height,
      portrait: true,
      aspectRatio: 9 / 16,
      device,
    };
  }
  return {
    width: LANDSCAPE_CAPTURE.width,
    height: LANDSCAPE_CAPTURE.height,
    portrait: false,
    aspectRatio: 16 / 9,
    device,
  };
}
