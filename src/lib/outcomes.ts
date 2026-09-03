/**
 * What your posts BECAME — doc 75 lot 5, the loop.
 *
 * Pheme could tell you what to write and where, and then never mentioned it
 * again. Everything needed to close that loop was already being fetched and
 * simply never assembled into the one question a person actually asks after
 * publishing: *did anything happen?*
 *
 * Two halves, and they are honest in opposite directions:
 *
 *  - **Reputation surfaces** (Reddit, HN): the outcome is already in the
 *    presence report. A reply count of 0 here is a MEASURED silence — the
 *    thread was fetched and nobody answered — and that is worth saying. A
 *    score of `null` is not: the source did not give one.
 *  - **Promotion surfaces**: nothing was measured at all, because the app
 *    never knew WHERE the human posted. It asks now, and for the two surfaces
 *    with a public counter API it reads them. Everywhere else it says there is
 *    no public counter rather than showing a zero.
 */
import type { PresenceReport, ThreadNode } from './presence';
import { isHumanVoice } from './authors';

export interface PostOutcome {
  id: string;
  network: string;
  community: string;
  title: string;
  url: string;
  /** When the user published it. */
  at: string;
  /**
   * Public score, ONLY where the source carried one. `null` = unknown; the
   * screen prints a dash, because a post shown at 0 points reads as rejected.
   */
  score: number | null;
  /**
   * Human replies received. This one IS counted, so 0 is an answer: the
   * thread was read and nobody spoke.
   */
  replies: number;
  /** Newest human reaction — '' when none ever arrived. */
  lastMoveAt: string;
}

/** The user's own posts, and what became of them. Newest movement first. */
export function outcomes(report: PresenceReport | null, netFilter?: string): PostOutcome[] {
  const out: PostOutcome[] = [];
  for (const g of report?.groups ?? []) {
    for (const th of g.threads) {
      // Somebody else's thread is somebody else's outcome. A thread the user
      // merely followed says nothing about what THEY published.
      if (th.mine === 'none') continue;
      if (netFilter && th.network !== netFilter) continue;
      out.push(toOutcome(th, g.community));
    }
  }
  return out.sort((a, b) =>
    (b.lastMoveAt || b.at).localeCompare(a.lastMoveAt || a.at));
}

function toOutcome(th: ThreadNode, fallbackCommunity: string): PostOutcome {
  const human = th.replies.filter(isHumanVoice);
  return {
    id: th.id,
    network: th.network,
    community: th.community || fallbackCommunity,
    title: th.title,
    url: th.url,
    at: th.timestamp,
    score: typeof th.myScore === 'number' ? th.myScore : null,
    replies: human.length,
    lastMoveAt: human.reduce((max, r) => (r.timestamp > max ? r.timestamp : max), ''),
  };
}

/**
 * Posts old enough that the silence is the result.
 *
 * Deliberately conservative: a thread from this morning with no replies has
 * not failed, it is young. Only a post past `days` with zero human reactions
 * has actually been answered — with nothing — and telling someone that is the
 * whole difference between a coach and a dashboard.
 */
export function silentOnes(list: PostOutcome[], days = 3): PostOutcome[] {
  const cutoff = Date.now() - days * 86_400_000;
  return list.filter(o => o.replies === 0 && Date.parse(o.at) < cutoff);
}

/** The one that travelled furthest — null when no score was ever published. */
export function bestScored(list: PostOutcome[]): PostOutcome | null {
  const scored = list.filter(o => o.score !== null);
  if (scored.length === 0) return null;
  return scored.reduce((best, o) => (o.score! > best.score! ? o : best));
}

/** What the work actually brought back, added up. */
export interface Harvest {
  /** Points across every post whose score WAS published. `null` = none was. */
  points: number | null;
  /**
   * How many posts that total rests on. A sum over two posts is a number, not
   * a body of work, and the interface has to be able to say which it is.
   */
  scored: number;
  /** Human replies received, across everything tracked. Counted, so 0 is real. */
  replies: number;
  /** Posts of the user's being tracked at all — the denominator for `scored`. */
  posts: number;
}

/**
 * The pleasant total: what all of it added up to.
 *
 * A sum is the easiest place in this cartridge to fabricate a value, so two
 * things are load-bearing. Posts whose score the source never published are
 * EXCLUDED rather than added as zero — a silent 0 in a sum is indistinguishable
 * from a measurement and drags the total down with a number nobody read. And
 * the count it rests on rides along, because "312 points" over two posts and
 * over forty are different sentences.
 */
export function harvest(list: PostOutcome[]): Harvest {
  const scored = list.filter(o => o.score !== null);
  return {
    points: scored.length > 0 ? scored.reduce((n, o) => n + (o.score ?? 0), 0) : null,
    scored: scored.length,
    replies: list.reduce((n, o) => n + o.replies, 0),
    posts: list.length,
  };
}

// ── Promotion surfaces: the counters that are public, and only those ─────────

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

/** Why a counter read produced nothing. Each maps to a sentence, never a 0. */
export type CountsFail = 'no-url' | 'no-api' | 'refused' | 'unreadable' | 'unreachable';

export interface PublicCounts {
  /** Favourites / likes. `null` where the payload did not carry the field. */
  likes: number | null;
  /** Boosts / reposts. */
  boosts: number | null;
  replies: number | null;
  /** Which surface answered — shown, so the number has a provenance. */
  source: 'mastodon' | 'bluesky';
}

/**
 * The public counter endpoint for a post URL, or null when the surface has no
 * public one.
 *
 * The same doctrine as `profileFeed.feedUrlFor`: only shapes we are SURE of.
 * A guessed endpoint answers 404 forever, which gets reported as "nothing
 * found" and reads as *nobody reacted* — a fabricated verdict about the user's
 * own work. X, LinkedIn, Threads and Medium publish no such counter, and this
 * says so instead of trying.
 */
export function countsApiFor(postUrl: string): { api: string; source: PublicCounts['source'] } | null {
  const raw = (postUrl ?? '').trim();
  if (!/^https:\/\//i.test(raw)) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const path = u.pathname.replace(/\/+$/, '');

  // Bluesky: https://bsky.app/profile/<handle>/post/<rkey>. The public AppView
  // takes an at:// URI and accepts the handle in the authority position.
  if (u.hostname.toLowerCase().endsWith('bsky.app')) {
    const m = path.match(/^\/profile\/([^/]+)\/post\/([A-Za-z0-9]+)$/);
    if (!m) return null;
    const uri = `at://${m[1]}/app.bsky.feed.post/${m[2]}`;
    return {
      api: `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?depth=0&parentHeight=0&uri=${encodeURIComponent(uri)}`,
      source: 'bluesky',
    };
  }

  // Mastodon: https://<instance>/@user/<statusId> on any instance.
  const m = path.match(/^\/@[^/]+\/(\d+)$/);
  if (m) return { api: `${u.origin}/api/v1/statuses/${m[1]}`, source: 'mastodon' };

  return null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Pull the three counters out of whichever payload came back. */
export function parsePublicCounts(source: PublicCounts['source'], body: string): PublicCounts | null {
  let json: unknown;
  try { json = JSON.parse(body); } catch { return null; }
  if (!json || typeof json !== 'object') return null;

  if (source === 'mastodon') {
    const s = json as Record<string, unknown>;
    const likes = num(s.favourites_count);
    const boosts = num(s.reblogs_count);
    const replies = num(s.replies_count);
    // Nothing recognisable in it: unknown, not a post that nobody liked.
    if (likes === null && boosts === null && replies === null) return null;
    return { likes, boosts, replies, source };
  }

  const post = (json as { thread?: { post?: Record<string, unknown> } })?.thread?.post;
  if (!post) return null;
  const likes = num(post.likeCount);
  const boosts = num(post.repostCount);
  const replies = num(post.replyCount);
  if (likes === null && boosts === null && replies === null) return null;
  return { likes, boosts, replies, source };
}

/**
 * What a published post is worth publicly, where the surface says so.
 *
 * Never throws, and never returns a zero it did not read: every failure comes
 * back named so the interface can say WHY there is no figure.
 */
export async function readPublicCounts(
  postUrl: string,
  fetchUrl: FetchUrl,
): Promise<{ counts: PublicCounts | null; fail: CountsFail | null }> {
  if (!(postUrl ?? '').trim()) return { counts: null, fail: 'no-url' };
  const target = countsApiFor(postUrl);
  if (!target) return { counts: null, fail: 'no-api' };
  try {
    const r = await fetchUrl(target.api);
    if (r.status < 200 || r.status >= 300) return { counts: null, fail: 'refused' };
    const counts = parsePublicCounts(target.source, r.body);
    return counts ? { counts, fail: null } : { counts: null, fail: 'unreadable' };
  } catch {
    return { counts: null, fail: 'unreachable' };
  }
}
