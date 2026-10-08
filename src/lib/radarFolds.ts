/**
 * What the radar grid shows by default, and what it folds away.
 *
 * The first scan after the agent door returned 307 threads, and the top of the
 * grid held month-old finished threads and threads already answered. That is
 * not a bug in the scan: `mergeScan` deliberately RETAINS everything the human
 * has touched so nothing is lost. It is a bug in the display — the grid was
 * answering "what did the scan bring back?" when the only question worth
 * asking is "where do I have something to say, today?".
 *
 * So the data does not change here; only which of it is drawn. Everything
 * folded stays one click away, under a counter that is COUNTED — never an
 * "and others".
 */
import { isStale, type ScoredItem } from './score';
import { followRefOf } from './store';

/**
 * The piles, in the order they claim a thread.
 *
 * A thread can be several of these at once (hidden AND answered AND finished),
 * and the piles are EXCLUSIVE on purpose: each folded thread lands in exactly
 * one, so the sub-counts sum to the total. Overlapping counts would each be
 * true on their own and produce a line whose arithmetic does not add up —
 * "212 folded (89 · 41 · 12)" invites the reader to check, and lose.
 *
 * The order is the strength of the human's own signal, strongest first:
 * `hidden` is an explicit gesture, `replied` is engagement, `stale` is nobody
 * doing anything while time passed.
 */
export const FOLD_PILES = ['hidden', 'replied', 'stale'] as const;
export type FoldPile = (typeof FOLD_PILES)[number];

export interface FoldContext {
  /** Ids the human hid, one thread at a time. */
  hidden: readonly string[];
  /** Thread urls the ledger already holds a participation for. */
  repliedUrls: ReadonlySet<string>;
  /** Ids with a saved draft — started counts as answered for the grid. */
  drafted: ReadonlySet<string>;
  /** Injected by tests; production reads the clock. */
  now?: number;
}

/** Which pile folds this thread away, or `null` when it belongs on the board. */
export function foldOf(item: ScoredItem, ctx: FoldContext): FoldPile | null {
  if (ctx.hidden.includes(item.id)) return 'hidden';
  // Both legs, because the card shows both badges: a reddit thread's draft is
  // saved under its follow-ref id, so testing `item.id` alone would leave a
  // visibly "✎ draft" card sitting in the unanswered pile.
  if (ctx.repliedUrls.has(item.url)
    || ctx.drafted.has(item.id)
    || ctx.drafted.has(followRefOf(item).id)) return 'replied';
  if (isStale(item, ctx.now)) return 'stale';
  return null;
}

export interface FoldPartition {
  /** What the grid draws, in the order it was given (score-sorted upstream). */
  visible: ScoredItem[];
  /**
   * How many threads each pile HOLDS — not how many are currently out of
   * sight. A chip whose number changed when you opened it would be describing
   * the chip's own state, not the threads.
   */
  counts: Record<FoldPile, number>;
  /** How many threads are out of sight right now: the closed piles only. */
  folded: number;
}

export function partitionFolds(
  items: readonly ScoredItem[],
  ctx: FoldContext,
  open: ReadonlySet<FoldPile>,
): FoldPartition {
  const counts: Record<FoldPile, number> = { hidden: 0, replied: 0, stale: 0 };
  const visible: ScoredItem[] = [];
  for (const item of items) {
    const pile = foldOf(item, ctx);
    if (pile === null) { visible.push(item); continue; }
    counts[pile]++;
    // An opened pile is shown IN PLACE, not appended: the grid stays sorted by
    // score, and a thread does not move when its pile is toggled.
    if (open.has(pile)) visible.push(item);
  }
  return {
    visible,
    counts,
    folded: FOLD_PILES.reduce((n, p) => (open.has(p) ? n : n + counts[p]), 0),
  };
}
