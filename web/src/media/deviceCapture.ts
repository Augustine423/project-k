/**
 * Detect capture device class before getUserMedia so we request:
 * - mobile phone → portrait 720×1280 (9:16) when upright; landscape when sideways
 * - tablet + laptop → landscape 1920×1080 (1080p 16:9)
 */

export type CaptureDeviceClass = "mobile" | "tablet" | "laptop";

/** Phone upright target — 720×1280 (9:16). */
export const PORTRAIT_CAPTURE = { width: 720, height: 1280 } as const;

/** Phone landscape target — 1280×720 (16:9). */
export const MOBILE_LANDSCAPE_CAPTURE = { width: 1280, height: 720 } as const;

/** Tablet / laptop publish target — 1920×1080 (16:9 1080p). */
export const LANDSCAPE_CAPTURE = { width: 1920, height: 1080 } as const;

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
    (/Macintosh/i.test(ua) && hasCoarsePointer() && (navigator.maxTouchPoints ?? 0) > 1);

  return { mobile: mobileUa && !tabletUa, tablet: tabletUa };
}

/** True when the device is held upright (or unknown defaults to portrait for phones). */
export function isDeviceOrientationPortrait(): boolean {
  if (typeof window === "undefined") return true;
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
 * Classify the local device for camera constraints.
 * Touchscreen laptops stay "laptop" (landscape).
 */
export function detectCaptureDeviceClass(): CaptureDeviceClass {
  if (typeof window === "undefined") return "laptop";

  const { mobile, tablet } = uaHints();
  if (tablet) return "tablet";
  if (mobile) return "mobile";

  const width = window.innerWidth;
  const coarse = hasCoarsePointer();
  if (coarse && width <= 600) return "mobile";
  if (coarse && width <= 1100) return "tablet";
  return "laptop";
}

/** Phones only — tablets are treated as landscape devices. */
export function isMobilePhoneCaptureDevice(device = detectCaptureDeviceClass()): boolean {
  return device === "mobile";
}

/** @deprecated Prefer isMobilePhoneCaptureDevice — tablets are landscape now. */
export function isHandheldCaptureDevice(device = detectCaptureDeviceClass()): boolean {
  return device === "mobile";
}

/**
 * Capture size for this device:
 * - Mobile phone → portrait 720×1280 when upright; landscape 1280×720 when sideways
 * - Tablet + laptop → 1920×1080
 */
export function resolveCaptureDimensions(device = detectCaptureDeviceClass()): {
  width: number;
  height: number;
  portrait: boolean;
  aspectRatio: number;
  device: CaptureDeviceClass;
} {
  if (device === "mobile") {
    const portrait = isDeviceOrientationPortrait();
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
      width: MOBILE_LANDSCAPE_CAPTURE.width,
      height: MOBILE_LANDSCAPE_CAPTURE.height,
      portrait: false,
      aspectRatio: 16 / 9,
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
