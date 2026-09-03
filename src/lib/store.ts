/**
 * Local persistence — profile, settings, the participation ledger, and the
 * radar's last scan. localStorage for v0 (same choice as social-engine's
 * settings); the ledger graduates to a vault when Pheme learns to ingest.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_TRIO, type MbtiType } from './archetypes';
import type { SkinId } from './skins';
import type { Lang } from './i18n';
import type { ScoredItem } from './score';
import type { DraftSet } from './drafts';
import type { DiagnosisData } from './analyze';
import type { PresenceReport } from './presence';
import { DEFAULT_MEMORY, type MemoryPrefs } from './memory';

/**
 * Everything that belongs to ONE network. The settings used to be a flat bag
 * shaped, without saying so, by Reddit and Hacker News: `subs` was Reddit-only
 * and `topics` doubled as the HN query. A third network had nowhere to put its
 * own pseudonym, its own places to watch, or its own presentation — so every
 * new surface would have widened the bag again.
 */
export interface NetSettings {
  /** The pseudonym on this network. */
  handle: string;
  /** The user's OWN place here — their subreddit, their page. */
  home: string;
  /**
   * What to scan HERE. Subreddit names on Reddit, search queries on Hacker
   * News. Distinct from `topics` on purpose: topics are what the user KNOWS
   * (they score every network), targets are where to look on this one.
   */
  targets: string[];
  /** How the user presents themselves on this network. */
  bio: string;
  /**
   * The link to the user's profile HERE. Not decoration: a handle alone is not
   * addressable on every surface — `@you` on Mastodon is meaningless without
   * the instance, and a LinkedIn vanity URL is not a handle at all.
   */
  profileUrl: string;
  /**
   * Promotion surfaces: the language the user PUBLISHES in here. '' follows
   * the UI language, which is what the composer used to do unconditionally —
   * so an app running in French could not compose an English LinkedIn post,
   * which is most people's actual situation.
   */
  postLang: '' | Lang;
  /** One line: who is on the other side HERE. Feeds the composer's prompt. */
  audience: string;
  /** '' until the user has been through this network's first-run setup. */
  configuredAt: string;
}

export const EMPTY_NET: NetSettings = {
  handle: '', home: '', targets: [], bio: '',
  profileUrl: '', postLang: '', audience: '',
  configuredAt: '',
};

/**
 * Read a network's settings — never undefined, so callers stay simple.
 * Tolerates a profile that never went through `normalizeProfile` (a restored
 * mirror, a hand-built object): a missing `nets` must read as "not configured",
 * never crash the surface that asked.
 *
 * Completed from EMPTY_NET, not returned raw: an entry stored before a field
 * existed carries a PARTIAL object, and `undefined` reads as "off" — the same
 * silent-downgrade-on-upgrade normalizeProfile guards against one level up.
 */
export const netOf = (p: Profile, id: string): NetSettings =>
  (p?.nets?.[id] ? { ...EMPTY_NET, ...p.nets[id] } : EMPTY_NET);

/**
 * Write part of a network's settings. Every edit goes through here so a UI can
 * never half-create a network entry — the shape is completed from EMPTY_NET.
 */
export const setNet = (p: Profile, id: string, patch: Partial<NetSettings>): Profile =>
  ({ ...p, nets: { ...p.nets, [id]: { ...netOf(p, id), ...patch } } });

/** The ids Pheme reads a pseudonym for today. */
export const REDDIT = 'reddit';
export const HN = 'hackernews';

export interface Profile {
  /** Expertise topics — what the user KNOWS. Scores every network's radar. */
  topics: string[];
  /** Per-network settings, keyed by the registry id (networks.ts). */
  nets: Record<string, NetSettings>;
  /** The 2-3 archetypes offered per draft. */
  trio: MbtiType[];
  /** UI language. */
  lang: Lang;
  /** Visual skin (Settings). */
  skin: SkinId;
  /** Why the user is here — drives the onboarding diagnosis and the Coach. */
  goal: '' | 'launch' | 'authority' | 'watch';
  /** Mnemosyne's onboarding diagnosis of the user's public profile. */
  diagnosis: string;
  diagnosedAt: string;
  /**
   * The wordmark printed on every poster. It was the literal string
   * 'MNEMOSYNE OS', hardcoded in the renderer — correct for exactly one user
   * of a cartridge meant to be installed by anyone. Empty renders no wordmark
   * at all, and the layout closes the gap rather than leaving a hole: a blank
   * brand line is a better poster than someone else's brand.
   */
  brand: string;
  /** Wit level for drafts and stories: 0 sober · 1 a dry aside · 2 funny. */
  wit: 0 | 1 | 2;
  /** Presence auto-recheck period in minutes; 0 = manual only. */
  presenceAutoMin: number;
  /** Pauses the auto-recheck without losing its period. */
  presencePaused: boolean;
  /** What of the user's public work Mnemosyne is told to remember. */
  memory: MemoryPrefs;
  done: boolean;
}

export const EMPTY_PROFILE: Profile = {
  topics: [],
  nets: {},
  trio: DEFAULT_TRIO,
  lang: 'en',
  skin: 'host',
  goal: '',
  diagnosis: '',
  diagnosedAt: '',
  brand: '',
  wit: 1,
  // On by default for new profiles: an app that only looks when asked
  // cannot tell you someone replied — which is the reason it exists.
  presenceAutoMin: 30,
  presencePaused: false,
  memory: DEFAULT_MEMORY,
  done: false,
};

/**
 * One logged act of presence. 'participation' = a genuine reply written by
 * the human; 'promo' = anything that pitches the product. The 9:1 gauge and
 * the per-community readiness both read from this.
 */
export interface LedgerEntry {
  at: string;
  community: string;
  url: string;
  kind: 'participation' | 'promo';
}

const K_PROFILE = 'pheme:profile';
const K_LEDGER = 'pheme:ledger';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const K_PROFILE_BACKUP = 'pheme:profile:backup';

/** The flat, Reddit+HN-shaped profile every install before 0.6 was written as. */
interface LegacyProfile {
  subs?: unknown;
  redditUser?: unknown;
  hnUser?: unknown;
  mySub?: unknown;
  topics?: unknown;
}

const strOf = (v: unknown): string => (typeof v === 'string' ? v : '');
const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

/**
 * `read` merges one level deep, so a stored profile written before a key
 * existed carries a PARTIAL nested object and an `undefined` reads as "off" —
 * a setting silently disabling itself on upgrade. Nested defaults are
 * re-applied here, at the one place the profile is loaded.
 *
 * It also carries the 0.6 migration: the flat `subs` / `redditUser` / `hnUser`
 * / `mySub` fields move into `nets`. This is the ONLY place that knows the old
 * shape, it runs once (a network already present is never overwritten), and it
 * is pinned by tests — those subreddits took real time to collect and a
 * migration that loses them is worse than no migration at all.
 */
export function normalizeProfile(p: Profile): Profile {
  const legacy = p as unknown as LegacyProfile;
  // Each stored entry is completed from EMPTY_NET for the same reason the
  // profile itself is: a network configured before a field existed must not
  // read that field as `undefined` on the next launch.
  const nets: Record<string, NetSettings> = Object.fromEntries(
    Object.entries(p.nets ?? {}).map(([id, s]) => [id, { ...EMPTY_NET, ...s }]),
  );

  const adopt = (id: string, from: Partial<NetSettings>) => {
    if (nets[id]) return; // already migrated — never clobber live settings
    const seeded = { ...EMPTY_NET, ...from };
    // Nothing to carry over = a network the user never touched. Leaving it
    // absent is what marks it "never set up" for the first-run flow.
    if (!seeded.handle && !seeded.home && seeded.targets.length === 0) return;
    nets[id] = { ...seeded, configuredAt: new Date(0).toISOString() };
  };

  adopt('reddit', {
    handle: strOf(legacy.redditUser),
    home: strOf(legacy.mySub),
    targets: listOf(legacy.subs),
  });
  // HN's scan targets WERE the expertise topics. They start as a copy and
  // then live their own life — a query you search is not a subject you know.
  adopt('hackernews', {
    handle: strOf(legacy.hnUser),
    targets: listOf(legacy.topics),
  });

  return {
    ...p,
    nets,
    topics: listOf(p.topics),
    memory: { ...DEFAULT_MEMORY, ...(p.memory ?? {}) },
  };
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => normalizeProfile(read(K_PROFILE, EMPTY_PROFILE)));
  useEffect(() => {
    try {
      // Guard: a save that EMPTIES the watch lists or the topics (interview
      // redone with cleared chips, bad state, a migration that went wrong)
      // keeps the previous profile as a backup — a destroyed list must never
      // be the only copy that ever existed. Counts across ALL networks, so it
      // still fires for a surface that did not exist when this was written.
      const prevRaw = localStorage.getItem(K_PROFILE);
      if (prevRaw) {
        const prev = normalizeProfile(JSON.parse(prevRaw) as Profile);
        const targets = (p: Profile) =>
          Object.values(p.nets).reduce((n, s) => n + s.targets.length, 0);
        const emptied =
          (targets(prev) > 0 && targets(profile) === 0) ||
          (prev.topics.length > 0 && profile.topics.length === 0);
        if (emptied) localStorage.setItem(K_PROFILE_BACKUP, prevRaw);
      }
    } catch { /* backup is best-effort — the save below still happens */ }
    localStorage.setItem(K_PROFILE, JSON.stringify(profile));
  }, [profile]);
  return { profile, setProfile };
}

export function loadProfileBackup(): Profile | null {
  try {
    const raw = localStorage.getItem(K_PROFILE_BACKUP);
    return raw ? { ...EMPTY_PROFILE, ...JSON.parse(raw) } : null;
  } catch { return null; }
}

export function useLedger() {
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => readList<LedgerEntry>(K_LEDGER));
  useEffect(() => { localStorage.setItem(K_LEDGER, JSON.stringify(ledger)); }, [ledger]);
  const log = (entry: Omit<LedgerEntry, 'at'>) =>
    setLedger(l => [{ ...entry, at: new Date().toISOString() }, ...l]);
  /**
   * Take ONE act back.
   *
   * A misclick on "I posted a reply" used to be permanent: the only way out
   * was `clear`, which destroys the whole ledger — so the choice was between
   * a wrong count and no history at all. The ledger feeds the 9:1 gauge and
   * every readiness verdict, so one phantom act is not cosmetic; and losing
   * months of real ones to fix it is worse.
   *
   * Keyed on `at`, which is a millisecond ISO stamp and unique per entry. A
   * stamp that matches nothing removes nothing — an undo that silently ate a
   * neighbouring row would be the same class of bug one level down.
   */
  const remove = (at: string) => setLedger(l => withoutAct(l, at));
  return { ledger, log, remove, clear: () => setLedger([]) };
}

/**
 * The ledger minus one act. Pure, so the rule can be pinned by a test rather
 * than trusted: a stamp that matches nothing removes nothing, and removing one
 * entry never disturbs its neighbours.
 */
export const withoutAct = (ledger: LedgerEntry[], at: string): LedgerEntry[] =>
  ledger.filter(e => e.at !== at);

// ── Radar persistence — a scan survives closing the widget ──────────────────

const K_RADAR = 'pheme:radar:cache';
const K_HIDDEN = 'pheme:radar:hidden';

export interface RadarCache { items: ScoredItem[]; at: string }

export function loadRadarCache(): RadarCache | null {
  try {
    const raw = localStorage.getItem(K_RADAR);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RadarCache;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch { return null; }
}

export function saveRadarCache(items: ScoredItem[]): RadarCache {
  const cache: RadarCache = { items, at: new Date().toISOString() };
  try { localStorage.setItem(K_RADAR, JSON.stringify(cache)); }
  catch { /* quota/private mode — the next scan just refetches */ }
  return cache;
}

// ── Pinned radar items — what the user marked relevant survives rescans ──────

const K_PINNED = 'pheme:radar:pinned';
const PIN_CAP = 300;
const HIDDEN_CAP = 500;
const FOLLOWED_CAP = 100;

export function usePinned() {
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(K_PINNED) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(K_PINNED, JSON.stringify(pinned)); }, [pinned]);
  return {
    pinned,
    // Capped in the UPDATER, and keeping the NEWEST: persisting slice(0,N)
    // of an append-list silently dropped the entry just added — the star
    // lit up, then vanished on reload.
    togglePin: (id: string) =>
      setPinned(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-PIN_CAP))),
  };
}

/** Items the user dismissed from the radar — a set of ids, persisted. */
export function useHidden() {
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(K_HIDDEN) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(K_HIDDEN, JSON.stringify(hidden)); }, [hidden]);
  return {
    hidden,
    hide: (id: string) => setHidden(h => (h.includes(id) ? h : [...h, id].slice(-HIDDEN_CAP))),
    unhideAll: () => setHidden([]),
  };
}

// ── Followed threads — any thread the user tracks from the radar ─────────────

const K_FOLLOWED = 'pheme:followed';

export interface FollowedRef {
  /** ThreadNode id format: reddit_<threadId> | hn_<storyId>. */
  id: string;
  network: 'reddit' | 'hackernews';
  title: string;
  url: string;
  community: string;
}

/** Follow-key for a radar item — matches the presence ThreadNode id format. */
export function followRefOf(item: ScoredItem): FollowedRef {
  const m = item.url.match(/\/comments\/([a-z0-9]+)/i);
  return {
    id: item.network === 'reddit' ? (m ? `reddit_${m[1]}` : item.id) : item.id,
    network: item.network,
    title: item.title,
    url: item.url,
    community: item.target,
  };
}

export function useFollowed() {
  const [followed, setFollowed] = useState<FollowedRef[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(K_FOLLOWED) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(K_FOLLOWED, JSON.stringify(followed)); }, [followed]);
  return {
    followed,
    toggle: (ref: FollowedRef) => setFollowed(list =>
      list.some(f => f.id === ref.id)
        ? list.filter(f => f.id !== ref.id)
        : [...list, ref].slice(-FOLLOWED_CAP)),
    isFollowed: (id: string) => followed.some(f => f.id === id),
  };
}

// ── Draft cache — generated drafts are DELIVERABLES, they never evaporate ────

const K_DRAFTS = 'pheme:drafts';
const DRAFTS_CAP = 40;

export interface SavedDrafts {
  id: string;
  at: string;
  drafts: DraftSet;
  angle: string | null;
  ideas: string;
  memory: string | null;
  /** The voice the user actually copied to post — their recorded choice. */
  chosen?: MbtiType | null;
  /**
   * The archetypes these drafts were written in. Per POST: a thread can call
   * for a register the profile trio does not carry, and the studio lets that
   * be picked on the spot. Absent = written in the profile trio of the day.
   */
  voices?: MbtiType[];
  /** Presence ThreadNode id — joins the draft to its thread (replies loop). */
  ref?: string;
}

function readDrafts(): SavedDrafts[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(K_DRAFTS) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function loadDrafts(id: string): SavedDrafts | null {
  return readDrafts().find(e => e.id === id) ?? null;
}

/**
 * Read a draft set under its STABLE key (the thread id), falling back to
 * a legacy key (the radar item id, which drifts between scans — how a
 * revisit "lost" its drafts). PURE: it used to persist the migration from
 * inside a component's render, so merely OPENING an old post could evict
 * another post's drafts.
 */
export function loadDraftsAs(key: string, legacyKey: string): SavedDrafts | null {
  const all = readDrafts();
  return all.find(e => e.id === key) ?? all.find(e => e.id === legacyKey) ?? null;
}

/** Re-key a legacy entry. Call from an effect, never during render. */
export function migrateDraftKey(key: string, legacyKey: string): void {
  if (key === legacyKey) return;
  const all = readDrafts();
  if (all.some(e => e.id === key)) return;
  const old = all.find(e => e.id === legacyKey);
  if (!old) return;
  const next = [{ ...old, id: key, ref: key }, ...all.filter(e => e.id !== legacyKey)].slice(0, DRAFTS_CAP);
  try { localStorage.setItem(K_DRAFTS, JSON.stringify(next)); }
  catch { /* quota — the entry stays readable under its legacy key */ }
}

export function saveDrafts(entry: SavedDrafts): void {
  const next = [entry, ...readDrafts().filter(e => e.id !== entry.id)].slice(0, DRAFTS_CAP);
  try { localStorage.setItem(K_DRAFTS, JSON.stringify(next)); }
  catch { /* quota — the on-screen copy is still there to copy out */ }
}

/**
 * Persist ONE reworked draft. The text on screen is what gets posted, so the
 * user's edits are the deliverable — a rewrite that survives only until the
 * post is reopened is worse than no textarea at all.
 *
 * Writes the one entry it was given and nothing else: rebuilding the whole
 * `SavedDrafts` from a component's state is how a stale copy overwrites a
 * fresher one (the bug class that ate the profile's subs).
 */
export function saveDraftText(id: string, type: MbtiType, text: string): void {
  const all = readDrafts();
  const entry = all.find(e => e.id === id);
  const draft = entry?.drafts.drafts.find(d => d.type === type);
  if (!draft) return;
  draft.text = text;
  try { localStorage.setItem(K_DRAFTS, JSON.stringify(all)); }
  catch { /* quota — the on-screen copy is still there to copy out */ }
}

// ── Voice log — the recorded choices, kept apart from the draft cache ────────

const K_VOICES = 'pheme:voices';
const VOICES_CAP = 1000;

export interface VoiceEntry { at: string; type: MbtiType; ref: string; net: string }

export function loadVoiceLog(): VoiceEntry[] {
  return readList<VoiceEntry>(K_VOICES);
}

/**
 * Record which voice was posted. Written to its OWN log, not just onto the
 * draft: the draft cache is a rolling 40, so the Coach's voice table used
 * to be a sliding window while the ledger beside it counted all-time.
 */
export function saveChosen(id: string, chosen: MbtiType): void {
  const all = readDrafts();
  const entry = all.find(e => e.id === id);
  if (entry) {
    entry.chosen = chosen;
    try { localStorage.setItem(K_DRAFTS, JSON.stringify(all)); }
    catch { /* quota — the log below is what the stats read */ }
  }
  const log = loadVoiceLog().filter(v => v.ref !== id);
  const net = id.startsWith('hn_') ? 'hackernews' : 'reddit';
  const next = [...log, { at: new Date().toISOString(), type: chosen, ref: id, net }].slice(-VOICES_CAP);
  try { localStorage.setItem(K_VOICES, JSON.stringify(next)); }
  catch { /* quota — the on-screen check still shows this session */ }
}

/** Which posts have saved drafts — drives the ✎ marker on radar tiles. */
export function draftedIds(): Set<string> {
  return new Set(readDrafts().map(e => e.id));
}

// ── Voice usage — which archetype the user ACTUALLY posts ────────────────────

export interface VoiceStats {
  type: MbtiType;
  total: number;
  reddit: number;
  hackernews: number;
  /** Replies received on this voice's threads — tracked subset only. */
  replies: number;
  /** How many of this voice's threads are still tracked in presence. */
  tracked: number;
  /** Average upvote score, over the threads whose score the source gave. */
  avgScore: number | null;
  /** How many threads that average rests on — honesty about the sample. */
  scored: number;
}

/**
 * Counted from recorded choices only (copy or the "which one?" picker) —
 * never inferred. The post id prefix carries the network. Replies join
 * through threads STILL in the presence report: absent is unknown, never
 * zero, so an untracked thread simply stays uncounted.
 */
export function chosenVoiceStats(presence?: PresenceReport | null): VoiceStats[] {
  const replyCount = new Map<string, number>();
  const scoreOf = new Map<string, number>();
  if (presence) {
    for (const g of presence.groups) for (const th of g.threads) {
      // Humans only: this is "did this voice earn answers?", and a bot that
      // answers every thread identically would credit every voice equally.
      replyCount.set(th.id, th.replies.filter(r => !r.bot).length);
      // Only threads whose source actually gave a score feed the average —
      // an unknown score must not drag it toward zero.
      if (typeof th.myScore === 'number') scoreOf.set(th.id, th.myScore);
    }
  }
  const by = new Map<MbtiType, VoiceStats>();
  const scoreSum = new Map<MbtiType, number>();
  // The voice LOG is the source of truth (all-time); legacy choices that
  // only exist on a cached draft are folded in once, keyed by thread.
  const seen = new Set<string>();
  const entries = loadVoiceLog().map(v => ({ type: v.type, ref: v.ref }));
  for (const v of entries) seen.add(v.ref);
  for (const d of readDrafts()) {
    if (d.chosen && d.ref && !seen.has(d.ref)) {
      seen.add(d.ref);
      entries.push({ type: d.chosen, ref: d.ref });
    }
  }
  for (const e of entries) {
    const s = by.get(e.type)
      ?? { type: e.type, total: 0, reddit: 0, hackernews: 0, replies: 0, tracked: 0, avgScore: null, scored: 0 };
    s.total++;
    if (e.ref.startsWith('reddit_')) s.reddit++;
    else if (e.ref.startsWith('hn_')) s.hackernews++;
    if (replyCount.has(e.ref)) {
      s.tracked++;
      s.replies += replyCount.get(e.ref) ?? 0;
    }
    if (scoreOf.has(e.ref)) {
      s.scored++;
      scoreSum.set(e.type, (scoreSum.get(e.type) ?? 0) + (scoreOf.get(e.ref) ?? 0));
    }
    by.set(e.type, s);
  }
  for (const s of by.values()) {
    s.avgScore = s.scored > 0 ? Math.round(((scoreSum.get(s.type) ?? 0) / s.scored) * 10) / 10 : null;
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

// ── Diagnosis timeline — every analysis since the FIRST scan, kept ───────────

const K_DIAG_LOG = 'pheme:diagnoses';
const DIAG_CAP = 24;

export interface DiagnosisSnapshot {
  at: string;
  goal: Profile['goal'];
  /** Readable rendering — Coach, Dashboard and the voice read this. */
  text: string;
  /** Structured form for the tile display; null when parsing failed. */
  data: DiagnosisData | null;
}

export function loadDiagnoses(): DiagnosisSnapshot[] {
  return readList<DiagnosisSnapshot>(K_DIAG_LOG);
}

/**
 * Prepend a snapshot; newest first, capped — but the FIRST analysis is
 * kept whatever happens. Trimming the oldest deleted the very point of
 * reference the timeline exists to compare against.
 */
export function pushDiagnosis(snap: DiagnosisSnapshot): DiagnosisSnapshot[] {
  const cur = loadDiagnoses();
  const all = [snap, ...cur];
  const next = all.length <= DIAG_CAP
    ? all
    : [...all.slice(0, DIAG_CAP - 1), all[all.length - 1]];
  try { localStorage.setItem(K_DIAG_LOG, JSON.stringify(next)); }
  catch { /* quota — the freshest one still lives in the profile */ }
  return next;
}

/**
 * Migration: a diagnosis made before the timeline existed becomes its
 * first point, dated by the original analysis. Idempotent.
 */
export function ensureDiagnosisSeed(profile: Profile): DiagnosisSnapshot[] {
  const cur = loadDiagnoses();
  if (cur.length > 0 || !profile.diagnosis) return cur;
  return pushDiagnosis({
    at: profile.diagnosedAt || new Date().toISOString(),
    goal: profile.goal,
    text: profile.diagnosis,
    data: null,
  });
}

// ── Translation cache — a translation is paid for once ───────────────────────

const K_TRANS = 'pheme:translations';
const TRANS_CAP = 100;

interface TransEntry { id: string; lang: string; text: string; at: string }

function readTrans(): TransEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(K_TRANS) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function loadTranslation(id: string, lang: string): string | null {
  return readTrans().find(e => e.id === id && e.lang === lang)?.text ?? null;
}

export function saveTranslation(id: string, lang: string, text: string): void {
  const rest = readTrans().filter(e => !(e.id === id && e.lang === lang));
  const next = [{ id, lang, text, at: new Date().toISOString() }, ...rest].slice(0, TRANS_CAP);
  try { localStorage.setItem(K_TRANS, JSON.stringify(next)); }
  catch { /* quota — the next open simply re-asks the model */ }
}

// ── Weekly rhythm (Coach) ────────────────────────────────────────────────────

/** Activity per day for the last 7 days, oldest first. */
export function weeklyActivity(ledger: LedgerEntry[]): number[] {
  const days = new Array(7).fill(0) as number[];
  const now = Date.now();
  for (const e of ledger) {
    const ageDays = Math.floor((now - Date.parse(e.at)) / 86_400_000);
    if (ageDays >= 0 && ageDays < 7) days[6 - ageDays]++;
  }
  return days;
}

/**
 * What the user DID here, counted, and nothing more.
 *
 * There used to be a `ready` boolean on this — `participation >= 8 && a local
 * 9:1` — and three screens printed it as the verdict. It was one invented
 * floor applied identically to a subreddit that BANS self-promotion and to a
 * surface where launching is the point (doc 75 §1). Readiness is now
 * `lib/readiness.ts`, which reads the community's own rules; this stays a
 * count, which is the one thing it was always right about.
 */
export interface CommunityStats {
  community: string;
  participation: number;
  promo: number;
  lastAt: string;
}

export function communityStats(ledger: LedgerEntry[]): CommunityStats[] {
  const by = new Map<string, CommunityStats>();
  for (const e of ledger) {
    const s = by.get(e.community) ?? { community: e.community, participation: 0, promo: 0, lastAt: e.at };
    if (e.kind === 'participation') s.participation++; else s.promo++;
    if (e.at > s.lastAt) s.lastAt = e.at;
    by.set(e.community, s);
  }
  return [...by.values()].sort((a, b) => b.participation - a.participation);
}
