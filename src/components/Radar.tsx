/** The radar grid and the in-app post view (bilingual, sidebar, follow). */
import { useEffect, useMemo, useState } from 'react';
import { bridge, inferText, isFramed } from '../lib/bridge';
import { isStale, type ScoredItem } from '../lib/score';
import { refreshThread, type ThreadCheck } from '../lib/verify';
import { fetchArticleText, htmlToText, isBareUrl, type ArticleFail, type ArticleRead } from '../lib/article';
import { draftedIds, followRefOf, loadTranslation, saveTranslation } from '../lib/store';
import { sortedTargets, targetLabel } from '../lib/selectors';
import { buildRankPrompt, loadRank, parseRank, saveRank, MNEMO_TIERS, RANK_MAX, type MnemoTier, type RankMap } from '../lib/rank';
import { AVAILABLE_LANGS, LANG_NAME, type Lang, type StringKey } from '../lib/i18n';
import { age, mmss, useCooldownClock, type T } from './shared';
import { DraftStudio } from './DraftStudio';
import type { MbtiType } from '../lib/archetypes';

const TIER_LABEL: Record<MnemoTier, StringKey> = { high: 'tierHigh', mid: 'tierMid', low: 'tierLow' };

/** Each way a link post can fail to be readable says something different. */
const ARTICLE_FAIL: Record<ArticleFail, StringKey> = {
  refused: 'articleRefused',
  empty: 'articleEmpty',
  notText: 'articleNotText',
  unreachable: 'articleUnreachable',
};

export function RadarTab({ t, framed, items, topics, scanning, failed, uncovered, rateLimited, scannedAt, hidden, repliedUrls, netFilter, subsCovered, pinned, onTogglePin, showHidden, onShowHidden, tierFilter, onTierFilter, targets, subFilter, onSubFilter, onHide, onUnhideAll, onScan, onOpenDetail }: {
  t: T; framed: boolean; items: ScoredItem[]; topics: string[]; scanning: boolean; failed: string[]; rateLimited: boolean;
  scannedAt: string | null; hidden: string[]; repliedUrls: Set<string>;
  /** v2: set by a network board — the tab shows ONE network, no picker. */
  netFilter?: 'reddit' | 'hackernews';
  /**
   * Subs a BATCHED request could not bring back. Kept apart from `failed` on
   * purpose: Reddit refuses a multireddit URL as a whole and never says which
   * member it objected to, so naming them as unreachable would be a verdict
   * about fifteen subs drawn from one refusal.
   */
  uncovered?: string[];
  /** Reddit coverage of the LAST scan — the rotation makes runs partial. */
  subsCovered?: { ok: number; total: number } | null;
  /** Pinned = survives every rescan until unpinned. */
  pinned: string[];
  onTogglePin: (id: string) => void;
  /** Filters are owned by App so a trip into a post does not reset them. */
  showHidden: boolean;
  onShowHidden: (v: boolean) => void;
  tierFilter: MnemoTier | 'all';
  onTierFilter: (v: MnemoTier | 'all') => void;
  /** This network's watch list — the sub filter's chips come from it. */
  targets: string[];
  /**
   * Held by App, not here: the tab unmounts while a post is open, and a
   * filtered view silently reset by the trip through a detail page is the
   * same bug the radar's other filters already learned.
   */
  subFilter: string | null;
  onSubFilter: (v: string | null) => void;
  onHide: (id: string) => void; onUnhideAll: () => void;
  onScan: () => void; onOpenDetail: (item: ScoredItem) => void;
}) {
  const [net, setNet] = useState<'all' | 'hackernews' | 'reddit'>('all');
  const activeNet = netFilter ?? net;
  const coolSecs = useCooldownClock();
  // Which posts already have saved drafts — the ✎ that answers "where was it?".
  // `items` is a REFRESH SIGNAL, not an input: draftedIds() reads localStorage,
  // and a new scan is exactly when the answer can have changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drafted = useMemo(() => draftedIds(), [items]);

  // The Mnemosyne pass — user-triggered (it costs), persisted (a reload
  // never re-bills it), and honest: unranked items simply carry no tier.
  const [rank, setRank] = useState<RankMap | null>(() => loadRank());
  const [rankBusy, setRankBusy] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const tierOf = (id: string): MnemoTier | null => rank?.tiers[id]?.tier ?? null;

  const runPass = async () => {
    if (rankBusy || !framed || visible.length === 0) return;
    setRankBusy(true);
    setRankError(null);
    try {
      // Rank what this board SHOWS: on a scoped board the global list made
      // the call pay to classify threads the user cannot see here.
      // The sub filter counts as part of "what this board shows": filtered to
      // one sub, the pass should not pay to classify the other twenty. The
      // TIER filter deliberately does not — you run the pass to obtain tiers,
      // so filtering on them first would be circular.
      const scoped = items
        .filter(i => activeNet === 'all' || i.network === activeNet)
        .filter(onTarget);
      const raw = inferText(await bridge.ask(buildRankPrompt(scoped, topics), { task: 'rank', net: netFilter }));
      const parsed = parseRank(raw, scoped);
      // Merge: a pass on one board must not erase the other board's tiers.
      if (parsed) {
        const merged = { at: parsed.at, tiers: { ...(rank?.tiers ?? {}), ...parsed.tiers } };
        setRank(merged);
        saveRank(merged);
      } else setRankError(t('suggestEmpty'));
    } catch (e) {
      setRankError(String(e instanceof Error ? e.message : e));
    } finally { setRankBusy(false); }
  };

  /** `r/Foo` and `Foo` are the same target — the same rule the board uses. */
  const onTarget = (i: ScoredItem) =>
    !subFilter || i.target.toLowerCase() === targetLabel(activeNet, subFilter).toLowerCase();
  const visible = items
    .filter(i => activeNet === 'all' || i.network === activeNet)
    .filter(onTarget)
    .filter(i => showHidden || !hidden.includes(i.id))
    .filter(i => tierFilter === 'all' || tierOf(i.id) === tierFilter);
  // Scoped like the grid: a "3 hidden" button on the HN board that reveals
  // three Reddit posts is a door to nowhere.
  const hiddenCount = items.filter(i =>
    (activeNet === 'all' || i.network === activeNet) && hidden.includes(i.id)).length;
  // A scoped board only reports ITS network's failures — reddit labels are
  // "r/<sub>", HN labels are "HN:<query>".
  const visibleFailed = !netFilter ? failed
    : failed.filter(f => netFilter === 'reddit' ? f.startsWith('r/') : f.startsWith('HN'));

  return (
    <div className="pane wide">
      {!framed && <p className="warn">{t('notConnected')}</p>}

      <div className="toolbar">
        <button className="primary" onClick={onScan} disabled={scanning || !framed}>
          {scanning ? t('scanning') : t('scan')}
        </button>
        {scannedAt && (
          <span className="karma" title={t('subsCoveredHint')}>
            {t('scannedAgo')} {age(scannedAt)}
            {netFilter !== 'hackernews' && subsCovered && subsCovered.total > 0
              ? ` · ${subsCovered.ok}/${subsCovered.total} ${t('subsCovered')}`
              : ''}
          </span>
        )}
        <span className="spacer" />
        {!netFilter && (
          <span className="filters">
            {([['all', t('filterAll')], ['hackernews', 'HN'], ['reddit', 'Reddit']] as const).map(([id, label]) => (
              <button key={id} className={net === id ? 'fchip on' : 'fchip'} onClick={() => setNet(id)}>
                {id === 'hackernews' && <span className="netChip hn">Y</span>}
                {id === 'reddit' && <span className="netChip rd">R</span>}
                {label}
              </button>
            ))}
          </span>
        )}
        {hiddenCount > 0 && (
          <button className="fchip" onClick={() => onShowHidden(!showHidden)}>
            {showHidden ? `${hiddenCount} ${t('hiddenLabel')}` : t('showHidden')}
          </button>
        )}
        {hiddenCount > 0 && showHidden && (
          <button className="fchip" onClick={onUnhideAll}>×0</button>
        )}
      </div>

      {/* Narrow the grid to ONE watched target, without leaving for the board.
          The radar had no such filter at all: on a dozen subs the only way to
          see one of them was to read past the other eleven. Alphabetical and
          stable — same order and same click as the board's row. */}
      {targets.length > 1 && (
        <div className="filters">
          <button className={subFilter === null ? 'fchip on' : 'fchip'}
            onClick={() => onSubFilter(null)}>
            {t('filterAll')} · {visible.length}
          </button>
          {sortedTargets(targets).map(s => {
            const name = targetLabel(activeNet, s);
            // Counted over the network's items, NOT over `visible` — a count
            // that shrank to 0 because another chip is active would read as
            // "this sub brought nothing", which is a different sentence.
            const n = items.filter(i =>
              (activeNet === 'all' || i.network === activeNet)
              && i.target.toLowerCase() === name.toLowerCase()).length;
            return (
              <button key={s} className={subFilter === s ? 'fchip on' : 'fchip'}
                onClick={() => onSubFilter(subFilter === s ? null : s)}>
                {name}{n > 0 && <span className="subMeta"> {n}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="toolbar">
        <button className="mini mnemoBtn" onClick={runPass}
          disabled={rankBusy || !framed || visible.length === 0}>
          {rankBusy ? t('mnemoPassing') : `Φ ${t('mnemoPass')}`}
        </button>
        {rank && (
          <span className="karma">
            {/* Counted over what this board shows — a stored map can outlive
                the items it ranked, and "30/12 ranked" is not a fact. */}
            Φ · {age(rank.at)} · {visible.filter(i => rank.tiers[i.id]).length}/{visible.length} {t('rankedLabel')}
          </span>
        )}
        {rankError && <span className="warn small">{rankError}</span>}
        {!rank && items.length > RANK_MAX && <span className="karma">{t('mnemoPassCap')} {RANK_MAX}</span>}
        {rank && scannedAt && rank.at < scannedAt && (
          <span className="warn small">{t('passStale')}</span>
        )}
        {rank && (
          <span className="filters">
            <button className={tierFilter === 'all' ? 'fchip on' : 'fchip'} onClick={() => onTierFilter('all')}>
              {t('filterAll')}
            </button>
            {MNEMO_TIERS.map(tier => (
              <button key={tier} className={tierFilter === tier ? 'fchip on' : 'fchip'}
                onClick={() => onTierFilter(tierFilter === tier ? 'all' : tier)}>
                {t(TIER_LABEL[tier])}
              </button>
            ))}
          </span>
        )}
      </div>
      {/* The throttle is a Reddit affair — the HN board has no business showing it. */}
      {netFilter !== 'hackernews' && (
        coolSecs > 0 ? (
          <p className="notice">{t('rateLimitedMsg')} · ⏳ {mmss(coolSecs)}</p>
        ) : rateLimited ? (
          <p className="cooldownOver">✓ {t('cooldownOver')}</p>
        ) : null
      )}
      {visibleFailed.length > 0 && <p className="notice">{t('failedTargets')} {visibleFailed.join(', ')}</p>}
      {/* Different sentence, because it is a different fact: these were asked
          inside one batched request that Reddit refused as a whole. Which
          member upset it is unknown, and saying "unreachable" about all of
          them would invent fifteen verdicts out of one refusal. */}
      {netFilter !== 'hackernews' && (uncovered?.length ?? 0) > 0 && (
        <p className="notice">{t('uncoveredTargets')} {uncovered!.join(', ')}</p>
      )}

      {visible.length === 0 && !scanning && <p className="empty">{t('noItems')}</p>}
      <ul className="grid">
        {visible.map(item => {
          const replied = repliedUrls.has(item.url);
          const tier = tierOf(item.id);
          const reason = rank?.tiers[item.id]?.reason;
          const isPinned = pinned.includes(item.id);
          return (
            <li
              key={item.id}
              className={`tile${replied ? ' dim' : ''}${tier === 'high' ? ' mnHigh' : tier === 'low' ? ' mnLow' : ''}`}
              onClick={() => onOpenDetail(item)}
            >
              <div className="cardHead">
                <button
                  className={isPinned ? 'pinX on' : 'pinX'} title={t('pinBtn')}
                  onClick={(e) => { e.stopPropagation(); onTogglePin(item.id); }}
                >{isPinned ? '★' : '☆'}</button>
                <span className="score" title="score">{item.score}</span>
                <div className="cardTitle">
                  <strong>
                    <span className={item.network === 'hackernews' ? 'netChip hn' : 'netChip rd'}>
                      {item.network === 'hackernews' ? 'Y' : 'R'}
                    </span>
                    {item.title}
                  </strong>
                  <span className="meta">
                    {item.target} · {age(item.timestamp)}
                    {typeof item.comments === 'number' ? ` · ${item.comments} 💬` : ''}
                    {tier === 'high' && <span className="mnTag" title={reason}>Φ {t('tierHigh').toLowerCase()}</span>}
                    {/* Say it, do not just decay it: a low score reads as
                        "weakly relevant", never as "you are three weeks late". */}
                    {isStale(item) && <span className="staleTag">⌛ {t('staleTag')}</span>}
                    {(drafted.has(item.id) || drafted.has(followRefOf(item).id)) && <span className="draftedTag">✎ {t('draft').toLowerCase()}</span>}
                    {replied && <span className="repliedTag">{t('repliedTag')}</span>}
                  </span>
                  {tier === 'high' && reason && <span className="mnWhy">{reason}</span>}
                </div>
                <button
                  className="hideX" title={t('hideBtn')}
                  onClick={(e) => { e.stopPropagation(); onHide(item.id); }}
                >×</button>
              </div>
              {item.matched.length > 0 && (
                <div className="why">
                  {item.matched.map(m => <span key={m} className="chip small">{m}</span>)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The post, inside the app — reading, options, and the draft studio in one place. */
export function DetailView({ t, lang, item, followed, replied, trio, wit, onWit, onBack, onToggleFollow, onLogged, onHide, onMakeStory }: {
  t: T; lang: Lang; item: ScoredItem; followed: boolean; trio: MbtiType[];
  /** The ledger already holds a participation for this thread. */
  replied: boolean;
  wit: 0 | 1 | 2;
  onWit: (w: 0 | 1 | 2) => void;
  onBack: () => void; onToggleFollow: () => void;
  onLogged: (item: ScoredItem) => void; onHide: (id: string) => void;
  /** Seed the publish studio with this thread — the conv becomes material. */
  onMakeStory: () => void;
}) {
  const [thread, setThread] = useState<ThreadCheck | null>(null);
  const [checking, setChecking] = useState(false);
  // Link posts carry no text of their own — the article is fetched and
  // extracted so the post is readable (and draftable) without leaving the app.
  const externalUrl = isBareUrl(item.body);
  // Cached scans may still carry raw HTML bodies — clean at display time too.
  const bodyText = htmlToText(item.body);
  const [article, setArticle] = useState<ArticleRead | null>(null);
  const [reading, setReading] = useState(false);

  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOrig, setShowOrig] = useState(false);
  const [transFail, setTransFail] = useState(false);

  useEffect(() => {
    let alive = true;
    setArticle(null);
    // Persistent translations: paid for once, shown forever.
    setTranslated(loadTranslation(item.id, lang));
    setShowOrig(false);
    setTransFail(false);
    if (externalUrl && isFramed()) {
      setReading(true);
      void fetchArticleText(externalUrl, bridge.fetchUrl).then(read => {
        if (!alive) return;
        setArticle(read);
        setReading(false);
      });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per item/lang only
  }, [item.id, lang]);

  const sourceText = article?.text || (externalUrl ? '' : bodyText);
  /**
   * A link post whose article was refused (403, SPA, paywall) has no body at
   * all — and the Translate button was rendered only `{sourceText && ...}`, so
   * it simply did not exist. From the outside that reads as "translation is
   * broken". A post always has a title, and a title is translatable.
   */
  const translatable = sourceText || item.title;

  const translate = async () => {
    if (translating || !translatable) return;
    setTranslating(true);
    setTransFail(false);
    try {
      const out = inferText(await bridge.ask(
        `Translate the following text into ${LANG_NAME[lang]}. Faithful and natural; keep technical terms, names and code as they are; output ONLY the translation, no commentary.\n\nTEXT:\n${translatable.slice(0, 3500)}`,
        { noMemory: true, task: 'translate', net: item.network },
      ));
      if (out.trim()) {
        setTranslated(out.trim());
        setShowOrig(false);
        saveTranslation(item.id, lang, out.trim());
      }
      else setTransFail(true);
    } catch { setTransFail(true); }
    finally { setTranslating(false); }
  };

  const recheck = async () => {
    if (checking) return;
    setChecking(true);
    try { setThread(await refreshThread(item, bridge.fetchUrl)); }
    finally { setChecking(false); }
  };

  /**
   * Drafts ground on the extracted article (or the cleaned body), never raw
   * HTML. NOT re-clipped to 800: an extracted article runs to 6000 characters
   * and a self-post to 2400, and cutting them here meant the drafter answered
   * a stump of what the reader had just finished reading.
   */
  const draftable = (): ScoredItem =>
    ({ ...item, body: article?.text || bodyText });

  const langLabel = AVAILABLE_LANGS.find(l => l.id === lang)?.label ?? lang;

  /** Side-by-side original|translation once translated — the learning view. */
  const renderText = (original: string) =>
    translated && !showOrig ? (
      <div className="biGrid">
        <div>
          <p className="biHead">{t('originalLabel')}</p>
          <pre className="postFull">{original}</pre>
        </div>
        <div>
          <p className="biHead">{langLabel}</p>
          <pre className="postFull">{translated}</pre>
        </div>
      </div>
    ) : <pre className="postFull">{original}</pre>;

  return (
    <div className="pane wide">
      <button className="ghost backBtn" onClick={onBack}>{t('back')}</button>

      <div className="detailGrid">
      <div className="detailMain">
      <div className="itemHead">
        <span className="score" title="score">{item.score}</span>
        <div className="cardTitle">
          <a className="direct" href={item.url} onClick={(e) => { e.preventDefault(); void bridge.openExternal(item.url); }}>
            <strong>
              <span className={item.network === 'hackernews' ? 'netChip hn' : 'netChip rd'}>
                {item.network === 'hackernews' ? 'Y' : 'R'}
              </span>
              {item.title}
            </strong>
          </a>
          <span className="meta">
            {item.target} · {item.author} · {age(item.timestamp)}
            {typeof item.comments === 'number' ? ` · ${item.comments} 💬` : ''}
            {isStale(item) && <span className="staleTag">⌛ {t('staleTag')}</span>}
            {replied && <span className="repliedTag">{t('repliedTag')}</span>}
          </span>
        </div>
      </div>

      {externalUrl ? (
        <>
          {reading && <p className="hint">{t('readingArticle')}</p>}
          {/* The source line shows whether the read worked or not: naming the
              URL that refused is half the diagnosis, and it used to be hidden
              on exactly the runs where the user needed it. */}
          {article && !reading && (
            <p className={article.reason ? 'warn small' : 'hint'}>
              {article.reason ? `${t(ARTICLE_FAIL[article.reason])}${article.status ? ` (${article.status})` : ''} · ` : `${t('articleFrom')} `}
              <a className="direct" href={externalUrl} onClick={(e) => { e.preventDefault(); void bridge.openExternal(externalUrl); }}>{externalUrl}</a>
            </p>
          )}
          {article?.text
            ? renderText(article.text)
            // No body to show — but a translated TITLE needs somewhere to
            // live, or the translation is paid for and never displayed.
            : (!reading && translated ? renderText(item.title) : null)}
        </>
      ) : (
        bodyText && renderText(bodyText)
      )}
      {item.matched.length > 0 && (
        <div className="why">
          {item.matched.map(m => <span key={m} className="chip small">{m}</span>)}
        </div>
      )}
      {thread && (
        thread.alive ? (
          <>
            <p className="hint">✓ {t('threadOk')}{thread.commentCount !== null ? ` · ${thread.commentCount} ${t('commentsNow')}` : ''}</p>
            {thread.recent.length > 0 && (
              <details className="postBox" open>
                <summary>{t('latestComments')}</summary>
                {thread.recent.map((c, i) => <pre key={i}>{c}</pre>)}
              </details>
            )}
          </>
        ) : thread.limited
          ? <p className="warn small">{t('rateLimitedMsg')}</p>
          : <p className="warn small">{t(thread.unknown ? 'threadUnknown' : 'threadDead')}</p>
      )}

      {/* key: a new post gets a FRESH studio; the old one's drafts stay saved. */}
      <DraftStudio key={item.id} t={t} lang={lang} item={draftable()} trio={trio} wit={wit} onWit={onWit} alreadyReplied={replied} onLogged={onLogged} />
      </div>

      <aside className="detailSide">
        <button
          className="primary"
          onClick={() => document.getElementById('draftStudio')?.scrollIntoView({ behavior: 'smooth' })}
        >
          {t('draft')}
        </button>
        <button onClick={() => bridge.openExternal(item.url)}>{t('open')}</button>
        <button className={followed ? 'followOn' : undefined} onClick={onToggleFollow}>
          {followed ? t('unfollowBtn') : t('followBtn')}
        </button>
        <button onClick={onMakeStory}>→ {t('makeStory')}</button>
        <button onClick={() => onHide(item.id)}>{t('hideBtn')}</button>
        <hr className="sideRule" />
        {translatable && (
          <button disabled={translating} onClick={translated ? () => setShowOrig(s => !s) : translate}>
            {translating
              ? t('translating')
              : translated
                ? (showOrig ? t('showTranslation') : t('hideTranslation'))
                : `${t('translateBtn')} ${langLabel}`}
          </button>
        )}
        {transFail && <span className="warn small">{t('translateFail')}</span>}
        <hr className="sideRule" />
        <button onClick={recheck} disabled={checking}>
          {checking ? t('verifying') : t('recheckBtn')}
        </button>
      </aside>
      </div>
    </div>
  );
}
