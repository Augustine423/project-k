import {
  detectCaptureDeviceClass,
  isDeviceOrientationPortrait,
  type CaptureDeviceClass,
} from "./deviceCapture";
import type { StreamAspect } from "./conferenceLayout";

/** LiveKit participant attributes — remotes use these to render portrait/landscape boxes. */
export const MM_DEVICE_ATTR = "mm.device";
export const MM_VIDEO_ASPECT_ATTR = "mm.videoAspect";

/**
 * Advertised video box aspect:
 * - mobile upright → portrait (9:16 gallery box)
 * - mobile sideways / tablet / laptop → square (1:1 gallery box)
 */
export type MmVideoAspectAttr = "portrait" | "landscape" | "square";

/**
 * Aspect to advertise to other participants.
 * Gallery: 9:16 only for mobile portrait; all other cases → 1:1 (`square`).
 * (Capture may still be 16:9 on mobile landscape; the tile box is 1:1 + cover.)
 */
export function preferredAspectForCaptureDevice(
  device: CaptureDeviceClass = detectCaptureDeviceClass(),
): MmVideoAspectAttr {
  if (device === "mobile" && isDeviceOrientationPortrait()) {
    return "portrait";
  }
  return "square";
}

/** Attributes every MeetingMax client should publish on join / camera enable / rotate. */
export function localDeviceAttributes(
  device: CaptureDeviceClass = detectCaptureDeviceClass(),
): Record<string, string> {
  return {
    [MM_DEVICE_ATTR]: device,
    [MM_VIDEO_ASPECT_ATTR]: preferredAspectForCaptureDevice(device),
  };
}

export function readSourceDevice(
  attributes: Record<string, string> | undefined | null,
): CaptureDeviceClass | undefined {
  const raw = attributes?.[MM_DEVICE_ATTR];
  if (raw === "mobile" || raw === "tablet" || raw === "laptop") return raw;
  return undefined;
}

export function readPreferredVideoAspect(
  attributes: Record<string, string> | undefined | null,
): StreamAspect | undefined {
  if (!attributes) return undefined;
  const raw = attributes[MM_VIDEO_ASPECT_ATTR];
  if (raw === "portrait" || raw === "landscape" || raw === "square") return raw;
  const device = attributes[MM_DEVICE_ATTR];
  // Legacy: old clients only sent mm.device=mobile without aspect — assume upright portrait.
  if (device === "mobile") return "portrait";
  if (device === "tablet" || device === "laptop") return "square";
  return undefined;
}

/** 9:16 gallery box only when publisher is a phone held upright. */
export function isMobilePortraitSource(
  attributes: Record<string, string> | undefined | null,
): boolean {
  if (!attributes) return false;
  const device = readSourceDevice(attributes);
  const aspect = readPreferredVideoAspect(attributes);
  if (device === "mobile" && aspect === "portrait") return true;
  // Legacy mobile with no aspect attr
  if (device === "mobile" && !attributes[MM_VIDEO_ASPECT_ATTR]) return true;
  return false;
}

export function isMobileSourceAttributes(
  attributes: Record<string, string> | undefined | null,
): boolean {
  return attributes?.[MM_DEVICE_ATTR] === "mobile";
}
