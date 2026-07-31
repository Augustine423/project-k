/** Shared chat message shape for room-wide and direct messages. */
export interface ChatMessage {
  id: string;
  participantId?: string;
  displayName: string;
  message: string;
  at: string;
  /** True for private client-to-client messages. */
  dm?: boolean;
  toParticipantId?: string;
  toDisplayName?: string;
}

/** Soft ink-desk avatar fills (graphite / slate / ink — not neon). */
export function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const tones = [
    "#3d4a5c",
    "#4a3f38",
    "#2f4a48",
    "#453c55",
    "#3a4550",
    "#4b4034",
    "#334851",
    "#4a3842",
  ];
  return tones[Math.abs(hash) % tones.length];
}

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

export function formatChatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}
