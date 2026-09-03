/**
 * Onboarding suggestions — the profile fills itself from what already exists.
 *
 *  - Topics come from the user's OWN memory (host RAG): Pheme asks the vaults
 *    what this person demonstrably works on. Nothing invented; if memory is
 *    silent, the field stays manual.
 *  - Subreddits come from Reddit's public subreddit-search Atom feed, driven
 *    by those topics — fetched host-side like every other scan. Best-effort:
 *    Reddit gates some endpoints, so an empty answer is a shrug, never an
 *    error wall.
 */

import type { PresenceReport } from './presence';
import { redditFetch } from './redditGate';

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

export function buildTopicsPrompt(): string {
  return [
    'From my vaults, list the 8 to 12 topics where I have demonstrable, hands-on expertise —',
    'things I have actually built, measured, debugged or written about.',
    'Phrase each as a SHORT keyword phrase (1-4 words) as used in Reddit or Hacker News discussions,',
    'e.g. "local AI", "RAG", "Electron", "vector search".',
    'One per line. No numbering, no commentary. If my memory holds nothing clear, output exactly: NOTHING_RELEVANT.',
  ].join('\n');
}

/**
 * Strip every decoration a model may wrap a list item in. Applied to
 * topics AND to hand-typed chips, because a topic is later used as a raw
 * substring needle (score.ts) and inside a query URL (scan.ts): one
 * surviving quote or "1." prefix makes it match NOTHING, forever, with an
 * empty radar as the only symptom.
 */
export function cleanListItem(line: string): string {
  let s = line.trim();
  let prev = '';
  // Loop: a single pass cannot undo "- 1. topic" (an anchored /g/ regex
  // stops matching once the first alternative has consumed).
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/^[\s>*•·\-–—]+/, '')
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^["'`«»]+/, '')
      .replace(/["'`«»]+$/, '')
      .replace(/[.,;:]+$/, '')
      .trim();
  }
  return s;
}

/** Model answers arrive decorated — bullets, numbering, prose. Keep the topics. */
export function parseTopics(raw: string): string[] {
  if (!raw || raw.includes('NOTHING_RELEVANT')) return [];
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const cleaned = cleanListItem(line);
    if (!cleaned || cleaned.length < 2 || cleaned.length > 40) continue;
    if (/[.!?]\s/.test(cleaned)) continue; // a sentence, not a topic
    if (!out.some(t => t.toLowerCase() === cleaned.toLowerCase())) out.push(cleaned);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Where a subreddit candidate came from — the UI shows it, because a name
 * the user already posts in deserves more trust than a model's guess.
 */
export type SubOrigin = 'history' | 'model';

export interface SubCandidate {
  name: string;
  origin: SubOrigin;
  /** Posts seen in the verification window — proof it is ALIVE. */
  posts: number;
}

/** Candidates from the user's OWN participation — free, and the best signal. */
export function subsFromHistory(presence: PresenceReport | null, known: string[]): string[] {
  if (!presence) return [];
  const have = new Set(known.map(s => s.replace(/^r\//, '').toLowerCase()));
  const out: string[] = [];
  for (const g of presence.groups) {
    for (const th of g.threads) {
      if (th.network !== 'reddit') continue;
      const name = th.community.replace(/^r\//, '');
      if (!name || have.has(name.toLowerCase()) || out.some(s => s.toLowerCase() === name.toLowerCase())) continue;
      out.push(name);
    }
  }
  return out;
}

/**
 * Ask the model for candidate subreddits. Models know Reddit's landscape
 * well, and unlike the search endpoint this costs ZERO Reddit budget and
 * works while the throttle is down. Every name is verified before use —
 * a plausible-sounding sub that does not exist never reaches the profile.
 */
/**
 * @param seed A keyword the user typed RIGHT NOW. When present it LEADS: the
 *   profile's topics stay in the prompt as context — they say who is asking —
 *   but the search is about the seed. Without it, "find me subs about
 *   Firecracker" could only be asked by first editing the profile, which is a
 *   detour through Settings to ask one question.
 */
export function buildSubsPrompt(topics: string[], known: string[], seed?: string): string {
  const focus = (seed ?? '').trim().slice(0, 80);
  return [
    `Someone works on: ${topics.slice(0, 10).join(', ') || 'unknown topics'}.`,
    'You also know their ACTUAL work from memory context.',
    known.length ? `They already watch: ${known.slice(0, 20).join(', ')}. Do NOT repeat those.` : '',
    focus
      ? `They are looking specifically for subreddits about: "${focus}". That subject LEADS — their other topics only say who is asking.`
      : '',
    focus
      ? `List 20 ACTIVE subreddits where "${focus}" is genuinely discussed.`
      : 'List 20 ACTIVE subreddits where these topics are genuinely discussed and where this person could contribute first-hand.',
    'Mix big hubs and smaller specialist subs. Exact subreddit names only, one per line, no r/ prefix, no commentary.',
  ].filter(Boolean).join('\n');
}

/** Extract plausible subreddit names from a model answer. */
export function parseSubNames(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/(?:^|\s|\/)r?\/?([A-Za-z0-9_]{3,21})\s*$/) ?? line.match(/r\/([A-Za-z0-9_]{3,21})/);
    const name = m?.[1];
    if (!name || /^(the|and|for|sub|subreddit|list|here|none)$/i.test(name)) continue;
    if (!out.some(s => s.toLowerCase() === name.toLowerCase())) out.push(name);
    if (out.length >= 30) break;
  }
  return out;
}

/**
 * Verify candidates in ONE request per 15 names: the multireddit feed
 * silently omits what does not exist (banned, private, misspelled) and
 * only carries posts from subs that are actually ALIVE. So "appears in
 * the feed" proves existence AND activity in a single call — the whole
 * reason this replaces the per-topic search that Reddit gates.
 */
export async function verifySubs(
  names: string[],
  fetchUrl: FetchUrl,
): Promise<{ alive: Map<string, number>; unreachable: boolean }> {
  const alive = new Map<string, number>();
  let unreachable = false;
  for (let i = 0; i < names.length; i += 15) {
    const chunk = names.slice(i, i + 15);
    const r = await redditFetch(fetchUrl, `https://www.reddit.com/r/${chunk.join('+')}/new/.rss?limit=100`);
    if (!r.ok) {
      // Reporting this matters: a silent break made the UI blame the user's
      // memory ("nothing usable came back") for a Reddit cooldown.
      unreachable = true;
      break;
    }
    for (const m of r.body.matchAll(/reddit\.com\/r\/([A-Za-z0-9_]{3,21})\//g)) {
      const key = m[1].toLowerCase();
      const canonical = chunk.find(c => c.toLowerCase() === key);
      if (!canonical) continue;
      alive.set(canonical, (alive.get(canonical) ?? 0) + 1);
    }
  }
  return { alive, unreachable };
}
