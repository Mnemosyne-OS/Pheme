/**
 * Who wrote it — Pheme, or the human on their own.
 *
 * Pheme knows every thread it drafted a reply for: the ledger stores the URL.
 * Presence knows every thread the user actually shows up in, whoever wrote the
 * words. Subtract the first set from the second and what is left is an act the
 * user wrote WITHOUT this app.
 *
 * That is a difference between two observed sets, not an inference about
 * intent. Nothing here judges what was written — only whether Pheme had a hand
 * in it.
 *
 * ## Why the join needs a key and not a URL
 *
 * The two sides carry the same thread under three different strings. The radar
 * hands the ledger Reddit's Atom permalink, slug and all
 * (`…/r/AI_Agents/comments/abc123/some_title/`); a reconstructed thread is
 * stored under its base (`…/comments/abc123/`); and the user's own COMMENT
 * arrives as a deep permalink with the comment id appended. Comparing those
 * three as strings fails every time — and it fails SILENTLY in the expensive
 * direction: every assisted act would read as an autonomous one and inflate
 * the credit. So both sides are reduced to the thread's identity first.
 */
import type { LedgerEntry } from './store';

/**
 * The thread a URL points at, canonically.
 *
 * Reddit publishes the thread id inside every permalink shape it has, and
 * Hacker News keys everything on `item?id=`. Anything else falls back to the
 * URL with its trailing punctuation and case normalised — a weak key, but a
 * stable one, and the networks that need it do not exist yet.
 *
 * @returns '' when there is nothing to key on. An empty key never joins and
 *   never counts: an act Pheme cannot place is an act it says nothing about.
 */
export function threadKey(url: string): string {
  const u = (url ?? '').trim();
  if (!u) return '';
  const reddit = u.match(/\/r\/[^/]+\/comments\/([a-z0-9]+)/i);
  if (reddit) return `reddit:${reddit[1].toLowerCase()}`;
  if (/news\.ycombinator\.com/i.test(u)) {
    const hn = u.match(/[?&]id=(\d+)/);
    if (hn) return `hn:${hn[1]}`;
  }
  return u.replace(/[/?#]+$/, '').toLowerCase();
}

/**
 * Every thread Pheme had a hand in, as keys.
 *
 * Both kinds count, not just `participation`: a promo the user logged against
 * a URL is still a thread this app knows about, and letting it fall through as
 * "autonomous" would pay credit for the one act the doctrine charges for.
 * Entries with no URL — the manual promo button logs one — key to '' and are
 * dropped, because they name no thread to exclude.
 */
export function ledgerKeys(ledger: LedgerEntry[]): Set<string> {
  const keys = new Set<string>();
  for (const e of ledger) {
    const k = threadKey(e.url);
    if (k) keys.add(k);
  }
  return keys;
}

/**
 * Did the user write this one alone? THE rule, and the only copy of it.
 *
 * The engine counts on it and a card displays it, and those two must never be
 * able to disagree about the same thread — a badge saying "solo" beside a
 * verdict that did not count it would discredit both. Written structurally so
 * a thread node and anything else shaped like one can be asked.
 *
 * Three ways to be false, and they are not the same sentence:
 *  - not a comment of theirs — their own POST may be the promo itself, and
 *    nothing here can tell, so it never funds the credit;
 *  - the ledger has this thread — Pheme had a hand in it;
 *  - the URL keys to nothing — unplaceable, which is unknown, not "alone".
 */
export function isSoloAct(
  act: { mine: 'post' | 'comment' | 'none'; url: string },
  written: Set<string>,
): boolean {
  if (act.mine !== 'comment') return false;
  const key = threadKey(act.url);
  return !!key && !written.has(key);
}
