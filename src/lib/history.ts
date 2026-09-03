/**
 * A dated trace of the counted facts — the thing whose absence made every
 * period comparison impossible (doc 75 §10).
 *
 * The report deliberately offered no "+3 since last month", because Pheme kept
 * no history of its own counts: such a figure would have been invented at the
 * SOURCE, before the model ever saw it, which is worse than a model inventing
 * one. This is the honest way to make it possible — write the numbers down,
 * dated, and compare them to themselves later.
 *
 * Three rules keep a delta from becoming the next fabricated value:
 *
 *  1. **A delta needs two real measurements.** If the earlier snapshot has no
 *     value for a fact — the day it was never read, a walled karma — there is
 *     no delta. Not zero: absent.
 *  2. **The baseline is DATED and shown.** "since 3 August" can be checked;
 *     "this month" cannot, and quietly changes meaning as time passes.
 *  3. **Nothing is back-filled.** A fresh install has no history and says so.
 *     The first useful comparison is a week away, and that is the truth.
 */
import type { Fact, ReportFacts } from './report';

type FactCode = Fact['code'];

export interface Snapshot {
  /** Local calendar day, YYYY-MM-DD — one entry per day, the last write wins. */
  day: string;
  /** Only facts that were actually measured. An absent key is an unknown. */
  values: Partial<Record<FactCode, number>>;
}

/** What changed since a dated baseline. Absent whenever there is no baseline. */
export interface Since {
  day: string;
  /** Only facts measured on BOTH days. Signed. */
  deltas: Partial<Record<FactCode, number>>;
}

const K_HISTORY = 'pheme:history';
/** Half a year of daily rows per scope — a few KB, and it bounds the cache. */
const DAY_CAP = 180;
/** How far back a comparison reaches for. A week is the rhythm of the Coach. */
export const SINCE_DAYS = 7;

/**
 * LOCAL calendar day, like `costs.dayKey`. The ISO/UTC slice would roll the
 * day over mid-evening for anyone west of Greenwich, and a snapshot filed
 * under tomorrow is a snapshot that overwrites tomorrow's.
 */
function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Store = Record<string, Snapshot[]>;

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(K_HISTORY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Store : {};
  } catch { return {}; }
}

/** The scope a snapshot is filed under: '' for the whole app, else a network id. */
const scopeOf = (facts: ReportFacts) => facts.network || '';

/**
 * Write today's counts down, once per day per scope.
 *
 * Same-day writes REPLACE rather than append: the latest read of a day is the
 * best one, and a dozen rows for one Tuesday would push a real week out of the
 * cap. Never throws — a lost snapshot costs a comparison, not a session.
 */
export function recordSnapshot(facts: ReportFacts): void {
  const values: Snapshot['values'] = {};
  for (const f of facts.facts) {
    // `null` is "not measured": storing it would let a later delta treat an
    // unknown as a zero, which is the exact fabrication this file guards.
    if (f.value !== null) values[f.code] = f.value;
  }
  const store = read();
  const scope = scopeOf(facts);
  const day = dayKey();
  const rows = (store[scope] ?? []).filter(s => s.day !== day);
  rows.push({ day, values });
  rows.sort((a, b) => a.day.localeCompare(b.day));
  store[scope] = rows.slice(-DAY_CAP);
  try { localStorage.setItem(K_HISTORY, JSON.stringify(store)); }
  catch { /* quota/private mode — the next refresh simply records again */ }
}

/** Every snapshot for a scope, oldest first. */
export function loadHistory(scope = ''): Snapshot[] {
  const rows = read()[scope];
  return Array.isArray(rows) ? rows : [];
}

/**
 * What moved since a baseline at least `days` old.
 *
 * @returns `null` when no snapshot is old enough — a fresh install, or a week
 *   that has not passed yet. The caller says "no comparison yet" rather than
 *   comparing today against today and printing a page of zeros.
 */
export function since(facts: ReportFacts, days = SINCE_DAYS, now = new Date()): Since | null {
  const cutoff = dayKey(new Date(now.getTime() - days * 86_400_000));
  const rows = loadHistory(scopeOf(facts));
  // The NEWEST snapshot that is still old enough: closest to the window the
  // caller asked for, so "since 30 July" is not silently "since March".
  const base = [...rows].reverse().find(s => s.day <= cutoff);
  if (!base) return null;

  const deltas: Since['deltas'] = {};
  for (const f of facts.facts) {
    const then = base.values[f.code];
    // Both ends have to be real. One measured and one unknown is not a change
    // of zero — it is a change nobody can compute.
    if (f.value === null || typeof then !== 'number') continue;
    if (f.value !== then) deltas[f.code] = f.value - then;
  }
  return { day: base.day, deltas };
}

/** Wipe the trace — the counts stay, only their history goes. */
export function forgetHistory(): void {
  try { localStorage.removeItem(K_HISTORY); }
  catch { /* private mode — there was nothing stored anyway */ }
}
