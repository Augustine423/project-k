import {
  detectCaptureDeviceClass,
  isDeviceOrientationPortrait,
  type CaptureDeviceClass,
} from "./deviceCapture";
import type { StreamAspect } from "./conferenceLayout";

/** LiveKit participant attributes — remotes use these to render portrait/landscape boxes. */
export const MM_DEVICE_ATTR = "mm.device";
export const MM_VIDEO_ASPECT_ATTR = "mm.videoAspect";

export type MmVideoAspectAttr = "portrait" | "landscape";

/**
 * Aspect to advertise to other participants.
 * Phones follow the real device orientation (was wrongly always-portrait).
 */
export function preferredAspectForCaptureDevice(
  device: CaptureDeviceClass = detectCaptureDeviceClass(),
): MmVideoAspectAttr {
  if (device === "mobile") {
    return isDeviceOrientationPortrait() ? "portrait" : "landscape";
  }
  return "landscape";
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

export function readPreferredVideoAspect(
  attributes: Record<string, string> | undefined | null,
): StreamAspect | undefined {
  if (!attributes) return undefined;
  const raw = attributes[MM_VIDEO_ASPECT_ATTR];
  if (raw === "portrait" || raw === "landscape") return raw;
  const device = attributes[MM_DEVICE_ATTR];
  // Legacy: old clients only sent mm.device=mobile without aspect — assume portrait.
  if (device === "mobile") return "portrait";
  if (device === "tablet" || device === "laptop") return "landscape";
  return undefined;
}

export function isMobileSourceAttributes(
  attributes: Record<string, string> | undefined | null,
): boolean {
  return attributes?.[MM_DEVICE_ATTR] === "mobile";
}
