/**
 * Derived state, computed in ONE place. Dashboard, Coach, Presence and the
 * Mnemosyne drawer all read these — never their own reimplementation. This
 * exists because the copies drifted twice: the Coach grew a different 9:1
 * formula than the dashboard, and the dashboard's sub filter diverged from
 * the Presence zones and lied about fetched data.
 */
import type { LedgerEntry } from './store';
import { seenOf, type PresenceReport, type SeenMarks, type ThreadNode } from './presence';
import { nextMove, verdicts, type Verdict } from './readiness';
import { standings, type Standing } from './standing';
import type { Unread } from './redditPublic';

/** Counts behind the 9:1 gauge. `ratioOk` is the verdict, never recomputed elsewhere. */
export interface LedgerStats {
  /** Genuine replies the user LOGGED here. */
  participation: number;
  /**
   * Genuine replies they wrote without Pheme (lib/authorship). Disjoint from
   * `participation` — the two are never a total and a share of it.
   */
  solo: number;
  promo: number;
  ratioOk: boolean;
}

/**
 * The 9:1 doctrine, one formula.
 *
 * Solo acts count toward the ratio. They have to: the gauge asks "did you give
 * more than you took", and a reply written without this app is still a reply
 * given. Leaving them out put a ✗ beside the promo tile on the very screen
 * whose verdict said READY — one question, two answers, which is the exact
 * drift this file exists to prevent.
 *
 * @param ledger Every act the user logged, across all networks.
 * @param presence Where the solo acts are counted from. Omitted — or null,
 *   before any refresh — the gauge simply reads the ledger, as it always did.
 * @returns Counts plus the verdict. Zero promo is always OK — the rule caps
 *   self-promotion, it does not demand any.
 */
export function ledgerStats(
  ledger: LedgerEntry[],
  presence: PresenceReport | null = null,
): LedgerStats {
  const participation = ledger.filter(e => e.kind === 'participation').length;
  const promo = ledger.filter(e => e.kind === 'promo').length;
  const solo = presence ? standings(ledger, presence).reduce((n, s) => n + s.autonomous, 0) : 0;
  return { participation, solo, promo, ratioOk: promo === 0 || participation + solo >= 9 * promo };
}

/**
 * Standing, verdicts and the next move — composed ONCE.
 *
 * Three surfaces show readiness (the cockpit, the Coach, each network board)
 * and they used to compute it three times, from `communityStats.ready`: an
 * invented floor (8 replies and a local 9:1) applied identically to a
 * subreddit that bans self-promotion and to a surface where launching is the
 * point. That is the divergence this whole file exists to prevent, so the
 * verdict is assembled here and nowhere else.
 */
export interface StandingBoard {
  rows: Standing[];
  verdicts: Verdict[];
  /** The one thing to do next, or null when nothing is decidable yet. */
  next: Verdict | null;
  /** Why a community's rules are missing, keyed by lowercased label. */
  unread: Record<string, Unread>;
}

/**
 * @param netFilter A network id — the per-network boards scope to their own.
 *   Rows whose network could not be identified from the label are dropped by
 *   a filter, never reassigned to a guess.
 */
export function standingBoard(
  ledger: LedgerEntry[],
  presence: PresenceReport | null,
  netFilter?: string,
): StandingBoard {
  const rows = standings(ledger, presence)
    .filter(s => !netFilter || s.network === netFilter);
  const all = verdicts(rows, presence?.rules ?? {});
  return { rows, verdicts: all, next: nextMove(all), unread: presence?.rulesUnread ?? {} };
}

// ── Watched targets: one order, one label, two surfaces ─────────────────────

/**
 * A target as the SCANNED ITEMS carry it. The profile stores a subreddit bare
 * (`LocalLLaMA`); the radar labels it `r/LocalLLaMA`. Hacker News queries are
 * stored and labelled the same. Written once because the board and the radar
 * both need it, and a second copy is how a filter starts matching nothing.
 */
export const targetLabel = (netId: string, target: string): string =>
  (netId === 'reddit' ? `r/${target.replace(/^r\//, '')}` : target);

/**
 * The watch list, in the order a human can actually use.
 *
 * Stored order is the order things were ADDED — arbitrary after the third sub,
 * and a wall of chips you have to read one by one. Alphabetical and
 * case-insensitive: findable, and above all STABLE. Sorting by hit count was
 * the tempting alternative and it is worse — the row would reshuffle after
 * every scan, so the chip you clicked last time is somewhere else now. The
 * count rides on the chip instead, which shows where the activity is without
 * moving anything.
 */
export const sortedTargets = (targets: string[]): string[] =>
  [...targets].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

/** The counted row behind a verdict — null when the two ever fall out of step. */
export const standingFor = (board: StandingBoard, community: string): Standing | null =>
  board.rows.find(s => s.community === community) ?? null;

/** The presence report re-cut around the user. Zones are disjoint except
 *  `all`, which is everything the filter let through. */
export interface PresenceZones {
  all: ThreadNode[];
  /** The user's own posts and comments, everywhere. Newest first. */
  mine: ThreadNode[];
  /** The own-sub FEED — the user's posts included. Newest first. */
  sub: ThreadNode[];
  follows: ThreadNode[];
  elsewhere: ThreadNode[];
  /** "r/<sub>" with the user's casing, null when no sub configured. */
  mySubName: string | null;
}

/**
 * One cut of the presence report around the USER. Community matching is
 * case-insensitive: threads carry Reddit's URL casing, the profile field
 * carries whatever the user typed. `netFilter` scopes the cut to one
 * network — the per-network boards and tabs pass it (v2).
 */
export function presenceZones(
  report: PresenceReport | null,
  mySub: string,
  netFilter?: 'reddit' | 'hackernews',
): PresenceZones {
  const mySubName = mySub ? `r/${mySub.replace(/^r\//, '')}` : null;
  const subLower = mySubName?.toLowerCase() ?? null;
  const all = (report?.groups.flatMap(g => g.threads) ?? [])
    .filter(th => !netFilter || th.network === netFilter);
  // A thread's LIVENESS is its latest event, not its own age: an old
  // thread someone just answered must float, not sink out of sight.
  // …and only a HUMAN event counts as liveness. AutoModerator posts within
  // seconds of every submission, so a bot-only thread would float to the top
  // of "still alive" forever on the strength of nobody having spoken.
  const activityAt = (th: ThreadNode) =>
    th.replies.reduce((max, r) => (!r.bot && r.timestamp > max ? r.timestamp : max), th.timestamp);
  const byTime = (a: ThreadNode, b: ThreadNode) => activityAt(b).localeCompare(activityAt(a));
  const inSub = (th: ThreadNode) => !!subLower && th.community.toLowerCase() === subLower;
  return {
    all,
    mySubName,
    mine: all.filter(th => th.mine !== 'none').sort(byTime),
    sub: all.filter(inSub).sort(byTime),
    follows: all.filter(th => th.mine === 'none' && !inSub(th) && th.followed).sort(byTime),
    elsewhere: all.filter(th => th.mine === 'none' && !inSub(th) && !th.followed).sort(byTime),
  };
}

/** One arrival: the reply, plus the thread it landed in so a row can name
 *  where it happened without a second lookup. */
export interface FreshReply {
  reply: ThreadNode['replies'][number];
  thread: ThreadNode;
}

/**
 * Replies still UNANSWERED — the to-do list, which is not the inbox.
 *
 * The inbox is keyed on a high-water mark: a reply you have merely LOOKED at
 * is gone from it forever. That is right for "what is new" and wrong for
 * "what is waiting", and the two were the same list — so a reply read in
 * passing and never answered vanished with no trace. Read is not answered.
 *
 * Answered means: you posted in that thread AFTER they spoke, according to
 * the ledger (a participation is logged against the thread url). Nothing
 * else counts, because nothing else is evidence.
 *
 * On the Atom fallback `toMe` is unknown, never guessed — so a reply in a
 * thread you are in counts as possibly-yours rather than being dropped. The
 * ones Reddit's tree confirmed are sorted first.
 */
export function awaitingReplies(
  report: PresenceReport | null,
  ledger: LedgerEntry[],
  netFilter?: 'reddit' | 'hackernews',
): FreshReply[] {
  if (!report) return [];
  const answeredAfter = (thread: ThreadNode, at: string) => ledger.some(
    e => e.kind === 'participation' && e.url === thread.url && e.at > at);
  const out: FreshReply[] = [];
  for (const g of report.groups) {
    for (const thread of g.threads) {
      if (netFilter && thread.network !== netFilter) continue;
      // Somebody else's thread you never spoke in owes you nothing.
      if (thread.mine === 'none' && !thread.replies.some(r => r.toMe)) continue;
      for (const reply of thread.replies) {
        if (reply.bot || reply.toMe === false) continue;
        if (answeredAfter(thread, reply.timestamp)) continue;
        out.push({ reply, thread });
      }
    }
  }
  return out.sort((a, b) =>
    (a.reply.toMe === b.reply.toMe ? 0 : a.reply.toMe ? -1 : 1)
    || b.reply.timestamp.localeCompare(a.reply.timestamp));
}

/**
 * Every reply newer than the mark, FLATTENED — the inbox the app was missing.
 * Until now a new reply was a line inside a card inside a zone: the data was
 * there, the answer to "did someone reply?" was not.
 *
 * @param report The cached presence report; `null` yields an empty inbox.
 * @param marks Per-network high-water marks (see `seenOf`).
 * @param netFilter Scope to one network — the per-network boards pass it.
 * @returns Replies addressed to the user FIRST, then newest — the order the
 *   user would triage in, not the order they were fetched.
 */
export function freshReplies(
  report: PresenceReport | null,
  marks: SeenMarks,
  netFilter?: 'reddit' | 'hackernews',
): FreshReply[] {
  const out: FreshReply[] = [];
  if (!report) return out;
  for (const g of report.groups) {
    for (const thread of g.threads) {
      if (netFilter && thread.network !== netFilter) continue;
      const mark = seenOf(marks, thread.network);
      for (const reply of thread.replies) {
        // The inbox answers "did someone reply?". A bot did not, and a
        // removed comment is not there to be answered (lib/authors.ts).
        if (!reply.bot && reply.timestamp > mark) out.push({ reply, thread });
      }
    }
  }
  // Replies addressed to the user first, then newest.
  return out.sort((a, b) =>
    (a.reply.toMe === b.reply.toMe ? 0 : a.reply.toMe ? -1 : 1)
    || b.reply.timestamp.localeCompare(a.reply.timestamp));
}

/** Unread replies per network — feeds the badges on the network tabs (v2). */
export function unseenByNetwork(report: PresenceReport | null, marks: SeenMarks): Record<string, number> {
  const out: Record<string, number> = {};
  if (!report) return out;
  for (const g of report.groups) {
    for (const th of g.threads) {
      // Same rule as unseenCount — kept identical on purpose: the global
      // KPI and the per-tab badges must never be able to disagree.
      const mark = seenOf(marks, th.network);
      let n = th.replies.filter(r => !r.bot && r.timestamp > mark).length;
      if (th.inMySub && th.mine === 'none' && th.timestamp > mark) n++;
      if (n > 0) out[th.network] = (out[th.network] ?? 0) + n;
    }
  }
  return out;
}
