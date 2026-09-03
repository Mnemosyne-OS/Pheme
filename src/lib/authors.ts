/**
 * Who is actually TALKING TO YOU — and who only looks like it.
 *
 * Every subreddit's AutoModerator posts a boilerplate comment on EVERY
 * submission, as a direct child of the post. Pheme's reply reconstruction
 * marks a comment `toMe` when its parent's author is the user, so on the
 * user's own post that boilerplate arrives as "someone replied to you": an
 * inbox badge, a 📬 row, and a draft studio opened to answer a bot. The thread
 * also reports "1 comment" while nobody has said anything.
 *
 * Same family, one step further: a `[deleted]` or `[removed]` comment is a
 * reply that no longer exists. Counting it is claiming a conversation that is
 * gone, and handing its body ("[removed]") to the drafter as thread context is
 * feeding the model a placeholder as if it were speech.
 *
 * The rule lives HERE, once. Nothing is hidden: a bot's comment still renders
 * in the thread, tagged as what it is — the same doctrine as the ⌛ mark on a
 * decayed thread. It is simply never COUNTED as a human, never routed to the
 * inbox, and never quoted to the model.
 */

/**
 * Accounts that post on a schedule rather than in a conversation.
 *
 * An explicit list, deliberately: a heuristic on the name (`/bot$/i`) matches
 * Talbot, Abbot and every human whose handle happens to end that way, and
 * silently deleting a real person's reply from the inbox is far worse than
 * letting one bot through. AutoModerator is the one that fires everywhere;
 * the rest are the widespread cross-subreddit accounts.
 */
const BOT_AUTHORS = new Set([
  'automoderator',
  'automod',
  'repostsleuthbot',
  'sneakpeekbot',
  'b0trank',
  'wikisummarizerbot',
  'savevideo',
  'redditsaveme',
  'remindmebot',
  'imagesofnetwork',
  'totesmessenger',
  'haikubotinaction',
  'anti-hatecrimes-bot',
  'visualmod',
]);

/** Reddit replaces the author of a removed comment with one of these. */
const GONE_AUTHORS = new Set(['[deleted]', '[removed]']);

const norm = (author: string): string => (author ?? '').trim().toLowerCase().replace(/^\/?u\//, '');

/** @returns True for a known automated account. Case- and `u/`-insensitive. */
export const isBotAuthor = (author: string): boolean => BOT_AUTHORS.has(norm(author));

/**
 * @returns True when the comment no longer exists — the author was replaced by
 *   `[deleted]`, or the body was, which is what a removal leaves behind.
 */
export const isGone = (author: string, body: string): boolean =>
  GONE_AUTHORS.has(norm(author)) || /^\[(deleted|removed)]$/i.test((body ?? '').trim());

/**
 * The ONE predicate every count, badge and prompt goes through: is this a
 * human, present, saying something to you?
 *
 * Used at every site that counts a reply. A second, hand-rolled `filter` on
 * one of those sites is exactly how the inbox and the badge came to disagree
 * before — see `selectors.ts`.
 */
export const isHumanVoice = (r: { author: string; body: string }): boolean =>
  !isBotAuthor(r.author) && !isGone(r.author, r.body);
