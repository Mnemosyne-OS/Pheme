/**
 * The default view answers ONE question: where do I have something to say
 * today? Everything pinned here is a way that answer went wrong on screen —
 * a month-old thread at rank 1, a card already marked "✎ draft" sitting in
 * the unanswered pile, a counter whose arithmetic does not add up.
 */
import { describe, it, expect } from 'vitest';
import { foldOf, partitionFolds, FOLD_PILES, type FoldContext, type FoldPile } from './radarFolds';
import type { ScoredItem } from './score';

const NOW = Date.parse('2026-09-08T12:00:00.000Z');
const HOUR = 3_600_000;

function item(over: Partial<ScoredItem> & { id: string }): ScoredItem {
  return {
    title: 'a thread', body: '', author: 'someone',
    url: `https://example.test/${over.id}`,
    timestamp: new Date(NOW - HOUR).toISOString(),
    network: 'reddit', target: 'r/LocalLLaMA', matched: [], score: 50,
    ...over,
  };
}

const EMPTY: FoldContext = { hidden: [], repliedUrls: new Set(), drafted: new Set(), now: NOW };
const open = (...p: FoldPile[]) => new Set<FoldPile>(p);

describe('foldOf', () => {
  it('leaves a fresh, unanswered, unhidden thread on the board', () => {
    expect(foldOf(item({ id: 'a' }), EMPTY)).toBeNull();
  });

  it('folds a thread older than the stale window', () => {
    const old = item({ id: 'a', timestamp: new Date(NOW - 30 * 24 * HOUR).toISOString() });
    expect(foldOf(old, EMPTY)).toBe('stale');
  });

  it('folds a thread the ledger already holds a reply for', () => {
    const it0 = item({ id: 'a' });
    expect(foldOf(it0, { ...EMPTY, repliedUrls: new Set([it0.url]) })).toBe('replied');
  });

  it('folds a thread with a saved draft', () => {
    expect(foldOf(item({ id: 'a' }), { ...EMPTY, drafted: new Set(['a']) })).toBe('replied');
  });

  /**
   * The card shows "✎ draft" from EITHER id. Dropping the follow-ref leg left
   * a visibly drafted card in the unanswered pile — the one place the human
   * reads as "not done yet".
   */
  it('folds a reddit thread drafted under its follow-ref id', () => {
    const red = item({ id: 't3_abc', url: 'https://www.reddit.com/r/x/comments/1wb6av9/title/' });
    expect(foldOf(red, EMPTY)).toBeNull();
    expect(foldOf(red, { ...EMPTY, drafted: new Set(['reddit_1wb6av9']) })).toBe('replied');
  });

  it('folds a hidden thread', () => {
    expect(foldOf(item({ id: 'a' }), { ...EMPTY, hidden: ['a'] })).toBe('hidden');
  });

  /**
   * The piles are exclusive, so the order decides where an overlapping thread
   * is counted. Strongest human signal first: hidden > replied > stale.
   * Without this, the sub-counts double-count and the total lies.
   */
  it('claims an overlapping thread by the strongest signal, hidden first', () => {
    const old = item({ id: 'a', timestamp: new Date(NOW - 30 * 24 * HOUR).toISOString() });
    const ctx = { ...EMPTY, hidden: ['a'], repliedUrls: new Set([old.url]) };
    expect(foldOf(old, ctx)).toBe('hidden');
    expect(foldOf(old, { ...ctx, hidden: [] })).toBe('replied');
    expect(foldOf(old, { ...ctx, hidden: [], repliedUrls: new Set() })).toBe('stale');
  });
});

describe('partitionFolds', () => {
  const fresh = item({ id: 'fresh' });
  const answered = item({ id: 'answered' });
  const old1 = item({ id: 'old1', timestamp: new Date(NOW - 30 * 24 * HOUR).toISOString() });
  const old2 = item({ id: 'old2', timestamp: new Date(NOW - 20 * 24 * HOUR).toISOString() });
  const gone = item({ id: 'gone' });
  const all = [fresh, answered, old1, old2, gone];
  const ctx: FoldContext = {
    hidden: ['gone'], repliedUrls: new Set([answered.url]), drafted: new Set(), now: NOW,
  };

  it('shows only fresh, unanswered, unhidden threads by default', () => {
    const { visible } = partitionFolds(all, ctx, open());
    expect(visible.map(i => i.id)).toEqual(['fresh']);
  });

  it('counts each pile, and the counts sum to the folded total', () => {
    const { counts, folded } = partitionFolds(all, ctx, open());
    expect(counts).toEqual({ hidden: 1, replied: 1, stale: 2 });
    expect(folded).toBe(4);
    expect(counts.hidden + counts.replied + counts.stale).toBe(folded);
  });

  it('opening a pile shows exactly that pile, and leaves the others folded', () => {
    const { visible, folded } = partitionFolds(all, ctx, open('stale'));
    expect(visible.map(i => i.id)).toEqual(['fresh', 'old1', 'old2']);
    expect(folded).toBe(2);
  });

  /**
   * The chip says how many threads the pile HOLDS. If it dropped to 0 when
   * opened, the chip would be reporting its own state and the human would
   * have no number to close it back by.
   */
  it('a pile keeps its count while it is open', () => {
    const closed = partitionFolds(all, ctx, open());
    const opened = partitionFolds(all, ctx, open('stale', 'hidden', 'replied'));
    expect(opened.counts).toEqual(closed.counts);
    expect(opened.folded).toBe(0);
    expect(opened.visible).toHaveLength(all.length);
  });

  /**
   * Toggling a pile must not reorder the grid: score order is upstream.
   * The folded thread is placed FIRST here on purpose — with it last, an
   * implementation that appends the opened pile produces the same array and
   * the test proves nothing.
   */
  it('shows an opened pile in place, never appended', () => {
    const { visible } = partitionFolds([gone, fresh, old1], ctx, open('hidden'));
    expect(visible.map(i => i.id)).toEqual(['gone', 'fresh']);
  });

  it('reports zeros rather than nothing when every thread is on the board', () => {
    const { counts, folded, visible } = partitionFolds([fresh], EMPTY, open());
    expect(counts).toEqual({ hidden: 0, replied: 0, stale: 0 });
    expect(folded).toBe(0);
    expect(visible).toHaveLength(1);
  });

  it('holds an empty board without inventing a pile', () => {
    const { visible, counts, folded } = partitionFolds([], EMPTY, open());
    expect(visible).toEqual([]);
    expect(folded).toBe(0);
    expect(FOLD_PILES.every(p => counts[p] === 0)).toBe(true);
  });
});
