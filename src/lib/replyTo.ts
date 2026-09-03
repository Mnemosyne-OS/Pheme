/**
 * Answering a PERSON, not a thread.
 *
 * The Studio was born on the radar, where the unit of work is a thread the
 * scan found. But the reply that matters most is the one somebody left under
 * YOUR comment, and that one arrives in the inbox — never on the radar. This
 * turns a reconstructed thread plus one of its replies into the item the
 * Studio already knows how to work with, without pretending it is a radar
 * pick: score 0 and no matched topics, because nothing scored it.
 */
import type { ReplyNode, ThreadNode } from './presence';
import type { ScoredItem } from './score';

/**
 * The item carries the THREAD's id and url on purpose. The Studio re-reads
 * the thread before drafting (verify.refreshThread keys off `id` for HN and
 * off `url` for Reddit), and a comment permalink would refresh one comment
 * instead of the room it lives in.
 */
export function replyItem(thread: ThreadNode, reply: ReplyNode): ScoredItem {
  return {
    id: thread.id,
    title: thread.title,
    body: thread.postBody,
    author: thread.postAuthor,
    url: thread.url,
    // The reply's own time: this item exists because THEY spoke, and the
    // studio's freshness reads from here.
    timestamp: reply.timestamp,
    network: thread.network,
    target: thread.community,
    ...(thread.commentCount !== null ? { comments: thread.commentCount } : {}),
    matched: [],
    score: 0,
  };
}

/**
 * Drafts are keyed per REPLY, not per thread: two people can answer the same
 * comment of yours, and drafting for the second must never overwrite the
 * work done for the first.
 */
export function replyDraftKey(reply: ReplyNode): string {
  return `reply_${reply.id}`;
}

/** What the model has to answer: their words, and the words of yours that drew them. */
export function replyingToOf(thread: ThreadNode, reply: ReplyNode): {
  author: string; body: string; mine?: string;
} {
  return {
    author: reply.author,
    body: reply.body,
    // Only when the user's own message is what they answered — for a post of
    // the user's, `myBody` is empty and the post body already carries it.
    ...(thread.myBody ? { mine: thread.myBody } : {}),
  };
}
