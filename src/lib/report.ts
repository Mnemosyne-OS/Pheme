/**
 * The reputation report — doc 75 §6, global or for one network, on demand.
 *
 * ## The inversion rule
 *
 * **The model writes the words. It never writes the numbers.**
 *
 * Every figure in a report comes from the ledger, from presence, or from the
 * verdict engine, and is rendered by the code in `reportFacts`. The model is
 * handed those figures and asked for prose around them. That is the same rule
 * the posters follow, and it exists because the failure it prevents is
 * specific and expensive: a beautifully written report claiming "+40 %
 * engagement this month" that nobody ever measured, which the user then
 * repeats to somebody else.
 *
 * ## And it is enforced, not requested
 *
 * A prompt saying "do not invent numbers" is a wish. `auditNumbers` reads the
 * prose back and lists every figure in it that is not in the fact sheet. If
 * anything is unbacked, the narrative is REFUSED — the facts still stand on
 * their own, and the user is told which figure was made up. A report is a
 * thing people forward; it does not get the benefit of the doubt.
 */
import type { LedgerEntry } from './store';
import type { PresenceReport } from './presence';
import { presenceZones, standingBoard, type StandingBoard } from './selectors';
import { since, type Since } from './history';
import type { Level } from './readiness';

/** One counted line of the report. `value` is the ONLY numeric truth there is. */
export interface Fact {
  /** What this measures — the view labels it, the model is given it in English. */
  code:
    | 'replies' | 'solo' | 'promos' | 'communities' | 'threads' | 'repliesReceived'
    | 'karmaReddit' | 'karmaHn' | 'ready' | 'close' | 'blocked' | 'unknown'
    | 'rulesRead' | 'rulesUnread';
  /** `null` = never measured. It is printed as a dash and never as a zero. */
  value: number | null;
}

export interface ReportFacts {
  /** '' for the global report, a network id for a scoped one. */
  network: string;
  facts: Fact[];
  /** Verdict per community, so the prose has something concrete to talk about. */
  communities: { community: string; level: Level; acts: number; solo: number; promo: number }[];
  /** Communities whose rules could not be read, and why — stated, never hidden. */
  unread: { community: string; why: string }[];
  /** When the counts were taken. A report without a date rots silently. */
  at: string;
  /** How old the presence data behind it is — '' when there is none. */
  presenceAt: string;
  /**
   * What moved since a DATED baseline, or `null` when Pheme has not been
   * running long enough to have one. This is the only period comparison that
   * exists, and it exists because the counts are now written down (lib/history)
   * — before that any "+3 since last month" was invented at the source.
   */
  since: Since | null;
}

const countLevel = (board: StandingBoard, level: Level) =>
  board.verdicts.filter(v => v.level === level).length;

/**
 * Everything the report is allowed to say in figures.
 *
 * Nothing here is estimated, extrapolated or compared to a previous period:
 * Pheme has no history of these counts, so a "+3 since last month" would be
 * invented at the source rather than by the model.
 */
export function reportFacts(
  ledger: LedgerEntry[],
  presence: PresenceReport | null,
  network?: string,
): ReportFacts {
  const board = standingBoard(ledger, presence, network);
  const scoped = network
    ? ledger.filter(e => board.rows.some(r => r.community === e.community))
    : ledger;
  const zones = presenceZones(presence, '', network === 'reddit' || network === 'hackernews' ? network : undefined);
  const mine = zones.mine;

  const karmaReddit = presence?.redditAccount?.total ?? null;
  const karmaHn = presence?.hnKarma ?? null;
  const rulesRead = Object.keys(presence?.rules ?? {}).length;
  const unreadKeys = Object.entries(board.unread);

  const facts: Fact[] = [
    { code: 'replies', value: scoped.filter(e => e.kind === 'participation').length },
    // Counted from presence, not the ledger — by definition these are the acts
    // the ledger never saw (lib/authorship).
    { code: 'solo', value: board.rows.reduce((n, r) => n + r.autonomous, 0) },
    { code: 'promos', value: scoped.filter(e => e.kind === 'promo').length },
    { code: 'communities', value: board.rows.length },
    { code: 'threads', value: mine.length },
    {
      code: 'repliesReceived',
      value: board.rows.reduce((n, r) => n + r.repliesReceived, 0),
    },
    // Absent karma stays absent. A 0 here reads as "nobody upvoted you ever".
    ...(network === 'hackernews' ? [] : [{ code: 'karmaReddit' as const, value: karmaReddit }]),
    ...(network === 'reddit' ? [] : [{ code: 'karmaHn' as const, value: karmaHn }]),
    { code: 'ready', value: countLevel(board, 'ready') },
    { code: 'close', value: countLevel(board, 'close') },
    { code: 'blocked', value: countLevel(board, 'blocked') },
    { code: 'unknown', value: countLevel(board, 'unknown') },
    { code: 'rulesRead', value: rulesRead },
    { code: 'rulesUnread', value: unreadKeys.length },
  ];

  const sheet: ReportFacts = {
    network: network ?? '',
    facts,
    communities: board.verdicts.map(v => {
      const row = board.rows.find(r => r.community === v.community);
      return {
        community: v.community, level: v.level,
        acts: row?.acts ?? 0, solo: row?.autonomous ?? 0, promo: row?.promo ?? 0,
      };
    }),
    unread: unreadKeys.map(([community, why]) => ({ community, why })),
    at: new Date().toISOString(),
    presenceAt: presence?.at ?? '',
    since: null,
  };
  // Read AFTER the sheet exists — `since` compares today's facts against the
  // stored ones, and it is null until a baseline is actually old enough.
  sheet.since = since(sheet);
  return sheet;
}

/** English labels for the prompt only — the SCREEN reads these from i18n. */
const FACT_EN: Record<Fact['code'], string> = {
  replies: 'genuine replies logged in this app',
  solo: 'FURTHER replies they wrote WITHOUT this app — seen in their public feed, never drafted here. Not a share of the line above: the two counts are separate',
  promos: 'promotional posts logged',
  communities: 'communities with any measured activity',
  threads: 'threads of their own currently tracked',
  repliesReceived: 'human replies received on those threads',
  karmaReddit: 'Reddit account karma',
  karmaHn: 'Hacker News karma',
  ready: 'communities ruled READY to launch in',
  close: 'communities ruled CLOSE',
  blocked: 'communities that FORBID self-promotion',
  unknown: 'communities where the verdict is UNKNOWN',
  rulesRead: 'communities whose own rules have been read',
  rulesUnread: 'communities whose rules could NOT be read',
};

/**
 * The prompt. Facts in, prose out — and the boundary is spelled out twice
 * because it is the only thing that matters here.
 */
export function buildReportPrompt(f: ReportFacts, langName: string, netName: string): string {
  const measured = f.facts
    .map(x => `- ${FACT_EN[x.code]}: ${x.value === null ? 'NOT MEASURED' : x.value}`)
    .join('\n');
  const communities = f.communities.length
    ? f.communities.slice(0, 12)
      // Two DISJOINT counts, never a total and a share of it: `acts` are the
      // replies logged here, `solo` the ones only their public feed knows
      // about. "N of them" would hand the model a subset that does not exist.
      .map(c => `- ${c.community}: verdict ${c.level}, ${c.acts} replies logged here, ${c.solo} further replies written without this app, ${c.promo} promos`)
      .join('\n')
    : '- none measured yet';
  // The ONLY comparison that exists, and only when a dated baseline does.
  const moved = f.since && Object.keys(f.since.deltas).length > 0
    ? `\nWHAT MOVED since ${f.since.day} (measured, not estimated):\n`
      + Object.entries(f.since.deltas)
        .map(([code, d]) => `- ${FACT_EN[code as Fact['code']]}: ${d > 0 ? '+' : ''}${d}`)
        .join('\n')
    : '';
  return [
    `Write the narrative of a reputation report${netName ? ` for ${netName}` : ' across every network'}.`,
    '',
    'THE MEASURED FACTS — the only figures that exist:',
    measured,
    moved,
    f.since ? '' : '\nThere is NO earlier measurement to compare against. Do not describe a trend.',
    '',
    'PER COMMUNITY:',
    communities,
    f.unread.length
      ? `\nRULES THAT COULD NOT BE READ (unknown, NOT "no rules"): ${f.unread.map(u => u.community).join(', ')}`
      : '',
    '',
    'ABSOLUTE RULE, and the report is discarded if you break it:',
    'DO NOT WRITE ANY NUMBER that is not in the lists above. No percentages, no averages,',
    'no "roughly", and no comparison beyond the measured movement given above — anything',
    'else was never measured, and inventing it would be a false claim the user then',
    'repeats to someone else.',
    'A fact marked NOT MEASURED is unknown: say it is unknown, never call it zero.',
    'The figures are already printed beside your text, so do not restate them — interpret them.',
    '',
    `Write 3 short paragraphs in ${langName}: where they stand, what is blocking them, what to do next.`,
    'Plain prose. No markdown, no headings, no bullet points, no asterisks.',
  ].filter(Boolean).join('\n');
}

/**
 * Every number the prose is ALLOWED to contain.
 *
 * The measured values, plus the small integers that appear in ordinary
 * sentences ("the first thing", "three weeks") and the years — blocking those
 * would reject honest prose and teach us to ignore the audit.
 */
function allowedNumbers(f: ReportFacts): Set<string> {
  const ok = new Set<string>();
  for (const x of f.facts) if (x.value !== null) ok.add(String(x.value));
  for (const c of f.communities) {
    ok.add(String(c.acts)); ok.add(String(c.solo)); ok.add(String(c.promo));
  }
  // A movement is measured too — it comes from two dated snapshots, not from
  // the model. Its magnitude is what may be written; the sign is prose.
  for (const d of Object.values(f.since?.deltas ?? {})) ok.add(String(Math.abs(d)));
  // The baseline's date is quotable: it is the one thing that makes "since"
  // checkable rather than vague.
  if (f.since) for (const part of f.since.day.split('-')) ok.add(String(Number(part)));
  // Small integers that live in ordinary sentences ("the first two things"),
  // and the 9:1 the app's own doctrine talks in. NOT zero: "0 replies
  // received" where nothing was measured is the exact fabrication this guards.
  for (const n of ['1', '2', '3', '9']) ok.add(n);
  return ok;
}

/**
 * Read the prose back and list every figure that is not in the fact sheet.
 *
 * ⚠️ What it CANNOT catch: a zero. If any measured fact is 0, then "0" is in
 * the allowed set, and a sentence calling an UNMEASURED value zero reads
 * exactly like a quotation of that other fact. No set of numbers can separate
 * the two. The defence there is the fact sheet, which prints an unmeasured
 * value as a dash — the reader sees "—" beside karma while the prose says
 * zero — and the prompt, which says outright that NOT MEASURED is unknown.
 *
 * @returns The unbacked figures, verbatim. Empty = the narrative is clean.
 *   The caller REFUSES a non-empty result rather than publishing it with a
 *   caveat: a report is forwarded, and the caveat is what gets dropped.
 */
export function auditNumbers(prose: string, f: ReportFacts): string[] {
  const ok = allowedNumbers(f);
  const bad: string[] = [];
  // Any digit run with what is attached to it — "40 %", "1,200", "3.5x" — so
  // the user is shown the claim as it was written, not a stripped version.
  for (const m of prose.matchAll(/\d[\d.,]*\s*%?/g)) {
    const raw = m[0].trim();
    const bare = raw.replace(/[%\s,]/g, '').replace(/\.$/, '');
    if (!bare) continue;
    // A year inside a date is prose, not a measurement.
    if (/^(19|20)\d{2}$/.test(bare)) continue;
    // A percentage is ALWAYS unbacked: Pheme computes no rate anywhere, so
    // there is no reading of the fact sheet that could justify one.
    if (!raw.includes('%') && ok.has(bare)) continue;
    if (!bad.includes(raw)) bad.push(raw);
  }
  return bad;
}
