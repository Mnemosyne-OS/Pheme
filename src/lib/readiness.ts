/**
 * The verdict. Mnemosyne RULES on this — it does not hand over numbers for the
 * human to interpret.
 *
 * Two questions, never merged into one score:
 *  - standing — where you are in this community (lib/standing.ts, counted);
 *  - readiness — whether you can talk about your product here without reading
 *    as a drive-by. Standing PLUS what the place demands.
 *
 * Reputation is not the right to launch, but it conditions it. That is the
 * whole shape of this file.
 *
 * Nothing here writes a sentence. A verdict is CODES AND FIGURES, and the view
 * says them in the user's language — except a community's own words, which are
 * carried verbatim and never translated, because a translated ban is a
 * paraphrase and this one is about someone getting banned.
 */
import { promoBanRule, rulesFor, type CommunityRules, type Demand } from './rulebook';
import type { Standing } from './standing';

/**
 * `unknown` is a first-class answer, not a fallback.
 *
 * "You are not ready" and "I cannot tell" are different sentences, and
 * defaulting the second to the first is the most likely silent failure in this
 * engine: it would tell someone to keep grinding in a community where nothing
 * was ever measured.
 *
 * `blocked` matters just as much in the other direction: where the community
 * forbids self-promotion, no volume of participation unlocks anything, and
 * saying so immediately saves the user three weeks.
 */
export type Level = 'unknown' | 'blocked' | 'not-yet' | 'close' | 'ready';

export interface Reason {
  from: 'counted' | 'rule' | 'gate';
  /**
   * The community's OWN words — present only on `from: 'rule'`. Shown exactly
   * as fetched: never paraphrased, never translated.
   */
  text?: string;
  /** A generated line. The view writes it, in the reader's language. */
  code?: 'acts' | 'autonomous' | 'replies' | 'score' | 'karma' | 'gate';
  /** The figure the line is about. */
  n?: number;
  /** How many observations it rests on — absent when it is not a count. */
  sample?: number;
}

/** What is missing to move, which is also the advice. Same rule: no prose. */
export interface Gap {
  code: 'forbidden' | 'nothing-measured' | 'rules-unread' | 'more-replies' | 'promo-raises-bar';
  n?: number;
}

export interface Verdict {
  community: string;
  /** The network id — a view routes on it and reads the rulebook with it. */
  network: string;
  level: Level;
  /** What the verdict rests on, each line saying where it came from. */
  because: Reason[];
  missing: Gap[];
}

/**
 * How many genuine contributions the place expects before a launch reads as
 * legitimate. Not a universal 9:1 — a ladder, because the surfaces are not
 * comparable (doc 75 §1).
 */
const FLOOR: Record<Demand, number> = { open: 0, earn: 8, gated: 12 };

/**
 * What one reply written WITHOUT Pheme is worth, against one written with it.
 *
 * ⚠️ The sign is deliberate and it is the opposite of what a tool normally
 * does. Pheme is a starter, not a crutch: it exists to get someone through the
 * first reply in a room they were not part of, and it has succeeded on the day
 * they answer without opening it. So the acts it did not write are the ones
 * that count double. Anyone reading this as an inverted comparison and
 * "fixing" it would be reversing the product's whole thesis (doc 75 §12).
 *
 * The floor is unchanged, so the ladder is genuinely shorter for someone who
 * has taken over: four solo replies clear an `earn` surface where eight
 * assisted ones are needed. That is the intended reward, not a rounding.
 */
export const AUTONOMOUS_WEIGHT = 2;

/**
 * @param standing  Counted facts, or null when nothing was ever measured here.
 * @param rules     The community's OWN rules, or null when they were not read
 *                  — which is UNKNOWN, never "there are no rules".
 */
export function readiness(
  community: string,
  netId: string,
  standing: Standing | null,
  rules: CommunityRules | null,
): Verdict {
  const net = rulesFor(netId);
  const because: Reason[] = [];
  const missing: Gap[] = [];

  // 1. The community's own words come FIRST. A ban is not a threshold to
  //    climb — it is a closed door, and everything below it is irrelevant.
  const ban = rules ? promoBanRule(rules.rules) : null;
  if (ban) {
    return {
      community,
      network: netId,
      level: 'blocked',
      because: [{ from: 'rule', text: ban }],
      missing: [{ code: 'forbidden' }],
    };
  }

  // 2. An invitation-only surface is a gate, not a workload.
  if (net.demand === 'gated') {
    because.push({ from: 'gate', code: 'gate' });
  }

  // 3. Nothing measured = nothing to say. This is the branch that must never
  //    silently become 'not-yet'.
  //
  //    Every counted quantity that can carry a verdict is named here, solo
  //    acts included. Today they imply `threads > 0` and the extra clause is
  //    redundant — but the guard has to be complete on its own terms, or a
  //    standing built anywhere else could hold four solo acts and still be
  //    announced as "nothing measured here".
  if (!standing || (standing.acts === 0 && standing.autonomous === 0 && standing.threads === 0)) {
    return {
      community,
      network: netId,
      level: 'unknown',
      because,
      missing: [
        { code: 'nothing-measured' },
        ...(rules ? [] : [{ code: 'rules-unread' as const }]),
      ],
    };
  }

  const floor = FLOOR[net.demand];
  because.push({ from: 'counted', code: 'acts', n: standing.acts, sample: standing.acts });
  if (standing.autonomous > 0) {
    because.push({ from: 'counted', code: 'autonomous', n: standing.autonomous, sample: standing.autonomous });
  }
  if (standing.repliesReceived > 0) {
    because.push({ from: 'counted', code: 'replies', n: standing.repliesReceived, sample: standing.threads });
  }
  // An average over one post is a number, not a measurement — the sample
  // rides along so the interface can refuse to dress it up.
  if (standing.avgScore !== null) {
    because.push({ from: 'counted', code: 'score', n: standing.avgScore, sample: standing.scored });
  }
  if (standing.karma !== null) {
    because.push({ from: 'counted', code: 'karma', n: standing.karma });
  }

  if (!rules) missing.push({ code: 'rules-unread' });
  if (net.gate && net.demand !== 'gated') {
    because.push({ from: 'gate', code: 'gate' });
  }

  // 4. The ladder. What was GIVEN first — assisted acts plus the solo ones at
  //    their weight — then the promo surcharge on top, because a community you
  //    have already pitched in owes you less patience than one you have only
  //    given to. Kept as two steps so the two gaps below stay two different
  //    sentences: the workload, and the price of having already pitched.
  const earned = standing.acts + standing.autonomous * AUTONOMOUS_WEIGHT;
  const credit = earned - standing.promo * 2;
  if (earned < floor) missing.push({ code: 'more-replies', n: floor - earned });
  if (standing.promo > 0 && credit < floor) {
    missing.push({ code: 'promo-raises-bar', n: standing.promo });
  }

  const level: Level =
    // Rules unread on a surface where promotion has to be earned: the counted
    // side may look fine and the door still be shut.
    !rules && net.demand !== 'open' ? 'unknown'
      : credit >= floor ? 'ready'
        : credit >= floor - 3 ? 'close'
          : 'not-yet';

  return { community, network: netId, level, because, missing };
}

/** Every community, ruled on. `rulesByCommunity` is keyed by LOWERCASED label. */
export function verdicts(
  standings: Standing[],
  rulesByCommunity: Record<string, CommunityRules | undefined>,
): Verdict[] {
  return standings.map(s =>
    readiness(s.community, s.network, s, rulesByCommunity[s.community.toLowerCase()] ?? null));
}

/**
 * The ONE thing to do next — the dashboard's headline.
 *
 * A blocked community is the most useful thing to surface: it is the only
 * verdict that changes what the user should do rather than how much. Then the
 * one closest to opening, because that is where effort pays.
 */
export function nextMove(all: Verdict[]): Verdict | null {
  return all.find(v => v.level === 'blocked')
    ?? all.find(v => v.level === 'close')
    ?? all.find(v => v.level === 'not-yet')
    ?? null;
}
