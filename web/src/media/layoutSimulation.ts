import type { StageParticipantTile, StreamAspect } from "./conferenceLayout";

const FAKE_NAMES = [
  "Ava Chen",
  "Ben Ortiz",
  "Cara Nguyen",
  "Diego Ruiz",
  "Elena Park",
  "Farid Ali",
  "Grace Kim",
  "Hugo Santos",
  "Imani Cole",
  "Jules Meyer",
  "Kai Nakamura",
  "Lina Costa",
  "Omar Haddad",
  "Priya Shah",
  "Quinn Blake",
  "Ravi Patel",
  "Sofia Rossi",
  "Tariq Hassan",
  "Uma Singh",
  "Vera Novak",
  "Wes Coleman",
  "Xena Brooks",
  "Yuri Petrov",
  "Zara Malik",
];

/** Clamp simulator total (includes real local + remotes). */
export function clampSimTotal(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(50, Math.max(1, Math.round(n)));
}

/**
 * Pad (or trim) the visible stage to exactly `totalCount` tiles for layout review.
 * Real tiles are kept first; fake no-video tiles fill the rest with mixed aspects.
 */
export function buildSimulatedStageTiles(
  realTiles: StageParticipantTile[],
  totalCount: number,
): StageParticipantTile[] {
  const target = clampSimTotal(totalCount);
  const base = realTiles.length > 0 ? realTiles : [];

  if (base.length >= target) {
    // Keep host/local when trimming so primary layout still makes sense.
    const hostish = base.filter(
      (t) => t.id === "local" || t.roleBadge === "Host" || t.roleBadge === "Co-host",
    );
    const others = base.filter((t) => !hostish.includes(t));
    return [...hostish, ...others].slice(0, target);
  }

  const fakes: StageParticipantTile[] = [];
  for (let i = 0; i < target - base.length; i++) {
    const name = FAKE_NAMES[i % FAKE_NAMES.length];
    const preferredAspect: StreamAspect = i % 3 === 0 ? "portrait" : "landscape";
    fakes.push({
      id: `sim-fake-${i + 1}`,
      label: `${name} (sim)`,
      stream: null,
      hasVideo: false,
      preferredAspect,
      isSpeaking: i === 0,
      roleBadge: undefined,
    });
  }
  return [...base, ...fakes];
}

export function layoutSimEnabledFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("layoutSim") === "1";
  } catch {
    return false;
  }
}
