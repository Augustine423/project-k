/** Browser media APIs are only available in a secure context (HTTPS or localhost). */

export function canAccessMediaDevices(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function isSecureMediaContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext;
}

export function mediaUnavailableReason(): string {
  if (canAccessMediaDevices()) return "";
  if (!isSecureMediaContext()) {
    const host = typeof window !== "undefined" ? window.location.hostname : "this host";
    const isLoopback = host === "localhost" || host === "127.0.0.1";
    if (isLoopback) {
      return "Camera/mic unavailable in this browser. Try Chrome or Edge.";
    }
    return `Camera/mic need HTTPS on ${host}. Open https://${host}:${window.location.port || "5173"} (accept the dev certificate). Chat still works.`;
  }
  return "Camera/mic unavailable in this browser.";
}
