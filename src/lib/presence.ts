/**
 * Presence v2 — the pseudonym followed as THREADS, not a flat feed.
 *
 * For every place the user showed up (their posts, their comments in other
 * people's threads, their own subreddit) the thread is RECONSTRUCTED: the
 * post itself (full body), whether the user's item is the post or a comment
 * inside it, and the replies underneath — grouped by community.
 *
 * Reddit is fetched gently: unique threads only, sequential with a delay,
 * and a 429/403 stops further Reddit calls for this run — the report says
 * "rate-limited" instead of a wall of unreachable titles (lesson from the
 * social-engine days: Reddit throttles per-IP fast).
 *
 * Persistence: the whole report caches in localStorage, so opening the tab
 * shows the last state instantly; fetching happens on demand or on the
 * user's own timer (Settings), never behind their back when the widget is
 * closed — an iframe cannot and must not outlive its window.
 */

export interface ReplyNode {
  id: string;
  author: string;
  body: string;
  url: string;
  timestamp: string;
  /** True when this reply is ADDRESSED to the user (parent is theirs). */
  toMe?: boolean;
  /**
   * An automated account, or a comment that no longer exists. KEPT in the
   * thread and tagged — never counted, never routed to the inbox, never
   * quoted to the model (lib/authors.ts).
   */
  bot?: boolean;
}

export interface ThreadNode {
  id: string;
  network: 'reddit' | 'hackernews';
  /** Was the user's presence here a post of theirs, or a comment they left? */
  mine: 'post' | 'comment' | 'none';
  community: string;
  title: string;
  url: string;
  /** The user's item timestamp (or the post's, for sub watch). */
  timestamp: string;
  /** The reconstructed post body (full, clipped high). */
  postBody: string;
  postAuthor: string;
  /** The user's own comment body when mine === 'comment'. */
  myBody: string;
  /**
   * Score of the user's post/comment here — ONLY when the source carries
   * it (Reddit JSON tree, HN points). Undefined = unknown, never zero.
   */
  myScore?: number | null;
  replies: ReplyNode[];
  commentCount: number | null;
  /**
   * Why this node arrived shallow, when it did. Three different unknowns
   * used to share one sentence ("not fetched this run"), which left nothing
   * to act on: a budget skip clears on the next refresh, a throttle needs
   * the countdown, a refusal needs the thread opened by hand.
   */
  shallowWhy?: ShallowWhy;
  /** Tracked from the radar's detail view, not the user's own activity. */
  followed?: boolean;
  /**
   * A post in the user's OWN subreddit. Only these make "a new post
   * appeared" worth an alert — a followed thread elsewhere must not.
   */
  inMySub?: boolean;
}

/** The three ways a thread can end a run un-opened. See `shallowWhy`. */
export type ShallowWhy = 'budget' | 'throttled' | 'refused';

import { markRedditJsonBlocked, redditFetch, redditJsonBlocked } from './redditGate';
import { refreshRedditFacts, type AccountKarma, type Unread } from './redditPublic';
import { htmlToText } from './article';
import { asId, asString } from './coerce';
import { isHumanVoice } from './authors';
import type { CommunityRules } from './rulebook';
import type { FollowedRef } from './store';

export interface PresenceConfig {
  redditUser: string;
  hnUser: string;
  mySub: string;
  /**
   * Communities whose RULES matter beyond the ones a run happens to see —
   * the user's scan targets. A sub they watch but have not posted in yet is
   * exactly where a verdict has to be ready before they launch.
   */
  subs?: string[];
}

export interface PresenceReport {
  /** community → threads, communities in stable alphabetical order. */
  groups: { community: string; threads: ThreadNode[] }[];
  hnKarma: number | null;
  /**
   * What Reddit publishes about the account — karma and age (doc 75 lot 2).
   * `null` = never read or unreadable, never a zeroed stand-in. Optional
   * because a report cached before 0.7.4 has none.
   */
  redditAccount?: AccountKarma | null;
  /**
   * Each community's own rules, VERBATIM, keyed by lowercased label. This is
   * what turns `readiness()` from `unknown` into a verdict: the rule of the
   * place outranks everything counted, and it is fetched, never asserted.
   */
  rules?: Record<string, CommunityRules>;
  /** Why a community's rules are absent — same keys. Never "there are none". */
  rulesUnread?: Record<string, Unread>;
  failed: string[];
  rateLimited: boolean;
  /**
   * The user's own sub ANSWERED but returned zero public posts — not a
   * fetch failure: either the sub is empty, or Reddit filters its posts
   * out of the anonymous view. Worth telling the user explicitly.
   */
  subEmpty?: boolean;
  /** When this report was fetched (drives "updated X ago" + persistence). */
  at: string;
}

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

const POST_CLIP = 1600;
const REPLY_CLIP = 400;
/** Reddit thread reconstructions per run — the per-IP budget is tight. */
const MAX_THREADS = 4;
/** The N newest threads are re-inspected every run; older ones rotate. */
const ALWAYS_FRESH = 2;

/** Followed-thread reconstructions per run — they rotate like the rest. */
const MAX_FOLLOWED = 6;

/** The user's own HN comments read per run, newest first. */
const MAX_HN_COMMENTS = 20;
/**
 * How many of the threads they commented in get looked INSIDE per run. The
 * rest arrive shallow — `commentCount: null`, which the card says out loud —
 * exactly like a Reddit thread past its budget. Appearing at all is never the
 * price of a reconstruction.
 */
const MAX_HN_COMMENT_THREADS = 3;

const K_THREAD_CURSOR = 'pheme:presence:threadCursor';
const K_FOLLOW_CURSOR = 'pheme:presence:followCursor';

function readCursor(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0) || 0; }
  catch { return 0; }
}

function saveCursor(key: string, n: number): void {
  try { localStorage.setItem(key, String(n)); }
  catch { /* best-effort — worst case the same threads rebuild next run */ }
}

const readThreadCursor = () => readCursor(K_THREAD_CURSOR);
const saveThreadCursor = (n: number) => saveCursor(K_THREAD_CURSOR, n);
const readFollowCursor = () => readCursor(K_FOLLOW_CURSOR);
const saveFollowCursor = (n: number) => saveCursor(K_FOLLOW_CURSOR, n);

const clip = (s: string, n: number) => (s ?? '').slice(0, n);
const strip = htmlToText;
export interface AtomEntry { id: string; title: string; body: string; author: string; url: string; timestamp: string }

export function parseAtom(xml: string): AtomEntry[] {
  const out: AtomEntry[] = [];
  let doc: Document;
  try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch { return out; }
  const txt = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? '';
  for (const el of Array.from(doc.getElementsByTagName('entry'))) {
    const href = el.getElementsByTagName('link')[0]?.getAttribute('href') ?? '';
    const dateStr = txt(el, 'published') || txt(el, 'updated');
    out.push({
      id: (txt(el, 'id') || href).slice(0, 200),
      title: (txt(el, 'title') || 'Untitled').trim(),
      body: strip(txt(el, 'content')).trim(),
      author: (el.getElementsByTagName('author')[0]?.getElementsByTagName('name')[0]?.textContent ?? '').replace(/^\/u\//, '').trim(),
      url: href,
      timestamp: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

/** Presence's view over the app-wide Reddit gate: labels failures, stops on throttle. */
class RedditGate {
  rateLimited = false;
  constructor(private fetchUrl: FetchUrl, private failed: string[]) {}
  async get(url: string, label: string): Promise<string | null> {
    if (this.rateLimited) return null;
    const r = await redditFetch(this.fetchUrl, url);
    if (r.ok) return r.body;
    if (r.reason !== 'error') { this.rateLimited = true; return null; }
    this.failed.push(label);
    return null;
  }

  /**
   * Probe an endpoint Reddit may simply refuse us (.json — social-engine
   * lesson). A refusal is an endpoint verdict, never an IP throttle: it
   * does not stop this run and does not trip the cooldown.
   */
  async probe(url: string): Promise<{ body: string } | 'blocked' | null> {
    if (this.rateLimited) return null;
    const r = await redditFetch(this.fetchUrl, url, { probe: true });
    if (r.ok) return { body: r.body };
    // ONLY a wall means the endpoint is closed to us. A throttle stops the
    // run like any other call — it must never be filed as "json blocked".
    if (r.reason === 'walled') return 'blocked';
    if (r.reason !== 'error') this.rateLimited = true;
    return null;
  }
}

/** Thread base + ids from any Reddit permalink (post or comment). */
function redditThreadRef(url: string): { base: string; threadId: string; sub: string } | null {
  const m = url.match(/(https:\/\/[^/]+\/r\/([^/]+)\/comments\/([a-z0-9]+))/i);
  if (!m) return null;
  return { base: m[1], threadId: m[3], sub: m[2] };
}

/** A permalink with a comment id after the slug — the user's COMMENT, not their post. */
function isCommentUrl(url: string): boolean {
  return /\/comments\/[a-z0-9]+\/[^/]+\/[a-z0-9]+/i.test(url);
}

/**
 * A thread known only from a LISTING entry — history that costs zero extra
 * fetches. No replies, no counts: the listing tells titles and dates, and
 * an honest shallow row beats a thread silently dropped.
 */
function shallowNode(
  entry: AtomEntry,
  ref: { threadId: string; sub: string } | null,
  user: string,
  why?: ShallowWhy,
): ThreadNode {
  const isComment = isCommentUrl(entry.url);
  const mine: ThreadNode['mine'] =
    user && entry.author.toLowerCase() === user.toLowerCase()
      ? (isComment ? 'comment' : 'post')
      : 'none';
  return {
    id: ref ? `reddit_${ref.threadId}` : `feed_${entry.id}`,
    network: 'reddit',
    mine,
    community: ref ? `r/${ref.sub}` : 'reddit',
    title: entry.title,
    url: entry.url,
    timestamp: entry.timestamp,
    postBody: isComment ? '' : clip(entry.body, POST_CLIP),
    postAuthor: entry.author,
    myBody: isComment && mine === 'comment' ? clip(entry.body, POST_CLIP) : '',
    replies: [],
    commentCount: null,
    ...(why ? { shallowWhy: why } : {}),
  };
}

/** One comment flattened out of Reddit's JSON tree, parent author kept. */
interface FlatComment { id: string; author: string; body: string; url: string; timestamp: string; parentAuthor: string; score: number | null }

function flattenRedditComments(children: unknown[], parentAuthor: string, out: FlatComment[]): void {
  for (const c of children ?? []) {
    const node = c as { kind?: string; data?: Record<string, unknown> };
    if (node?.kind !== 't1' || !node.data) continue;
    const d = node.data;
    const author = asString(d.author, '');
    out.push({
      id: `t1_${asString(d.id, '')}`,
      author,
      body: asString(d.body, ''),
      url: d.permalink ? `https://www.reddit.com${asString(d.permalink)}` : '',
      timestamp: new Date(Number(d.created_utc ?? 0) * 1000).toISOString(),
      parentAuthor,
      score: typeof d.score === 'number' ? d.score : null,
    });
    const replies = d.replies as { data?: { children?: unknown[] } } | '' | undefined;
    if (replies && typeof replies === 'object') {
      flattenRedditComments(replies.data?.children ?? [], author, out);
    }
  }
}

/**
 * Reconstruct one Reddit thread. Two strategies, tried in order:
 *  1. The JSON tree — parent links let a reply be identified as ADDRESSED
 *     TO the user (the "replies to you" badge). Reddit blocks public .json
 *     for many clients (social-engine lesson): the first refusal sets a
 *     2h flag (JSON_BLOCK_TTL_MS) and NEVER trips the app-wide cooldown.
 *  2. The Atom feed — always open, flat: same thread, no parent links, so
 *     `toMe` stays unknown there rather than guessed.
 */
async function buildRedditThread(
  gate: RedditGate,
  ref: { base: string; threadId: string; sub: string },
  user: string,
  myEntry: AtomEntry | null,
): Promise<ThreadNode | null> {
  const lower = user.toLowerCase();
  if (!redditJsonBlocked()) {
    const probe = await gate.probe(`${ref.base}/.json?limit=50&raw_json=1`);
    if (probe === 'blocked') markRedditJsonBlocked();
    else if (probe) {
      const node = threadFromJson(probe.body, ref, lower, myEntry);
      if (node) return node;
    }
  }
  const body = await gate.get(`${ref.base}/.rss?limit=50`, `r/${ref.sub}#${ref.threadId}`);
  if (body === null) return null;
  return threadFromAtom(body, ref, lower, myEntry);
}

function threadFromJson(
  body: string,
  ref: { base: string; threadId: string; sub: string },
  lower: string,
  myEntry: AtomEntry | null,
): ThreadNode | null {
  let post: Record<string, unknown> | undefined;
  const flat: FlatComment[] = [];
  try {
    const listing = JSON.parse(body) as { data?: { children?: { data?: Record<string, unknown> }[] } }[];
    post = listing?.[0]?.data?.children?.[0]?.data;
    if (!post) return null;
    flattenRedditComments(listing?.[1]?.data?.children ?? [], asString(post.author, ''), flat);
  } catch { return null; }
  const postAuthor = asString(post.author, '');
  const myComment = myEntry && postAuthor.toLowerCase() !== lower
    ? flat.find(c => c.author.toLowerCase() === lower) ?? null
    : null;
  // The tree can miss the user's comment (deep thread, removed, past the
  // 50-comment budget) — the feed entry itself is proof enough of "mine".
  const mineFromFeed = !!myEntry && isCommentUrl(myEntry.url);
  const postTs = new Date(Number(post.created_utc ?? 0) * 1000).toISOString();
  return {
    id: `reddit_${ref.threadId}`,
    network: 'reddit',
    mine: postAuthor.toLowerCase() === lower ? 'post' : myComment || mineFromFeed ? 'comment' : 'none',
    community: `r/${ref.sub}`,
    title: asString(post.title, 'Untitled'),
    url: `${ref.base}/`,
    timestamp: myEntry?.timestamp ?? postTs,
    postBody: clip((asString(post.selftext) || asString(post.url)), POST_CLIP),
    postAuthor,
    myBody: myComment
      ? clip(myComment.body, POST_CLIP)
      : mineFromFeed && myEntry ? clip(myEntry.body, POST_CLIP) : '',
    myScore: postAuthor.toLowerCase() === lower
      ? (typeof post.score === 'number' ? post.score : null)
      : myComment ? myComment.score : null,
    replies: flat
      .filter(c => c.author.toLowerCase() !== lower)
      .map(c => {
        const bot = !isHumanVoice(c);
        return {
          id: c.id, author: c.author, body: clip(c.body, REPLY_CLIP),
          url: c.url || `${ref.base}/`, timestamp: c.timestamp,
          // AutoModerator's boilerplate IS a direct child of the post, so on
          // the user's own post it satisfied "parent is you" and arrived as
          // "someone replied to you". A bot addresses nobody.
          toMe: !bot && c.parentAuthor.toLowerCase() === lower,
          ...(bot ? { bot } : {}),
        };
      }),
    // Humans only: "1 comment" on a thread whose single comment is the sub's
    // AutoModerator is a conversation nobody had.
    commentCount: flat.filter(isHumanVoice).length,
  };
}

/** The open path: entry 0 is the post, the rest are comments — no parents. */
function threadFromAtom(
  xml: string,
  ref: { base: string; threadId: string; sub: string },
  lower: string,
  myEntry: AtomEntry | null,
): ThreadNode | null {
  const entries = parseAtom(xml);
  if (entries.length === 0) return null;
  const post = entries[0];
  const comments = entries.slice(1);
  const myComment = myEntry && post.author.toLowerCase() !== lower
    ? comments.find(c => c.author.toLowerCase() === lower) ?? null
    : null;
  const mineFromFeed = !!myEntry && isCommentUrl(myEntry.url);
  return {
    id: `reddit_${ref.threadId}`,
    network: 'reddit',
    mine: post.author.toLowerCase() === lower ? 'post' : myComment || mineFromFeed ? 'comment' : 'none',
    community: `r/${ref.sub}`,
    title: post.title,
    url: `${ref.base}/`,
    timestamp: myEntry?.timestamp ?? post.timestamp,
    postBody: clip(post.body, POST_CLIP),
    postAuthor: post.author,
    myBody: myComment
      ? clip(myComment.body, POST_CLIP)
      : mineFromFeed && myEntry ? clip(myEntry.body, POST_CLIP) : '',
    replies: comments
      .filter(c => c.author.toLowerCase() !== lower)
      .map(c => ({
        id: c.id, author: c.author, body: clip(c.body, REPLY_CLIP),
        url: c.url || `${ref.base}/`, timestamp: c.timestamp,
        // No parent info in the flat feed — toMe stays unknown, never guessed.
        // But WHO is speaking is knowable from the entry alone, and this path
        // used to skip the question entirely: every reply arrived unflagged,
        // so AutoModerator — which posts on EVERY submission — counted as a
        // human wherever a caller tests `!r.bot`. Same predicate as the JSON
        // path, because two ways of asking "is this a human" is how the inbox
        // and the badge came to disagree (lib/authors.ts).
        ...(isHumanVoice(c) ? {} : { bot: true }),
      })),
    // Humans only, exactly as the JSON path counts them. `comments.length`
    // reported "1 comment" on a thread whose only comment was the sub's bot.
    commentCount: comments.filter(isHumanVoice).length,
  };
}

/**
 * The comments under one HN story, shaped as replies to the user.
 *
 * Written once because three callers need it — the user's own stories, the
 * threads they merely commented in, and the ones they follow — and the three
 * copies had already started to differ on what "addressed to me" means.
 *
 * @param ownsStory True when the STORY is theirs, which makes a top-level
 *   comment a reply to them. On a thread they only commented in, it is not:
 *   only children of their own comments are.
 * @returns `fetched: false` when Algolia did not answer. The caller keeps the
 *   count at `null` rather than at zero — "nobody replied" and "we never
 *   looked" are different sentences.
 */
async function hnReplies(
  storyId: string,
  user: string,
  fetchUrl: FetchUrl,
  ownsStory: boolean,
): Promise<{ replies: ReplyNode[]; fetched: boolean }> {
  try {
    const r = await fetchUrl(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${storyId}&hitsPerPage=20`);
    if (r.status < 200 || r.status >= 300) return { replies: [], fetched: false };
    const hits = (JSON.parse(r.body)?.hits ?? []) as Record<string, unknown>[];
    const lower = user.toLowerCase();
    const isMine = (h: Record<string, unknown>) =>
      !!lower && asString(h.author, '').toLowerCase() === lower;
    // ⚠️ Ids through `asId`, never `asString`. Algolia sends `objectID` as a
    // string and `parent_id` as a NUMBER on the very same hit, so the two
    // sides of this comparison had no chance of ever matching — "someone
    // replied to you" could not fire on Hacker News at all.
    //
    // What the user OWNS in this thread: their own comments, plus the story
    // itself when it is theirs. A reply whose parent is one of these is TO them.
    const myIds = new Set([
      ...(ownsStory ? [storyId] : []),
      ...hits.filter(isMine).map(h => asId(h.objectID)),
    ].filter(Boolean));
    const replies = hits.filter(h => !isMine(h)).map(h => ({
      id: `hn_${asId(h.objectID)}`,
      author: asString(h.author, 'unknown'),
      body: clip(strip(asString(h.comment_text, '')), REPLY_CLIP),
      url: `https://news.ycombinator.com/item?id=${asId(h.objectID)}`,
      timestamp: new Date(asString(h.created_at, new Date().toISOString())).toISOString(),
      // An absent parent keys to '' and is filtered out of `myIds` above, so
      // it can never collide with another absent one and claim to address you.
      toMe: myIds.has(asId(h.parent_id)),
      ...(isHumanVoice({ author: asString(h.author, ''), body: asString(h.comment_text, '') })
        ? {} : { bot: true }),
    }));
    return { replies, fetched: true };
  } catch {
    return { replies: [], fetched: false };
  }
}

async function fetchHn(user: string, fetchUrl: FetchUrl, failed: string[]): Promise<{ threads: ThreadNode[]; karma: number | null }> {
  let karma: number | null = null;
  try {
    const r = await fetchUrl(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(user)}.json`);
    if (r.status >= 200 && r.status < 300) {
      // Firebase answers 200 + literal `null` for an unknown user, and
      // Number(null) is 0 — which the UI then shows as a real karma of
      // zero and the diagnosis prompt sells as a measured fact.
      const raw = (JSON.parse(r.body) as { karma?: unknown } | null)?.karma;
      karma = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      if (karma === null) failed.push(`HN:${user}`);
    } else failed.push(`HN:${user}`);
  } catch { failed.push(`HN:${user}`); }

  const threads: ThreadNode[] = [];
  try {
    const r = await fetchUrl(`https://hn.algolia.com/api/v1/search_by_date?tags=story,author_${encodeURIComponent(user)}&hitsPerPage=4`);
    if (r.status < 200 || r.status >= 300) return { threads, karma };
    const stories = (JSON.parse(r.body)?.hits ?? []) as Record<string, unknown>[];
    for (const story of stories) {
      const id = asId(story.objectID);
      if (!id) continue;
      let replies: ReplyNode[] = [];
      // null until we actually LOOK: a count kept from the story listing
      // while the comment fetch failed made the UI say "12 replies" and
      // "no replies yet" on the same card.
      let count: number | null = null;
      const got = await hnReplies(id, user, fetchUrl, true);
      if (got.fetched) {
        replies = got.replies;
        // The thread's REAL size when Algolia gives it; the fetched list
        // is capped at 20 and excludes the user's own comments.
        count = typeof story.num_comments === 'number' ? story.num_comments : replies.length;
      }
      threads.push({
        id: `hn_${id}`,
        network: 'hackernews',
        mine: 'post',
        community: 'Hacker News',
        title: asString(story.title, 'my story'),
        url: `https://news.ycombinator.com/item?id=${id}`,
        timestamp: new Date(asString(story.created_at, new Date().toISOString())).toISOString(),
        postBody: clip(strip((asString(story.story_text) || asString(story.url))), POST_CLIP),
        postAuthor: user,
        myBody: '',
        myScore: typeof story.points === 'number' ? story.points : null,
        replies,
        commentCount: count,
      });
    }
  } catch { /* Algolia down — karma may still have landed */ }

  // The user's own COMMENTS.
  //
  // Until this existed, Hacker News only ever produced the stories they
  // POSTED, so a reply they wrote on somebody else's thread was invisible to
  // the whole app: absent from their history, unable to receive an answer in
  // the inbox, and — since 0.9.7 — unable to be credited as an act written
  // without Pheme (lib/authorship). Reddit had this from the start; HN was
  // half a presence.
  try {
    const r = await fetchUrl(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,author_${encodeURIComponent(user)}&hitsPerPage=${MAX_HN_COMMENTS}`);
    if (r.status >= 200 && r.status < 300) {
      const hits = (JSON.parse(r.body)?.hits ?? []) as Record<string, unknown>[];
      // One row per THREAD, never per comment. Three comments in one
      // discussion are one presence: counting them as three would inflate the
      // thread count, the replies received, and the solo credit all at once.
      // Newest first from the API, so the first hit wins the body.
      const byStory = new Map<string, Record<string, unknown>>();
      for (const h of hits) {
        // `asId`, not `asString`: Algolia sends this one as a number, and
        // reading it as a string answered '' for every single hit — the whole
        // feature would have done nothing, silently, in production.
        const sid = asId(h.story_id);
        if (sid && !byStory.has(sid)) byStory.set(sid, h);
      }

      let looked = 0;
      for (const [sid, h] of byStory) {
        // Their own story already covers this thread, and a post is the
        // stronger identity — the same rule the Reddit feed applies.
        if (threads.some(t => t.id === `hn_${sid}`)) continue;
        let replies: ReplyNode[] = [];
        let count: number | null = null;
        if (looked < MAX_HN_COMMENT_THREADS) {
          looked++;
          const got = await hnReplies(sid, user, fetchUrl, false);
          if (got.fetched) {
            replies = got.replies;
            count = replies.length;
          }
        }
        threads.push({
          id: `hn_${sid}`,
          network: 'hackernews',
          mine: 'comment',
          community: 'Hacker News',
          title: asString(h.story_title, 'a thread'),
          // The STORY, deliberately, and not the comment's own permalink:
          // this is the id the radar hands the ledger, and the two have to
          // reduce to one thread key or every assisted reply here would read
          // as a solo one (lib/authorship).
          url: `https://news.ycombinator.com/item?id=${sid}`,
          timestamp: new Date(asString(h.created_at, new Date().toISOString())).toISOString(),
          // A comment hit carries the story's title and id, never its author
          // or its text. Left empty rather than filled with the user, who did
          // not write it.
          postBody: '',
          postAuthor: '',
          myBody: clip(strip(asString(h.comment_text, '')), POST_CLIP),
          // Algolia publishes no points on a comment. Unknown, and the card
          // prints a dash — never a score of zero.
          myScore: null,
          replies,
          commentCount: count,
        });
      }
    }
  } catch { /* their comments are unreadable this run — the stories still stand */ }

  return { threads, karma };
}

/** Comments landing on one FOLLOWED HN story (title/url known from the ref). */
async function buildHnFollowedThread(ref: FollowedRef, user: string, fetchUrl: FetchUrl): Promise<ThreadNode | null> {
  const storyId = ref.id.replace(/^hn_/, '');
  // The story is not the user's here — only children of THEIR comments are
  // addressed to them, which is what `ownsStory: false` says.
  const { replies, fetched } = await hnReplies(storyId, user, fetchUrl, false);
  if (!fetched) return null;
  return {
    id: ref.id, network: 'hackernews', mine: 'none', community: 'Hacker News',
    title: ref.title, url: ref.url,
    timestamp: replies[0]?.timestamp ?? new Date().toISOString(),
    postBody: '', postAuthor: 'HN', myBody: '',
    replies, commentCount: replies.length, followed: true,
  };
}

/** One full refresh. Reddit goes through the gate; nothing here ever throws. */
export async function fetchPresence(
  cfg: PresenceConfig,
  fetchUrl: FetchUrl,
  followed: FollowedRef[] = [],
): Promise<PresenceReport> {
  const failed: string[] = [];
  const threads: ThreadNode[] = [];
  let rateLimited = false;
  let hnKarma: number | null = null;
  const gate = new RedditGate(fetchUrl, failed);

  // LISTINGS FIRST — two cheap calls before any thread reconstruction.
  // Reddit's throttle regularly trips mid-run; when the sub was fetched
  // last, a tripped gate starved it silently and every fresh report read
  // as "where did my sub go?". Listings grab their data up front; the
  // reconstructions spend whatever budget remains.
  const userFeed = cfg.redditUser
    ? await gate.get(`https://www.reddit.com/user/${cfg.redditUser}/.rss?limit=25`, `u/${cfg.redditUser}`)
    : null;
  const subName = cfg.mySub ? cfg.mySub.replace(/^r\//, '') : null;
  const subFeed = subName
    ? await gate.get(`https://www.reddit.com/r/${subName}/new/.rss?limit=25`, `r/${subName}`)
    : null;
  const subEntries = subFeed !== null ? parseAtom(subFeed) : null;
  const subEmpty = subEntries !== null && subEntries.length === 0;

  if (cfg.redditUser && userFeed !== null) {
    // EVERY feed entry becomes history. Reconstruction (replies, toMe) is a
    // bonus for the most recent threads — never the price of appearing at
    // all: a throttled or over-budget thread falls back to its listing row.
    const byThread = new Map<string, { ref: ReturnType<typeof redditThreadRef>; entry: AtomEntry }>();
    for (const entry of parseAtom(userFeed)) {
      const ref = redditThreadRef(entry.url);
      const key = ref?.threadId ?? entry.id;
      const prev = byThread.get(key);
      // A thread can appear as both the user's POST and their later comment
      // in it — the post is the stronger identity, it must win the tag.
      if (!prev) byThread.set(key, { ref, entry });
      else if (isCommentUrl(prev.entry.url) && !isCommentUrl(entry.url)) byThread.set(key, { ref, entry });
    }
    // Budget: the FRESHEST threads are rebuilt every run (that is where a
    // new reply lands), the rest take turns through a persisted cursor.
    // Without the cursor, threads past the budget were never inspected —
    // ever, at any future run — so a reply on the 5th thread simply never
    // reached the user. Attempts count against the budget, not successes:
    // a failing run must not walk the whole feed paying 5s per call.
    const entries = [...byThread.values()];
    const rotatable = Math.max(0, entries.length - ALWAYS_FRESH);
    const start = rotatable > 0 ? readThreadCursor() % rotatable : 0;
    const ordered = [
      ...entries.slice(0, ALWAYS_FRESH),
      ...entries.slice(ALWAYS_FRESH + start),
      ...entries.slice(ALWAYS_FRESH, ALWAYS_FRESH + start),
    ];
    let spent = 0;
    for (const { ref, entry } of ordered) {
      let node: ThreadNode | null = null;
      // Which unknown this is, so the card can say it. No ref = the feed row
      // is not a thread URL at all; that one stays unnamed.
      let why: ShallowWhy | undefined;
      if (ref) {
        if (gate.rateLimited) why = 'throttled';
        else if (spent >= MAX_THREADS) why = 'budget';
        else {
          spent++;
          node = await buildRedditThread(gate, ref, cfg.redditUser, entry);
          if (!node) why = gate.rateLimited ? 'throttled' : 'refused';
        }
      }
      threads.push(node ?? shallowNode(entry, ref, cfg.redditUser, why));
    }
    if (rotatable > 0) {
      saveThreadCursor((start + Math.max(0, spent - ALWAYS_FRESH)) % rotatable);
    }
  }

  // The user's own sub — watched even without a Reddit username configured.
  if (subName && subEntries) {
    for (const e of subEntries.slice(0, 25)) {
      const ref = redditThreadRef(e.url);
      const existing = ref ? threads.find(t => t.id === `reddit_${ref.threadId}`) : undefined;
      if (existing) {
        // The sub listing knows the POST (author, title, body) — a shallow
        // node built from a comment entry does not. Upgrade, never drop:
        // "your comment on your own post" is above all YOUR POST.
        if (existing.commentCount === null) {
          existing.title = e.title;
          existing.postAuthor = e.author;
          if (!existing.postBody) existing.postBody = clip(e.body, POST_CLIP);
          if (cfg.redditUser && e.author.toLowerCase() === cfg.redditUser.toLowerCase()) {
            existing.mine = 'post';
          }
        }
        continue;
      }
      threads.push({
        id: ref ? `reddit_${ref.threadId}` : `sub_${e.id}`,
        network: 'reddit',
        mine: cfg.redditUser && e.author.toLowerCase() === cfg.redditUser.toLowerCase() ? 'post' : 'none',
        community: `r/${subName}`,
        title: e.title,
        url: e.url,
        timestamp: e.timestamp,
        postBody: clip(e.body, POST_CLIP),
        postAuthor: e.author,
        myBody: '',
        replies: [],
        commentCount: null,
        inMySub: true,
      });
    }
  }

  if (cfg.hnUser) {
    const hn = await fetchHn(cfg.hnUser, fetchUrl, failed);
    threads.push(...hn.threads.filter(h => !threads.some(t => t.id === h.id)));
    hnKarma = hn.karma;
  }

  // Followed threads (radar detail view) — tracked like the user's own.
  // Runs LAST so a thread that is both owned and followed keeps its richer,
  // owned reconstruction and simply gains the flag below.
  // BUDGETED and rotating, like the user's own feed: this loop had no cap
  // at all, so a hundred follows meant up to two hundred sequential Reddit
  // calls per refresh — every N minutes when the auto-timer is on.
  const pending = followed.filter(ref => !threads.some(t => t.id === ref.id));
  const fStart = pending.length > 0 ? readFollowCursor() % pending.length : 0;
  const fOrdered = [...pending.slice(fStart), ...pending.slice(0, fStart)];
  let fSpent = 0;
  for (const ref of fOrdered) {
    if (fSpent >= MAX_FOLLOWED || gate.rateLimited) break;
    fSpent++;
    if (ref.network === 'reddit') {
      const tref = redditThreadRef(ref.url);
      if (!tref) continue;
      const node = await buildRedditThread(gate, tref, cfg.redditUser || '', null);
      if (node) threads.push({ ...node, followed: true });
    } else {
      const node = await buildHnFollowedThread(ref, cfg.hnUser, fetchUrl);
      if (node) threads.push(node);
    }
  }
  if (pending.length > 0) saveFollowCursor((fStart + fSpent) % pending.length);

  // Flag follows that also surfaced through the user's own activity.
  const followedIds = new Set(followed.map(f => f.id));
  for (const t of threads) if (followedIds.has(t.id)) t.followed = true;

  rateLimited = gate.rateLimited;

  // What Reddit says publicly about the account and about these communities
  // (doc 75 lot 2). LAST on purpose: the threads are what the user came for,
  // and this must never spend the budget they need. It rotates and caches, so
  // a throttled run here costs nothing that was not already lost — and every
  // failure comes back as an unknown with a reason, never as a zero.
  const facts = await refreshRedditFacts(
    cfg.redditUser,
    [
      ...threads.filter(t => t.network === 'reddit').map(t => t.community),
      ...(subName ? [`r/${subName}`] : []),
      ...(cfg.subs ?? []),
    ],
    fetchUrl,
  );

  const mySubName = subName ? `r/${subName}` : null;
  return {
    groups: groupThreads(threads, mySubName),
    hnKarma,
    redditAccount: facts.account,
    rules: facts.rules,
    rulesUnread: facts.unread,
    failed,
    rateLimited,
    subEmpty,
    at: new Date().toISOString(),
  };
}

/** Group by community; inside a group newest first; groups alphabetical, the user's own sub first. */
function groupThreads(threads: ThreadNode[], mySubName: string | null): PresenceReport['groups'] {
  const byCommunity = new Map<string, ThreadNode[]>();
  for (const t of threads) {
    byCommunity.set(t.community, [...(byCommunity.get(t.community) ?? []), t]);
  }
  // Case-insensitive: thread communities carry Reddit's URL casing, the
  // profile field carries whatever the user typed.
  const subLower = mySubName?.toLowerCase() ?? null;
  return [...byCommunity.entries()]
    .map(([community, list]) => ({
      community,
      threads: list.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    }))
    .sort((a, b) =>
      a.community.toLowerCase() === subLower ? -1
        : b.community.toLowerCase() === subLower ? 1
          : a.community.localeCompare(b.community));
}

// One run can now legitimately carry ~55 rows (25 feed + 25 sub + HN +
// follows) — the cap only exists to bound the cache, not to trim history.
const MERGE_CAP = 120;

/**
 * A refresh UPDATES what it could re-fetch and KEEPS the rest. Reddit's
 * throttle (or the MAX_THREADS budget, or the user feed rotating) routinely
 * leaves threads out of a run — losing them from the screen read as "where
 * did everything go?". A thread re-fetched replaces its old self; a thread
 * missing from the new run is carried forward as it was. Oldest carried
 * threads fall off past MERGE_CAP so the cache never grows without bound.
 */
/**
 * A thread the new run never OPENED must not erase what a run that did
 * already found. Only 4 threads are reconstructed per refresh (MAX_THREADS,
 * rotating), so a conversation read on Monday comes back shallow on Tuesday
 * — and replacing it wholesale turned replies that exist into "not fetched
 * this run", which reads as if nobody had answered. Shallow means NOT LOOKED
 * AT, never LOOKED AT AND EMPTY. The fresh row still wins on everything the
 * feed itself knows; only what requires opening the thread is carried.
 */
function keepWhatWasSeen(fresh: ThreadNode, old: ThreadNode | undefined): ThreadNode {
  if (!old || fresh.commentCount !== null || old.commentCount === null) return fresh;
  const kept: ThreadNode = {
    ...fresh,
    replies: old.replies,
    commentCount: old.commentCount,
    postBody: fresh.postBody || old.postBody,
    myBody: fresh.myBody || old.myBody,
    ...(fresh.myScore == null && old.myScore != null ? { myScore: old.myScore } : {}),
  };
  // It is no longer un-inspected: the reason would announce an absence the
  // node does not have any more.
  delete kept.shallowWhy;
  return kept;
}

export function mergePresence(
  prev: PresenceReport | null,
  next: PresenceReport,
  mySub: string,
): PresenceReport {
  if (!prev) return next;
  const prevById = new Map<string, ThreadNode>();
  for (const g of prev.groups) for (const t of g.threads) prevById.set(t.id, t);
  const nextIds = new Set<string>();
  const merged: ThreadNode[] = [];
  for (const g of next.groups) for (const t of g.threads) {
    nextIds.add(t.id);
    merged.push(keepWhatWasSeen(t, prevById.get(t.id)));
  }
  const carried: ThreadNode[] = [];
  for (const g of prev.groups) for (const t of g.threads) {
    if (!nextIds.has(t.id)) carried.push(t);
  }
  carried.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  merged.push(...carried.slice(0, Math.max(0, MERGE_CAP - merged.length)));

  const mySubName = mySub ? `r/${mySub.replace(/^r\//, '')}` : null;
  return {
    groups: groupThreads(merged, mySubName),
    hnKarma: next.hnKarma ?? prev.hnKarma,
    // Same rule as the threads: a run that could not read a public fact keeps
    // the last one that WAS read rather than blanking it. `refreshRedditFacts`
    // already answers with the whole cache, so `next` normally wins outright.
    redditAccount: next.redditAccount ?? prev.redditAccount,
    rules: next.rules ?? prev.rules,
    rulesUnread: next.rulesUnread ?? prev.rulesUnread,
    failed: next.failed,
    rateLimited: next.rateLimited,
    // Fresh-run signal only: an old "empty" must not outlive a good fetch.
    subEmpty: next.subEmpty,
    at: next.at,
  };
}

// ── Persistence (report cache + high-water mark) ─────────────────────────────

const K_SEEN = 'pheme:presence:seen';
const K_CACHE = 'pheme:presence:cache';

export function loadCachedPresence(): PresenceReport | null {
  try {
    const raw = localStorage.getItem(K_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PresenceReport;
    return Array.isArray(parsed.groups) ? parsed : null;
  } catch { return null; }
}

export function cachePresence(report: PresenceReport): void {
  try { localStorage.setItem(K_CACHE, JSON.stringify(report)); }
  catch { /* quota/private mode — the tab just refetches next time */ }
}

/**
 * One high-water mark PER NETWORK. A single global mark meant "mark seen"
 * on the Reddit tab silently cleared the Hacker News badge — destroying an
 * unread state over replies that screen never showed.
 */
export type SeenMarks = Record<string, string>;

const EPOCH = new Date(0).toISOString();

export function getLastSeen(): SeenMarks {
  let raw: string | null = null;
  try { raw = localStorage.getItem(K_SEEN); } catch { return {}; }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as SeenMarks;
  } catch { /* legacy: a bare ISO string, applied to every network below */ }
  return { reddit: raw, hackernews: raw };
}

/** Mark one network seen — or every network when `net` is omitted. */
export function markAllSeen(marks: SeenMarks, net?: string): SeenMarks {
  const now = new Date().toISOString();
  const next: SeenMarks = { ...marks };
  if (net) next[net] = now;
  else { next.reddit = now; next.hackernews = now; }
  try { localStorage.setItem(K_SEEN, JSON.stringify(next)); } catch { /* see cachePresence */ }
  return next;
}

export function seenOf(marks: SeenMarks, net: string): string {
  return marks[net] ?? EPOCH;
}

/**
 * Alert-worthy = replies from others newer than the mark, plus new posts
 * in the user's OWN sub. The sub test used to be `mine === 'none'`, which
 * also caught every followed thread and every "elsewhere" thread — and
 * since a followed HN thread carries its newest reply's timestamp, that
 * reply was counted twice (and a reply-less one counted forever).
 */
export function unseenCount(report: PresenceReport | null, marks: SeenMarks): number {
  if (!report) return 0;
  let n = 0;
  for (const g of report.groups) {
    for (const t of g.threads) {
      const mark = seenOf(marks, t.network);
      n += t.replies.filter(r => !r.bot && r.timestamp > mark).length;
      if (t.inMySub && t.mine === 'none' && t.timestamp > mark) n++;
    }
  }
  return n;
}
