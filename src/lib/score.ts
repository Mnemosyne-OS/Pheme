/**
 * Radar scoring — "can I add real value here, soon?" — not "is this viral?".
 *
 * Deliberately a transparent heuristic, not an LLM call: the radar re-scores
 * on every scan and every profile edit, and the user must be able to see WHY
 * a thread ranks (matched topics are surfaced in the UI). Substance stays
 * cheap; the model is spent on drafts, where it earns its cost.
 */
import type { RadarItem } from './scan';

export interface ScoredItem extends RadarItem {
  score: number;
  /** Topics from the profile that matched (shown as chips — the "why"). */
  matched: string[];
}

const HOUR = 3_600_000;
/**
 * Past this, a thread is archaeology. Hacker News falls off the front page in
 * a day and Reddit sorts new to the bottom within two; a reply written a week
 * later is read by nobody. The score is decayed rather than the item hidden —
 * it may still be worth READING, it is just not a place to speak.
 */
const STALE_H = 7 * 24;
const STALE_KEEP = 0.4;

/**
 * The thread is over. Exposed so the UI can SAY it: a decayed score alone
 * looks like a weak topic match, and the user cannot tell the difference
 * between "not very relevant" and "you are three weeks late".
 */
export function isStale(item: { timestamp: string }, now = Date.now()): boolean {
  const ageH = (now - Date.parse(item.timestamp)) / HOUR;
  return Number.isFinite(ageH) && ageH > STALE_H;
}

export function scoreItems(items: RadarItem[], topics: string[]): ScoredItem[] {
  const needles = topics.map(t => t.trim().toLowerCase()).filter(Boolean);
  const now = Date.now();

  return items
    .map((item) => {
      const hay = `${item.title}\n${item.body}`.toLowerCase();
      const matched = needles.filter(n => hay.includes(n));

      // Relevance: any match qualifies, each extra topic compounds.
      let score = matched.length === 0 ? 0 : 40 + (matched.length - 1) * 15;

      // Freshness: an answerable thread is a young thread. Full bonus under
      // 6h, fading to zero at 48h; older than 48h barely registers.
      const ageH = Math.max(0, (now - Date.parse(item.timestamp)) / HOUR);
      score += Math.max(0, 30 * (1 - ageH / 48));

      // Conversation temperature (HN only — Reddit RSS carries no counts):
      // a few comments = alive; a hundred = your reply drowns.
      if (typeof item.comments === 'number') {
        // The "alive" bonus is only true while the thread still is. On a
        // three-week-old post, two comments is not an intimate discussion —
        // it is a thread nobody read, and it used to be rewarded for it.
        if (ageH < 48 && item.comments > 0 && item.comments <= 30) score += 10;
        if (item.comments > 100) score -= 15;
      }

      // A topic match cannot carry a thread that is over. This is what the
      // freshness term above never did: it floors at zero and rewards a fresh
      // thread, but it never penalised a dead one, so a perfect keyword match
      // on a month-old post outranked a live thread with a weaker match.
      if (ageH > STALE_H) score *= STALE_KEEP;

      return { ...item, matched, score: Math.round(score) };
    })
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score);
}
