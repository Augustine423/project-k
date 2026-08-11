/**
 * Join invitation URL using the same host the browser used to open the app.
 * Works for localhost, LAN IP, GKE Gateway / load balancer — no hardcoded server.
 */
export function inviteLinkForRoom(roomId: string): string {
  const id = roomId.trim();
  if (!id) return "";

  const path = `/join/${encodeURIComponent(id)}`;

  if (typeof window === "undefined") {
    return path;
  }

  const origin = window.location.origin.replace(/\/$/, "");
  return `${origin}${path}`;
}

export function meetingNameStorageKey(roomId: string): string {
  return `mm.meetingName.${roomId.trim()}`;
}

export function readStoredMeetingName(roomId: string): string {
  if (typeof window === "undefined" || !roomId.trim()) return "";
  try {
    return window.localStorage.getItem(meetingNameStorageKey(roomId))?.trim() ?? "";
  } catch {
    return "";
  }
}

export function persistMeetingName(roomId: string, name: string): void {
  if (typeof window === "undefined" || !roomId.trim()) return;
  try {
    const trimmed = name.trim().slice(0, 80);
    if (trimmed) {
      window.localStorage.setItem(meetingNameStorageKey(roomId), trimmed);
    } else {
      window.localStorage.removeItem(meetingNameStorageKey(roomId));
    }
  } catch {
    /* ignore */
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function copyInviteLink(roomId: string): Promise<boolean> {
  return copyTextToClipboard(inviteLinkForRoom(roomId));
}
