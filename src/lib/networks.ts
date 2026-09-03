/**
 * THE network registry — one list, one classification, every surface reads
 * it (Settings roster, Publish studio, prompts). Two roles, one doctrine:
 *
 *  - 'reputation' — communities where promotion must be EARNED: genuine
 *    participation first (9:1, readiness floors). Pheme listens there
 *    (radar, presence) and never posts.
 *  - 'promotion' — the user's own broadcast channels, where promo is
 *    legitimate. The studio composes for them; the human posts.
 *
 * 'soon' entries are named honestly in the product: visible roadmap, no
 * pretend connectors. Composer-live promotion networks carry their hard
 * per-post character limit.
 */

/** Which doctrine a surface falls under — see the file header. */
export type NetworkRole = 'reputation' | 'promotion';
/** 'soon' is named honestly in the product: visible roadmap, no fake connector. */
export type NetworkStatus = 'live' | 'soon';
/** Business tier — 'licensed' networks unlock with the OS license (v2). */
export type NetworkTier = 'free' | 'licensed';

/** One network. The `id` is the key everything else is keyed by: the profile's
 *  per-network settings, the cost ledger, the seen marks, the poster sizes. */
export interface NetworkDef {
  /** Stable key. Never rename one — it is the id in stored user settings. */
  id: string;
  name: string;
  role: NetworkRole;
  status: NetworkStatus;
  tier: NetworkTier;
  /** Brand colour for the dot. */
  color: string;
  /** Promotion networks only: hard character limit per post (composer). */
  limit?: number;
}

/**
 * The single source of truth. Adding a surface is ONE row here — the dock, the
 * settings roster, the boards and the prompts all derive from it. There is no
 * second list anywhere; if you find one, it is a bug.
 */
export const NETWORKS: NetworkDef[] = [
  // ── Reputation first — earn before you promote ─────────────────────────────
  { id: 'reddit', name: 'Reddit', role: 'reputation', status: 'live', tier: 'free', color: '#FF4500' },
  { id: 'hackernews', name: 'Hacker News', role: 'reputation', status: 'live', tier: 'free', color: '#FF6600' },
  { id: 'lobsters', name: 'Lobsters', role: 'reputation', status: 'soon', tier: 'free', color: '#AC130A' },
  { id: 'stackoverflow', name: 'Stack Overflow', role: 'reputation', status: 'soon', tier: 'free', color: '#F48024' },
  { id: 'discord', name: 'Discord', role: 'reputation', status: 'soon', tier: 'free', color: '#5865F2' },

  // ── Promotion surfaces — your voice, your channels ─────────────────────────
  /*
   * DEV, Indie Hackers and Quora were filed under `reputation` (doc 75 §2a)
   * because the roster was written before the rulebook existed and everything
   * that was not X or LinkedIn looked like a place to earn. It is wrong twice
   * over: publishing your own work is NORMAL on all three — the rulebook has
   * them `open`, so the doctrine of restraint did not apply — and `reputation`
   * makes their profile page ask for "what to watch here", a list no code path
   * reads. Only reddit and hackernews reach a scan. A question whose answer
   * does nothing teaches the user their answers are decoration.
   *
   * They stay `soon`: nothing composes for them yet, so no `limit` and they do
   * not enter PUB_NETWORKS. The role is now honest about what they are.
   */
  { id: 'devto', name: 'DEV Community', role: 'promotion', status: 'soon', tier: 'free', color: '#8894a8' },
  { id: 'indiehackers', name: 'Indie Hackers', role: 'promotion', status: 'soon', tier: 'free', color: '#4D6BFE' },
  { id: 'quora', name: 'Quora', role: 'promotion', status: 'soon', tier: 'free', color: '#B92B27' },
  { id: 'x', name: 'X', role: 'promotion', status: 'live', tier: 'free', color: '#9aa0a6', limit: 280 },
  { id: 'linkedin', name: 'LinkedIn', role: 'promotion', status: 'live', tier: 'free', color: '#0A66C2', limit: 3000 },
  { id: 'bluesky', name: 'Bluesky', role: 'promotion', status: 'live', tier: 'free', color: '#0085FF', limit: 300 },
  { id: 'mastodon', name: 'Mastodon', role: 'promotion', status: 'live', tier: 'free', color: '#6364FF', limit: 500 },
  { id: 'threads', name: 'Threads', role: 'promotion', status: 'live', tier: 'free', color: '#8894a8', limit: 500 },
  // Long form: the one surface here where a post is an ESSAY, not a status.
  // The cap is nominal — Medium has none; it exists so the composer knows to
  // stop writing tweets and write a piece.
  { id: 'medium', name: 'Medium', role: 'promotion', status: 'live', tier: 'free', color: '#c8c8c8', limit: 20000 },
  // Visual/video-first — a composer without image/video generation would be
  // a lie; they wait for that machinery, behind the license (v2 tiers).
  { id: 'instagram', name: 'Instagram', role: 'promotion', status: 'soon', tier: 'licensed', color: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', role: 'promotion', status: 'soon', tier: 'licensed', color: '#69C9D0' },
  { id: 'youtube', name: 'YouTube', role: 'promotion', status: 'soon', tier: 'licensed', color: '#FF0000' },
  { id: 'facebook', name: 'Facebook', role: 'promotion', status: 'soon', tier: 'licensed', color: '#1877F2' },
  { id: 'producthunt', name: 'Product Hunt', role: 'promotion', status: 'soon', tier: 'licensed', color: '#DA552F' },
];

/** @returns Every surface where promotion has to be EARNED first. */
export const reputationNetworks = (): NetworkDef[] => NETWORKS.filter(n => n.role === 'reputation');

/** @returns Every surface that is the user's own channel to broadcast on. */
export const promotionNetworks = (): NetworkDef[] => NETWORKS.filter(n => n.role === 'promotion');

/**
 * What a network's profile page asks for — derived from the ROLE, never from a
 * per-component `if`.
 *
 * The rule is one line long and it is the whole point: **ask only what
 * something reads.** The first version asked every surface the same four
 * questions, which meant a first visit to X or LinkedIn collected a list of
 * "topics to watch here" that no code path has ever read — only `reddit` and
 * `hackernews` targets reach a scan (`scanRadar`) or a watch
 * (`watchTargetsFor`). A question whose answer does nothing is worse than no
 * question: it teaches the user their answers are decoration.
 *
 * What a promotion surface actually needs instead is what its studio consumes:
 * the language to publish in, who reads them there, and the profile link that
 * a handle alone cannot stand in for.
 */
export interface NetProfileShape {
  /** The user's own place here (a subreddit). Reddit only. */
  home: boolean;
  /** A per-network scan list — ONLY where a scan reads it. */
  targets: boolean;
  /** Publish language + audience + profile link — the composer's inputs. */
  publish: boolean;
}

export function netProfileShape(net: NetworkDef): NetProfileShape {
  return {
    home: net.id === 'reddit',
    targets: net.role === 'reputation',
    publish: net.role === 'promotion',
  };
}
