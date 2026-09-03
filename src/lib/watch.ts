/**
 * What Pheme asks the host to keep watching while its window is closed
 * (host doc 72).
 *
 * The targets are exactly the two public feeds Presence already reads —
 * the user's own activity and their own sub — declared, not scraped: the
 * host parses them with its own audited Atom reader. Reddit thread
 * reconstructions are NOT watched: they cost several calls each and the
 * point of a background pass is to answer "is there anything?", cheaply,
 * so the user opens Pheme for the rest.
 */
import { HN, REDDIT, netOf, type Profile } from './store';

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
