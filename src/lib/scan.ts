/**
 * Radar scan — find fresh threads worth a genuine reply.
 *
 * Ported from social-engine's proven connectors, narrowed to the two networks
 * that matter for reputation building. All network I/O goes through the
 * host-side fetch (bridge.fetchUrl) so there is no iframe CORS wall; parsing
 * (JSON / Atom via DOMParser) happens here.
 *
 * Hard-won specifics baked in (see social-curator memory):
 *  - Reddit public .json is 403-blocked for non-OAuth requests; the per-sub
 *    Atom feed stays open. `/new/.rss` — the radar wants answerable threads,
 *    not yesterday's front page.
 *  - Hacker News goes through the Algolia API (CORS-open, but host fetch
 *    keeps one code path and one UA).
 */

import { redditFetch } from './redditGate';
import { htmlToText } from './article';
import { asString } from './coerce';

/** The two surfaces Pheme can currently READ without an account. */
export type Network = 'reddit' | 'hackernews';

/**
 * One thread as the scan found it. Optional fields are optional on purpose:
 * `points` and `comments` are absent when the source did not send them, and
 * an absent count must never be rendered as zero.
 */
export interface RadarItem {
  /** Stable per source: `hn_<id>` on HN, the Reddit fullname on Reddit. */
  id: string;
  title: string;
  /** Cleaned text, or the bare outbound URL for a link post (see isBareUrl). */
  body: string;
  author: string;
  url: string;
  /** HN only, and only when Algolia sent it. Absent ≠ zero. */
  points?: number;
  /** Absent ≠ "no comments" — Reddit's Atom feed carries no count at all. */
  comments?: number;
  timestamp: string;
  network: Network;
  /** Which configured target produced it (e.g. "r/LocalLLaMA"). */
  target: string;
}

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

/**
 * The scan cache lives in localStorage, so a body has to be bounded — but 800
 * cut a normal Reddit self-post mid-word ("…E2B, Daytona, Modal, and
 * OpenHands, bu"), and that stump was then what the reader saw AND what the
 * drafter answered. 2400 covers the great majority of self-posts; a hundred
 * cached items is ~240KB, well inside the quota.
 */
const clip = (s: string, n = 2400) => (s ?? '').slice(0, n);
const strip = htmlToText;

/**
 * The result of ONE pass. Deliberately not just an item list: a partial pass
 * has to be able to say it was partial, or the UI reports an empty radar as
 * "nothing to say" when the truth is "Reddit stopped answering".
 */
export interface ScanOutcome {
  items: RadarItem[];
  /**
   * Targets asked ON THEIR OWN that failed — so naming them is a fact.
   *
   * A subreddit only lands here after a request that covered IT ALONE was
   * refused. That is the difference between "r/foo is unreachable" and
   * "a request covering fifteen subs came back 403", and the second one is
   * not a verdict about any of the fifteen.
   */
  failed: string[];
  /**
   * Subs a batched request could not bring back, cause UNATTRIBUTED.
   *
   * Reddit refuses a multireddit URL as a whole and never says which member
   * upset it — so the honest report is "these were not covered", never "these
   * are unreachable". Listing fifteen healthy subs as broken is a fabricated
   * verdict, and it is what this run used to print.
   */
  uncovered: string[];
  /** A 429 was hit: the gap is a throttle, not an absence of threads. */
  rateLimited: boolean;
  /** Targets that answered THIS run — anything else keeps its old items. */
  okTargets: string[];
  /** Reddit coverage this pass: subs reached / subs configured. */
  subsCovered: { ok: number; total: number };
}

// Reddit accepts MULTIREDDIT urls — r/a+b+c/new.rss — one request for the
// whole roster. On a stingy per-IP budget (a per-sub loop starved every
// sub after the second, scan after scan) batching is what makes the scan
// SOLID: the entire list costs ONE call, chunked at 15 subs for URL sanity.
// Private/banned subs are silently omitted by Reddit; the chunk survives.
const SUBS_PER_REQUEST = 15;

// Rotation cursor — only matters when the roster needs MULTIPLE chunks:
// each scan starts at the chunk the throttle blocked last time.
const K_CURSOR = 'pheme:radar:subCursor';

function readCursor(): number {
  try { return Number(localStorage.getItem(K_CURSOR) ?? 0) || 0; }
  catch { return 0; }
}

function saveCursor(n: number): void {
  try { localStorage.setItem(K_CURSOR, String(n)); }
  catch { /* best-effort — worst case the same subs go first again */ }
}

/**
 * Scan every configured target. Never throws for a single bad target.
 * Every Reddit request goes through the app-wide gate (redditGate.ts):
 * global spacing, and a tripped cooldown short-circuits instead of
 * hammering the throttle. Hacker News (Algolia) is unaffected.
 */
export async function scanRadar(
  subs: string[],
  hnQueries: string[],
  fetchUrl: FetchUrl,
  /** Restrict to ONE network — a scoped board must not spend the other's budget. */
  only?: Network,
): Promise<ScanOutcome> {
  const failed: string[] = [];
  const uncovered: string[] = [];
  const items: RadarItem[] = [];
  const okTargets: string[] = [];
  let rateLimited = false;
  let okSubs = 0;

  const clean = only === 'hackernews' ? [] : subs.map(s => s.replace(/^r\//, '').trim()).filter(Boolean);
  const chunks: string[][] = [];
  for (let i = 0; i < clean.length; i += SUBS_PER_REQUEST) chunks.push(clean.slice(i, i + SUBS_PER_REQUEST));

  const start = chunks.length > 0 ? readCursor() % chunks.length : 0;
  const orderedChunks = [...chunks.slice(start), ...chunks.slice(0, start)];
  let attempted = 0;

  /**
   * One batch, with ONE salvage attempt when it is refused.
   *
   * A multireddit is all-or-nothing: Reddit answers the whole URL or refuses
   * it, and never says which member it objected to. So a refused batch of
   * fifteen used to blame fifteen subs and lose them all — one dead sub in the
   * roster meant fourteen healthy ones went dark, every scan, forever.
   *
   * Splitting once recovers the healthy half in two extra calls, and halves
   * what stays unexplained. A full bisect would attribute the blame exactly
   * and cost up to fifteen calls against a per-IP budget that is already the
   * scarce resource here — not worth it for a label.
   *
   * @returns false when the run must stop (throttled). Depth guards the split.
   */
  const runChunk = async (chunk: string[], depth = 0): Promise<boolean> => {
    const url = `https://www.reddit.com/r/${chunk.join('+')}/new/.rss?limit=100`;
    const r = await redditFetch(fetchUrl, url);
    if (r.ok) {
      okSubs += chunk.length;
      // Every sub of an answered chunk counts as covered — a sub with no
      // fresh post in the window is covered, not missing.
      okTargets.push(...chunk.map(s => `r/${s}`));
      items.push(...parseRedditAtom(r.body, 'reddit'));
      return true;
    }
    // A throttle stops everything: the subs after it were never asked, and
    // reporting them at all would be reporting on a request nobody made.
    if (r.reason !== 'error') { rateLimited = true; return false; }

    // Asked alone and refused: THAT is a fact about the sub — private,
    // banned, renamed, gone.
    if (chunk.length === 1) { failed.push(`r/${chunk[0]}`); return true; }

    if (depth === 0) {
      const mid = Math.ceil(chunk.length / 2);
      const first = await runChunk(chunk.slice(0, mid), 1);
      return first ? await runChunk(chunk.slice(mid), 1) : false;
    }
    // Still refused after the split. We do not know which member did it, so
    // we do not name one — they are simply not covered.
    uncovered.push(...chunk.map(s => `r/${s}`));
    return true;
  };

  for (const chunk of orderedChunks) {
    attempted++;
    if (!(await runChunk(chunk))) { attempted--; break; }
  }
  // Next run starts at the first chunk this one could not reach.
  if (chunks.length > 0 && attempted > 0) saveCursor((start + attempted) % chunks.length);

  for (const q of only === 'reddit' ? [] : hnQueries) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=25`;
    const body = await safe(fetchUrl, url);
    if (body === null) { failed.push(`HN:${q}`); continue; }
    okTargets.push(`HN · ${q}`);
    items.push(...parseHnHits(body, q));
  }

  // One thread can match several queries — keep the first sighting.
  const seen = new Set<string>();
  const deduped = items.filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  return {
    items: deduped, failed, uncovered, rateLimited, okTargets,
    subsCovered: { ok: okSubs, total: clean.length },
  };
}

/**
 * A scan UPDATES what it could reach and KEEPS the rest — same doctrine as
 * presence: a throttled or partially-failed run must never erase what a
 * good run brought. Items from a target that answered this run are fully
 * replaced by its fresh listing; items from any target that did NOT answer
 * are carried forward as they were. And `retainIds` — what the user has
 * MARKED as mattering (pins, drafts, follows) — survives even a fresh
 * listing that rotated them out of the window.
 */
export function mergeScan<T extends RadarItem>(
  prev: T[],
  next: T[],
  okTargets: string[],
  retainIds?: Set<string>,
): T[] {
  const nextIds = new Set(next.map(i => i.id));
  const ok = new Set(okTargets.map(s => s.toLowerCase()));
  const carried = prev.filter(i =>
    !nextIds.has(i.id) && (!ok.has(i.target.toLowerCase()) || retainIds?.has(i.id)));
  return [...next, ...carried];
}

async function safe(fetchUrl: FetchUrl, url: string): Promise<string | null> {
  try { const r = await fetchUrl(url); return r.status >= 200 && r.status < 300 ? r.body : null; }
  catch { return null; }
}

function parseRedditAtom(xml: string, fallbackTarget: string): RadarItem[] {
  const out: RadarItem[] = [];
  let doc: Document;
  try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch { return out; }
  const txt = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? '';
  for (const el of Array.from(doc.getElementsByTagName('entry'))) {
    const href = el.getElementsByTagName('link')[0]?.getAttribute('href') ?? '';
    const id = txt(el, 'id') || href;
    const dateStr = txt(el, 'published') || txt(el, 'updated');
    // A multireddit feed mixes subs — each entry carries its OWN sub in
    // its permalink; that is the target merge and display key on.
    const sub = href.match(/\/r\/([^/]+)\//i)?.[1];
    const target = sub ? `r/${sub}` : fallbackTarget;
    out.push({
      id: `reddit_${id}`.slice(0, 200),
      title: (txt(el, 'title') || 'Untitled').trim(),
      body: clip(strip(txt(el, 'content')).trim()),
      author: (el.getElementsByTagName('author')[0]?.getElementsByTagName('name')[0]?.textContent ?? target).trim(),
      url: href,
      timestamp: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      network: 'reddit',
      target,
    });
  }
  return out;
}

function parseHnHits(json: string, query: string): RadarItem[] {
  const out: RadarItem[] = [];
  try {
    const hits = (JSON.parse(json)?.hits ?? []) as Record<string, unknown>[];
    for (const h of hits) {
      out.push({
        id: `hn_${h.objectID as string}`,
        title: asString(h.title, 'Untitled'),
        // story_text is an HTML fragment; a link post falls back to its URL.
        body: h.story_text ? clip(strip(asString(h.story_text)), 2000) : clip(asString(h.url, '')),
        author: asString(h.author, 'unknown'),
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: Number(h.points ?? 0),
        comments: Number(h.num_comments ?? 0),
        timestamp: new Date(asString(h.created_at, new Date().toISOString())).toISOString(),
        network: 'hackernews',
        target: `HN · ${query}`,
      });
    }
  } catch { /* a malformed payload skips the whole query, reported upstream as 0 items */ }
  return out;
}
