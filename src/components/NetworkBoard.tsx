/**
 * ONE board per network, ONE component for all of them — its shape comes
 * from the network's role in the registry. It renders the same selectors
 * and data the tabs use, SCOPED by network; it never recomputes and never
 * reimplements (see V2_BLUEPRINT.md invariants). Every section is a door
 * into the full system.
 */
import { useState } from 'react';
import { bridge } from '../lib/bridge';
import { netCosts } from '../lib/costs';
import { NETWORKS, type NetworkDef } from '../lib/networks';
import { LANG_NAME } from '../lib/i18n';
import { redditJsonBlocked } from '../lib/redditGate';
import { isStale } from '../lib/score';
import { ReplyAction, ThreadCard, type ReplyKit } from './ThreadCard';
import { NetIcon } from './NetIcon';
import { SubFinder } from './SubFinder';
import { VerdictTable } from './VerdictBoard';
import { ReportPanel } from './ReportPanel';
import { OutcomesPanel } from './OutcomesPanel';
import { awaitingReplies, freshReplies, ledgerStats, presenceZones, sortedTargets, standingBoard, targetLabel } from '../lib/selectors';
import { loadStories } from '../lib/stories';
import { REDDIT, draftedIds, followRefOf, netOf, useHidden } from '../lib/store';
import type { LedgerEntry, Profile } from '../lib/store';
import type { PresenceReport, SeenMarks, ThreadNode } from '../lib/presence';
import type { ScoredItem } from '../lib/score';
import { age, type T } from './shared';

export function NetworkBoard({ t, netId, profile, setProfile, ledger, items, presence, lastSeen, replyKit, refreshPhase, radarSkipped, onRefreshAll, onGo, onOpenItem }: {
  t: T;
  netId: string;
  profile: Profile;
  /** Absent = read-only board; present = the sub finder can add from here. */
  setProfile?: (fn: (p: Profile) => Profile) => void;
  ledger: LedgerEntry[];
  items: ScoredItem[];
  presence: PresenceReport | null;
  lastSeen: SeenMarks;
  /** Lets an unfolded conversation be answered here, not only in Pseudo. */
  replyKit?: ReplyKit;
  /** Which half of the combined refresh is running, null when idle. */
  refreshPhase?: null | 'presence' | 'radar';
  /** The breaker tripped before the radar got its turn — said, never hidden. */
  radarSkipped?: boolean;
  onRefreshAll?: () => void;
  onGo: (tab: 'radar' | 'publish' | 'coach' | 'presence' | 'settings' | 'profile') => void;
  onOpenItem: (item: ScoredItem) => void;
}) {
  const net = NETWORKS.find(n => n.id === netId);
  if (!net) return null;
  const costs = net.status === 'live' && net.tier !== 'licensed' ? netCosts(net.id) : null;

  return (
    <div className="pane wide">
      <h2>
        <NetIcon id={net.id} size={20} /> {net.name}
        <span className="meta"> · {t(net.role === 'reputation' ? 'repNetsLabel' : 'promoNetsLabel')}</span>
      </h2>
      {costs && costs.calls > 0 && (
        <p className="hint">
          {t('boardCosts')} · ${costs.usd.toFixed(3)} / {t('periodMonth').toLowerCase()} · {costs.calls} {t('callsLabel')}
        </p>
      )}

      {net.tier === 'licensed' ? (
        <LockedBoard t={t} />
      ) : net.status === 'soon' ? (
        <p className="empty">{t('boardSoon')}</p>
      ) : net.role === 'reputation' ? (
        <ReputationBoard t={t} net={net} profile={profile} setProfile={setProfile} ledger={ledger}
          items={items} presence={presence} lastSeen={lastSeen} replyKit={replyKit}
          refreshPhase={refreshPhase} radarSkipped={radarSkipped} onRefreshAll={onRefreshAll}
          onGo={onGo} onOpenItem={onOpenItem} />
      ) : (
        <PromotionBoard t={t} net={net} profile={profile} onGo={onGo} />
      )}
    </div>
  );
}

/** Honest lock — the value is named, nothing pretends to work. */
function LockedBoard({ t }: { t: T }) {
  return (
    <div className="card">
      <p className="lead">{t('boardLocked')}</p>
      <p className="hint">{t('boardLockedHint')}</p>
    </div>
  );
}

function ReputationBoard({ t, net, profile, setProfile, ledger, items, presence, lastSeen, replyKit, refreshPhase, radarSkipped, onRefreshAll, onGo, onOpenItem }: {
  t: T; net: NetworkDef; profile: Profile;
  setProfile?: (fn: (p: Profile) => Profile) => void;
  ledger: LedgerEntry[];
  items: ScoredItem[]; presence: PresenceReport | null; lastSeen: SeenMarks;
  replyKit?: ReplyKit;
  refreshPhase?: null | 'presence' | 'radar';
  radarSkipped?: boolean;
  onRefreshAll?: () => void;
  onGo: (tab: 'radar' | 'coach' | 'presence' | 'settings' | 'profile') => void;
  onOpenItem: (item: ScoredItem) => void;
}) {
  /**
   * One watched target, or all of them. Held HERE and not in a url or the
   * profile: it is a way of looking at this screen, not a setting — leaving
   * the board and coming back shows everything again, which is what "filter"
   * means to everyone who has ever used one.
   */
  const [subFilter, setSubFilter] = useState<string | null>(null);
  /** `r/Foo` and `Foo` are the same target — shared with the radar's filter. */
  const label = (target: string) => targetLabel(net.id, target);
  const onTarget = (i: ScoredItem) =>
    !subFilter || i.target.toLowerCase() === label(subFilter).toLowerCase();
  // The SAME data the tabs show, scoped to this network — never recomputed.
  const picksAll = items.filter(i => i.network === net.id);
  const picks = picksAll.filter(onTarget).slice(0, 6);
  const drafted = draftedIds();
  // The conversation unfolded right here, below the card that was clicked.
  const [openThread, setOpenThread] = useState<string | null>(null);
  // One open studio at a time on this board too: a drafting studio costs a
  // model call, and a column of half-filled ones is a column of half-spent money.
  const [openReply, setOpenReply] = useState<string | null>(null);
  /**
   * A radar pick and a "your history" row can be the SAME conversation shown
   * twice on one screen, with nothing joining them. They share an id space:
   * `followRefOf(item).id` and a presence thread id are both `<net>_<postid>`.
   * That is the join, and it is why clicking either one opens one thread.
   */
  const threadsById = new Map<string, ThreadNode>();
  for (const g of presence?.groups ?? []) {
    for (const th of g.threads) if (th.network === net.id) threadsById.set(th.id, th);
  }
  const threadFor = (item: ScoredItem): ThreadNode | undefined => threadsById.get(followRefOf(item).id);
  // Derived from the ledger the board already receives — same rule as the
  // radar's (a participation IS a reply), so the two views cannot disagree.
  const repliedUrls = new Set(ledger.filter(e => e.kind === 'participation').map(e => e.url));
  const arrivals = freshReplies(presence, lastSeen, net.id as 'reddit' | 'hackernews');
  // The KPI above counts what is NEW. This list carries what is UNANSWERED —
  // a reply read in passing and never answered stayed nowhere, because the
  // only list that held it was keyed on "seen".
  const { hidden, hide } = useHidden();
  const awaiting = awaitingReplies(presence, ledger, net.id as 'reddit' | 'hackernews')
    .filter(a => !hidden.includes(a.reply.id));
  // Work you STARTED and never finished: a draft exists and no reply is
  // logged. It belongs next to the replies because both answer the only
  // question worth opening this app for — what is waiting for me?
  const resumables = picksAll.filter(i =>
    (drafted.has(i.id) || drafted.has(followRefOf(i).id))
    && !repliedUrls.has(i.url) && !hidden.includes(i.id));
  const todoCount = awaiting.length + resumables.length;
  // This board's OWN settings — never the profile's shape reached into here.
  const settings = netOf(profile, net.id);
  const zones = presenceZones(presence, netOf(profile, REDDIT).home);
  const inNet = (th: ThreadNode) => th.network === net.id;
  const mine = zones.mine
    .filter(inNet)
    // A filter that moves the radar but not the history below it would be a
    // screen half-answering the question it was just asked.
    .filter(th => !subFilter || th.community.toLowerCase() === label(subFilter).toLowerCase())
    .slice(0, 6);
  const { ratioOk } = ledgerStats(ledger, presence);
  const cost = netCosts(net.id);
  // Same community rule as the readiness table below — one definition.
  const inThisNet = (community: string) => net.id === 'hackernews'
    ? community === 'Hacker News' || /^HN\b/.test(community)
    : community.startsWith('r/');
  const netActs = ledger.filter(e => e.kind === 'participation' && inThisNet(e.community)).length;
  // Scoped by the ENGINE's own network resolution (`standing.networkOf`), not
  // by a per-component prefix test: the two used to be written twice and the
  // copies are exactly what drifts.
  const board = standingBoard(ledger, presence, net.id);

  return (
    <>
      {/* The network's own numbers, first. The cockpit answers "across all my
          networks"; this answers "here" — and every tile is a door, so a
          number you doubt is one click from the list behind it. */}
      <div className="kpis netKpis">
        <button className="kpi" onClick={() => onGo('presence')}>
          <span className="kpiVal">{arrivals.length}</span>
          <span className="kpiLabel">{t('kpiUnseen')}</span>
        </button>
        <button className="kpi" onClick={() => onGo('radar')}>
          <span className="kpiVal">{picks.length}</span>
          <span className="kpiLabel">{t('kpiRadar')}</span>
        </button>
        <button className="kpi" onClick={() => onGo('presence')}>
          <span className="kpiVal">{mine.length}</span>
          <span className="kpiLabel">{t('historyHead')}</span>
        </button>
        <button className="kpi" onClick={() => onGo('coach')}>
          <span className="kpiVal">{netActs}</span>
          <span className="kpiLabel">{t('replies')}</span>
        </button>
        <button className="kpi" onClick={() => onGo('settings')}>
          {/* Absent is not zero: a network never called shows a dash. */}
          <span className="kpiVal">{cost.calls > 0 ? `$${cost.usd.toFixed(3)}` : '—'}</span>
          <span className="kpiLabel">{cost.calls > 0 ? `${cost.calls} ${t('callsLabel')}` : t('periodMonth')}</span>
        </button>
      </div>

      {/* THE question this board must answer before any other: what is
          waiting for me? Answers people left you, and drafts you started and
          never finished — one list, each row answerable WHERE IT IS. This
          used to be four lists opening at once with none of them saying what
          to do now, and an inbox that vanished on zero, which read as "this
          app cannot answer people" rather than "nobody answered you yet".
          Everything below is discovery, and discovery folds away. */}
      <div className="streamHead">
        <label>📬 {t('todoHead')} · {todoCount}</label>
        <span className="row">
          {/* One button for both halves, because they were never two budgets.
              It names the half it is on: a refresh that reads your threads and
              then scans is worth waiting for, one that looks stuck is not. */}
          {onRefreshAll && (
            <button className="mini primary" onClick={onRefreshAll} disabled={!!refreshPhase}>
              {refreshPhase === 'presence' ? `… ${t('refreshAllPresence')}`
                : refreshPhase === 'radar' ? `… ${t('refreshAllRadar')}`
                  : `↻ ${t('refreshAllBtn')}`}
            </button>
          )}
          <button className="mini" onClick={() => onGo('presence')}>{t('goBtn')}</button>
        </span>
      </div>
      {radarSkipped && <p className="warn small">{t('refreshRadarSkipped')}</p>}
      {todoCount === 0
        ? <p className="hint">{t('todoNone')}</p>
        : (
          <ul className="replyList">
            {resumables.slice(0, 5).map(item => (
              <li key={`draft_${item.id}`} className="reply inboxRow">
                <span className="replyMeta">
                  <span className="draftedTag">✎ {t('draft').toLowerCase()}</span>
                  <span className="meta"> {item.target} · {age(item.timestamp)}</span>
                </span>
                <p>{item.title}</p>
                <div className="row">
                  <button className="mini" onClick={() => bridge.openExternal(item.url)}>{t('open')}</button>
                  <button className="mini primary" onClick={() => onOpenItem(item)}>✍️ {t('todoResume')}</button>
                  {/* A to-do you cannot cross off is not a to-do. Same hidden
                      list the radar uses — dismissed here, dismissed there. */}
                  <button className="mini" onClick={() => hide(item.id)}>{t('hideBtn')}</button>
                </div>
              </li>
            ))}
            {awaiting.slice(0, 5).map(({ reply, thread }) => (
              <li key={reply.id} className="reply inboxRow">
                <span className="replyMeta">
                  {reply.toMe && <span className="kindTag comment">↳ {t('toYouTag')}</span>}
                  {reply.bot && <span className="kindTag none">{t('botTag')}</span>}
                  <strong>{reply.author}</strong> · {age(reply.timestamp)}
                  <span className="meta"> · {thread.community}</span>
                </span>
                {reply.body && <p>{reply.body}</p>}
                <div className="row">
                  <button className="mini" onClick={() => bridge.openExternal(reply.url || thread.url)}>
                    {t('open')}
                  </button>
                  <ReplyAction
                    t={t} kit={replyKit} thread={thread} reply={reply}
                    open={openReply === reply.id}
                    onToggle={() => setOpenReply(id => id === reply.id ? null : reply.id)}
                  />
                  <button className="mini" onClick={() => hide(reply.id)}>{t('hideBtn')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}

      {/* Everything from here down is DISCOVERY — what is watched, what was
          found, what became of it. Real, and none of it urgent: it opened
          all at once above the one thing that was, and the board read as a
          wall. Folded by default, one click from open, counts on the lid so
          closing never hides how much is inside. */}
      <details className="boardRest">
        <summary>
          {t('boardRestHead')} · {t('watchedSubs')} {settings.targets.length}
          {' · '}{t('kpiRadar')} {picks.length}
        </summary>

      {/* WHAT the scan actually watches — visible, and now CLICKABLE: each one
          is a filter over everything below it. "It only scans LocalLLaMA" must
          be a fact you can see, and "show me only LocalLLaMA" a fact you can
          ask for without leaving the board. */}
      <div className="streamHead">
        <label>
          {net.id === REDDIT ? t('watchedSubs') : t('watchedTopics')}
          {' · '}{settings.targets.length}
          {subFilter && <span className="meta"> · {t('filteredBy')} {label(subFilter)}</span>}
        </label>
        <button className="mini" onClick={() => onGo('profile')}>⚙︎ {t('netProfileTab')}</button>
      </div>
      {settings.targets.length === 0
        ? <p className="hint">{t(net.id === REDDIT ? 'subsHint' : 'topicsHint')}</p>
        : (
          <div className="filters">
            <button className={subFilter === null ? 'fchip on' : 'fchip'}
              onClick={() => setSubFilter(null)}>
              {t('filterAll')} · {picksAll.length}
            </button>
            {/* Alphabetical, not insertion order: past the third sub the
                stored order is arbitrary, and a chip row you have to read one
                by one is not a filter. Shared with the radar. */}
            {sortedTargets(settings.targets).map(s => {
              const name = label(s);
              // The count is the RADAR's, on this target — a sub with 0 is a
              // sub the last scan brought nothing from, which is worth seeing.
              const n = picksAll.filter(i => i.target.toLowerCase() === name.toLowerCase()).length;
              return (
                <button key={s} className={subFilter === s ? 'fchip on' : 'fchip'}
                  onClick={() => setSubFilter(cur => (cur === s ? null : s))}>
                  {name}{n > 0 && <span className="subMeta"> {n}</span>}
                </button>
              );
            })}
          </div>
        )}

      {/* Add one WITHOUT a trip through Settings: type a subject, Mnemosyne
          goes looking, every name is checked against Reddit before it is
          offered. Same component Settings uses — one search, one set of
          rules about what reaches the profile. */}
      {net.id === REDDIT && setProfile && (
        <SubFinder t={t} profile={profile} setProfile={setProfile} seeded />
      )}

      <div className="streamHead">
        <label>{t('kpiRadar')} · {picks.length}</label>
        <button className="mini" onClick={() => onGo('radar')}>{t('goBtn')}</button>
      </div>
      {picks.length === 0
        ? <p className="hint">{t('boardNoPicks')}</p>
        : (
          <ul className="actGrid">
            {picks.map(item => {
              const thr = threadFor(item);
              const key = followRefOf(item).id;
              return (
                <li key={item.id} className={openThread === key ? 'spanAll' : undefined}>
                  {/* A thread you are already IN unfolds here — post, your
                      words, the answers. One you have not touched goes to the
                      post view, where the drafting starts. */}
                  <button
                    className={openThread === key ? 'actCard on' : 'actCard'}
                    onClick={() => thr
                      ? setOpenThread(cur => cur === key ? null : key)
                      : onOpenItem(item)}
                  >
                    <span className="actTop">
                      <span className="score">{item.score}</span>
                      <span className="meta">{item.target}</span>
                      {isStale(item) && <span className="staleTag">⌛ {t('staleTag')}</span>}
                      {/* Work already done here — the drafts and the voice you
                          picked are one click away, and this board never said so. */}
                      {(drafted.has(item.id) || drafted.has(key)) && (
                        <span className="draftedTag">✎ {t('draft').toLowerCase()}</span>
                      )}
                      {repliedUrls.has(item.url) && <span className="repliedTag">{t('repliedTag')}</span>}
                      {thr && <span className="meta">{openThread === key ? '▾' : '▸'}</span>}
                    </span>
                    <span className="actTitle">{item.title}</span>
                  </button>
                  {thr && openThread === key && (
                    <ThreadCard t={t} thr={thr} lastSeen={lastSeen} kit={replyKit} />
                  )}
                </li>
              );
            })}
          </ul>
        )}

      <div className="streamHead">
        <label>{t('historyHead')} · {mine.length}</label>
        <button className="mini" onClick={() => onGo('presence')}>{t('goBtn')}</button>
      </div>
      {/* A capability that goes away must SAY so. When Reddit walls its public
          .json, Pheme falls back to the Atom feed — which carries no score and
          no parent links at all — so every row loses its score and no reply can
          be known to be addressed to the user. Silently, that reads as "this
          app does not track anything". */}
      {net.id === 'reddit' && redditJsonBlocked() && (
        <p className="warn small">{t('redditJsonWalled')}</p>
      )}
      {/* Why half the rows show dashes, stated once and in the open. A tooltip
          is not discoverable, and "no score anywhere" reads as "this app does
          not track what my posts became". */}
      {mine.some(thr => thr.commentCount === null) && (
        <p className="hint">
          {mine.filter(thr => thr.commentCount === null).length}/{mine.length} {t('notReadCount')}
        </p>
      )}
      {mine.length === 0
        ? <p className="hint">{t('historyEmpty')}</p>
        : (
          // These rows used to carry NO action at all: the user could see
          // their own post and had no way to reach it from here.
          <ul className="actGrid">
            {mine.map(thr => (
              <li key={thr.id} className={openThread === thr.id ? 'spanAll' : undefined}>
                <button
                  className={openThread === thr.id ? 'actCard on' : 'actCard'}
                  onClick={() => setOpenThread(cur => cur === thr.id ? null : thr.id)}
                >
                  <span className="actTop">
                    <span className={`kindTag ${thr.mine}`}>{t(thr.mine === 'post' ? 'kindPost' : 'kindComment')}</span>
                    <span className="meta">{thr.community} · {age(thr.timestamp)}</span>
                    {/* An unmeasured score used to render as NOTHING — which
                        made "not inspected yet", "the source carried no score"
                        and "nobody voted" three identical blanks. A dash says
                        unknown; a number says measured. `commentCount === null`
                        is the flag: it means this thread was never opened. */}
                    {typeof thr.myScore === 'number'
                      ? <span className="scoreUp" title={t('myScoreTitle')}>▲ {thr.myScore}</span>
                      : (
                        <span className="meta" title={t(thr.commentCount === null ? 'threadNotRead' : 'myScoreNone')}>
                          ▲ —
                        </span>
                      )}
                    {/* A counted 0 is a MEASURED silence and worth saying. An
                        uncounted one is not the same statement. */}
                    <span className="meta" title={thr.commentCount === null ? t('threadNotRead') : undefined}>
                      · {thr.commentCount === null ? '—' : thr.replies.filter(r => !r.bot).length} {t('repliesLabel')}
                    </span>
                    <a
                      className="actOpen" href={thr.url} title={t('open')}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void bridge.openExternal(thr.url); }}
                    >↗</a>
                    <span className="meta">{openThread === thr.id ? '▾' : '▸'}</span>
                  </span>
                  <span className="actTitle">{thr.title.replace(/^\/?u\/\S+\s+on\s+/i, '')}</span>
                </button>
                {openThread === thr.id && (
                  <ThreadCard t={t} thr={thr} lastSeen={lastSeen} kit={replyKit} />
                )}
              </li>
            ))}
          </ul>
        )}

      {/* Directly under the history, because the two halves are one question:
          here is what you posted — and here is what became of it. The verdict
          board used to sit between them, which put the answer to "did anything
          happen?" below a table about something else entirely. */}
      <OutcomesPanel t={t} presence={presence} network={net.id} />

      {/* The verdict for THIS network. Same component, same composition as the
          cockpit and the Coach — the 9:1 stays on the line as one signal among
          others, and no longer as the answer (doc 75 §1). */}
      <div className="streamHead">
        <label>
          <span className="sourceTag">{t('vCounted')}</span>{t('vHead')} · 9:1 {ratioOk ? '✓' : '✗'}
        </label>
        <button className="mini" onClick={() => onGo('coach')}>{t('goBtn')}</button>
      </div>
      <VerdictTable t={t} board={board} rules={presence?.rules ?? {}} limit={5} />

      <ReportPanel t={t} profile={profile} ledger={ledger} presence={presence} network={net.id} />
      </details>
    </>
  );
}

function PromotionBoard({ t, net, profile, onGo }: {
  t: T; net: NetworkDef; profile: Profile; onGo: (tab: 'publish' | 'profile') => void;
}) {
  const stories = loadStories().filter(s => s.network === net.id);
  const posted = stories.filter(s => s.posts.length > 0 && s.posts.every(p => p.posted));
  // What the composer will actually do here, stated. The reputation board
  // shows WHAT THE SCAN WATCHES for the same reason: a setting you can see is
  // a fact, one you cannot is a hunch.
  const settings = netOf(profile, net.id);
  const writeLang = settings.postLang || profile.lang;

  return (
    <>
      <div className="streamHead">
        <label>{t('boardComposesFor')}</label>
        <button className="mini" onClick={() => onGo('profile')}>{t('netProfileTab')}</button>
      </div>
      <p className="hint">
        {LANG_NAME[writeLang]}
        {' · '}
        {settings.audience.trim() || t('boardAudienceUnset')}
      </p>

      <div className="streamHead">
        <label>{t('boardStories')} · {stories.length}{posted.length > 0 ? ` · ${posted.length} ✓` : ''}</label>
        <button className="mini" onClick={() => onGo('publish')}>{t('goBtn')}</button>
      </div>
      {stories.length === 0
        ? <p className="hint">{t('storiesEmpty')}</p>
        : (
          <ul className="actGrid">
            {stories.slice(0, 8).map(s => (
              <li key={s.id}>
                <button className="actCard" onClick={() => onGo('publish')}>
                  <span className="actTop">
                    <span className={s.kind === 'promo' ? 'kindTag none' : 'kindTag comment'}>
                      {t(s.kind === 'promo' ? 'kindPromo' : 'kindStory')}
                    </span>
                    <span className="meta">
                      {s.posts.length} {t('postsCount')}
                      {s.posts.length > 0 && s.posts.every(p => p.posted) && ' · ✓'}
                      {' · '}{age(s.updatedAt)}
                    </span>
                  </span>
                  <span className="actTitle">
                    {s.title || t(s.kind === 'promo' ? 'kindPromo' : 'kindStory')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {net.limit && <p className="hint">{net.name} · {net.limit} {t('charsLabel')} / post</p>}
    </>
  );
}
