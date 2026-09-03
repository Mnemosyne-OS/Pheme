/**
 * ONE reconstructed conversation, rendered the same way everywhere it is
 * shown: the post, your side of it, the replies beneath, and the Studio one
 * click under the words it answers.
 *
 * It used to live inside PresenceTab, which meant the network board could
 * only ever LINK to a conversation instead of showing it — the same thread
 * appeared twice on one screen (once as a radar pick, once as "your history")
 * with nothing joining them. This file exists so that never has to be
 * written a second time: the board unfolds the very same card Pseudo does.
 */
import { useState } from 'react';
import { bridge } from '../lib/bridge';
import { isSoloAct } from '../lib/authorship';
import { seenOf, type ReplyNode, type SeenMarks, type ShallowWhy, type ThreadNode } from '../lib/presence';
import { replyDraftKey, replyItem, replyingToOf } from '../lib/replyTo';
import type { Lang, StringKey } from '../lib/i18n';
import type { MbtiType } from '../lib/archetypes';
import type { ScoredItem } from '../lib/score';
import { DraftStudio } from './DraftStudio';
import { age, type T } from './shared';

export const MINE_LABEL: Record<ThreadNode['mine'], StringKey> = {
  post: 'kindPost', comment: 'kindComment', none: 'kindSubNew',
};

/**
 * "Not fetched this run" is three different situations, and the user can act
 * on each one differently — refresh again, wait for the countdown, or open
 * the thread by hand. The generic line stays for the case nobody named.
 */
const SHALLOW_KEY: Record<ShallowWhy, StringKey> = {
  budget: 'notInspectedBudget',
  throttled: 'notInspectedThrottled',
  refused: 'notInspectedRefused',
};

/**
 * Everything the Studio needs, carried as ONE prop. Presence is a reading
 * surface that grew an answering surface inside it; five drilled props per
 * level would have been five chances to forget one.
 */
export interface ReplyKit {
  lang: Lang;
  trio: MbtiType[];
  wit: 0 | 1 | 2;
  /** Threads the ledger already counts — the Studio must not re-log them. */
  repliedUrls: Set<string>;
  /**
   * The same ledger, keyed by THREAD rather than by URL (lib/authorship) — what
   * lets a card say "you wrote this one on your own". Built once in App so the
   * badge and the verdict engine can never disagree about a given thread.
   */
  writtenKeys: Set<string>;
  onWit: (w: 0 | 1 | 2) => void;
  onLogged: (item: ScoredItem) => void;
  /** Take that act back — a misclick must not need the whole ledger emptied. */
  onUnlog?: (item: ScoredItem) => void;
}

/**
 * The answer button and, once opened, the Studio itself — right under the
 * words being answered. Drafting keyed per reply (see replyDraftKey), so two
 * people answered in the same thread keep two separate draft sets.
 */
export function ReplyAction({ t, kit, thread, reply, open, onToggle }: {
  t: T; kit?: ReplyKit; thread: ThreadNode; reply: ReplyNode;
  open: boolean; onToggle: () => void;
}) {
  if (!kit) return null;
  const item = replyItem(thread, reply);
  return (
    <>
      <button className={open ? 'mini on' : 'mini'} onClick={onToggle}>
        {open ? t('closeBtn') : `✍️ ${t('replyBtn')}`}
      </button>
      {open && (
        <DraftStudio
          key={reply.id}
          t={t} lang={kit.lang} item={item} trio={kit.trio} wit={kit.wit}
          replyingTo={replyingToOf(thread, reply)}
          draftKey={replyDraftKey(reply)}
          alreadyReplied={kit.repliedUrls.has(item.url)}
          onWit={kit.onWit} onLogged={kit.onLogged} onUnlog={kit.onUnlog}
        />
      )}
    </>
  );
}

/** One reconstructed thread: the post, my side of it, the replies beneath. */
export function ThreadCard({ t, thr, lastSeen, showNet, hideNoneTag, kit }: {
  t: T; thr: ThreadNode; lastSeen: SeenMarks; showNet?: boolean; hideNoneTag?: boolean;
  kit?: ReplyKit;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const mark = seenOf(lastSeen, thr.network);
  const freshReplies = thr.replies.filter(r => !r.bot && r.timestamp > mark).length;
  const isNewSubPost = !!thr.inMySub && thr.mine === 'none' && thr.timestamp > mark;
  const fresh = freshReplies > 0 || isNewSubPost;
  // The engine's own rule, called rather than restated — this is the card the
  // user checks to confirm Pheme is right about which acts were theirs alone,
  // and a badge that disagreed with the verdict would discredit both. Absent
  // the kit nothing is claimed either way: "not marked" must never be readable
  // as "assisted".
  const solo = !!kit && isSoloAct(thr, kit.writtenKeys);

  return (
    <div className={fresh ? 'card fresh' : 'card'}>
      <div className="cardTitle">
        <span className="meta">
          {showNet && (
            <span className={thr.network === 'hackernews' ? 'netChip hn' : 'netChip rd'}>
              {thr.network === 'hackernews' ? 'Y' : 'R'}
            </span>
          )}
          {showNet && `${thr.community} · `}
          {(thr.mine !== 'none' || !hideNoneTag) && (
            <span className={`kindTag ${thr.mine}`}>{t(MINE_LABEL[thr.mine])}</span>
          )}
          {solo && <span className="kindTag solo" title={t('soloTagHint')}>{t('soloTag')}</span>}
          {thr.followed && <span className="kindTag post">{t('followedTag')}</span>}
          {thr.postAuthor} · {age(thr.timestamp)}
          {/* Same rule as the history row: unknown says so with a dash rather
              than disappearing, and the tooltip says WHICH unknown it is. */}
          {typeof thr.myScore === 'number'
            ? <span className="scoreUp" title={t('myScoreTitle')}>▲ {thr.myScore}</span>
            : (
              <span className="meta" title={t(thr.commentCount === null ? 'threadNotRead' : 'myScoreNone')}>
                {' '}▲ —
              </span>
            )}
          {thr.commentCount !== null
            ? ` · ${thr.commentCount} ${t('repliesLabel')}`
            : <span title={t('threadNotRead')}> · — {t('repliesLabel')}</span>}
          {fresh && <span className="newChip">{freshReplies > 1 ? `${freshReplies} ${t('newBadge')}` : t('newBadge')}</span>}
        </span>
        <a className="direct" href={thr.url} onClick={(e) => { e.preventDefault(); void bridge.openExternal(thr.url); }}>
          <strong>{thr.title}</strong>
        </a>
      </div>

      {thr.postBody && (
        <details className="postBox">
          <summary>{t('showPost')}</summary>
          <pre>{thr.postBody}</pre>
        </details>
      )}
      {thr.myBody && (
        <div className="myMsg">
          <span className="meta">{t('myMessage')}</span>
          <p>{thr.myBody}</p>
        </div>
      )}

      {thr.replies.length === 0
        // commentCount null = this run never LOOKED inside the thread —
        // "no replies yet" would be a claim nobody checked.
        ? <p className="hint">{thr.commentCount === null
            ? t(thr.shallowWhy ? SHALLOW_KEY[thr.shallowWhy] : 'notInspected')
            : t('noReplies')}</p>
        : (
          <ul className="replyList">
            {thr.replies.map(r => (
              <li key={r.id} className="reply">
                <span className="replyMeta">
                  {r.toMe && <span className="kindTag comment">↳ {t('toYouTag')}</span>}
                  {/* Shown, never hidden — and never counted. Same doctrine as
                      the ⌛ on a decayed thread: the user sees what is there. */}
                  {r.bot && <span className="kindTag none">{t('botTag')}</span>}
                  {r.author} · {age(r.timestamp)}
                  {!r.bot && r.timestamp > mark && <span className="newChip">{t('newBadge')}</span>}
                </span>
                {r.body && <p>{r.body}</p>}
                <div className="row">
                  <button className="mini" onClick={() => bridge.openExternal(r.url)}>{t('open')}</button>
                  <ReplyAction
                    t={t} kit={kit} thread={thr} reply={r}
                    open={openId === r.id}
                    onToggle={() => setOpenId(id => id === r.id ? null : r.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
