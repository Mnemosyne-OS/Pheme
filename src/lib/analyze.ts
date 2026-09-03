/**
 * Onboarding diagnosis — Mnemosyne reads the user's PUBLIC profile and
 * advises against their stated goal.
 *
 * Facts are fetched (Reddit user feed through the gate, HN karma + counts
 * via Firebase/Algolia), then ONE inference call gets: the goal, the hard
 * numbers, and raw samples of the user's recent public writing. The model
 * judges — promo smell, community spread, rhythm — because judging is what
 * it is for; the code only counts. RAG stays ON on purpose: Mnemosyne knows
 * the user's own work from the vaults, so the advice can name what they are
 * actually building.
 */
import { asString } from './coerce';
import { redditFetch } from './redditGate';
import { parseAtom, type PresenceReport } from './presence';
import { ledgerStats, standingBoard } from './selectors';
import { harvest, outcomes, silentOnes } from './outcomes';
import { HN, REDDIT, netOf, type LedgerEntry, type Profile } from './store';

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

export interface ProfileFacts {
  reddit: {
    items: number;
    posts: number;
    comments: number;
    communities: string[];
    spanDays: number | null;
    samples: string[];
  } | null;
  hn: { karma: number | null; stories: number; comments: number } | null;
  rateLimited: boolean;
}

export async function fetchProfileFacts(
  cfg: { redditUser: string; hnUser: string },
  fetchUrl: FetchUrl,
): Promise<ProfileFacts> {
  let reddit: ProfileFacts['reddit'] = null;
  let hn: ProfileFacts['hn'] = null;
  let rateLimited = false;

  if (cfg.redditUser) {
    const r = await redditFetch(fetchUrl, `https://www.reddit.com/user/${cfg.redditUser}/.rss`);
    if (r.ok) {
      const entries = parseAtom(r.body);
      const comments = entries.filter(e => /^\/u\//i.test(e.title)).length;
      const communities = [...new Set(entries
        .map(e => e.url.match(/\/r\/([^/]+)\//)?.[1])
        .filter((s): s is string => !!s))];
      const stamps = entries.map(e => Date.parse(e.timestamp)).filter(Number.isFinite);
      const spanDays = stamps.length >= 2
        ? Math.round((Math.max(...stamps) - Math.min(...stamps)) / 86_400_000)
        : null;
      reddit = {
        items: entries.length,
        posts: entries.length - comments,
        comments,
        communities,
        spanDays,
        samples: entries.slice(0, 6).map(e => `"${e.title.slice(0, 70)}" — ${e.body.slice(0, 90)}`),
      };
    } else if (r.reason !== 'error') {
      rateLimited = true;
    }
  }

  if (cfg.hnUser) {
    let karma: number | null = null;
    let stories = 0;
    let comments = 0;
    try {
      const k = await fetchUrl(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(cfg.hnUser)}.json`);
      if (k.status >= 200 && k.status < 300) {
        // Firebase answers 200 with a literal `null` for an unknown user, and
        // `Number(null)` is 0 — so an account nobody could read was reported
        // to the diagnosis model as a measured karma of ZERO, and judged on
        // it. Same guard as `fetchHn` in presence.ts, which fixed this on its
        // own copy; this one kept the bug. Unknown stays unknown.
        const raw = (JSON.parse(k.body) as { karma?: unknown } | null)?.karma;
        karma = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      }
    } catch { /* profile private or absent — karma stays unknown */ }
    for (const [tag, set] of [['story', (n: number) => { stories = n; }], ['comment', (n: number) => { comments = n; }]] as const) {
      try {
        const r = await fetchUrl(`https://hn.algolia.com/api/v1/search_by_date?tags=${tag},author_${encodeURIComponent(cfg.hnUser)}&hitsPerPage=1`);
        if (r.status >= 200 && r.status < 300) set(Number(JSON.parse(r.body)?.nbHits ?? 0));
      } catch { /* counts stay at zero — the prompt says what is known */ }
    }
    hn = { karma, stories, comments };
  }

  return { reddit, hn, rateLimited };
}

/**
 * Everything Pheme has MEASURED about this user, in one block.
 *
 * The diagnosis used to judge a person on a re-fetch of their Reddit RSS feed
 * and an HN karma number — nothing else. Meanwhile the app had grown a verdict
 * per community, the rules those communities publish, account karma on both
 * networks, and what every post actually became. A judgement passed without
 * any of that is a judgement on a fraction of what is known.
 *
 * Same discipline as the report: this states facts and marks the unmeasured as
 * unmeasured. `not read` and `0` are different sentences, and the model is
 * told which is which so it cannot turn a wall into bad news.
 */
export function buildMeasuredBrief(p: {
  profile: Profile;
  ledger: LedgerEntry[];
  presence: PresenceReport | null;
}): string {
  const { profile, ledger, presence } = p;
  const board = standingBoard(ledger, presence);
  const { participation, promo, ratioOk } = ledgerStats(ledger, presence);
  const done = outcomes(presence);
  const got = harvest(done);
  const reddit = netOf(profile, REDDIT);
  const hn = netOf(profile, HN);
  const num = (v: number | null, unit = '') => (v === null ? 'NOT MEASURED' : `${v}${unit}`);

  const lines = [
    `Watching: reddit ${reddit.targets.join(', ') || 'nothing'}; HN ${hn.targets.join(', ') || 'nothing'}.`,
    `Their own ledger: ${participation} genuine replies, ${promo} promotional posts.`
    + ` The 9:1 courtesy ${ratioOk ? 'holds' : 'is BROKEN'} — counted over the logged replies AND the ones below that this app never drafted.`,
    `Public account karma: reddit ${num(presence?.redditAccount?.total ?? null)}, HN ${num(presence?.hnKarma ?? null)}.`,
  ];

  // Kept as its own sentence, and outside the ledger line, because it is NOT
  // part of that count: these are the replies the ledger never saw. Worth
  // saying out loud — the app is designed to make itself unnecessary, so this
  // is the number that says whether it is working (doc 75 §12).
  const solo = board.rows.reduce((n, r) => n + r.autonomous, 0);
  if (solo > 0) {
    lines.push(
      `Beyond that ledger, ${solo} further replies of theirs are visible in their public feed that this app never drafted`
      + ' — they wrote those alone. That is the goal, not a gap to close.',
    );
  }

  if (board.verdicts.length > 0) {
    lines.push('Per-community verdict, from their acts AND the community\'s own published rules:');
    for (const v of board.verdicts.slice(0, 12)) {
      const row = board.rows.find(r => r.community === v.community);
      lines.push(
        `- ${v.community}: ${v.level.toUpperCase()} (${row?.acts ?? 0} replies logged here`
        + `, ${row?.autonomous ?? 0} further ones written without this app, ${row?.promo ?? 0} promos)`,
      );
    }
  } else {
    lines.push('No community has any measured activity yet.');
  }

  const unread = Object.entries(board.unread);
  if (unread.length > 0) {
    lines.push(
      `Rules NOT read for: ${unread.map(([c, why]) => `${c} (${why})`).join(', ')}.`
      + ' Unknown, NOT "these communities have no rules" — do not treat them as open.',
    );
  }

  lines.push(
    `What their posts became: ${done.length} tracked, ${num(got.points)} points`
    + `${got.points === null ? ' (no source published a score)' : ` across ${got.scored} of them`}`
    + `, ${got.replies} human replies received.`,
  );
  const silent = silentOnes(done).length;
  if (silent > 0) {
    lines.push(`${silent} of those posts are past three days with no human reply — a measured silence, not a missing measurement.`);
  }
  return lines.join('\n');
}

const GOAL_LINE: Record<string, string> = {
  launch: 'launch and promote a product without being read as a spammer',
  authority: 'build long-term authority and reputation in their field',
  watch: 'watch their field and learn, participating occasionally',
};

export function buildDiagnosisPrompt(
  goal: string,
  topics: string[],
  facts: ProfileFacts,
  langName: string,
  /**
   * Everything the app has MEASURED (buildMeasuredBrief). Optional only so a
   * caller without a presence report still works — but every real caller
   * passes it, because a verdict on a fraction of what is known is a worse
   * verdict, not a shorter one.
   */
  measured?: string,
): string {
  const r = facts.reddit;
  const h = facts.hn;
  return [
    `A user wants to: ${GOAL_LINE[goal] ?? goal}. Their expertise topics: ${topics.slice(0, 6).join(', ') || 'unknown'}.`,
    'Their PUBLIC footprint, fetched just now:',
    r ? `Reddit (recent feed): ${r.items} items (${r.posts} posts, ${r.comments} comments) across ${r.communities.length} communities (${r.communities.slice(0, 5).join(', ')}), span ${r.spanDays ?? '?'} days. Samples:\n${r.samples.join('\n')}` : 'Reddit: no username given or unreachable.',
    h ? `Hacker News: karma ${h.karma ?? 'unknown'}, ${h.stories} stories, ${h.comments} comments all-time.` : 'Hacker News: no username given.',
    measured ? `\nWHAT PHEME HAS MEASURED SO FAR (their ledger, the verdict engine, what their posts became):\n${measured}` : '',
    measured
      ? '\nJudge against ALL of the above, not the feed alone. Anything marked NOT MEASURED is unknown:'
        + ' say so, never call it zero and never treat an unread rulebook as permission.'
        + ' Do not state a number that is not written above.'
      : '',
    '',
    'You also know this user\'s actual work from memory context. Judge frankly — promo smell, genuine participation, spread. No flattery: a thin or promotional footprint is said plainly.',
    'Answer with ONE JSON object and NOTHING else — no markdown, no code fence, no text around it:',
    '{"summary":"two frank sentences","verdicts":[{"platform":"Reddit","ready":false,"why":"one sentence"}],"plan":{"repliesPerWeek":5,"weeksBeforeLaunch":3,"topics":["topic"]},"rules":["3 short do/don\'t rules for THIS user"]}',
    `Verdicts only for platforms with data above. Numbers are integers (weeksBeforeLaunch null if the goal is not a launch). Every free-text value in ${langName}.`,
  ].join('\n');
}

// ── Structured diagnosis — parsed once, rendered as tiles + timeline ─────────

export interface DiagnosisData {
  summary: string;
  verdicts: { platform: string; ready: boolean; why: string }[];
  plan: { repliesPerWeek: number | null; weeksBeforeLaunch: number | null; topics: string[] };
  rules: string[];
}

/** Tolerant extraction — models decorate JSON in creative ways. Null = keep raw text. */
export function parseDiagnosis(raw: string): DiagnosisData | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    // Models quote scalars ("5", "true") as readily as they write them bare.
    // Rejecting the quoted form made whole tiles vanish, and turned a
    // "ready" verdict into "not yet" — a wrong value shown confidently.
    const num = (x: unknown) => {
      const n = typeof x === 'string' ? Number(x.trim()) : x;
      return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null;
    };
    const bool = (x: unknown) =>
      x === true || (typeof x === 'string' && /^(true|yes|oui)$/i.test(x.trim()));
    const verdicts = Array.isArray(j.verdicts)
      ? j.verdicts.flatMap((v) => {
          const o = v as Record<string, unknown>;
          const platform = asString(o.platform, '').trim();
          return platform ? [{ platform, ready: bool(o.ready), why: asString(o.why, '').trim() }] : [];
        })
      : [];
    const plan = (j.plan ?? {}) as Record<string, unknown>;
    const data: DiagnosisData = {
      summary: asString(j.summary, '').trim(),
      verdicts,
      plan: {
        repliesPerWeek: num(plan.repliesPerWeek),
        weeksBeforeLaunch: num(plan.weeksBeforeLaunch),
        topics: Array.isArray(plan.topics) ? plan.topics.map(x => String(x).trim()).filter(Boolean).slice(0, 6) : [],
      },
      rules: Array.isArray(j.rules) ? j.rules.map(x => String(x).trim()).filter(Boolean).slice(0, 5) : [],
    };
    return data.summary || data.verdicts.length ? data : null;
  } catch { return null; }
}

/**
 * Plain readable text from the structured diagnosis — what the Coach and
 * Dashboard show, and what the voice reads. No markdown, ever.
 */
export function diagnosisToText(
  d: DiagnosisData,
  L: { ready: string; notReady: string; plan: string; perWeek: string; weeks: string; rules: string },
): string {
  const lines: string[] = [];
  if (d.summary) lines.push(d.summary);
  for (const v of d.verdicts) lines.push(`${v.platform} — ${v.ready ? L.ready : L.notReady}. ${v.why}`.trim());
  const bits: string[] = [];
  if (d.plan.repliesPerWeek !== null) bits.push(`${d.plan.repliesPerWeek} ${L.perWeek}`);
  if (d.plan.weeksBeforeLaunch !== null) bits.push(`${d.plan.weeksBeforeLaunch} ${L.weeks}`);
  if (d.plan.topics.length) bits.push(d.plan.topics.join(', '));
  if (bits.length) lines.push(`${L.plan} : ${bits.join(' · ')}`);
  if (d.rules.length) lines.push(`${L.rules} :\n${d.rules.join('\n')}`);
  return lines.join('\n\n');
}
