/**
 * The control room. Everything it shows is derived from local state and
 * caches — the dashboard never fetches: KPIs, the weekly pulse, readiness,
 * and a short list of NEXT BEST ACTIONS computed from what is actually
 * stale, unread or promising right now. Every tile is a door.
 */
import { useMemo, useState } from 'react';
import { bridge } from '../lib/bridge';
import { cooldownRemainingMin } from '../lib/redditGate';
import { COST_PERIODS, costRows, netCosts, type CostPeriod, type CostTask } from '../lib/costs';
import type { MemoryPrefs } from '../lib/memory';
import { NETWORKS } from '../lib/networks';
import type { PresenceReport } from '../lib/presence';
import type { ScoredItem } from '../lib/score';
import { freshReplies, ledgerStats, presenceZones, standingBoard } from '../lib/selectors';
import { loadStories } from '../lib/stories';
import type { SeenMarks } from '../lib/presence';
import { REDDIT, netOf, weeklyActivity, useLedger, useProfile, type LedgerEntry } from '../lib/store';
import type { StringKey } from '../lib/i18n';
import { NetIcon } from './NetIcon';
import { NextMove, VerdictTable } from './VerdictBoard';
import { ReportPanel } from './ReportPanel';
import { OutcomesPanel } from './OutcomesPanel';
import { age, type T } from './shared';

const TASK_LABEL: Record<CostTask, StringKey> = {
  drafts: 'taskDrafts', angles: 'taskAngles', recall: 'taskRecall', translate: 'taskTranslate',
  diagnosis: 'taskDiagnosis', suggest: 'taskSuggest', voice: 'taskVoice', chat: 'taskChat',
  rank: 'taskRank', story: 'taskStory', svg: 'taskSvg', vision: 'taskVision',
  report: 'taskReport', polish: 'taskPolish',
};

const PERIOD_LABEL: Record<CostPeriod, StringKey> = {
  week: 'periodWeek', month: 'periodMonth', quarter: 'periodQuarter',
  semester: 'periodSemester', year: 'periodYear',
};

/**
 * One line per live network — the cockpit's actual job. It replaced the
 * Reddit-shaped tile streams that used to live here: every one of those rows
 * now exists on the network's own board and in Pseudo, scoped and actionable,
 * so repeating them on the home was three views of one truth and a reason to
 * scroll past the things only the home can say.
 *
 * Everything is read from the same selectors the tabs use. Nothing fetches.
 */
function NetworkRow({ t, presence, ledger, items, mySub, lastSeen, onGoNet }: {
  t: T; presence: PresenceReport | null; ledger: LedgerEntry[];
  items: ScoredItem[]; mySub: string; lastSeen: SeenMarks;
  onGoNet: (net: string) => void;
}) {
  const live = NETWORKS.filter(n => n.status === 'live' && n.tier !== 'licensed');
  if (live.length === 0) return null;

  return (
    <section className="pseudoBox">
      <label>{t('netRowLabel')}</label>
      <div className="netCards">
        {live.map(net => {
          const rep = net.role === 'reputation';
          const netId = net.id as 'reddit' | 'hackernews';
          const picks = rep ? items.filter(i => i.network === net.id).length : 0;
          const mine = rep ? presenceZones(presence, mySub, netId).mine.length : 0;
          const arrivals = rep ? freshReplies(presence, lastSeen, netId).length : 0;
          const acts = ledger.filter(e => rep
            ? (net.id === 'hackernews'
              ? e.community === 'Hacker News' || /^HN\b/.test(e.community)
              : e.community.startsWith('r/'))
            : false).length;
          const stories = !rep ? loadStories().filter(s => s.network === net.id).length : 0;
          const cost = netCosts(net.id);

          return (
            <button key={net.id} className="netCard" onClick={() => onGoNet(net.id)}>
              <span className="netCardHead">
                <NetIcon id={net.id} size={16} /> {net.name}
                {arrivals > 0 && <span className="badge">{arrivals}</span>}
              </span>
              <span className="meta">
                {rep
                  ? `${picks} ${t('kpiRadar').toLowerCase()} · ${mine} ${t('postsCount')} · ${acts} ${t('replies').toLowerCase()}`
                  : `${stories} ${t('boardStories').toLowerCase()}`}
              </span>
              {/* Absent cost is "never called", not "free" — show only real calls. */}
              <span className="meta">
                {cost.calls > 0 ? `$${cost.usd.toFixed(3)} · ${cost.calls} ${t('callsLabel')}` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * What Pheme has put into Mnemosyne's memory. A counter of RECEIPTS: writes
 * that came back with a chronicle id, never intentions. Off by settings =>
 * say so plainly rather than showing a zero that reads like a failure.
 */
function MemoryStrip({ t, prefs, stats, busy, error, onGoSettings, onRetry }: {
  t: T; prefs: MemoryPrefs; stats: { count: number; lastAt: string | null };
  busy: boolean; error: string | null; onGoSettings: () => void;
  onRetry: () => void;
}) {
  const on = prefs.myPosts || prefs.myReplies || prefs.diagnosis;
  return (
    <section className="pseudoBox">
      <div className="streamHead">
        <label>🧠 {t('memLabel')}</label>
        <button className="mini" onClick={onGoSettings}>⚙︎ {t('goBtn')}</button>
      </div>
      {error
        ? (
          <p className="warn small">
            {t('memFailed')} {error}
            {/* A refusal the user can act on beats a refusal they must
                research: the manifest declares it, the running app just has
                not re-read it. */}
            <button className="mini" style={{ marginLeft: 10 }} onClick={onRetry}>
              🔓 {t('memGrantNow')}
            </button>
          </p>
        )
        : busy
          ? <p className="hint">{t('memWriting')}</p>
          : !on
            ? <p className="hint">{t('memOff')}</p>
            : (
              <p className="hint">
                {stats.count > 0
                  ? `✓ ${stats.count} ${t('memWritten')}${stats.lastAt ? ` · ${t('updatedAgo')} ${age(stats.lastAt)}` : ''}`
                  : t('memNoneYet')}
              </p>
            )}
    </section>
  );
}

const STALE_SCAN_MS = 12 * 3_600_000;

export function Dashboard({ t, profile, ledger, presence, unseen, items, scannedAt, followedCount, repliedUrls, hidden, unseenNet, lastSeen, memStats, memBusy, memError, onGo, onGoPresence, onGoNet, onGoSettings, onRetryMemory, onOpenItem, onDiagnose, onUnlog }: {
  t: T;
  profile: ReturnType<typeof useProfile>['profile'];
  ledger: ReturnType<typeof useLedger>['ledger'];
  presence: PresenceReport | null;
  unseen: number;
  items: ScoredItem[];
  scannedAt: string | null;
  followedCount: number;
  /** Threads already replied — a done action is not a "next" action. */
  repliedUrls: Set<string>;
  /** Dismissed on the radar — a dismissal must hold here too. */
  hidden: string[];
  /** Where the unread replies actually are. */
  unseenNet: 'reddit' | 'hackernews';
  /** Per-network high-water marks — the inbox reads them. */
  lastSeen: SeenMarks;
  /** Memory write status, owned by App (it runs the pass). */
  memStats: { count: number; lastAt: string | null };
  memBusy: boolean;
  memError: string | null;
  onGo: (tab: 'radar' | 'coach' | 'presence') => void;
  /** Presence is per-network in v2 — rows and tiles carry their network. */
  onGoPresence: (net: 'reddit' | 'hackernews') => void;
  /** Open a network's own board — the cockpit's rows are doors. */
  onGoNet: (net: string) => void;
  onGoSettings: () => void;
  /** Re-read the manifest and retry the memory pass — no restart. */
  onRetryMemory: () => void;
  onOpenItem: (item: ScoredItem) => void;
  /**
   * The diagnosis has its own button now (Coach) — this lands on it,
   * instead of tearing the app back down to the onboarding interview.
   */
  onDiagnose: () => void;
  /** Take one logged act back, by its timestamp. */
  onUnlog: (at: string) => void;
}) {
  const { participation, promo, ratioOk } = ledgerStats(ledger, presence);
  // The best NEXT action skips what is already done — a replied thread is
  // a victory, not a suggestion — and what was explicitly dismissed.
  const top = items.find(i => !repliedUrls.has(i.url) && !hidden.includes(i.id)) ?? null;
  const cooldown = cooldownRemainingMin();
  // The verdict engine (doc 75). Composed in `selectors` so the Coach and the
  // network boards cannot grow a second, different answer to the same question.
  const board = useMemo(() => standingBoard(ledger, presence), [ledger, presence]);
  // Acts written without Pheme, everywhere. Derived from the same board the
  // verdicts read, never recounted here (this file's whole reason to exist).
  const solo = board.rows.reduce((n, r) => n + r.autonomous, 0);
  const rules = presence?.rules ?? {};
  const [period, setPeriod] = useState<CostPeriod>('month');
  const costs = costRows(period);
  const [costsOpen, setCostsOpen] = useState(false);
  // Balance is fetched only on the user's click — the dashboard never
  // touches the network on its own.
  const [balance, setBalance] = useState<number | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  const [balBusy, setBalBusy] = useState(false);
  const refreshBalance = async () => {
    if (balBusy) return;
    setBalBusy(true);
    try {
      const { usd, reason } = await bridge.creditBalanceUsd();
      setBalance(usd);
      setBalErr(reason);
    } finally { setBalBusy(false); }
  };

  const actions: { key: string; text: string; go: () => void }[] = [];
  if (!profile.diagnosis) actions.push({ key: 'diag', text: t('actDiag'), go: onDiagnose });
  if (unseen > 0) actions.push({ key: 'unseen', text: `${unseen} ${t('actUnseen')}`, go: () => onGoPresence(unseenNet) });
  if (!scannedAt) actions.push({ key: 'scan', text: t('actScanNever'), go: () => onGo('radar') });
  else if (Date.now() - Date.parse(scannedAt) > STALE_SCAN_MS) {
    actions.push({ key: 'stale', text: t('actScanStale'), go: () => onGo('radar') });
  }
  if (top) actions.push({ key: 'top', text: `${t('actTop')} “${top.title.slice(0, 70)}” (${top.score})`, go: () => onOpenItem(top) });
  if (cooldown > 0) actions.push({ key: 'cool', text: `${t('actCooldown')} (~${cooldown} min)`, go: () => onGo('radar') });

  return (
    <div className="pane wide">
      {/* Doc 75 §5.1 — the single move that unblocks the most, before
          anything else on the screen. */}
      <NextMove t={t} board={board} rules={rules} onGoNet={onGoNet} />

      {/* §5.3 — the model's judgement is NOT the counts, and it says so.
          Both used to sit under the word "diagnostic": one is what the user
          did, the other is one inference at one moment. Labelled and dated. */}
      {profile.diagnosis && (
        <details className="postBox">
          <summary>
            <span className="sourceTag">{t('vEstimated')}</span>
            {t('diagnosisTitle')}
            {profile.diagnosedAt && ` · ${age(profile.diagnosedAt)}`}
            {profile.goal && ` · ${t(profile.goal === 'launch' ? 'goalLaunch' : profile.goal === 'authority' ? 'goalAuthority' : 'goalWatch')}`}
          </summary>
          <p className="hint">{t('vEstimatedHint')}</p>
          <pre>{profile.diagnosis}</pre>
        </details>
      )}

      <div className="kpis">
        <button className="kpi" onClick={() => onGo('coach')}>
          <span className="kpiVal">{participation}</span>
          <span className="kpiLabel">{t('replies').toLowerCase()}</span>
        </button>
        {/* The one tile that goes UP as this app is used less. Its own tile
            rather than a share of the one before it: the two counts are
            disjoint — logged here, versus only ever seen in the public feed —
            and printing them as a total and a part would be a fraction that
            does not exist. Shown only once there is one: a "0 solo" on a fresh
            install reads as a reproach for something nobody was asked to do. */}
        {solo > 0 && (
          <button className="kpi" onClick={() => onGo('presence')} title={t('kpiSoloHint')}>
            <span className="kpiVal accent">{solo}</span>
            <span className="kpiLabel">{t('kpiSolo')}</span>
          </button>
        )}
        <button className="kpi" onClick={() => onGo('coach')}>
          <span className={ratioOk ? 'kpiVal ok' : 'kpiVal ko'}>{promo}</span>
          <span className="kpiLabel">{t('promo').toLowerCase()} · 9:1 {ratioOk ? '✓' : '✗'}</span>
        </button>
        <button className="kpi" onClick={() => onGoPresence(unseenNet)}>
          <span className={unseen > 0 ? 'kpiVal accent' : 'kpiVal'}>{unseen}</span>
          <span className="kpiLabel">{t('kpiUnseen')}</span>
        </button>
        {/* Named per network since 0.7.4: Reddit publishes a karma too, so a
            tile labelled just "karma" now points at one of two figures. */}
        <button className="kpi" onClick={() => onGoPresence('hackernews')}>
          <span className="kpiVal">{presence?.hnKarma ?? '—'}</span>
          <span className="kpiLabel">{t('karma').toLowerCase()} · HN</span>
        </button>
        <button className="kpi" onClick={() => onGoPresence('reddit')}>
          <span className="kpiVal">{presence?.redditAccount?.total ?? '—'}</span>
          <span className="kpiLabel">{t('karma').toLowerCase()} · Reddit</span>
        </button>
        <button className="kpi" onClick={() => onGo('presence')}>
          <span className="kpiVal">{followedCount}</span>
          <span className="kpiLabel">{t('kpiFollowed')}</span>
        </button>
        <button className="kpi" onClick={() => onGo('radar')}>
          <span className="kpiVal">{items.length}</span>
          <span className="kpiLabel">
            {t('kpiRadar')}{scannedAt ? ` · ${age(scannedAt)}` : ''}
          </span>
        </button>
        <button className="kpi" onClick={() => setCostsOpen(true)}>
          <span className="kpiVal">${costs.usdTodayTotal.toFixed(3)}</span>
          <span className="kpiLabel">{t('spentToday')}</span>
        </button>
        <button className="kpi" onClick={refreshBalance} disabled={balBusy}
          title={balErr ?? undefined}>
          <span className={balErr ? 'kpiVal ko' : 'kpiVal'}>
            {balBusy ? '…' : balance !== null ? `$${balance.toFixed(2)}` : '—'}
          </span>
          <span className="kpiLabel">
            {t('balanceLabel')} · {balErr ? '✗' : t('presenceRefresh').toLowerCase()}
          </span>
        </button>
      </div>

      {/* Arrivals first: the one thing worth opening the app for. */}
      {(() => {
        const fresh = freshReplies(presence, lastSeen);
        if (fresh.length === 0) return null;
        return (
          <section className="pseudoBox">
            <label>📬 {t('inboxHead')} · {fresh.length}</label>
            <ul className="actList">
              {fresh.slice(0, 5).map(({ reply, thread }) => (
                <li key={reply.id} className="actItem">
                  <span>
                    {reply.toMe && <span className="kindTag comment">↳ {t('toYouTag')}</span>}
                    <strong>{reply.author}</strong> · {age(reply.timestamp)} · {thread.community}
                    {reply.body ? ` · ${reply.body.slice(0, 70)}` : ''}
                  </span>
                  {/* Name the act, not the navigation — this button leads to
                      the surface where the answer is actually written. */}
                  <button className="mini" onClick={() => onGoPresence(thread.network)}>✍️ {t('replyBtn')}</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      <NetworkRow
        t={t} presence={presence} ledger={ledger} items={items}
        mySub={netOf(profile, REDDIT).home} lastSeen={lastSeen} onGoNet={onGoNet}
      />

      <MemoryStrip
        t={t} prefs={profile.memory} stats={memStats} busy={memBusy} error={memError}
        onGoSettings={onGoSettings} onRetry={onRetryMemory}
      />

      <div className="dashGrid">
        <section>
          <label>{t('nextActions')}</label>
          {actions.length === 0
            ? <p className="hint">{t('actAllGood')}</p>
            : (
              <ul className="actList">
                {actions.map(a => (
                  <li key={a.key} className="actItem">
                    <span>{a.text}</span>
                    <button className="mini" onClick={a.go}>{t('goBtn')}</button>
                  </li>
                ))}
              </ul>
            )}

          <label>{t('weekLabel')}</label>
          <div className="spark">
            {weeklyActivity(ledger).map((n, i) => (
              <span key={i} className={n > 0 ? 'sparkBar on' : 'sparkBar'}
                style={{ height: `${6 + Math.min(n, 6) * 5}px` }} title={String(n)} />
            ))}
          </div>

          {costs.hasHistory && (
            <details className="postBox" open={costsOpen}
              onToggle={e => setCostsOpen(e.currentTarget.open)}>
              <summary>{t('costsTitle')} · ${costs.usdPeriodTotal.toFixed(3)} / {t(PERIOD_LABEL[period]).toLowerCase()}</summary>
              <div className="filters">
                {COST_PERIODS.map(p => (
                  <button key={p} className={period === p ? 'fchip on' : 'fchip'}
                    onClick={() => setPeriod(p)}>
                    {t(PERIOD_LABEL[p])}
                  </button>
                ))}
              </div>
              <p className="hint">{t('costNote')}</p>
              {costs.rows.length === 0
                ? <p className="hint">{t('periodEmpty')}</p>
                : (
                  <table className="stats">
                    <thead>
                      <tr>
                        <th></th><th>{t('callsLabel')}</th><th>~$ ({t('colToday')})</th><th>~$ ({t(PERIOD_LABEL[period]).toLowerCase()})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.rows.map(r => (
                        <tr key={r.task}>
                          <td>{t(TASK_LABEL[r.task])}</td>
                          <td>{r.callsToday} ({r.callsPeriod})</td>
                          <td>{r.usdToday > 0 ? `$${r.usdToday.toFixed(3)}` : '0'}</td>
                          <td>{r.usdPeriod > 0 ? `$${r.usdPeriod.toFixed(3)}` : '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </details>
          )}
        </section>

        <section>
          {/* §5.2 — one line per community. This replaced a table whose
              "ready" column was an invented floor (8 replies, a local 9:1)
              applied identically to a sub that BANS self-promotion and to a
              surface where launching is the point. */}
          <label>
            <span className="sourceTag">{t('vCounted')}</span>{t('vHead')}
          </label>
          <p className="hint">{t('vHint')}</p>
          <VerdictTable t={t} board={board} rules={rules} limit={6} />

          {/* Lot 5 — the loop: Pheme said what to write, this says what
              became of it. */}
          <OutcomesPanel t={t} presence={presence} />

          {/* §6 — the report, global here, per network on each board. */}
          <ReportPanel t={t} profile={profile} ledger={ledger} presence={presence} />

          {ledger.length > 0 && (
            <>
              <label>{t('recentActivity')}</label>
              {/* Every row is takeable back. This list feeds the 9:1 gauge and
                  every readiness verdict, and the only undo used to be
                  emptying the whole ledger — so a single misclick cost either
                  a wrong count forever or all of the real history. */}
              <p className="hint">{t('undoHint')}</p>
              <ul className="actList">
                {ledger.slice(0, 5).map(e => (
                  <li key={e.at} className="actItem">
                    <span>
                      <span className={e.kind === 'participation' ? 'kindTag comment' : 'kindTag none'}>
                        {e.kind === 'participation' ? t('replies') : t('promo')}
                      </span>
                      {e.community} · {age(e.at)}
                    </span>
                    <button className="hideX" title={t('undoReplied')} onClick={() => onUnlog(e.at)}>×</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
