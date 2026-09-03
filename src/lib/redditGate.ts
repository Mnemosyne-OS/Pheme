/**
 * The ONE gate every Reddit request in Pheme goes through — radar scans,
 * presence, thread re-checks, subreddit suggestions. Politeness is global
 * or it is nothing: four features each being "gentle" separately is still
 * a burst to Reddit's per-IP throttle.
 *
 *  - Spacing: at most one Reddit call every SPACING_MS, app-wide.
 *  - Circuit breaker: the first 429/403 trips a persisted COOLDOWN — every
 *    Reddit call for the next N minutes short-circuits locally instead of
 *    hammering a wall that each retry extends. Hacker News is unaffected.
 *
 * The cooldown lives in localStorage so it survives widget reloads: a user
 * who reopens Pheme while throttled must NOT restart the burst.
 */

const K_COOL = 'pheme:reddit:cooldownUntil';
// Measured on a warm Starlink IP (2026-08-04): at 2s spacing Reddit still
// 429'd every other request. 5s keeps a whole presence run (~6 calls) under
// the per-IP bucket once it cools.
const SPACING_MS = 5000;
const COOLDOWN_MIN = 10;

let lastCall = 0;

/** Milliseconds left on the cooldown, 0 when clear — feeds the live countdown. */
export function cooldownRemainingMs(): number {
  try {
    const until = Number(localStorage.getItem(K_COOL) ?? 0);
    return Math.max(0, until - Date.now());
  } catch { return 0; }
}

/** Minutes left on the cooldown, 0 when clear. */
export function cooldownRemainingMin(): number {
  return Math.ceil(cooldownRemainingMs() / 60_000);
}

function tripCooldown(): void {
  try { localStorage.setItem(K_COOL, String(Date.now() + COOLDOWN_MIN * 60_000)); }
  catch { /* private mode — the in-session spacing still protects */ }
}

export type RedditResult =
  | { ok: true; body: string }
  /**
   * 'limited' = IP throttle (429) — always arms the cooldown, whoever asked.
   * 'walled'  = this ENDPOINT refuses us (403 while probing) — a verdict on
   *             the door, never on the whole of Reddit. The two were once
   *             merged, and a transient throttle then blinded the .json path
   *             for hours while the throttle itself went unrecorded.
   */
  | { ok: false; reason: 'cooldown' | 'limited' | 'walled' | 'error' };

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

/**
 * `probe: true` = the endpoint itself may be BLOCKED for us (Reddit walls
 * public .json — the social-engine lesson) while .rss stays open. A refusal
 * there is an endpoint verdict, NOT an IP throttle: it must never trip the
 * app-wide cooldown that would starve the feeds which still work.
 */
export async function redditFetch(fetchUrl: FetchUrl, url: string, opts?: { probe?: boolean }): Promise<RedditResult> {
  if (cooldownRemainingMin() > 0) return { ok: false, reason: 'cooldown' };
  const wait = lastCall + SPACING_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const r = await fetchUrl(url);
    // A throttle is a throttle even when probing: recording it is the whole
    // point of the gate, and mistaking it for a wall blinds a feature for hours.
    if (r.status === 429) { tripCooldown(); return { ok: false, reason: 'limited' }; }
    if (r.status === 403) {
      // A wall, not a throttle: endpoint verdict when probing, otherwise an
      // unreachable target (private/banned sub) — NEVER a reason to freeze
      // all of Reddit for ten minutes.
      return { ok: false, reason: opts?.probe ? 'walled' : 'error' };
    }
    if (r.status < 200 || r.status >= 300) return { ok: false, reason: 'error' };
    return { ok: true, body: r.body };
  } catch (e) {
    // The host's social.fetch THROWS on any non-2xx ('HTTP_429'…) — the
    // cartridge classifies from the message. Same doctrine as above: only
    // the 429 family is an IP throttle.
    const msg = String(e instanceof Error ? e.message : e);
    if (/429|rate.?limit|too many/i.test(msg)) { tripCooldown(); return { ok: false, reason: 'limited' }; }
    if (opts?.probe && /403|forbidden/i.test(msg)) return { ok: false, reason: 'walled' };
    return { ok: false, reason: 'error' };
  }
}

// ── Public-.json availability — probed once, remembered for a day ────────────

const K_JSON_BLOCK = 'pheme:reddit:jsonBlockedAt';
// Short on purpose: the JSON tree is what carries parent links — the only
// way to know a reply is addressed TO the user. A day of blindness for one
// transient 403 costs more than one probe call every couple of hours.
const JSON_BLOCK_TTL_MS = 2 * 3_600_000;

/** True while Reddit's public .json is known blocked for this client. */
export function redditJsonBlocked(): boolean {
  try {
    const at = Number(localStorage.getItem(K_JSON_BLOCK) ?? 0);
    return at > 0 && Date.now() - at < JSON_BLOCK_TTL_MS;
  } catch { return false; }
}

export function markRedditJsonBlocked(): void {
  try { localStorage.setItem(K_JSON_BLOCK, String(Date.now())); }
  catch { /* private mode — we simply re-probe next run */ }
}
