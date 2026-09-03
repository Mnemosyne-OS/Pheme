/**
 * What a promotion surface says about you, PUBLICLY.
 *
 * Pheme does not scan promotion networks — that is the doctrine, and it stays:
 * it listens where reputation is earned (Reddit, Hacker News) and never reads
 * the user's own broadcast channels looking for things to react to.
 *
 * But a profile URL that does nothing is the failure this cartridge just spent
 * a release removing everywhere else. Some of those surfaces publish an open
 * feed of what the user themselves wrote, and reading it turns "here is a
 * link" into two concrete things: you can see what Pheme sees, and the bio
 * drafter can be grounded on what you ACTUALLY publish there instead of on
 * memory alone.
 *
 * Only surfaces with a feed we are sure of are listed. A URL guessed for X or
 * LinkedIn would 404 forever and be reported as "nothing found", which reads
 * as "you have published nothing" — a fabricated verdict about the user's own
 * work. The others say plainly that there is no public feed.
 */
import { htmlToText } from './article';

type FetchUrl = (url: string) => Promise<{
  status: number; body: string; contentType?: string; encoding?: string;
}>;

export interface FeedPost {
  title: string;
  url: string;
  /** ISO date, or '' when the feed did not carry one — never invented. */
  at: string;
  /** First readable line, when the feed carries the body. */
  excerpt: string;
}

/**
 * The public feed for a profile URL, or null when the surface has none.
 *
 * @param netId   Registry id — the surface decides the shape.
 * @param profile The URL the user typed on their network profile page.
 */
export function feedUrlFor(netId: string, profile: string): string | null {
  const url = (profile ?? '').trim();
  if (!/^https:\/\//i.test(url)) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, '');

  if (netId === 'medium') {
    // medium.com/@user → medium.com/feed/@user. A publication or a custom
    // domain answers on /feed at its own root.
    const handle = path.match(/^\/(@[^/]+)/)?.[1];
    if (host.endsWith('medium.com')) {
      return handle ? `https://medium.com/feed/${handle}` : `https://${host}${path}/feed`;
    }
    return `${u.origin}/feed`;
  }

  if (netId === 'mastodon') {
    // Any Mastodon instance serves a user's public posts at <profile>.rss.
    return /^\/@[^/]+$/.test(path) ? `${u.origin}${path}.rss` : null;
  }

  // X, LinkedIn, Bluesky, Threads: nothing public and stable to read.
  return null;
}

/**
 * Parse RSS **or** Atom. Medium serves RSS 2.0 (`<item>`, `<link>` as text,
 * `<pubDate>`); Mastodon serves RSS too; the Reddit/HN paths elsewhere in this
 * cartridge are Atom (`<entry>`, `<link href>`). One reader for both, because
 * the alternative is a caller having to know which it is about to receive.
 */
export function parseFeed(xml: string): FeedPost[] {
  let doc: Document;
  try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch { return []; }
  const txt = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? '';
  const first = (s: string) => htmlToText(s).split('\n').map(l => l.trim()).find(Boolean) ?? '';
  const iso = (raw: string): string => {
    if (!raw.trim()) return '';
    const d = new Date(raw);
    // An unparseable date stays ABSENT rather than becoming "now" — a made-up
    // publication date on the user's own work is worse than no date.
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  };

  const items = Array.from(doc.getElementsByTagName('item'));
  if (items.length > 0) {
    return items.map(el => ({
      title: (txt(el, 'title') || 'Untitled').trim(),
      url: txt(el, 'link').trim(),
      at: iso(txt(el, 'pubDate')),
      excerpt: first(txt(el, 'encoded') || txt(el, 'description')).slice(0, 200),
    }));
  }
  return Array.from(doc.getElementsByTagName('entry')).map(el => ({
    title: (txt(el, 'title') || 'Untitled').trim(),
    url: el.getElementsByTagName('link')[0]?.getAttribute('href') ?? '',
    at: iso(txt(el, 'published') || txt(el, 'updated')),
    excerpt: first(txt(el, 'content') || txt(el, 'summary')).slice(0, 200),
  }));
}

/** Why a read produced nothing. Each maps to a sentence the user can act on. */
export type FeedFail = 'no-feed' | 'no-url' | 'refused' | 'empty' | 'unreachable';

export interface FeedRead {
  posts: FeedPost[];
  fail: FeedFail | null;
  /** The HTTP status, when there was one — 404 and 429 are not one event. */
  status?: number;
}

/** Read the surface's public feed. Never throws — every failure is named. */
export async function readProfileFeed(
  netId: string,
  profileUrl: string,
  fetchUrl: FetchUrl,
): Promise<FeedRead> {
  if (!/^https:\/\//i.test((profileUrl ?? '').trim())) return { posts: [], fail: 'no-url' };
  const feed = feedUrlFor(netId, profileUrl);
  if (!feed) return { posts: [], fail: 'no-feed' };
  try {
    const r = await fetchUrl(feed);
    if (r.status < 200 || r.status >= 300) return { posts: [], fail: 'refused', status: r.status };
    // The host hands binary back as base64 (doc 74) — a feed never is, so
    // this is a wrong URL rather than something to try to parse.
    if (r.encoding === 'base64') return { posts: [], fail: 'empty', status: r.status };
    const posts = parseFeed(r.body).filter(p => p.title || p.url).slice(0, 12);
    return posts.length > 0
      ? { posts, fail: null, status: r.status }
      : { posts: [], fail: 'empty', status: r.status };
  } catch {
    return { posts: [], fail: 'unreachable' };
  }
}

/**
 * The user's own published work, as ground for the bio drafter.
 *
 * Presented as what it is — titles they actually published — so the model
 * describes a real body of work instead of paraphrasing the memory vault into
 * something that sounds like a bio.
 */
export function feedGroundLine(posts: FeedPost[]): string {
  if (posts.length === 0) return '';
  return [
    'What I have actually published there, most recent first:',
    ...posts.slice(0, 8).map(p => `- ${p.title}`),
  ].join('\n');
}
