/**
 * Detect capture device class before getUserMedia so we request:
 * - mobile phone → portrait 720×1280 (shown as portrait on every screen)
 * - tablet + laptop → landscape 1280×720 (shown as landscape on every screen)
 */

export type CaptureDeviceClass = "mobile" | "tablet" | "laptop";

/** Phone upright target — 720×1280 (9:16). */
export const PORTRAIT_CAPTURE = { width: 720, height: 1280 } as const;

/** Tablet / laptop target — 1280×720 (16:9). */
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
 * Touchscreen laptops stay "laptop" (landscape).
 */
export function detectCaptureDeviceClass(): CaptureDeviceClass {
  if (typeof window === "undefined") return "laptop";

  const { mobile, tablet } = uaHints();
  if (tablet) return "tablet";
  if (mobile) return "mobile";

  const width = window.innerWidth;
  const coarse = hasCoarsePointer();
  // Small phone-sized touch screens without clear UA → mobile.
  if (coarse && width <= 600) return "mobile";
  // Larger touch pads without phone UA → tablet (landscape capture).
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
 * - Mobile phone → always portrait 720×1280
 * - Tablet + laptop → always landscape 1280×720
 */
export function resolveCaptureDimensions(device = detectCaptureDeviceClass()): {
  width: number;
  height: number;
  portrait: boolean;
  aspectRatio: number;
  device: CaptureDeviceClass;
} {
  if (device === "mobile") {
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
