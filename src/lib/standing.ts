/**
 * Where the user actually stands, COMMUNITY BY COMMUNITY.
 *
 * Reputation is not fungible: 500 karma in r/LocalLLaMA buys nothing in
 * r/selfhosted. A single global figure would be a number that reads as
 * objective and means nothing — so there is no global figure here, and no
 * score anywhere. Only counted facts, each carrying the size of the sample it
 * rests on, and `null` wherever nothing was measured.
 *
 * `null` is the load-bearing value in this file. "I have not measured this"
 * and "this is zero" are different sentences, and collapsing them is how a
 * dashboard ends up telling someone their work got no reaction when nobody
 * ever looked (see `fabricated-values` across this cartridge).
 */
import { isSoloAct, ledgerKeys } from './authorship';
import { isHumanVoice } from './authors';
import type { PresenceReport } from './presence';
import type { LedgerEntry } from './store';

export interface Standing {
  community: string;
  network: string;
  /** Genuine replies the user logged here — the ones Pheme helped write. */
  acts: number;
  /**
   * Replies the user left here that Pheme never touched: present in their
   * public feed, absent from its ledger (lib/authorship).
   *
   * Comments only, never their own posts. A post of theirs may BE the promo,
   * and nothing here can tell — counting it would let a launch quietly pay for
   * itself. So an unclassifiable act stays out of the credit rather than
   * funding it.
   *
   * Counted on BOTH networks since 0.9.8. Nothing here changed for that —
   * this already read `mine === 'comment'`; it was presence that never
   * produced one on Hacker News (doc 75 §13).
   */
  autonomous: number;
  /** Promo acts logged here. */
  promo: number;
  /** Threads of theirs Pheme is tracking in this community. */
  threads: number;
  /** Human replies received on those threads — bots never count. */
  repliesReceived: number;
  /**
   * Average score of their items here — and `null` when NO source gave one.
   * `scored` says how many it rests on: an average over one post is a number,
   * not a measurement, and the interface has to be able to say so.
   */
  avgScore: number | null;
  scored: number;
  /**
   * Account-level karma from a public source — Reddit's `/about.json`, HN's
   * profile (doc 75 lot 2). `null` = never read, or unreadable: a walled
   * endpoint and a suspended account both leave it absent, never at 0.
   */
  karma: number | null;
  /** Last time the user did something here, from their own ledger. '' = never. */
  lastActAt: string;
}

const empty = (community: string, network: string): Standing => ({
  community, network,
  acts: 0, autonomous: 0, promo: 0, threads: 0, repliesReceived: 0,
  avgScore: null, scored: 0, karma: null, lastActAt: '',
});

/**
 * The network a community label belongs to. Ledger entries carry the radar's
 * labels — `r/<sub>` on Reddit, `HN · <query>` or the display name on Hacker
 * News — and that prefix is the only join available.
 */
export function networkOf(community: string): string {
  if (/^r\//i.test(community)) return 'reddit';
  if (community === 'Hacker News' || /^HN\b/.test(community)) return 'hackernews';
  return '';
}

/**
 * Account-level karma on the network a row belongs to — the same figure on
 * every community of that network, because that is what it is: Reddit
 * publishes ONE karma per account and nothing per subreddit.
 *
 * It rides along anyway, because a verdict is per community and has to be
 * able to cite it there. `null` for a network that publishes nothing, and for
 * one that was simply never read — the two are the same sentence here: not
 * measured.
 */
function accountKarma(presence: PresenceReport | null, network: string): number | null {
  if (network === 'hackernews') return presence?.hnKarma ?? null;
  if (network === 'reddit') return presence?.redditAccount?.total ?? null;
  return null;
}

/**
 * Fold the ledger and the presence report into one row per community.
 *
 * Both sources are partial by nature — the ledger holds what the user marked,
 * presence holds the threads a run managed to reconstruct — so a community can
 * appear in one and not the other. Everything is counted where it is found and
 * left at `null` where it is not.
 */
export function standings(
  ledger: LedgerEntry[],
  presence: PresenceReport | null,
): Standing[] {
  const by = new Map<string, Standing>();
  const row = (community: string) => {
    const key = community.toLowerCase();
    const found = by.get(key) ?? empty(community, networkOf(community));
    by.set(key, found);
    return found;
  };

  for (const e of ledger) {
    if (!e.community) continue;
    const s = row(e.community);
    if (e.kind === 'participation') s.acts++; else s.promo++;
    if (e.at > s.lastActAt) s.lastActAt = e.at;
  }

  // Every thread this app had a hand in. Anything the user is present in and
  // this set does not contain, they wrote alone.
  const written = ledgerKeys(ledger);

  const scoreSum = new Map<string, number>();
  for (const g of presence?.groups ?? []) {
    for (const th of g.threads) {
      // Only the user's OWN presence says anything about their standing: a
      // thread they merely watched is somebody else's reputation.
      if (th.mine === 'none') continue;
      const s = row(th.community || g.community);
      if (!s.network) s.network = th.network;
      s.threads++;
      s.repliesReceived += th.replies.filter(isHumanVoice).length;
      // The subtraction is also what stops a double count: a reply written
      // THROUGH Pheme lands in the ledger and, a refresh later, in this feed
      // too. Excluding it here is the same operation as detecting the other.
      if (isSoloAct(th, written)) s.autonomous++;
      if (typeof th.myScore === 'number') {
        s.scored++;
        const k = s.community.toLowerCase();
        scoreSum.set(k, (scoreSum.get(k) ?? 0) + th.myScore);
      }
    }
  }

  for (const [key, s] of by) {
    s.avgScore = s.scored > 0
      ? Math.round(((scoreSum.get(key) ?? 0) / s.scored) * 10) / 10
      : null;
    s.karma = accountKarma(presence, s.network);
  }
  // Busiest first — where the user has actually invested comes first.
  return [...by.values()].sort((a, b) =>
    (b.acts + b.threads) - (a.acts + a.threads) || a.community.localeCompare(b.community));
}

/** One community's row, or null when there is nothing measured about it. */
export const standingOf = (all: Standing[], community: string): Standing | null =>
  all.find(s => s.community.toLowerCase() === community.toLowerCase()) ?? null;
