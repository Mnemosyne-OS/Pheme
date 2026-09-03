/**
 * What each surface actually demands before it tolerates your product.
 *
 * The 9:1 ratio is folklore. What bites, in order of brutality: the community's
 * own rule (many subs ban self-promotion outright, and no amount of
 * participation unlocks that), then the posting gate (account age, karma
 * minimums enforced by AutoModerator), then the imposed format (a flair, a
 * weekly thread), and only then the tone and the ratio.
 *
 * This file is EDITORIAL and DATED — written by a human, checked against the
 * network's own documentation. It is deliberately not generated: a model asked
 * "what are r/LocalLLaMA's rules?" answers with confidence and invents them,
 * and that would be a fabricated claim about a real ban. Per-COMMUNITY rules
 * are a different thing entirely: those are fetched and shown verbatim
 * (doc 75 §2b).
 *
 * ── How a draft has to READ, or it does not get posted ──────────────────────
 *
 * From a real Hacker News test: the draft came back in a register that reads
 * instantly as "brand comment written by an AI". On Reddit and HN that
 * perception is UNRECOVERABLE — it is a product risk, not a matter of style.
 * The rules below are the doctrine; `DraftDoctrine` holds the thresholds a
 * check can enforce, and `buildDraftPrompt` states the rest to the model.
 *
 *  1. SELF-REFERENCE: zero by default. At most one short offer, and only when
 *     the lived experience genuinely carries the point. Never two mentions of
 *     yourself in one draft. And never the VAGUE unnamed kind — "my OS", "my
 *     systems", "my own stack": it reads as bait to be asked, and lands worse
 *     than a name you own. Enforced (`selfRef`, `vagueSelfRef`).
 *  2. NO LINK to the user's own product until the rulebook's gate is open
 *     (`ownLinkAllowed`). The generator must not be able to produce one, even
 *     when asked. Enforced (`ownLink`).
 *  3. NEVER ask a question the source post already answered. The source is
 *     re-read and any such question is dropped or re-aimed at what is really
 *     still open. This is the most expensive mistake in the list: it signals
 *     "I did not read your post", which no amount of substance repairs.
 *  4. GIVE BEFORE ASKING. The reply brings something — a concrete experience,
 *     a fact, a useful correction — before its question.
 *  5. NATIVE REGISTER. Banned: corporate filler and translation-ese ("seems to
 *     address a real need for…", "aligns with the rigorous constraints…",
 *     "would it be possible to consider…"). Short sentences, concrete. Any
 *     flattering preamble is three words at most.
 *  6. LENGTH: `maxSentences` per network — 4 on HN. A wall reads as posture.
 *     Enforced (`sentences`).
 *  7. LANGUAGE: the thread's, never the interface's. Enforced (`language`).
 *  8. A HANDLE THAT LOOKS LIKE A PRODUCT is flagged (`looksLikeBrandHandle`):
 *     a brand account talking about "its" product reads as astroturfing even
 *     when every word is sincere.
 */

import type { StringKey } from './i18n';

/** How much has to be earned before promotion is tolerated. */
export type Demand = 'open' | 'earn' | 'gated';

export interface NetworkRules {
  demand: Demand;
  /**
   * What can stop you posting AT ALL — '' when nothing is known to.
   *
   * A LOCALE KEY, not a sentence: this is the one field a verdict shows, and
   * a French user reading an English warning about a ban is a warning half
   * read. The editorial text lives under that key in `i18n.ts`, in every
   * language, and there is exactly one copy of it.
   */
  gate: StringKey | '';
  /**
   * How the surface treats self-promotion, and what publicly signals standing
   * here. English prose on purpose: this is the editorial RECORD — what was
   * checked, and when — and no surface renders it. Anything that gets rendered
   * moves to a locale key first.
   */
  promo: string;
  standing: string;
  /** Dated, because an undated assertion about someone else's rules rots. */
  checkedAt: string;
  /** How a reply has to READ here to pass for a peer. */
  draft: DraftDoctrine;
}

/**
 * What a draft must respect to read as a human peer rather than as a brand
 * account — per network, because the venues are not comparable.
 *
 * This exists because of a real test on Hacker News: the draft came out in a
 * register that reads instantly as "brand comment written by an AI". On these
 * platforms that perception is unrecoverable — it is a product risk, not a
 * matter of style. The full doctrine is in the file header; these are the
 * thresholds the code can actually enforce.
 */
export interface DraftDoctrine {
  /**
   * Sentences a reply stays under. A wall of text reads as posture: the
   * author is performing expertise instead of answering.
   */
  maxSentences: number;
  /**
   * References to oneself tolerated in ONE draft. Zero is the default a
   * prompt asks for; this is the ceiling a check enforces. Two mentions of
   * yourself in four sentences is an advert with a question mark on the end.
   */
  maxSelfRefs: number;
}

/**
 * Two axes, and they now agree. `demand` (here) is the DOCTRINE — how much has
 * to be earned before promotion is tolerated. `role` (networks.ts) is the UI
 * SHAPE — does Pheme scan here, or compose here? They are separate on purpose,
 * but indiehackers / devto / quora were `open` here and `reputation` there,
 * which is the one combination that cannot be true: it applied a doctrine of
 * restraint to surfaces where publishing your own work is the norm, and made
 * their profile page collect a watch list nothing reads. Fixed in 0.8.2.
 */
export const RULEBOOK: Record<string, NetworkRules> = {
  reddit: {
    demand: 'earn',
    gate: 'gateReddit',
    promo: 'Set PER SUBREDDIT, and often an outright ban. Where it is allowed it is usually framed — a flair, a dedicated day, a single weekly thread. The site-wide 9:1 is a courtesy, not the rule that removes your post.',
    standing: 'Post and comment karma are public on the account. Per-post score and comment count are public. Per-subreddit standing is not published anywhere.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 6, maxSelfRefs: 1 },
  },
  hackernews: {
    demand: 'earn',
    gate: 'gateHackernews',
    promo: 'Tolerated through the "Show HN" format, which has its own rules. Outside it, promotion is expected to be incidental to a real contribution.',
    standing: 'Karma is public on the profile. Story points and comment counts are public.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 4, maxSelfRefs: 1 },
  },
  lobsters: {
    demand: 'gated',
    // The strongest gate in the roster: you cannot participate at all until
    // someone already inside vouches for you.
    gate: 'gateLobsters',
    promo: 'Self-promotion is visible and policed by the community; the submission history of an account is public and read.',
    standing: 'Account history is public.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 4, maxSelfRefs: 1 },
  },
  stackoverflow: {
    demand: 'earn',
    gate: 'gateStackoverflow',
    promo: 'Affiliation must be disclosed. Undisclosed promotion is treated as spam.',
    standing: 'Reputation is public on the profile.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 6, maxSelfRefs: 1 },
  },
  discord: {
    demand: 'earn',
    gate: 'gateDiscord',
    promo: 'Per server, usually a dedicated channel and nowhere else.',
    standing: 'Nothing public and readable from outside.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 6, maxSelfRefs: 1 },
  },
  devto: {
    demand: 'open',
    gate: '',
    promo: 'Publishing about your own work is the norm.',
    standing: 'Reactions and follower counts are public on a post and a profile.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 14, maxSelfRefs: 3 },
  },
  indiehackers: {
    demand: 'open',
    gate: '',
    promo: 'Launches and build-in-public posts are the point of the place.',
    standing: 'Public post history.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 14, maxSelfRefs: 3 },
  },
  quora: {
    demand: 'open',
    gate: '',
    promo: 'Answering with your own product is accepted when the answer stands on its own.',
    standing: 'Views per answer are shown to the author.',
    checkedAt: '2026-08-06',
    draft: { maxSentences: 14, maxSelfRefs: 3 },
  },
};

/** Everything not listed is one of the user's OWN channels: nothing to earn. */
export const PROMOTION_DEFAULT: NetworkRules = {
  demand: 'open',
  gate: '',
  promo: 'Your own channel — promotion is what it is for.',
  standing: 'Whatever the surface publishes about your posts.',
  checkedAt: '2026-08-06',
  draft: { maxSentences: 20, maxSelfRefs: 5 },
};

export const rulesFor = (netId: string): NetworkRules => RULEBOOK[netId] ?? PROMOTION_DEFAULT;

/**
 * Is a link to the user's own product tolerable here at all?
 *
 * Derived from `demand`, never stored twice: the rulebook's gate IS the
 * answer. On an `earn` or `gated` surface the generator must not be able to
 * produce one, even when asked — a link is the single fastest way to convert
 * a good reply into an advert. A per-community `ready` verdict does NOT open
 * this door: that verdict is about participation earned, not about link
 * etiquette in a thread that is somebody else's.
 */
export const ownLinkAllowed = (netId: string): boolean => rulesFor(netId).demand === 'open';

// ── Per-community rules: fetched, never asserted ─────────────────────────────

/**
 * What ONE community says about itself, in its own words. Filled by
 * `lib/redditPublic.ts` from `/r/<sub>/about/rules.json`; `null` everywhere it
 * has not been read, which the verdict treats as UNKNOWN rather than as "no
 * rules". An EMPTY list is the other answer, and a real one: the sub replied
 * and publishes nothing.
 */
export interface CommunityRules {
  community: string;
  /** Rule titles, verbatim — shown to the human, never paraphrased. */
  rules: string[];
  fetchedAt: string;
}

/**
 * Does this community forbid promoting your own work?
 *
 * Matched over the community's OWN words, and the matching line is returned so
 * the interface can show it verbatim beside the verdict. A paraphrase here
 * would be Pheme telling the user what a subreddit thinks.
 *
 * @returns The rule that forbids it, or null. Null on an EMPTY rule list means
 *   "nothing was read", which is not the same as "nothing forbids it" — the
 *   caller distinguishes them by checking the list length itself.
 */
export function promoBanRule(rules: string[]): string | null {
  // Deliberately narrow. A rule saying "self-promotion allowed on Fridays"
  // must NOT read as a ban: over-blocking tells the user a door is shut when
  // it is open, and they never try it again.
  const BAN = /\b(no|not?)\s+(self[\s-]?promo\w*|advertis\w+|solicit\w+|spam)|\b(self[\s-]?promo\w*|advertis\w+)\s+(is\s+)?(banned|prohibited|forbidden|not allowed)/i;
  const ALLOW = /\b(allowed|permitted|welcome|ok)\b/i;
  // A NEGATED permission is not a permission. Rules arrive with their full
  // description attached (lot 2), and those spell the ban out a second time —
  // "No advertising. Ads are not allowed here." — so the raw allow-words test
  // read "allowed", called it a framed permission, and let the ban through.
  const NEGATED = /\b(not|never|no longer|isn'?t|aren'?t|don'?t|do not)\s+(\w+\s+){0,2}?(allowed|permitted|welcome|ok)\b/gi;
  for (const raw of rules) {
    const line = (raw ?? '').trim();
    if (!line || !BAN.test(line)) continue;
    if (ALLOW.test(line.replace(BAN, '').replace(NEGATED, ''))) continue;
    return line;
  }
  return null;
}
