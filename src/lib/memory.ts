/**
 * What Mnemosyne remembers of the user's public life.
 *
 * Pheme reads a lot and keeps almost none of it: the scan is noise that ages
 * out, and putting other people's threads into the user's memory would be
 * pollution, not recall. What deserves to persist is what the USER produced —
 * so this module builds a chronicle out of the user's own work and nothing
 * else, and the user says in Settings which kinds count.
 *
 * Three rules the rest of the app relies on:
 *
 * 1. **Only the user's own output.** Never a thread they merely read, never
 *    another person's words on their own (they can ride along as context, and
 *    only when the user asks for it).
 * 2. **Written once.** Each memory carries a stable `sourceRef`; what has
 *    already been written is remembered locally so a rescan never re-ingests.
 *    The host dedups by SHA-256 too — this just avoids paying for the call.
 * 3. **Nothing is inferred.** A score the source never gave is absent from the
 *    text, not a zero. A memory is supposed to be true a year from now.
 */
import type { PresenceReport, ThreadNode } from './presence';

export interface MemoryPrefs {
  /** Threads the user OPENED themselves — their own posts. */
  myPosts: boolean;
  /** Replies the user actually posted (a logged participation). */
  myReplies: boolean;
  /** Join the post — and the comment being answered — to the user's words. */
  threadContext: boolean;
  /** The reputation diagnoses, as they evolve. */
  diagnosis: boolean;
}

/**
 * Posts only, by the user's own choice (2026-08-05). The rest is off until
 * they turn it on: memory is permanent, and a default that writes more than
 * the user expected is not recoverable by unchecking a box later.
 */
export const DEFAULT_MEMORY: MemoryPrefs = {
  myPosts: true,
  myReplies: false,
  threadContext: false,
  diagnosis: false,
};

export interface MemoryItem {
  /** Stable across rescans — the dedup key AND the host's `sourceRef`. */
  ref: string;
  text: string;
  /** What this is, for the UI that reports what was written. */
  kind: 'post' | 'reply' | 'diagnosis';
  label: string;
}

const K_WRITTEN = 'pheme:memory:written';

/** ref → ISO timestamp of the write. */
export type WrittenLog = Record<string, string>;

export function loadWritten(): WrittenLog {
  try {
    const raw = localStorage.getItem(K_WRITTEN);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as WrittenLog : {};
  } catch { return {}; }
}

export function markWritten(refs: string[], at = new Date().toISOString()): WrittenLog {
  const log = loadWritten();
  for (const ref of refs) log[ref] = at;
  try { localStorage.setItem(K_WRITTEN, JSON.stringify(log)); }
  catch (err) {
    // Quota: the write HAPPENED host-side, only the local receipt is lost.
    // Say so rather than pretending nothing was written.
    console.warn('[pheme] could not persist the memory receipt:', err);
  }
  return log;
}

/**
 * Drop the local receipts so the next pass re-offers everything. This does
 * NOT delete a single memory — forgetting is the human's, in the Vault
 * Manager. It is safe to re-run: the host dedups by SHA-256, so re-writing
 * identical content creates nothing new.
 */
export function forgetReceipts(): void {
  try { localStorage.removeItem(K_WRITTEN); }
  catch (err) { console.warn('[pheme] could not clear the memory receipts:', err); }
}

/** How much of the user's public life is in memory, and when it last grew. */
export function memoryStats(log: WrittenLog = loadWritten()): { count: number; lastAt: string | null } {
  const times = Object.values(log).filter(Boolean).sort();
  return { count: times.length, lastAt: times[times.length - 1] ?? null };
}

const refOf = (thr: ThreadNode): string => `pheme:${thr.network}:${thr.id}`;

/** Reddit titles a comment entry "/u/name on <post>" — the post is the title. */
const cleanTitle = (title: string): string => title.replace(/^\/?u\/\S+\s+on\s+/i, '').trim();

/**
 * The chronicle for one of the user's own posts. Written as prose because a
 * year from now it is read by a retrieval pass, not by a parser.
 */
export function postMemoryText(thr: ThreadNode, prefs: MemoryPrefs): string {
  const net = thr.network === 'hackernews' ? 'Hacker News' : 'Reddit';
  const lines = [
    `I published a post on ${net} in ${thr.community}, on ${thr.timestamp.slice(0, 10)}.`,
    `Title: ${cleanTitle(thr.title)}`,
  ];
  if (thr.postBody.trim()) lines.push('', thr.postBody.trim());
  // A score the source never sent stays ABSENT — "0 points" would be a claim
  // nobody made, and it is exactly the sort of thing that reads as fact later.
  if (typeof thr.myScore === 'number') lines.push('', `Score at the time of writing: ${thr.myScore}.`);
  if (typeof thr.commentCount === 'number') lines.push(`Replies at the time of writing: ${thr.commentCount}.`);
  // "What PEOPLE answered" — so people only. This write is PERMANENT: a
  // subreddit bot's boilerplate ingested here becomes a chronicle of what the
  // user's audience said, retrievable by the chat and the RAG forever, and
  // removing it later is a human-gated operation in the Vault Manager.
  const answers = thr.replies.filter(r => !r.bot);
  if (prefs.threadContext && answers.length > 0) {
    lines.push('', 'What people answered:');
    for (const r of answers.slice(0, 5)) {
      if (r.body.trim()) lines.push(`- ${r.author}: ${r.body.trim().slice(0, 400)}`);
    }
  }
  lines.push('', `Source: ${thr.url}`);
  return lines.join('\n');
}

/** The chronicle for a reply the user actually posted. */
export function replyMemoryText(thr: ThreadNode, prefs: MemoryPrefs): string {
  const net = thr.network === 'hackernews' ? 'Hacker News' : 'Reddit';
  const lines = [
    `I replied on ${net} in ${thr.community}, on ${thr.timestamp.slice(0, 10)}.`,
  ];
  if (prefs.threadContext) {
    lines.push(`In the thread: ${cleanTitle(thr.title)}`);
    if (thr.postBody.trim()) lines.push(`The post said: ${thr.postBody.trim().slice(0, 800)}`);
  }
  if (thr.myBody.trim()) lines.push('', 'What I wrote:', thr.myBody.trim());
  if (typeof thr.myScore === 'number') lines.push('', `Score at the time of writing: ${thr.myScore}.`);
  lines.push('', `Source: ${thr.url}`);
  return lines.join('\n');
}

/**
 * Everything the current settings say belongs in memory and that has not been
 * written yet. Pure: the caller does the network, so the selection is testable
 * without a bridge.
 */
export function pendingMemories(
  report: PresenceReport | null,
  prefs: MemoryPrefs,
  written: WrittenLog,
): MemoryItem[] {
  if (!report) return [];
  const out: MemoryItem[] = [];
  for (const group of report.groups) {
    for (const thr of group.threads) {
      // `mine: 'none'` is someone else's thread that Pheme happens to watch —
      // it is never the user's output, whatever the settings say.
      if (thr.mine === 'none') continue;
      const wantPost = thr.mine === 'post' && prefs.myPosts;
      const wantReply = thr.mine === 'comment' && prefs.myReplies;
      if (!wantPost && !wantReply) continue;
      const ref = refOf(thr);
      if (written[ref]) continue;
      // A comment with no recovered body would be an empty memory: the run
      // that built this report never reached inside the thread.
      if (wantReply && !thr.myBody.trim()) continue;
      out.push({
        ref,
        kind: wantPost ? 'post' : 'reply',
        label: cleanTitle(thr.title).slice(0, 80),
        text: wantPost ? postMemoryText(thr, prefs) : replyMemoryText(thr, prefs),
      });
    }
  }
  return out;
}

/** The diagnosis chronicle — one per analysis, keyed by its timestamp. */
export function diagnosisMemory(diagnosis: string, at: string): MemoryItem | null {
  if (!diagnosis.trim() || !at) return null;
  return {
    ref: `pheme:diagnosis:${at}`,
    kind: 'diagnosis',
    label: at.slice(0, 10),
    text: [
      `Reputation diagnosis of my public profile, ${at.slice(0, 10)}:`,
      '',
      diagnosis.trim(),
    ].join('\n'),
  };
}
