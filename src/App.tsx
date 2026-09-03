/**
 * Pheme - reputation partner. App.tsx owns STATE AND WIRING ONLY: every
 * surface lives in components/, every behaviour in lib/. The hard rule is
 * structural and global: no code path posts anywhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { bridge, isFramed } from './lib/bridge';
import { mergeScan, scanRadar } from './lib/scan';
import { scoreItems, type ScoredItem } from './lib/score';
import { cachePresence, fetchPresence, getLastSeen, loadCachedPresence, markAllSeen, mergePresence, unseenCount, type PresenceReport, type SeenMarks } from './lib/presence';
import { HN, REDDIT, draftedIds, followRefOf, loadRadarCache, netOf, saveRadarCache, useFollowed, useHidden, useLedger, usePinned, useProfile } from './lib/store';
import { ledgerKeys } from './lib/authorship';
import { loadStories, saveStories, seedStoryFromThread } from './lib/stories';
import { recordSnapshot } from './lib/history';
import { reportFacts } from './lib/report';
import { makeT } from './lib/i18n';
import { SKINS } from './lib/skins';
import { Shell, useWidth } from './components/shared';
import { AskDrawer } from './components/AskDrawer';
import { Dashboard } from './components/Dashboard';
import { Dock } from './components/Dock';
import { NetworkBoard } from './components/NetworkBoard';
import { NETWORKS } from './lib/networks';
import { cooldownRemainingMs } from './lib/redditGate';
import { Onboarding } from './components/Onboarding';
import { DetailView, RadarTab } from './components/Radar';
import { CoachTab } from './components/CoachTab';
import { PresenceTab } from './components/PresenceTab';
import { NetProfile } from './components/NetProfile';
import type { ReplyKit } from './components/ThreadCard';
import { PublishTab } from './components/PublishTab';
import { SettingsTab } from './components/SettingsTab';
import { unseenByNetwork } from './lib/selectors';
import type { MnemoTier } from './lib/rank';
import { loadWatchSignature, saveWatchSignature, watchSignature, watchTargetsFor } from './lib/watch';
import { hasProfile, localIsBlank, restoreLocal, snapshotLocal } from './lib/mirror';
import { diagnosisMemory, loadWritten, markWritten, memoryStats, pendingMemories } from './lib/memory';

/** One-shot flag: a mirror restore reloads the app, the notice must outlive it. */
const K_RESTORED = 'pheme:mirror:restoredAt';
import type { PubNetwork } from './lib/stories';
import type { StringKey } from './lib/i18n';

/**
 * v2 navigation — the NETWORK is the primary tab; its functions are the
 * sub-tabs (V2_BLUEPRINT.md). 'cockpit' holds the global views (dashboard,
 * coach); each live network opens ITS OWN board/radar/presence or studio.
 */
// A network id from the registry, or one of the two global scopes below.
// Written as a bare string on purpose: a union with `string` in it collapses
// to `string` anyway, so spelling the literals out promised a narrowing the
// compiler never gave. The two reserved values are named here instead.
// The two reserved values are 'cockpit' (the global views) and 'settings';
// anything else is a network id from the registry.
type Scope = string;

// One read at module load - both radar states boot from the same snapshot.
const bootRadar = loadRadarCache();

export default function App() {
  const { profile, setProfile } = useProfile();
  const { ledger, log, remove: unlog, clear } = useLedger();
  const t = useMemo(() => makeT(profile.lang), [profile.lang]);

  // Measured on the SHELL ROOT, never on the dock: the dock sits in the header
  // and is sized by its own content, so measuring it reported ~200px on a
  // maximised window and the app opened permanently in its narrow mode.
  const rootRef = useRef<HTMLDivElement>(null);
  const navWidth = useWidth(rootRef);
  const [scope, setScope] = useState<Scope>('cockpit');
  const [sub, setSub] = useState<string>('dash');
  const [askOpen, setAskOpen] = useState(false);
  // The radar boots from its cached scan — closing the widget loses nothing.
  const [items, setItems] = useState<ScoredItem[]>(bootRadar?.items ?? []);
  const [scannedAt, setScannedAt] = useState<string | null>(bootRadar?.at ?? null);
  const [scanning, setScanning] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  /** Subs a batched request could not bring back — cause unattributed. */
  const [uncovered, setUncovered] = useState<string[]>([]);
  const [radarLimited, setRadarLimited] = useState(false);
  const [subsCovered, setSubsCovered] = useState<{ ok: number; total: number } | null>(null);
  const [detail, setDetail] = useState<ScoredItem | null>(null);
  const { hidden, hide, unhideAll } = useHidden();
  const { pinned, togglePin } = usePinned();
  // Radar filters live HERE: the tab unmounts while a post is open, and a
  // filtered view was silently reset by the trip through a detail page.
  const [showHidden, setShowHidden] = useState(false);
  const [tierFilter, setTierFilter] = useState<MnemoTier | 'all'>('all');
  /**
   * Which watched target the radar is narrowed to. Same reason as the two
   * above: the tab unmounts while a post is open. `go()` clears it — a sub
   * filter carried onto another network would match nothing there and read as
   * "the scan found nothing here".
   */
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const { followed, toggle: toggleFollow, isFollowed } = useFollowed();

  // Presence lives at the App level so its unseen badge shows from any tab.
  // It boots from the cached report: reopening Pheme never forces a rescan.
  const [presence, setPresence] = useState<PresenceReport | null>(() => loadCachedPresence());
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [lastSeen, setLastSeen] = useState<SeenMarks>(() => getLastSeen());
  const unseen = unseenCount(presence, lastSeen);

  const framed = isFramed();
  // The two networks Pheme reads a pseudonym for. Read once, so no surface
  // reaches into the profile's shape on its own.
  const reddit = netOf(profile, REDDIT);
  const hn = netOf(profile, HN);

  const repliedUrls = useMemo(
    () => new Set(ledger.filter(e => e.kind === 'participation').map(e => e.url)),
    [ledger],
  );
  // Every thread Pheme had a hand in, keyed by thread rather than by URL. The
  // engine derives the same set to count solo acts; building it once here means
  // a card and the verdict can never disagree about the same thread.
  const writtenKeys = useMemo(() => ledgerKeys(ledger), [ledger]);

  /**
   * What lets a conversation be ANSWERED, wherever it is unfolded — Pseudo
   * or a network board. Built once so both surfaces share the same ledger
   * rule: one thread, one participation. A second click must never inflate
   * the 9:1 gauge.
   */
  const replyKit: ReplyKit = useMemo(() => ({
    lang: profile.lang, trio: profile.trio, wit: profile.wit, repliedUrls, writtenKeys,
    onWit: (w) => setProfile(p => ({ ...p, wit: w })),
    onLogged: (item) => {
      if (repliedUrls.has(item.url)) return;
      log({ community: item.target, url: item.url, kind: 'participation' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log/setProfile are stable setters
  }), [profile.lang, profile.trio, profile.wit, repliedUrls, writtenKeys]);

  // A ref, not the state: the timer tick reads a stale `presenceBusy` and
  // would start a SECOND concurrent run — two parallel Reddit runs are
  // exactly what trips the per-IP throttle.
  const busyRef = useRef(false);
  const refreshPresence = async () => {
    if (busyRef.current || !framed) return;
    busyRef.current = true;
    setPresenceBusy(true);
    try {
      const report = await fetchPresence(
        // `subs` is not scanned here — it says whose RULES to read (doc 75
        // lot 2). A sub the user watches but has not posted in yet is exactly
        // where the verdict has to be ready before they launch.
        { redditUser: reddit.handle, hnUser: hn.handle, mySub: reddit.home, subs: reddit.targets },
        bridge.fetchUrl,
        followed,
      );
      // Merge over the previous state: what re-fetched updates, what the
      // throttle left out survives from the last good run. Functional update
      // on purpose — the auto-recheck interval calls this from an older
      // closure, and the merge must land on the CURRENT report, not a stale one.
      setPresence(prev => {
        const merged = mergePresence(prev, report, reddit.home);
        cachePresence(merged);
        return merged;
      });
      // Write today's counts down, once per day, for the app and for each
      // reputation surface. PASSIVE on purpose: a history that only accrued
      // when someone opened a report would be full of holes, and a hole is
      // exactly what makes a comparison unmeasurable (doc 75 lot 4).
      for (const scope of [undefined, 'reddit', 'hackernews'] as const) {
        recordSnapshot(reportFacts(ledger, report, scope));
      }
      // What the host found while we were closed has now been fetched for
      // real — its inbox has served its purpose and must not double-count.
      try { await bridge.watchClear(); setBgUnread(0); } catch { /* capability absent */ }
    } finally {
      busyRef.current = false;
      setPresenceBusy(false);
    }
  };

  /**
   * What the user PUBLISHED goes into their own memory (SOCIAL vault), so
   * Mnemosyne can recall it later the way it recalls anything else. Settings
   * decides what counts; nothing here is inferred and nothing is written
   * twice (`pheme:memory:written` holds the receipts).
   *
   * An effect on the REPORT, not a call inside `setPresence`: the updater
   * runs when React processes the update, so the merged report is not
   * readable on the line after. This also covers a boot from cache.
   */
  const [memBusy, setMemBusy] = useState(false);
  const [memError, setMemError] = useState<string | null>(null);
  const [memStats, setMemStats] = useState(() => memoryStats());
  // Bumped by "grant it now" — re-runs the pass without a rescan or a restart.
  const [memRetry, setMemRetry] = useState(0);
  const memRunning = useRef(false);

  /**
   * The manifest declares `vault:write`, but enforcement reads the registry
   * built at startup — so on the run where the permission was added, every
   * write was refused with a message that read like a bug. This asks the host
   * to re-read the manifest, then retries.
   */
  const retryMemory = async () => {
    setMemError(null);
    try {
      const res = await bridge.refreshPermissions(['vault:write']);
      if (!res?.granted?.['vault:write']) {
        setMemError('vault:write still refused — restart Mnemosyne OS.');
        return;
      }
      setMemRetry(n => n + 1);
    } catch (e) {
      setMemError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!framed || memRunning.current) return;
    const items = pendingMemories(presence, profile.memory, loadWritten());
    const diag = profile.memory.diagnosis
      ? diagnosisMemory(profile.diagnosis, profile.diagnosedAt)
      : null;
    if (diag && !loadWritten()[diag.ref]) items.push(diag);
    if (items.length === 0) return;

    memRunning.current = true;
    setMemBusy(true);
    setMemError(null);
    let alive = true;
    void (async () => {
      const done: string[] = [];
      try {
        for (const it of items) {
          // Sequential: each ingest embeds and persists host-side, and firing
          // twenty at once would queue behind the same embedder anyway.
          await bridge.remember(it.text, it.ref);
          done.push(it.ref);
        }
      } catch (e) {
        // A refused write is NOT "nothing to remember" — say which failure.
        if (alive) setMemError(e instanceof Error ? e.message : String(e));
      } finally {
        // Receipts for what actually landed, even when the loop broke: the
        // ones already written must never be paid for a second time.
        if (done.length > 0) markWritten(done);
        if (alive) { setMemStats(memoryStats()); setMemBusy(false); }
        memRunning.current = false;
      }
    })();
    return () => { alive = false; };
  }, [presence, profile.memory, profile.diagnosis, profile.diagnosedAt, framed, memRetry]);

  // Opening the presence sub-tab IS asking — one automatic fetch, and only
  // when there is no cached report at all. Everything else is the button or
  // the timer.
  const hasPresenceConfig = !!(reddit.handle || hn.handle || reddit.home);
  useEffect(() => {
    if (sub === 'presence' && presence === null && !presenceBusy && framed && hasPresenceConfig) {
      void refreshPresence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on sub-tab entry
  }, [sub]);

  /**
   * The host mirror (doc 73). Two jobs, in this order:
   *  1. If THIS origin is blank but the host holds a profile, restore it —
   *     that is a cartridge that just booted under a new origin, not a new
   *     user. A local profile always wins; the mirror can lag a moment.
   *  2. Otherwise keep the mirror fresh.
   * The app is fully usable if this fails: localStorage stays the primary.
   */
  // A restore reloads the app, so the news has to survive the reload to be
  // tellable. Silently repopulating someone's profile would be worse magic
  // than losing it.
  const [restoredNotice, setRestoredNotice] = useState(() => {
    try {
      if (localStorage.getItem(K_RESTORED)) { localStorage.removeItem(K_RESTORED); return true; }
    } catch { /* private mode */ }
    return false;
  });
  useEffect(() => {
    if (!framed) return;
    let alive = true;
    void (async () => {
      try {
        if (localIsBlank()) {
          const res = await bridge.stateGet();
          const snap = res?.state?.snapshot;
          if (alive && snap && hasProfile(snap) && restoreLocal(snap).length > 0) {
            try { localStorage.setItem(K_RESTORED, new Date().toISOString()); } catch { /* private mode */ }
            // The whole app derives from these keys at mount; re-reading
            // them piecemeal would leave half the surfaces on stale state.
            window.location.reload();
            return;
          }
        }
        await bridge.stateSet(snapshotLocal());
      } catch { /* capability absent or declined — localStorage still works */ }
    })();
    return () => { alive = false; };
     
  }, [framed, profile, ledger.length]);

  /**
   * Hand the host what to watch while this window is closed (doc 72), and
   * read what it found. Registration is idempotent by signature, so it
   * happens on a real config change and not on every render.
   */
  const [bgUnread, setBgUnread] = useState(0);
  useEffect(() => {
    if (!framed) return;
    let alive = true;
    void (async () => {
      const targets = watchTargetsFor(profile);
      const interval = profile.presenceAutoMin || 30;
      const sig = watchSignature(targets, interval);
      try {
        if (targets.length === 0) {
          if (loadWatchSignature()) { await bridge.watchUnregister(); saveWatchSignature(''); }
        } else if (sig !== loadWatchSignature()) {
          await bridge.watchRegister(targets, interval);
          saveWatchSignature(sig);
        }
        const res = await bridge.watchInbox();
        if (alive) setBgUnread(res?.items?.length ?? 0);
      } catch {
        // The permission may be declined, or the host may be older than
        // the capability: the app simply keeps working without it.
        if (alive) setBgUnread(0);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config identity, not object identity
  }, [framed, reddit.handle, hn.handle, reddit.home, profile.presenceAutoMin]);

  // The timer must call the CURRENT refresh, not the one captured when it
  // was armed: with the closure, renaming a pseudonym left the timer
  // polling the old account forever, and newly followed threads were never
  // auto-updated. A ref keeps the interval identity stable AND live.
  const refreshRef = useRef(refreshPresence);
  refreshRef.current = refreshPresence;

  // The user's own timer (Settings): re-check every N minutes while Pheme is
  // open, pausable. The interval is torn down on every dependency change and
  // on unmount — a widget that closes stops asking, always.
  useEffect(() => {
    if (!framed || profile.presencePaused || !profile.presenceAutoMin || !hasPresenceConfig) return;
    const id = setInterval(() => { void refreshRef.current(); }, profile.presenceAutoMin * 60_000);
    return () => clearInterval(id);
  }, [framed, profile.presencePaused, profile.presenceAutoMin, hasPresenceConfig]);

  const runScan = async (only?: 'reddit' | 'hackernews') => {
    if (scanning) return;
    setScanning(true);
    try {
      // Each network scans ITS own targets now: subreddits here, search
      // queries there. They were one list wearing two hats.
      const { items: raw, failed: bad, uncovered: unc, rateLimited, okTargets, subsCovered: cov } = await scanRadar(reddit.targets, hn.targets, bridge.fetchUrl, only);
      // A scoped scan reports only its own failures; the other network's
      // previous verdicts stay untouched.
      setFailed(prev => (only ? [...prev.filter(f => only === 'reddit' ? f.startsWith('HN') : !f.startsWith('HN')), ...bad] : bad));
      setUncovered(unc);
      setRadarLimited(rateLimited);
      if (only !== 'hackernews') setSubsCovered(cov);
      const scored = scoreItems(raw, profile.topics);
      // A throttled or partial run keeps what the last good run brought —
      // only targets that answered replace their own items. What the user
      // MARKED (pins, drafts, follows) survives even a fresh listing.
      const drafted = draftedIds();
      const followedIds = new Set(followed.map(f => f.id));
      const retainIds = new Set(items
        .filter(i => pinned.includes(i.id)
          || drafted.has(i.id) || drafted.has(followRefOf(i).id)
          || followedIds.has(followRefOf(i).id))
        .map(i => i.id));
      const merged = mergeScan(items, scored, okTargets, retainIds).sort((a, b) => b.score - a.score);
      setItems(merged);
      setScannedAt(saveRadarCache(merged).at);
    } finally {
      setScanning(false);
    }
  };

  /**
   * ONE refresh, in the order that survives the circuit breaker.
   *
   * Every Reddit call shares one gate, and a single 429 freezes ALL of Reddit
   * for ten minutes (redditGate). So the radar and the user's own presence
   * were never two budgets competing — they were one, and whichever the user
   * happened to launch first could condemn the other. Presence goes first
   * because it is the cheaper of the two and answers the only question that
   * cannot wait: did somebody speak to me? The radar takes what is left, and
   * if the breaker tripped meanwhile it is SKIPPED rather than spending a
   * call to prove the wall is there — and the board says so, because a radar
   * silently left stale is indistinguishable from a radar that found nothing.
   */
  const [refreshPhase, setRefreshPhase] = useState<null | 'presence' | 'radar'>(null);
  const [radarSkipped, setRadarSkipped] = useState(false);
  const refreshAll = async (only?: 'reddit' | 'hackernews') => {
    if (busyRef.current || scanning) return;
    setRadarSkipped(false);
    setRefreshPhase('presence');
    try {
      await refreshPresence();
      if (cooldownRemainingMs() > 0) { setRadarSkipped(true); return; }
      setRefreshPhase('radar');
      await runScan(only);
    } finally {
      setRefreshPhase(null);
    }
  };

  if (!profile.done) {
    // No tab bar yet — give the header a compact skin + language control so
    // nobody sits through onboarding in the wrong surface or language.
    return (
      <Shell
        t={t}
        skin={profile.skin}
        corner={
          <div className="corner">
            {SKINS.map(s => (
              <button
                key={s.id}
                className={profile.skin === s.id ? 'cornerSkin on' : 'cornerSkin'}
                title={s.name[profile.lang]}
                onClick={() => setProfile(p => ({ ...p, skin: s.id }))}
                style={{ background: s.swatch[0] }}
              >
                <span style={{ background: s.swatch[1] }} />
              </button>
            ))}
            <button
              className="cornerLang"
              onClick={() => setProfile(p => ({ ...p, lang: p.lang === 'en' ? 'fr' : 'en' }))}
            >
              {profile.lang === 'en' ? 'FR' : 'EN'}
            </button>
          </div>
        }
      >
        <Onboarding t={t} profile={profile} setProfile={setProfile}
          ledger={ledger} presence={presence} />
      </Shell>
    );
  }

  // v2 navigation — the network is the primary tab, its functions the subs.
  const netDef = NETWORKS.find(n => n.id === scope) ?? null;
  const unseenNet = unseenByNetwork(presence, lastSeen);
  // Where the unread replies actually ARE — the cockpit's unseen doors used
  // to land on Reddit unconditionally, even with every reply on HN.
  const topUnseenNet = ((Object.entries(unseenNet).sort((a, b) => b[1] - a[1])[0]?.[0]) ?? 'reddit') as 'reddit' | 'hackernews';
  const go = (s: Scope, subId?: string) => {
    setScope(s);
    setDetail(null);
    // A target filter belongs to the network it came from.
    if (s !== scope) setSubFilter(null);
    const nd = NETWORKS.find(n => n.id === s);
    setSub(subId ?? (s === 'cockpit' ? 'dash' : nd ? 'board' : ''));
  };
  const subTabs: { id: string; label: StringKey }[] =
    scope === 'cockpit'
      ? [{ id: 'dash', label: 'boardTab' }, { id: 'coach', label: 'coach' }]
      : netDef && netDef.status === 'live' && netDef.tier !== 'licensed'
        ? netDef.role === 'reputation'
          ? [{ id: 'board', label: 'boardTab' }, { id: 'radar', label: 'radar' }, { id: 'presence', label: 'presence' }, { id: 'profile', label: 'netProfileTab' }]
          : [{ id: 'board', label: 'boardTab' }, { id: 'studio', label: 'publish' }, { id: 'profile', label: 'netProfileTab' }]
        : [];
  /**
   * First visit to a live network: show its profile page instead of a board
   * built on nothing. `configuredAt` is the mark, so this happens exactly
   * once per network and never again — including for surfaces that did not
   * exist when the user set the app up.
   */
  const netFirstRun = !!netDef
    && netDef.status === 'live' && netDef.tier !== 'licensed'
    && !netOf(profile, netDef.id).configuredAt;
  const netSub = netFirstRun ? 'profile' : sub;
  const repNet = netDef && netDef.role === 'reputation' && netDef.status === 'live'
    ? (netDef.id as 'reddit' | 'hackernews') : null;
  // Compact below this: measured on the PANE, not the screen — a cartridge is
  // as wide as the window the user gave it, which a media query cannot see.
  // 700, not the old 620: the dock now shares the mark's line, so the header
  // needs the brand (~190px) AND fourteen 36px icons before it is cramped.
  const compact = navWidth > 0 && navWidth < 700;

  const dock = (
    <Dock t={t} scope={scope} unseenNet={unseenNet} compact={compact} onGo={go} />
  );
  return (
    <Shell t={t} skin={profile.skin} corner={dock} rootRef={rootRef}>
      {!askOpen && (
        <button className="askHandle" onClick={() => setAskOpen(true)} title={t('askTitle')}>
          Φ
        </button>
      )}
      <AskDrawer
        t={t} open={askOpen} onClose={() => setAskOpen(false)}
        profile={profile} ledger={ledger} items={items} scannedAt={scannedAt}
        presence={presence} unseen={unseen}
      />

      {/* Primary tabs: Cockpit · one tab per LIVE network · locked roster · ⚙.
          No color dots up here — names carry the row, color lives in the
          boards. Locked networks collapse into ONE quiet door. */}
      {restoredNotice && (
        <p className="cooldownOver" style={{ margin: '8px 18px 0' }}>
          ✓ {t('mirrorRestored')}
          <button className="mini" style={{ marginLeft: 10 }} onClick={() => setRestoredNotice(false)}>×</button>
        </p>
      )}
      {/* The selected network's own functions. Hidden on a first visit: there
          is nothing to look at until the network knows who you are there. */}
      {subTabs.length > 0 && !netFirstRun && (
        <nav className="netbar">
          {subTabs.map(st => (
            <button key={st.id} className={netSub === st.id ? 'fchip on' : 'fchip'}
              onClick={() => { setSub(st.id); setDetail(null); }}>
              {t(st.label)}
            </button>
          ))}
        </nav>
      )}

      {netDef && netSub === 'profile' && (
        <NetProfile
          key={netDef.id}
          t={t} net={netDef} profile={profile} setProfile={setProfile}
          firstRun={netFirstRun}
          onDone={() => setSub('board')}
        />
      )}

      {scope === 'cockpit' && sub === 'dash' && (
        <Dashboard
          t={t} profile={profile} ledger={ledger} presence={presence} unseen={unseen}
          items={items} scannedAt={scannedAt} followedCount={followed.length}
          repliedUrls={repliedUrls} hidden={hidden} unseenNet={topUnseenNet} lastSeen={lastSeen}
          memStats={memStats} memBusy={memBusy} memError={memError}
          // Reddit is the flagship door for network-less tiles; coach stays
          // global; anything that KNOWS its network routes to it.
          onGo={(dest) => dest === 'coach' ? go('cockpit', 'coach') : go('reddit', dest)}
          onDiagnose={() => go('cockpit', 'coach')}
          onUnlog={unlog}
          onGoPresence={(net) => go(net, 'presence')}
          onGoNet={(net) => go(net, 'board')}
          onGoSettings={() => go('settings')}
          onRetryMemory={() => { void retryMemory(); }}
          onOpenItem={(item) => { go(item.network, 'radar'); setDetail(item); }}
        />
      )}
      {scope === 'cockpit' && sub === 'coach' && (
        <CoachTab
          t={t} ledger={ledger} profile={profile} setProfile={setProfile} presence={presence}
          onPromo={(c) => log({ community: c, url: '', kind: 'promo' })} onReset={clear}
        />
      )}
      {scope === 'settings' && (
        <SettingsTab
          t={t} profile={profile} setProfile={setProfile}
          onInterview={() => setProfile(p => ({ ...p, done: false }))}
        />
      )}

      {netDef && (netDef.tier === 'licensed' || netSub === 'board') && (
        <NetworkBoard
          t={t} netId={netDef.id} profile={profile} setProfile={setProfile}
          ledger={ledger} items={items} presence={presence} lastSeen={lastSeen}
          replyKit={replyKit}
          refreshPhase={refreshPhase} radarSkipped={radarSkipped}
          onRefreshAll={() => void refreshAll(netDef.id as 'reddit' | 'hackernews')}
          onGo={(dest) => dest === 'coach' ? go('cockpit', 'coach')
            : dest === 'settings' ? go('settings')
              : setSub(dest === 'publish' ? 'studio' : dest)}
          onOpenItem={(item) => { setSub('radar'); setDetail(item); }}
        />
      )}
      {repNet && netSub === 'radar' && (detail ? (
        <DetailView
          t={t} lang={profile.lang} item={detail} followed={isFollowed(followRefOf(detail).id)}
          replied={repliedUrls.has(detail.url)}
          trio={profile.trio} wit={profile.wit}
          onWit={(w) => setProfile(p => ({ ...p, wit: w }))}
          onBack={() => setDetail(null)}
          onToggleFollow={() => toggleFollow(followRefOf(detail))}
          onLogged={(item) => {
            // The ledger is a count of ACTS: one thread, one participation.
            // Regenerating drafts re-enabled the button, and a second click
            // inflated the 9:1 gauge and every readiness verdict.
            if (repliedUrls.has(item.url)) return;
            log({ community: item.target, url: item.url, kind: 'participation' });
          }}
          onHide={(id) => { hide(id); setDetail(null); }}
          onMakeStory={() => {
            const story = seedStoryFromThread({
              title: detail.title, url: detail.url, body: detail.body, target: detail.target,
            });
            saveStories([story, ...loadStories()]);
            go('x', 'studio');
          }}
        />
      ) : (
        <RadarTab
          t={t} framed={framed} items={items} topics={profile.topics} scanning={scanning} failed={failed} uncovered={uncovered} rateLimited={radarLimited}
          scannedAt={scannedAt} hidden={hidden} onHide={hide} onUnhideAll={unhideAll}
          repliedUrls={repliedUrls} netFilter={repNet} subsCovered={subsCovered}
          pinned={pinned} onTogglePin={togglePin}
          showHidden={showHidden} onShowHidden={setShowHidden}
          tierFilter={tierFilter} onTierFilter={setTierFilter}
          targets={repNet === 'reddit' ? reddit.targets : hn.targets}
          subFilter={subFilter} onSubFilter={setSubFilter}
          onScan={() => runScan(repNet ?? undefined)}
          onOpenDetail={setDetail}
        />
      ))}
      {repNet && netSub === 'presence' && (
        <PresenceTab
          t={t} profile={profile} setProfile={setProfile}
          report={presence} busy={presenceBusy} lastSeen={lastSeen} framed={framed}
          netFilter={repNet} bgUnread={bgUnread}
          replyKit={replyKit}
          onRefresh={refreshPresence}
          // Mark only the network on screen: clearing the other tab's badge
          // from here would erase replies this surface never displayed.
          onMarkSeen={() => setLastSeen(marks => markAllSeen(marks, repNet ?? undefined))}
        />
      )}
      {netDef && netDef.role === 'promotion' && netDef.tier !== 'licensed' && netSub === 'studio' && (
        <PublishTab
          key={netDef.id}
          t={t} framed={framed} profile={profile}
          onWit={(w) => setProfile(p => ({ ...p, wit: w }))}
          fixedNet={netDef.id as PubNetwork}
          onPromo={(c) => log({ community: c, url: '', kind: 'promo' })}
        />
      )}
    </Shell>
  );
}
