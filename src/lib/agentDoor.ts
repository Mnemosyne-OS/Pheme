/**
 * agentDoor — the cartridge's half of the agent door (host doc 75 §14).
 *
 * An external agent (Claude Code over the MCP, say) can put a subreddit, an
 * HN query or a topic on Pheme's radar, and read what the radar last found.
 * It never talks to this iframe: it edits the host-side MIRROR of the profile
 * (doc 73) and leaves a dated, signed RECEIPT next to it. This module is how
 * Pheme notices and adopts that, and how it hands the radar back.
 *
 *   in  — `pheme:agent` in the mirror carries a revision. When it is newer
 *         than the one this origin has seen, the mirrored profile is adopted
 *         (the agent's edit was made on top of what Pheme last mirrored, so
 *         nothing of the human's is lost), the receipt is kept locally, and
 *         the human is TOLD, with what changed. Silently repopulating a watch
 *         list would be the same bad magic as silently losing one.
 *   out — after every scan and every Mnemosyne pass, a COMPACT projection of
 *         the radar (`pheme:radar:agent`: title, url, sub, score, tier — no
 *         bodies) is written locally and mirrored. Compact because the mirror
 *         is capped at 256 KB and the full radar cache carries bodies; dated
 *         because an agent reading it a week later must know it is a week old.
 *
 * ⛔ There is no door for posting. The agent drafts elsewhere; the human
 * posts (no OAuth, by decision). An agent that could post as the human is
 * the automated form of what the radar exists to make unnecessary.
 */
import { bridge } from './bridge';
import { snapshotLocal, type MirrorSnapshot, hasProfile } from './mirror';
import { normalizeProfile, type Profile } from './store';
import { isStale, type ScoredItem } from './score';
import type { MnemoTier, RankMap } from './rank';

/** Written by the HOST door; read here. Both sides pin the shape in their tests. */
export const K_AGENT = 'pheme:agent';
/** The highest agent revision this origin has adopted. */
export const K_AGENT_SEEN = 'pheme:agent:seen';
/** The radar as projected for agents — see `radarProjection`. */
export const K_RADAR_AGENT = 'pheme:radar:agent';
/** The host's nudge, relayed into the iframe as a plugin event (host usePluginBridge). */
export const STATE_CHANGED_EVENT = 'mnemosyne:state-changed';
/** Lines a projection keeps. ~200 bytes each: well under the mirror's budget with everything else. */
export const RADAR_PROJECTION_CAP = 60;

export interface AgentReceipt {
  at: string;
  by: string;
  byName?: string;
  applied: number;
  ops: Array<{ op: 'add' | 'remove'; kind: 'sub' | 'topic' | 'hnQuery'; value: string }>;
}

export interface AgentRecord {
  revision: number;
  at: string;
  by: string;
  receipts: AgentReceipt[];
}

function parseRecord(raw: unknown): AgentRecord | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<AgentRecord>;
    if (typeof r?.revision !== 'number' || !Number.isFinite(r.revision)) return null;
    return {
      revision: r.revision,
      at: typeof r.at === 'string' ? r.at : '',
      by: typeof r.by === 'string' ? r.by : '',
      receipts: Array.isArray(r.receipts) ? r.receipts.filter((x): x is AgentReceipt => !!x && typeof x === 'object' && Array.isArray((x).ops)) : [],
    };
  } catch { return null; }
}

/** The agent record a mirror snapshot carries, or null. */
export function agentRecordOf(snap: MirrorSnapshot | null | undefined): AgentRecord | null {
  return parseRecord(snap?.[K_AGENT]);
}

/** The record this origin adopted last (kept locally so Settings can show the receipts). */
export function loadAgentRecord(): AgentRecord | null {
  try { return parseRecord(localStorage.getItem(K_AGENT)); } catch { return null; }
}

export function seenAgentRevision(): number {
  try {
    const n = Number(localStorage.getItem(K_AGENT_SEEN) ?? '0');
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

function markAgentSeen(revision: number): void {
  try { localStorage.setItem(K_AGENT_SEEN, String(revision)); } catch { /* private mode */ }
}

/**
 * Adopts the mirrored profile when the mirror carries an agent revision this
 * origin has not seen. Returns what was adopted, or null when there is
 * nothing to adopt — same revision, no record, or a mirror with no profile
 * (a record alone is not a profile, and adopting nothing is not adopting).
 *
 * Side effects on adoption: the record lands in localStorage (so the next
 * mirror sync carries it forward instead of erasing it), and the revision is
 * marked seen. The PROFILE is handed back, not written: the caller owns the
 * profile state and its save effect writes it, with the backup guard intact.
 */
export function adoptAgentProfile(snap: MirrorSnapshot | null | undefined): { profile: Profile; record: AgentRecord } | null {
  const record = agentRecordOf(snap);
  if (!record || record.revision <= seenAgentRevision()) return null;
  if (!snap || !hasProfile(snap)) return null;
  const raw = snap['pheme:profile'];
  let profile: Profile;
  try { profile = normalizeProfile(JSON.parse(raw) as Profile); } catch { return null; }
  try { localStorage.setItem(K_AGENT, JSON.stringify(record)); } catch { /* private mode */ }
  markAgentSeen(record.revision);
  return { profile, record };
}

/** The host's nudge — and only the host's: a message from anywhere else is ignored. */
export function isStateChangedMessage(ev: MessageEvent): boolean {
  if (ev.source !== window.parent) return false;
  const d = ev.data as { type?: unknown; event?: unknown } | null;
  return !!d && d.type === 'MNEMO_PLUGIN_EVENT' && d.event === STATE_CHANGED_EVENT;
}

/** What the last receipt changed, as chips: `+r/sub`, `−topic`. */
export function receiptChips(record: AgentRecord | null | undefined): string[] {
  const last = record?.receipts[record.receipts.length - 1];
  if (!last) return [];
  return last.ops.map(o => `${o.op === 'add' ? '+' : '−'}${o.kind === 'sub' ? 'r/' : ''}${o.value}`);
}

// ── The radar, projected for agents ─────────────────────────────────────────

export interface RadarLine {
  id: string;
  title: string;
  url: string;
  target: string;
  network: 'reddit' | 'hackernews';
  timestamp: string;
  score: number;
  matched: string[];
  tier?: MnemoTier;
  reason?: string;
  points?: number;
  comments?: number;
}

export interface RadarProjection {
  scannedAt: string;
  rankedAt?: string;
  items: RadarLine[];
  failed?: string[];
}

const TIER_ORDER: Record<MnemoTier, number> = { high: 0, mid: 1, low: 2 };

/**
 * The lines worth an agent's attention: not hidden by the human, not stale
 * (a thread three weeks old is over whatever its score), ranked tier first
 * and score second, capped. Absent tier = never ranked, never `low`.
 */
export function radarProjection(
  items: readonly ScoredItem[],
  rank: RankMap | null,
  hidden: readonly string[],
  opts: { failed?: readonly string[]; scannedAt?: string; now?: number } = {},
): RadarProjection {
  const hid = new Set(hidden);
  const now = opts.now ?? Date.now();
  const lines: RadarLine[] = items
    .filter(i => !hid.has(i.id) && !isStale(i, now))
    .map(i => {
      const t = rank?.tiers[i.id];
      return {
        id: i.id, title: i.title, url: i.url, target: i.target, network: i.network,
        timestamp: i.timestamp, score: i.score, matched: i.matched,
        ...(t ? { tier: t.tier, ...(t.reason ? { reason: t.reason } : {}) } : {}),
        ...(typeof i.points === 'number' ? { points: i.points } : {}),
        ...(typeof i.comments === 'number' ? { comments: i.comments } : {}),
      };
    })
    .sort((a, b) => {
      const ta = a.tier ? TIER_ORDER[a.tier] : 3;
      const tb = b.tier ? TIER_ORDER[b.tier] : 3;
      return ta - tb || b.score - a.score;
    })
    .slice(0, RADAR_PROJECTION_CAP);
  return {
    scannedAt: opts.scannedAt ?? new Date(now).toISOString(),
    ...(rank?.at ? { rankedAt: rank.at } : {}),
    items: lines,
    ...(opts.failed && opts.failed.length > 0 ? { failed: [...opts.failed] } : {}),
  };
}

/** Writes the projection locally; `syncMirror` carries it to the host. */
export function writeRadarProjection(projection: RadarProjection): void {
  try { localStorage.setItem(K_RADAR_AGENT, JSON.stringify(projection)); }
  catch { /* quota/private mode — the agent reads the previous one, dated */ }
}

/**
 * Pushes the local snapshot to the host mirror. Best-effort by design: the
 * capability may be absent or declined, and localStorage keeps working.
 */
export async function syncMirror(): Promise<void> {
  try { await bridge.stateSet(snapshotLocal()); } catch { /* see above */ }
}
