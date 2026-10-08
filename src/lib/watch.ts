/**
 * What Pheme asks the host to keep watching while its window is closed
 * (host doc 72).
 *
 * The targets are the public feeds Presence already reads — the user's own
 * activity and their own sub — plus, since 0.10, the `/new` feed of the subs
 * they DECLARED on the radar (host doc 75 §14): one Atom call per sub, the
 * same price as the user's own feeds, so a fresh thread in a watched sub
 * reaches the inbox while Pheme is closed. All declared, not scraped: the
 * host parses them with its own audited Atom reader. Reddit thread
 * reconstructions are NOT watched: they cost several calls each and the
 * point of a background pass is to answer "is there anything?", cheaply,
 * so the user opens Pheme for the rest.
 */
import { HN, REDDIT, netOf, type Profile } from './store';

/**
 * How many declared subs ride along. The host caps a cartridge at 12 targets
 * (doc 72) and the three own feeds come first, so past this the host would
 * silently drop the tail — better a declared cap than a silent one. The
 * FIRST subs in the human's list are watched: the order they keep is the
 * order they care in.
 */
export const WATCH_SUB_CAP = 9;

export interface WatchTarget {
  url: string;
  spec: { mode: 'atom' | 'json' | 'hash'; arrayPath?: string; idField?: string; labelField?: string };
  label?: string;
}

export interface WatchInboxItem {
  id: string;
  label?: string;
  source: string;
  at: string;
}

export interface WatchStatus {
  registered: boolean;
  targets: number;
  intervalMin: number;
  lastRunAt: string | null;
  lastError: string | null;
  unread: number;
}

/**
 * The watch Pheme wants, derived from the profile. Empty when nothing is
 * configured — registering an empty watch is how a user ends up with a
 * background job that can never find anything.
 */
export function watchTargetsFor(profile: Profile): WatchTarget[] {
  const targets: WatchTarget[] = [];
  const reddit = netOf(profile, REDDIT);
  const hn = netOf(profile, HN);
  if (reddit.handle) {
    targets.push({
      url: `https://www.reddit.com/user/${encodeURIComponent(reddit.handle)}/.rss?limit=25`,
      spec: { mode: 'atom' },
      label: `u/${reddit.handle}`,
    });
  }
  const sub = reddit.home.replace(/^r\//, '').trim();
  if (sub) {
    targets.push({
      url: `https://www.reddit.com/r/${encodeURIComponent(sub)}/new/.rss?limit=25`,
      spec: { mode: 'atom' },
      label: `r/${sub}`,
    });
  }
  if (hn.handle) {
    targets.push({
      url: `https://hn.algolia.com/api/v1/search_by_date?tags=comment,author_${encodeURIComponent(hn.handle)}&hitsPerPage=20`,
      spec: { mode: 'json', arrayPath: 'hits', idField: 'objectID', labelField: 'story_title' },
      label: `HN ${hn.handle}`,
    });
  }
  // The declared subs, minus the home sub (already above) and duplicates.
  const seen = new Set<string>(sub ? [sub.toLowerCase()] : []);
  for (const raw of reddit.targets) {
    const name = raw.replace(/^r\//i, '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    if (seen.size >= WATCH_SUB_CAP + (sub ? 1 : 0)) break;
    seen.add(name.toLowerCase());
    targets.push({
      url: `https://www.reddit.com/r/${encodeURIComponent(name)}/new/.rss?limit=25`,
      spec: { mode: 'atom' },
      label: `r/${name}`,
    });
  }
  return targets;
}

/**
 * A stable signature of what we last asked the host to watch. Re-registering
 * on every render would be noise; re-registering when the user changes a
 * pseudonym is the whole point.
 */
export function watchSignature(targets: WatchTarget[], intervalMin: number): string {
  return `${intervalMin}|${targets.map(t => t.url).join('|')}`;
}

const K_WATCH_SIG = 'pheme:watch:signature';

export function loadWatchSignature(): string {
  try { return localStorage.getItem(K_WATCH_SIG) ?? ''; }
  catch { return ''; }
}

export function saveWatchSignature(sig: string): void {
  try { localStorage.setItem(K_WATCH_SIG, sig); }
  catch { /* private mode — worst case we re-register next open */ }
}
