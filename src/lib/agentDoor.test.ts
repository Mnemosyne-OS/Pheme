/**
 * agentDoor.test.ts — Pheme adopts an agent's edit only when its revision is
 * new, keeps the receipt, tells the human what changed, projects the radar
 * compact and dated, and lets the host watch the declared subs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  adoptAgentProfile, agentRecordOf, isStateChangedMessage, loadAgentRecord, radarProjection,
  receiptChips, seenAgentRevision, writeRadarProjection, K_AGENT, K_AGENT_SEEN, K_RADAR_AGENT,
  RADAR_PROJECTION_CAP, STATE_CHANGED_EVENT,
} from './agentDoor';
import { watchTargetsFor, WATCH_SUB_CAP } from './watch';
import { normalizeProfile, setNet, REDDIT, EMPTY_PROFILE } from './store';
import type { ScoredItem } from './score';

vi.mock('./bridge', () => ({ bridge: { stateSet: vi.fn().mockResolvedValue({}) }, isFramed: () => true }));

const record = (revision: number, ops: Array<{ op: 'add' | 'remove'; kind: 'sub' | 'topic' | 'hnQuery'; value: string }> = [{ op: 'add', kind: 'sub', value: 'hermesagent' }]) =>
  JSON.stringify({ revision, at: '2026-09-08T22:00:00.000Z', by: 'mnemosyne-mcp', receipts: [{ at: '2026-09-08T22:00:00.000Z', by: 'mnemosyne-mcp', byName: 'Mnemosyne MCP Server', applied: ops.length, ops }] });

const mirroredProfile = (subs: string[]) =>
  JSON.stringify({ topics: ['retrieval'], nets: { reddit: { handle: 'yaka', home: 'MnemosyneOS', targets: subs } }, done: true });

describe('adoptAgentProfile', () => {
  beforeEach(() => localStorage.clear());

  it('adopts a mirror whose agent revision is newer than the one seen, keeps the record, marks it seen', () => {
    const snap = { 'pheme:profile': mirroredProfile(['LocalLLaMA', 'hermesagent']), [K_AGENT]: record(1) };
    const out = adoptAgentProfile(snap);
    expect(out).not.toBeNull();
    expect(out!.profile.nets['reddit'].targets).toEqual(['LocalLLaMA', 'hermesagent']);
    expect(out!.profile.nets['reddit'].handle).toBe('yaka');
    expect(out!.record.revision).toBe(1);
    expect(seenAgentRevision()).toBe(1);
    expect(loadAgentRecord()?.receipts[0]?.byName).toBe('Mnemosyne MCP Server');
    // The same record again is nothing new.
    expect(adoptAgentProfile(snap)).toBeNull();
    // A newer one is.
    expect(adoptAgentProfile({ ...snap, [K_AGENT]: record(2) })?.record.revision).toBe(2);
    expect(localStorage.getItem(K_AGENT_SEEN)).toBe('2');
  });

  it('adopts nothing without a record, with an older record, or with a record and no profile', () => {
    localStorage.setItem(K_AGENT_SEEN, '3');
    expect(adoptAgentProfile({ 'pheme:profile': mirroredProfile(['x']) })).toBeNull();
    expect(adoptAgentProfile({ 'pheme:profile': mirroredProfile(['x']), [K_AGENT]: record(3) })).toBeNull();
    expect(adoptAgentProfile({ [K_AGENT]: record(9) })).toBeNull();
    expect(adoptAgentProfile({ 'pheme:profile': '{"nets":{}}', [K_AGENT]: record(9) })).toBeNull();
    expect(adoptAgentProfile(null)).toBeNull();
    // Nothing adopted = nothing marked.
    expect(seenAgentRevision()).toBe(3);
  });

  it('reads a corrupt record as no record', () => {
    expect(agentRecordOf({ [K_AGENT]: '{nope' })).toBeNull();
    expect(agentRecordOf({ [K_AGENT]: JSON.stringify({ revision: 'one' }) })).toBeNull();
    expect(agentRecordOf({ [K_AGENT]: JSON.stringify({ revision: 2 }) })).toEqual({ revision: 2, at: '', by: '', receipts: [] });
  });

  it('turns the last receipt into chips the human can read', () => {
    expect(receiptChips(null)).toEqual([]);
    const r = agentRecordOf({ [K_AGENT]: record(1, [{ op: 'add', kind: 'sub', value: 'hermesagent' }, { op: 'remove', kind: 'topic', value: 'crypto' }]) });
    expect(receiptChips(r)).toEqual(['+r/hermesagent', '−crypto']);
  });
});

describe('isStateChangedMessage', () => {
  it('accepts only the host nudge from the parent window', () => {
    const data = { type: 'MNEMO_PLUGIN_EVENT', event: STATE_CHANGED_EVENT };
    expect(isStateChangedMessage({ source: window.parent, data } as MessageEvent)).toBe(true);
    expect(isStateChangedMessage({ source: null, data } as unknown as MessageEvent)).toBe(false);
    expect(isStateChangedMessage({ source: window.parent, data: { ...data, event: 'mnemosyne:network-event' } } as MessageEvent)).toBe(false);
    expect(isStateChangedMessage({ source: window.parent, data: null } as MessageEvent)).toBe(false);
  });
});

describe('radarProjection', () => {
  const now = Date.parse('2026-09-08T22:00:00.000Z');
  const item = (id: string, score: number, ageH = 1, extra: Partial<ScoredItem> = {}): ScoredItem => ({
    id, title: `t ${id}`, body: 'a long body that must not travel', author: 'a', url: `https://x/${id}`,
    timestamp: new Date(now - ageH * 3_600_000).toISOString(), network: 'reddit', target: 'r/LocalLLaMA',
    score, matched: ['retrieval'], ...extra,
  });

  it('drops hidden and stale lines, keeps no bodies, orders tier first then score, and is dated', () => {
    const items = [item('a', 10), item('b', 50), item('c', 30, 24 * 30), item('d', 5), item('e', 40, 1, { points: 12, comments: 3 })];
    const rank = { at: '2026-09-08T21:00:00.000Z', tiers: { a: { tier: 'high' as const, reason: 'fits' }, d: { tier: 'mid' as const } } };
    const p = radarProjection(items, rank, ['b'], { failed: ['r/private'], scannedAt: '2026-09-08T21:30:00.000Z', now });
    expect(p.scannedAt).toBe('2026-09-08T21:30:00.000Z');
    expect(p.rankedAt).toBe('2026-09-08T21:00:00.000Z');
    expect(p.failed).toEqual(['r/private']);
    expect(p.items.map(l => l.id)).toEqual(['a', 'd', 'e']);
    expect(p.items[0]).toMatchObject({ tier: 'high', reason: 'fits' });
    expect(p.items[2]).toMatchObject({ points: 12, comments: 3 });
    expect(p.items[2].tier).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain('long body');
  });

  it('caps the lines and dates from now when no scan time is given', () => {
    const items = Array.from({ length: RADAR_PROJECTION_CAP + 20 }, (_, i) => item(`i${i}`, i));
    const p = radarProjection(items, null, [], { now });
    expect(p.items).toHaveLength(RADAR_PROJECTION_CAP);
    expect(p.items[0].id).toBe(`i${RADAR_PROJECTION_CAP + 19}`);
    expect(p.scannedAt).toBe(new Date(now).toISOString());
    expect(p.rankedAt).toBeUndefined();
    expect(p.failed).toBeUndefined();
  });

  it('writes where the mirror picks it up', () => {
    localStorage.clear();
    writeRadarProjection(radarProjection([item('a', 1)], null, [], { now }));
    expect(JSON.parse(localStorage.getItem(K_RADAR_AGENT)!).items[0].id).toBe('a');
  });
});

describe('watchTargetsFor with declared subs', () => {
  const base = normalizeProfile({ redditUser: 'yaka', hnUser: 'yk', mySub: 'MnemosyneOS' } as never);

  it('adds the /new feed of each declared sub after the own feeds, skipping the home sub and duplicates', () => {
    const p = setNet(base, REDDIT, { targets: ['LocalLLaMA', 'r/mnemosyneos', 'ObsidianMD', 'localllama'] });
    const labels = watchTargetsFor(p).map(t => t.label);
    expect(labels).toEqual(['u/yaka', 'r/MnemosyneOS', 'HN yk', 'r/LocalLLaMA', 'r/ObsidianMD']);
    const sub = watchTargetsFor(p).find(t => t.label === 'r/ObsidianMD')!;
    expect(sub.url).toBe('https://www.reddit.com/r/ObsidianMD/new/.rss?limit=25');
    expect(sub.spec).toEqual({ mode: 'atom' });
  });

  it('stops at the declared cap so the host never drops the tail in silence', () => {
    const many = Array.from({ length: WATCH_SUB_CAP + 5 }, (_, i) => `s${i}`);
    const p = setNet(base, REDDIT, { targets: many });
    expect(watchTargetsFor(p).filter(t => t.label?.startsWith('r/s'))).toHaveLength(WATCH_SUB_CAP);
    // Without a home sub the cap is the same number of declared subs.
    const noHome = setNet({ ...EMPTY_PROFILE, nets: {} }, REDDIT, { targets: many });
    expect(watchTargetsFor(noHome)).toHaveLength(WATCH_SUB_CAP);
  });

  it('a profile with subs but nothing else still asks for those subs', () => {
    const only = setNet({ ...EMPTY_PROFILE, nets: {} }, REDDIT, { targets: ['hermesagent'] });
    expect(watchTargetsFor(only).map(t => t.label)).toEqual(['r/hermesagent']);
  });
});
