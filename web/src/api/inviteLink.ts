/**
 * Join invitation URL using the same host the browser used to open the app.
 * Works for localhost, LAN IP, GKE Gateway / load balancer — no hardcoded server.
 */
export function inviteLinkForRoom(roomId: string): string {
  const id = roomId.trim();
  if (!id) return "";

  if (typeof window === "undefined") {
    return `/join/${encodeURIComponent(id)}`;
  }

  const origin = window.location.origin.replace(/\/$/, "");
  return `${origin}/join/${encodeURIComponent(id)}`;
}

export async function copyInviteLink(roomId: string): Promise<boolean> {
  const link = inviteLinkForRoom(roomId);
  if (!link) return false;

  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    try {
      const input = document.createElement("textarea");
      input.value = link;
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
