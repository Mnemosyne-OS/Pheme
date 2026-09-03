/**
 * What Reddit publishes about you, and about the places you post in — read
 * without an account (doc 75 lot 2).
 *
 * Two endpoints, and they are what turns the verdict engine on. Until they
 * are read, `Standing.karma` is `null` everywhere and `readiness()` answers
 * `unknown` for EVERY Reddit community, because the rules of the place
 * outrank anything counted:
 *
 *  - `/user/<handle>/about.json` → post + comment karma, account age. The
 *    hardest standing signal available for free, and Pheme was not reading it.
 *  - `/r/<sub>/about/rules.json` → the community's rules, IN ITS OWN WORDS.
 *
 * Two doctrines run through every line below.
 *
 * **Fetched, never asserted.** A model asked what r/LocalLLaMA forbids
 * invents an answer with total confidence, and that would be a fabricated
 * claim about a real ban. Rules are quoted verbatim or they are unknown.
 *
 * **A wall is an unknown, never a zero.** Reddit walls public `.json` for
 * many clients, and it throttles hard per IP. Every failure here leaves the
 * fact absent and says WHY — a suspended account reported as "0 karma", or a
 * walled sub reported as "no rules", would be Pheme inventing good news.
 */
import { markRedditJsonBlocked, redditFetch, redditJsonBlocked } from './redditGate';
import type { CommunityRules } from './rulebook';

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

/** Why a public fact is absent. There is no fifth value meaning "it is zero". */
export type Unread =
  /** Never looked — the budget rotates, and a fresh install has looked nowhere. */
  | 'not-read'
  /** Reddit refuses this client the public .json tree. */
  | 'walled'
  /** Throttled, or inside the app-wide cooldown the throttle armed. */
  | 'limited'
  /** Answered, but with nothing we could read (404, private sub, bad JSON). */
  | 'error';

export interface AccountKarma {
  handle: string;
  /** `null` where the payload carried no such figure — never 0 by default. */
  link: number | null;
  comment: number | null;
  /** What a verdict cites. The account is only recorded when this is known. */
  total: number;
  /**
   * Account creation, ISO — '' when absent. Not judged anywhere yet on
   * purpose: AutoModerator gates on account age, but the threshold is the
   * sub's and it is not published, so Pheme carries the fact and invents no
   * bar to compare it against.
   */
  createdAt: string;
  fetchedAt: string;
}

/** Everything the two endpoints know right now, cache included. */
export interface RedditFacts {
  /** `null` = never read, or unreadable. Never a zeroed stand-in. */
  account: AccountKarma | null;
  /** Rules read verbatim, keyed by LOWERCASED label — `r/localllama`. */
  rules: Record<string, CommunityRules>;
  /** Why the rules asked for are absent, same keys. Never "there are none". */
  unread: Record<string, Unread>;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * `/user/<handle>/about.json` → the account's public karma.
 *
 * @returns `null` whenever no karma figure came back. A suspended account
 *   answers 200 with a payload that simply has no karma in it, and
 *   `Number(undefined) || 0` there would print a hard "0 karma" for an
 *   account with thousands — the fabricated-zero trap this cartridge keeps
 *   walking into.
 */
export function parseAccountKarma(handle: string, body: string): AccountKarma | null {
  let data: Record<string, unknown> | undefined;
  try {
    data = (JSON.parse(body) as { data?: Record<string, unknown> } | null)?.data;
  } catch { return null; }
  if (!data) return null;

  const link = num(data.link_karma);
  const comment = num(data.comment_karma);
  // `total_karma` is the field Reddit added later and the one it keeps
  // accurate; the sum of the two halves is the fallback, and only when at
  // least one half actually arrived.
  const total = num(data.total_karma)
    ?? (link === null && comment === null ? null : (link ?? 0) + (comment ?? 0));
  if (total === null) return null;

  const created = num(data.created_utc);
  return {
    handle,
    link,
    comment,
    total,
    createdAt: created !== null ? new Date(created * 1000).toISOString() : '',
    fetchedAt: new Date().toISOString(),
  };
}

/** One rule line stays whole up to this; past it the cut is SHOWN, not hidden. */
const RULE_CLIP = 600;
/** Rules kept per community — Reddit's own limit is well under this. */
const MAX_RULES = 25;

/**
 * `/r/<sub>/about/rules.json` → the community's rules, verbatim.
 *
 * Title and description are joined into one line each, because that is how
 * the sub itself reads: `promoBanRule` matches over the same text the human
 * is shown, so a verdict can never rest on words the interface hides.
 *
 * @returns `null` when the payload is not a rules payload — unknown. An
 *   EMPTY list is a different answer and a real one: the sub answered and
 *   publishes no rules.
 */
export function parseSubRules(community: string, body: string): CommunityRules | null {
  let list: unknown;
  try { list = (JSON.parse(body) as { rules?: unknown } | null)?.rules; } catch { return null; }
  if (!Array.isArray(list)) return null;

  const rules: string[] = [];
  for (const entry of list.slice(0, MAX_RULES)) {
    const r = entry as { short_name?: unknown; description?: unknown; violation_reason?: unknown };
    const name = str(r?.short_name) || str(r?.violation_reason);
    const desc = str(r?.description);
    const line = name && desc ? `${name} — ${desc}` : name || desc;
    if (!line) continue;
    // A visible ellipsis is not a paraphrase: the reader knows there is more
    // and the sub is one click away. Silently trimming would be.
    rules.push(line.length > RULE_CLIP ? `${line.slice(0, RULE_CLIP)}…` : line);
  }
  return { community, rules, fetchedAt: new Date().toISOString() };
}

// ── Cache ────────────────────────────────────────────────────────────────────

const K_ACCOUNT = 'pheme:reddit:account';
const K_RULES = 'pheme:reddit:rules';

/** Karma moves; six hours is often enough for a signal measured in hundreds. */
const KARMA_TTL_MS = 6 * 3_600_000;
/** A subreddit rewrites its rules a few times a year. */
const RULES_TTL_MS = 7 * 24 * 3_600_000;
/** Do not re-ask a door that just refused — but do re-ask the same day. */
const UNREAD_TTL_MS = 6 * 3_600_000;
/**
 * Rule reads per run. Presence already spends ~10 Reddit calls at 5s spacing
 * and the per-IP bucket is the scarce resource: rules rotate, oldest first,
 * and a hundred subs simply take a few runs to cover.
 */
const MAX_RULES_PER_RUN = 2;
/** Communities kept in the cache — the oldest fall off, nothing grows forever. */
const RULES_CAP = 60;

interface RulesEntry {
  /** Display label, `r/<Name>` with the sub's own casing where we saw it. */
  community: string;
  /** Verbatim rules, or `null` when the read did not happen. Never `[]` for that. */
  rules: string[] | null;
  why?: Unread;
  at: string;
}

type RulesCache = Record<string, RulesEntry>;

function readAccount(): AccountKarma | null {
  try {
    const raw = localStorage.getItem(K_ACCOUNT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountKarma;
    return typeof parsed?.total === 'number' ? parsed : null;
  } catch { return null; }
}

function writeAccount(a: AccountKarma): void {
  try { localStorage.setItem(K_ACCOUNT, JSON.stringify(a)); }
  catch { /* quota/private mode — the next run simply re-reads it */ }
}

function readRulesCache(): RulesCache {
  try {
    const raw = localStorage.getItem(K_RULES);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RulesCache : {};
  } catch { return {}; }
}

function writeRulesCache(cache: RulesCache): void {
  const entries = Object.entries(cache);
  const kept = entries.length <= RULES_CAP
    ? entries
    : entries.sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, RULES_CAP);
  try { localStorage.setItem(K_RULES, JSON.stringify(Object.fromEntries(kept))); }
  catch { /* see writeAccount */ }
}

/**
 * The subreddit NAME inside a community label, with its own casing kept —
 * '' for anything that is not one, so a caller can hand over its whole
 * community list unsorted (Hacker News has no such endpoint).
 */
export function subName(community: string): string {
  const name = (community ?? '').trim().replace(/^\/?r\//i, '');
  return /^[A-Za-z0-9_]{2,24}$/.test(name) ? name : '';
}

/**
 * The key a community is filed under: `r/<lowercase>`, which is exactly what
 * `verdicts()` looks up (`standing.community.toLowerCase()`). Accepts what
 * every caller happens to hold — `r/Name`, `/r/Name` or a bare `Name`.
 */
export function subKey(community: string): string {
  const name = subName(community);
  return name ? `r/${name.toLowerCase()}` : '';
}

// ── Fetching ─────────────────────────────────────────────────────────────────

/** A gate refusal, translated into the reason a human can be told. */
function whyOf(reason: 'cooldown' | 'limited' | 'walled' | 'error'): Unread {
  return reason === 'walled' ? 'walled'
    : reason === 'error' ? 'error'
      : 'limited';
}

/**
 * Read what is stale, keep what is fresh, and report what could not be read.
 *
 * Everything goes through `redditGate`, in `probe` mode: these are `.json`
 * endpoints, and Reddit walling them is a verdict on the DOOR, never a reason
 * to freeze the feeds that still answer.
 *
 * @param handle      The user's Reddit pseudonym. '' = no account to read.
 * @param communities Every community whose rules matter — presence threads,
 *                    the user's own sub, their scan targets. Non-subreddits
 *                    are ignored, so callers hand over the whole list.
 * @returns The full picture including everything already cached — never
 *          throws, and a run that fetched nothing still answers with what is
 *          known.
 */
export async function refreshRedditFacts(
  handle: string,
  communities: string[],
  fetchUrl: FetchUrl,
): Promise<RedditFacts> {
  const now = Date.now();
  const cache = readRulesCache();
  let account = readAccount();

  // Someone else's karma is not this user's. A renamed pseudonym drops it.
  if (!handle || account?.handle.toLowerCase() !== handle.toLowerCase()) account = null;

  // The public .json tree is known closed to this client: every call below
  // would be one 403 after another, and the flag has its own short TTL so the
  // wall is re-probed on its own schedule.
  const walled = redditJsonBlocked();

  if (handle && !walled && (!account || now - Date.parse(account.fetchedAt) > KARMA_TTL_MS)) {
    const r = await redditFetch(
      fetchUrl,
      `https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`,
      { probe: true },
    );
    if (r.ok) {
      // A payload we could not read leaves the previous karma standing: it is
      // dated, and a dated figure beats an unexplained blank.
      account = parseAccountKarma(handle, r.body) ?? account;
      if (account) writeAccount(account);
    } else if (r.reason === 'walled') markRedditJsonBlocked();
  }

  // Key → the label to SHOW. The key is lowercased so a standing row finds
  // it; the label keeps the casing the user (or Reddit) actually wrote, so
  // nothing is displayed as `r/localllama`.
  const label = new Map<string, string>();
  for (const c of communities) {
    const name = subName(c);
    if (name && !label.has(`r/${name.toLowerCase()}`)) label.set(`r/${name.toLowerCase()}`, `r/${name}`);
  }
  const keys = [...label.keys()];

  if (!walled) {
    const stale = keys
      .filter(k => {
        const e = cache[k];
        if (!e) return true;
        const age = now - Date.parse(e.at);
        return Number.isNaN(age) || age > (e.rules ? RULES_TTL_MS : UNREAD_TTL_MS);
      })
      // Oldest first, so the rotation covers everything instead of retrying
      // the same two subs every run.
      .sort((a, b) => (Date.parse(cache[a]?.at ?? '') || 0) - (Date.parse(cache[b]?.at ?? '') || 0));

    for (const key of stale.slice(0, MAX_RULES_PER_RUN)) {
      const shown = label.get(key) ?? key;
      const r = await redditFetch(
        fetchUrl,
        `https://www.reddit.com/${shown}/about/rules.json`,
        { probe: true },
      );
      const at = new Date().toISOString();
      if (r.ok) {
        const parsed = parseSubRules(shown, r.body);
        cache[key] = parsed
          ? { community: parsed.community, rules: parsed.rules, at }
          : { community: shown, rules: null, why: 'error', at };
      } else {
        if (r.reason === 'walled') markRedditJsonBlocked();
        cache[key] = { community: shown, rules: null, why: whyOf(r.reason), at };
        // A throttle stops the whole rotation: the next sub would meet the
        // same wall and spend a call to learn it again.
        if (r.reason !== 'error') break;
      }
    }
    writeRulesCache(cache);
  }

  // Everything ever read comes back, not only what was asked for this run: a
  // community can leave the scan list and still own a standing row.
  const rules: Record<string, CommunityRules> = {};
  for (const [key, e] of Object.entries(cache)) {
    if (e.rules) rules[key] = { community: e.community, rules: e.rules, fetchedAt: e.at };
  }
  const unread: Record<string, Unread> = {};
  for (const key of keys) {
    if (rules[key]) continue;
    unread[key] = walled ? 'walled' : cache[key]?.why ?? 'not-read';
  }
  return { account, rules, unread };
}
