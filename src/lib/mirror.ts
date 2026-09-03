/**
 * mirror.ts — Pheme's second copy, kept where the origin cannot reach it.
 *
 * Everything Pheme knows lives in localStorage, which belongs to the
 * iframe's ORIGIN. That origin is not a stable thing: a dev server on
 * another port, a packaged copy served over `mnemo-plugin://`, a launcher
 * handing the canvas an incomplete manifest — each hands the cartridge a
 * clean, empty store, and the user is told their profile is gone. It
 * happened, twice, before this file existed.
 *
 * So the host holds a mirror (doc 73). localStorage stays the primary — it
 * is synchronous and always there — and this is what makes losing it
 * survivable.
 *
 * Only what CANNOT be recomputed is mirrored: the profile, the ledger, the
 * recorded voices, the diagnosis timeline. Caches (radar, presence,
 * drafts, translations) are regenerable and would blow the size budget for
 * nothing.
 */

/** The keys worth surviving an origin change. */
export const MIRRORED_KEYS = [
  'pheme:profile',
  'pheme:ledger',
  'pheme:voices',
  'pheme:diagnoses',
  'pheme:radar:pinned',
  'pheme:presence:seen',
] as const;

export type MirrorSnapshot = Record<string, string>;

/** Everything mirrorable that currently exists locally. */
export function snapshotLocal(): MirrorSnapshot {
  const out: MirrorSnapshot = {};
  for (const key of MIRRORED_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) out[key] = raw;
    } catch { /* private mode — nothing to mirror from */ }
  }
  return out;
}

/**
 * Does this snapshot actually hold a configured profile?
 *
 * Reads the raw JSON, so it has to know BOTH shapes: the flat one every
 * install before 0.6 was written as, and the per-network one written since.
 * A blind spot here is expensive — this is the guard that decides whether a
 * cartridge booting on a new origin restores or shows onboarding, and the
 * user has already seen "AUCUN PROFIL" once.
 */
export function hasProfile(snap: MirrorSnapshot | null | undefined): boolean {
  const raw = snap?.['pheme:profile'];
  if (!raw) return false;
  try {
    const p = JSON.parse(raw) as {
      topics?: unknown; done?: boolean;
      // Legacy (< 0.6)
      redditUser?: string; hnUser?: string; mySub?: string;
      // Per-network (>= 0.6)
      nets?: Record<string, { handle?: string; home?: string; targets?: unknown }>;
    };
    if (p.done) return true;
    if (p.redditUser || p.hnUser || p.mySub) return true;
    if (Array.isArray(p.topics) && p.topics.length > 0) return true;
    return Object.values(p.nets ?? {}).some(n =>
      !!n?.handle || !!n?.home || (Array.isArray(n?.targets) && n.targets.length > 0));
  } catch { return false; }
}

/**
 * True when THIS origin has nothing worth keeping — the signature of a
 * cartridge that just booted somewhere new. Restoring is only ever
 * proposed in that state: a local profile always wins over the mirror,
 * because the mirror can be a moment behind.
 */
export function localIsBlank(): boolean {
  return !hasProfile(snapshotLocal());
}

/**
 * Write a mirror snapshot into this origin's localStorage. Returns the
 * keys actually restored. Never removes a key the snapshot does not carry.
 */
export function restoreLocal(snap: MirrorSnapshot): string[] {
  const restored: string[] = [];
  for (const key of MIRRORED_KEYS) {
    const value = snap[key];
    if (typeof value !== 'string') continue;
    try {
      localStorage.setItem(key, value);
      restored.push(key);
    } catch { /* quota — the rest still lands */ }
  }
  return restored;
}
