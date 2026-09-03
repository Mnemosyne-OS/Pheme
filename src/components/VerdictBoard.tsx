/**
 * The verdict, on screen — doc 75 §5.
 *
 * Mnemosyne RULES here rather than handing over a table of numbers. One row
 * per community, because reputation is not fungible and there is no global
 * figure to show. Three things carry the whole design:
 *
 *  - **A wall is not an answer.** `unknown` is printed as "can't tell", with
 *    the reason, and never dressed up as "not ready" or as a clean slate.
 *  - **Every count shows its sample.** An average over one post is a number,
 *    not a measurement, and the row says so.
 *  - **A community's rules are quoted, never summarised.** They sit one click
 *    from the verdict, in the community's own words, untranslated.
 */
import { rulesFor } from '../lib/rulebook';
import type { Gap, Level, Reason, Verdict } from '../lib/readiness';
import { standingFor, type StandingBoard } from '../lib/selectors';
import type { CommunityRules } from '../lib/rulebook';
import type { Unread } from '../lib/redditPublic';
import type { StringKey } from '../lib/i18n';
import type { T } from './shared';

const LEVEL_LABEL: Record<Level, StringKey> = {
  ready: 'vReady', close: 'vClose', 'not-yet': 'vNotYet', blocked: 'vBlocked', unknown: 'vUnknown',
};

/** Tone per verdict — `blocked` is the loudest on purpose: it saves weeks. */
const LEVEL_TONE: Record<Level, string> = {
  ready: 'ready', close: 'close', 'not-yet': 'notyet', blocked: 'blocked', unknown: 'unknown',
};

const WHY_LABEL: Record<Unread, StringKey> = {
  'not-read': 'whyNotRead', walled: 'whyWalled', limited: 'whyLimited', error: 'whyError',
};

export function LevelTag({ t, level }: { t: T; level: Level }) {
  return <span className={`vTag ${LEVEL_TONE[level]}`}>{t(LEVEL_LABEL[level])}</span>;
}

/**
 * One line of reasoning, written HERE and not in the engine.
 *
 * The verdict carries codes and figures; the sentence is the view's job, so a
 * French reader gets a French reason. The one exception is `from: 'rule'`,
 * which is the community's own wording: translating a ban would paraphrase it,
 * and this is the sentence someone gets banned over.
 */
export function reasonLine(t: T, r: Reason, netId: string): string {
  if (r.from === 'rule') return r.text ?? '';
  if (r.from === 'gate') {
    const key = rulesFor(netId).gate;
    return key ? t(key) : '';
  }
  switch (r.code) {
    case 'acts': return `${r.n} ${t(r.n === 1 ? 'rAct' : 'rActs')}`;
    case 'autonomous': return `${r.n} ${t(r.n === 1 ? 'rSolo' : 'rSolos')}`;
    case 'replies': return `${r.n} ${t('rReplies')} ${r.sample} ${t('rThreads')}`;
    case 'score': return `${t('rScore')} ${r.n} ${t('rOver')} ${r.sample} ${t('rPosts')}`;
    case 'karma': return `${r.n} ${t('rKarma')}`;
    default: return '';
  }
}

/**
 * How a reason reads on screen.
 *
 * `verbatim` is the community's own words; `solo` marks the acts written
 * without Pheme, which are the ones that weigh double — a line that changes
 * the verdict more than its neighbours should not look identical to them.
 */
export function reasonClass(r: Reason): string | undefined {
  if (r.from === 'rule') return 'verbatim';
  if (r.code === 'autonomous') return 'solo';
  return undefined;
}

/** What is missing — which is also the advice. Same rule: the view writes it. */
export function gapLine(t: T, g: Gap): string {
  switch (g.code) {
    case 'forbidden': return t('gForbidden');
    case 'nothing-measured': return t('gNothing');
    case 'rules-unread': return t('gRulesUnread');
    case 'more-replies': return `${g.n} ${t('gMoreReplies')}`;
    case 'promo-raises-bar': return `${g.n}× — ${t('gPromoBar')}`;
    default: return '';
  }
}

/**
 * The community's own words, or an honest account of why they are absent.
 *
 * The distinction this makes is the one that matters most in the whole file: a
 * community that ANSWERED and publishes nothing is not the same as one whose
 * rules Reddit refused us. Collapsing them would tell someone a door is open
 * on the strength of a 403.
 */
function RulesBlock({ t, rules, why }: { t: T; rules?: CommunityRules; why?: Unread }) {
  if (!rules) {
    return <p className="hint">{t(WHY_LABEL[why ?? 'not-read'])}</p>;
  }
  if (rules.rules.length === 0) return <p className="hint">{t('vRulesNone')}</p>;
  return (
    <details className="vRules">
      <summary>{t('vRulesLabel')} · {rules.rules.length} {t('vRulesRead')}</summary>
      <ul>
        {rules.rules.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    </details>
  );
}

/**
 * The headline: the single move that unblocks the most (doc 75 §5.1).
 *
 * Renders nothing when nothing is decidable — an empty verdict list means the
 * app has not measured anything yet, and a confident headline over no data is
 * exactly what this engine exists to avoid.
 */
export function NextMove({ t, board, rules, onGoNet }: {
  t: T;
  board: StandingBoard;
  rules: Record<string, CommunityRules>;
  onGoNet?: (net: string) => void;
}) {
  const next = board.next;
  if (!next) return null;
  const key = next.community.toLowerCase();
  return (
    <section className="nextMove">
      <label>{t('vNextHead')}</label>
      <h3>
        <LevelTag t={t} level={next.level} /> {next.community}
        {onGoNet && next.network && (
          <button className="mini" style={{ marginLeft: 10, marginTop: 0 }}
            onClick={() => onGoNet(next.network)}>{t('vOpenNet')}</button>
        )}
      </h3>
      <ul className="because">
        {next.missing.map((g, i) => <li key={`g${i}`}>{gapLine(t, g)}</li>)}
        {next.because.map((r, i) => (
          <li key={`r${i}`} className={reasonClass(r)}>
            {reasonLine(t, r, next.network)}
            {r.sample !== undefined && r.code !== 'acts' && r.code !== 'autonomous'
              && ` · ${t('vSample')} ${r.sample}`}
          </li>
        ))}
      </ul>
      <RulesBlock t={t} rules={rules[key]} why={board.unread[key]} />
    </section>
  );
}

/**
 * One row per community: the verdict, what it rests on, and the sample behind
 * each figure. `limit` trims the table on a crowded surface — the full list
 * always exists, nothing is silently dropped without the caller asking.
 */
export function VerdictTable({ t, board, rules, limit }: {
  t: T;
  board: StandingBoard;
  rules: Record<string, CommunityRules>;
  limit?: number;
}) {
  if (board.verdicts.length === 0) return <p className="hint">{t('vEmpty')}</p>;
  const shown = limit ? board.verdicts.slice(0, limit) : board.verdicts;
  return (
    <table className="stats vTable">
      <tbody>
        {shown.map((v: Verdict) => {
          const key = v.community.toLowerCase();
          const st = standingFor(board, v.community);
          return (
            <tr key={v.community}>
              <td>
                <strong>{v.community}</strong>
                {/* The karma is per ACCOUNT, so it repeats down a network's
                    rows — and stays absent rather than showing 0 when it was
                    never read. */}
                {st?.karma !== null && st?.karma !== undefined && (
                  <span className="karma"> · {st.karma} {t('rKarma')}</span>
                )}
              </td>
              <td><LevelTag t={t} level={v.level} /></td>
              <td>
                <ul className="because">
                  {v.because.map((r, i) => (
                    <li key={`r${i}`} className={reasonClass(r)}>
                      {reasonLine(t, r, v.network)}
                      {r.sample !== undefined && r.code !== 'acts' && r.code !== 'autonomous'
                        && ` · ${t('vSample')} ${r.sample}`}
                    </li>
                  ))}
                  {v.missing.map((g, i) => <li key={`g${i}`} className="gap">{gapLine(t, g)}</li>)}
                </ul>
                <RulesBlock t={t} rules={rules[key]} why={board.unread[key]} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
