/**
 * Operating costs, told honestly. Pheme counts every model call it makes,
 * tagged by task, and — when Mnemosyne Cloud is the engine — attributes a
 * cost by measuring the credit balance before and after the call (the host
 * drops its balance cache after every inference, so the after-read is
 * fresh). Local engines show 0: that is not a gap, that is the point of
 * local. Deltas are ESTIMATES — another surface spending concurrently can
 * blur one reading — and the UI says so.
 */

export type CostTask = 'drafts' | 'angles' | 'recall' | 'translate' | 'diagnosis' | 'suggest' | 'voice' | 'chat' | 'rank' | 'story' | 'svg' | 'vision' | 'report' | 'polish';

export const COST_TASKS: CostTask[] = ['drafts', 'angles', 'recall', 'translate', 'diagnosis', 'suggest', 'voice', 'chat', 'rank', 'story', 'svg', 'vision', 'report', 'polish'];

export type CostPeriod = 'week' | 'month' | 'quarter' | 'semester' | 'year';

export const COST_PERIODS: CostPeriod[] = ['week', 'month', 'quarter', 'semester', 'year'];

const PERIOD_DAYS: Record<CostPeriod, number> = { week: 7, month: 30, quarter: 91, semester: 182, year: 365 };

interface DayTally {
  calls: Partial<Record<CostTask, number>>;
  usdMicro: Partial<Record<CostTask, number>>;
  /** Per-network attribution — only calls whose network is unambiguous. */
  netCalls?: Record<string, number>;
  netUsdMicro?: Record<string, number>;
}

const K_COSTS = 'pheme:costs';
// A rolling year of daily tallies — a few KB at most, and every period
// filter (week through year) stays answerable from local data alone.
const DAY_CAP = 366;

/**
 * LOCAL calendar day. The ISO/UTC slice made "spent today" reset in the
 * middle of an evening session for anyone west of Greenwich.
 */
function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readAll(): Record<string, DayTally> {
  try {
    const parsed = JSON.parse(localStorage.getItem(K_COSTS) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

/** Record one call. usdMicro null = engine free or delta unmeasurable. */
export function tally(task: CostTask, usdMicro: number | null, net?: string): void {
  const all = readAll();
  const key = dayKey();
  const day = all[key] ?? { calls: {}, usdMicro: {} };
  day.calls[task] = (day.calls[task] ?? 0) + 1;
  if (usdMicro !== null && usdMicro > 0) {
    day.usdMicro[task] = (day.usdMicro[task] ?? 0) + usdMicro;
  }
  if (net) {
    day.netCalls = day.netCalls ?? {};
    day.netCalls[net] = (day.netCalls[net] ?? 0) + 1;
    if (usdMicro !== null && usdMicro > 0) {
      day.netUsdMicro = day.netUsdMicro ?? {};
      day.netUsdMicro[net] = (day.netUsdMicro[net] ?? 0) + usdMicro;
    }
  }
  all[key] = day;
  const keys = Object.keys(all).sort().slice(-DAY_CAP);
  const trimmed: Record<string, DayTally> = {};
  for (const k of keys) trimmed[k] = all[k];
  try { localStorage.setItem(K_COSTS, JSON.stringify(trimmed)); }
  catch { /* quota — counting resumes next write */ }
}

/** Attributable spend for ONE network over a rolling period. */
export function netCosts(net: string, period: CostPeriod = 'month'): { calls: number; usd: number } {
  const all = readAll();
  const cutoff = dayKey(new Date(Date.now() - (PERIOD_DAYS[period] - 1) * 86_400_000));
  let calls = 0;
  let micro = 0;
  for (const [k, day] of Object.entries(all)) {
    if (k < cutoff) continue;
    calls += day.netCalls?.[net] ?? 0;
    micro += day.netUsdMicro?.[net] ?? 0;
  }
  return { calls, usd: micro / 1e6 };
}

export interface CostRow { task: CostTask; callsToday: number; callsPeriod: number; usdToday: number; usdPeriod: number }

/** Rows scoped to a rolling period window ending today. */
export function costRows(period: CostPeriod = 'month'): {
  rows: CostRow[]; usdTodayTotal: number; usdPeriodTotal: number; hasHistory: boolean;
} {
  const all = readAll();
  const today = dayKey();
  // Day keys are ISO dates, so the window is a plain string comparison.
  const cutoff = dayKey(new Date(Date.now() - (PERIOD_DAYS[period] - 1) * 86_400_000));
  const rows: CostRow[] = COST_TASKS.map(task => {
    let callsToday = 0, callsPeriod = 0, microToday = 0, microPeriod = 0;
    for (const [k, day] of Object.entries(all)) {
      if (k < cutoff) continue;
      const c = day.calls[task] ?? 0;
      const m = day.usdMicro[task] ?? 0;
      callsPeriod += c;
      microPeriod += m;
      if (k === today) { callsToday = c; microToday = m; }
    }
    return { task, callsToday, callsPeriod, usdToday: microToday / 1e6, usdPeriod: microPeriod / 1e6 };
  }).filter(r => r.callsPeriod > 0);
  return {
    rows,
    usdTodayTotal: rows.reduce((s, r) => s + r.usdToday, 0),
    usdPeriodTotal: rows.reduce((s, r) => s + r.usdPeriod, 0),
    hasHistory: Object.keys(all).length > 0,
  };
}
