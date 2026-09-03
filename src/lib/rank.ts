/**
 * The Mnemosyne pass over the radar — ONE user-triggered inference that
 * classifies every scanned thread by how much substance THIS user can
 * actually bring (RAG rides along, so "this user" means their real work,
 * not their topic list alone). The verdict colors the grid and feeds the
 * tier filters; it persists so a reload never re-bills it.
 */
import { asString } from './coerce';
import type { ScoredItem } from './score';

export type MnemoTier = 'high' | 'mid' | 'low';

export const MNEMO_TIERS: MnemoTier[] = ['high', 'mid', 'low'];

export interface RankMap {
  at: string;
  tiers: Record<string, { tier: MnemoTier; reason?: string }>;
}

const K_RANK = 'pheme:radar:mnemopass';
/** Prompt budget — the radar rarely holds more anyway. */
export const RANK_MAX = 30;

export function loadRank(): RankMap | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(K_RANK) ?? 'null') as RankMap | null;
    return parsed && typeof parsed.tiers === 'object' ? parsed : null;
  } catch { return null; }
}

export function saveRank(map: RankMap): void {
  try { localStorage.setItem(K_RANK, JSON.stringify(map)); }
  catch { /* quota — the pass still colors this session */ }
}

export function buildRankPrompt(items: ScoredItem[], topics: string[]): string {
  const list = items.slice(0, RANK_MAX)
    .map((it, i) => `${i}. [${it.target}] ${it.title.slice(0, 90)}`);
  return [
    `A user with expertise in: ${topics.slice(0, 8).join(', ') || 'unknown'}.`,
    'You also know their ACTUAL work from memory context. Threads on their radar:',
    ...list,
    '',
    'Classify EACH thread by how much real, first-hand substance THIS user could bring in a reply — not general interest, not topicality: could they add something only they can say?',
    'Answer with ONE JSON object and NOTHING else:',
    '{"ranks":[{"i":0,"tier":"high","reason":"max 8 words, only for high"}]}',
    'tier is "high", "mid" or "low". Return one entry for EVERY index above.',
    'Calibration: "high" is rare (the few they could own), "mid" is a genuine maybe (roughly a quarter), the rest is "low".',
  ].join('\n');
}

/**
 * Models drift on tier vocabulary ("medium", "maybe", "weak"…) — dropping
 * those entries silently emptied whole filter tiers. Normalize instead.
 */
function normTier(x: unknown): MnemoTier | null {
  const s = asString(x, '').toLowerCase().trim();
  if (/^(high|relevant|top|strong)/.test(s)) return 'high';
  if (/^(mid|medium|maybe|moderate)/.test(s)) return 'mid';
  if (/^(low|weak|skip|none)/.test(s)) return 'low';
  return null;
}

/** Tolerant parse; indexes map back to item ids. Null = nothing usable. */
export function parseRank(raw: string, items: ScoredItem[]): RankMap | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as { ranks?: unknown };
    if (!Array.isArray(j.ranks)) return null;
    const tiers: RankMap['tiers'] = {};
    for (const r of j.ranks) {
      const o = r as Record<string, unknown>;
      const idx = typeof o.i === 'number' ? o.i : Number(o.i);
      const item = Number.isInteger(idx) ? items[idx] : undefined;
      const tier = normTier(o.tier);
      if (!item || !tier) continue;
      const reason = typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim().slice(0, 80) : undefined;
      tiers[item.id] = { tier, ...(tier === 'high' && reason ? { reason } : {}) };
    }
    return Object.keys(tiers).length > 0 ? { at: new Date().toISOString(), tiers } : null;
  } catch { return null; }
}
