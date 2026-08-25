import { detectCaptureDeviceClass, isDeviceOrientationPortrait } from "./deviceCapture";
import {
  LANDSCAPE_CAPTURE,
  MOBILE_LANDSCAPE_CAPTURE,
  PORTRAIT_CAPTURE,
  type CaptureDeviceClass,
} from "./deviceCapture";

export interface DeviceBandwidthHint {
  uplinkKbps: number;
  downlinkKbps: number;
  batterySaver: boolean;
  isMobile: boolean;
  isPortrait: boolean;
}

export interface AdaptiveCameraTarget {
  width: number;
  height: number;
  frameRate: number;
  bitrateKbps: number;
  portrait: boolean;
  device: CaptureDeviceClass;
}

function readNetworkDownlinkKbps(): number {
  if (typeof navigator === "undefined") return 0;
  const conn = (navigator as Navigator & {
    connection?: {
      downlink?: number;
      saveData?: boolean;
      effectiveType?: string;
    };
  }).connection;

  const downlinkMbps = Number(conn?.downlink ?? 0);
  if (Number.isFinite(downlinkMbps) && downlinkMbps > 0) {
    return Math.round(downlinkMbps * 1000);
  }

  const effectiveType = String(conn?.effectiveType ?? "");
  switch (effectiveType) {
    case "slow-2g":
      return 150;
    case "2g":
      return 300;
    case "3g":
      return 1200;
    case "4g":
      return 4500;
    default:
      return 0;
  }
}

export function createDeviceBandwidthHint(): DeviceBandwidthHint {
  const device = detectCaptureDeviceClass();
  const isMobile = device === "mobile";
  const isPortrait = isMobile ? isDeviceOrientationPortrait() : false;
  const downlinkKbps = readNetworkDownlinkKbps();
  const fallbackDownlinkKbps = isMobile ? (isPortrait ? 1800 : 2200) : 4500;
  const resolvedDownlinkKbps = downlinkKbps > 0 ? downlinkKbps : fallbackDownlinkKbps;
  const uplinkKbps = Math.max(256, Math.round(resolvedDownlinkKbps * 0.7));

  const conn = (typeof navigator !== "undefined"
    ? (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    : undefined);
  const batterySaver = Boolean(conn?.saveData) || resolvedDownlinkKbps < 1200;

  return {
    uplinkKbps,
    downlinkKbps: resolvedDownlinkKbps,
    batterySaver,
    isMobile,
    isPortrait,
  };
}

function targetForBandwidth(
  hint: DeviceBandwidthHint,
): AdaptiveCameraTarget {
  const device: CaptureDeviceClass = hint.isMobile ? "mobile" : "laptop";
  const portrait = hint.isMobile ? hint.isPortrait : false;
  const downlink = hint.downlinkKbps;
  const uplink = hint.uplinkKbps;
  const budget = Math.min(downlink || uplink || 0, uplink || downlink || 0);

  if (budget < 500) {
    return {
      width: portrait ? 240 : 426,
      height: portrait ? 426 : 240,
      frameRate: 12,
      bitrateKbps: 240,
      portrait,
      device,
    };
  }

  if (budget < 900) {
    return portrait
      ? { ...PORTRAIT_CAPTURE, frameRate: 15, bitrateKbps: 320, portrait, device }
      : { ...MOBILE_LANDSCAPE_CAPTURE, frameRate: 15, bitrateKbps: 320, portrait, device };
  }

  if (budget < 1500) {
    return portrait
      ? { width: 640, height: 960, frameRate: 20, bitrateKbps: 600, portrait, device }
      : { width: 640, height: 360, frameRate: 20, bitrateKbps: 600, portrait, device };
  }

  if (budget < 2500) {
    return portrait
      ? { width: 720, height: 1280, frameRate: 24, bitrateKbps: 1000, portrait, device }
      : { width: 960, height: 540, frameRate: 24, bitrateKbps: 1000, portrait, device };
  }

  if (budget < 4000) {
    return portrait
      ? { width: 720, height: 1280, frameRate: 30, bitrateKbps: 1800, portrait, device }
      : { width: 1280, height: 720, frameRate: 30, bitrateKbps: 1800, portrait, device };
  }

  return portrait
    ? { ...PORTRAIT_CAPTURE, frameRate: 30, bitrateKbps: 4500, portrait, device }
    : { ...LANDSCAPE_CAPTURE, frameRate: 30, bitrateKbps: 4500, portrait, device };
}

export function selectAdaptiveCameraTarget(
  hint: DeviceBandwidthHint = createDeviceBandwidthHint(),
): AdaptiveCameraTarget {
  return targetForBandwidth(hint);
}
