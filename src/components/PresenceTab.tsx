/** Presence - the pseudonym followed as reconstructed threads. */
import { useState } from 'react';
import { bridge } from '../lib/bridge';
import { type PresenceReport, type SeenMarks } from '../lib/presence';
import { freshReplies, presenceZones } from '../lib/selectors';
import { HN, REDDIT, netOf, useProfile } from '../lib/store';
// The thread card is SHARED with the network board — the same conversation
// must not be rendered by two different components (doc: centralise).
import { ReplyAction, ThreadCard, type ReplyKit } from './ThreadCard';
import { age, mmss, useCooldownClock, type T } from './shared';

export function PresenceTab({ t, profile, setProfile, report, busy, lastSeen, framed, netFilter, bgUnread, replyKit, onRefresh, onMarkSeen }: {
  t: T;
  profile: ReturnType<typeof useProfile>['profile'];
  setProfile: ReturnType<typeof useProfile>['setProfile'];
  report: PresenceReport | null;
  busy: boolean;
  lastSeen: SeenMarks;
  framed: boolean;
  /** v2: set by a network board — the tab shows ONE network's presence. */
  netFilter?: 'reddit' | 'hackernews';
  /** Items the HOST spotted while this window was closed (doc 72). */
  bgUnread?: number;
  /** Absent = read-only presence (the Cockpit preview); present = you can answer here. */
  replyKit?: ReplyKit;
  onRefresh: () => void;
  onMarkSeen: () => void;
}) {
  const reddit = netOf(profile, REDDIT);
  const hasConfig = !!(reddit.handle || netOf(profile, HN).handle || reddit.home);
  // Everything on this screen must be about THIS network: an unscoped read
  // made the HN tab claim Reddit threads, list r/… as failed targets and
  // offer "mark seen" over replies it never showed.
  const hasThreads = !!report && report.groups.some(g =>
    g.threads.some(th => !netFilter || th.network === netFilter));
  const netFailed = !report ? [] : !netFilter ? report.failed
    : report.failed.filter(f => netFilter === 'reddit' ? !f.startsWith('HN') : f.startsWith('HN'));
  // The cooldown is app-wide (radar trips it too) — show it even when the
  // last presence report predates it. Ticks every second.
  const coolSecs = useCooldownClock();

  return (
    <div className="pane wide">
      <h2>{t('presenceTitle')}</h2>
      <p className="lead">{t('presenceLead')}</p>

      {/* Pseudonyms and sub are edited in Settings — ONE place, not two. */}
      {!hasConfig && <p className="hint">{t('configureHint')}</p>}

      <div className="row">
        <button className="primary" onClick={onRefresh} disabled={busy || !framed || !hasConfig}>
          {busy ? t('presenceRefreshing') : t('presenceRefresh')}
        </button>
        {/* The timer moved out of Settings, next to the button it automates.
            It is ONE timer for one run covering both reputation surfaces, so
            it reads the same on either tab — the hint below says so rather
            than letting it look per-network. */}
        <select
          value={profile.presenceAutoMin}
          title={t('autoHint')}
          onChange={e => setProfile(p => ({
            ...p, presenceAutoMin: Number(e.target.value), presencePaused: false,
          }))}
        >
          <option value={0}>{t('autoOff')}</option>
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={60}>1 h</option>
          <option value={180}>3 h</option>
        </select>
        {profile.presenceAutoMin > 0 && (
          <button onClick={() => setProfile(p => ({ ...p, presencePaused: !p.presencePaused }))}>
            {profile.presencePaused ? t('resume') : t('pause')}
          </button>
        )}
        {hasThreads && <button onClick={onMarkSeen}>{t('markSeen')}</button>}
        {netFilter !== 'reddit' && report?.hnKarma !== null && report?.hnKarma !== undefined && (
          <span className="karma">{t('karma')} · <strong>{report.hnKarma}</strong></span>
        )}
        {/* Reddit publishes karma too, and Pheme read past it until 0.7.4.
            Absent stays absent: an unread or walled account shows nothing
            here rather than a 0 that reads as a measured figure. */}
        {netFilter !== 'hackernews' && typeof report?.redditAccount?.total === 'number' && (
          <span className="karma">{t('karma')} · <strong>{report.redditAccount.total}</strong></span>
        )}
        {report && <span className="karma">{t('updatedAgo')} {age(report.at)}</span>}
      </div>
      {!framed && <p className="warn small">{t('notConnected')}</p>}
      {/* The host looked while this window was closed and saw movement —
          it counts arrivals, it does not fetch the threads. Refresh does. */}
      {(bgUnread ?? 0) > 0 && (
        <p className="cooldownOver">📡 {bgUnread} {t('bgFound')}</p>
      )}
      {/* The honest nudge: nothing arrives on its own while this is off. */}
      {profile.presenceAutoMin === 0 && (
        <p className="hint">{t('autoOffHint')}</p>
      )}
      {/* The throttle is a Reddit affair — same rule as the radar board. */}
      {netFilter !== 'hackernews' && (
        coolSecs > 0 ? (
          <p className="warn small">{t('rateLimitedMsg')} · ⏳ {mmss(coolSecs)}</p>
        ) : report?.rateLimited ? (
          // The last run WAS throttled but the wall is down — invite the win.
          <p className="cooldownOver">✓ {t('cooldownOver')}</p>
        ) : null
      )}
      {netFailed.length > 0 && (
        <p className="warn small">{t('failedTargets')} {netFailed.join(', ')}</p>
      )}
      {report?.subEmpty && netFilter !== 'hackernews' && (
        <p className="warn small">r/{reddit.home} · {t('subEmptyMsg')}</p>
      )}

      {!hasThreads && !busy && <p className="empty">{t('presenceEmpty')}</p>}

      {report && <Inbox t={t} report={report} lastSeen={lastSeen} netFilter={netFilter} kit={replyKit} />}
      {report && <Zones t={t} report={report} mySub={reddit.home} lastSeen={lastSeen} netFilter={netFilter} kit={replyKit} />}
    </div>
  );
}

/**
 * The answer to "did anyone reply?" — every fresh reply, flat, at the top.
 * The zones below stay thread-shaped for reading a conversation; this is
 * the arrival board.
 */
function Inbox({ t, report, lastSeen, netFilter, kit }: {
  t: T; report: PresenceReport; lastSeen: SeenMarks;
  netFilter?: 'reddit' | 'hackernews';
  kit?: ReplyKit;
}) {
  // One open studio at a time: generating drafts costs a model call, and a
  // column of half-filled studios is a column of half-spent money.
  const [openId, setOpenId] = useState<string | null>(null);
  const fresh = freshReplies(report, lastSeen, netFilter);
  // Never vanish on zero: the arrival board disappearing is what made
  // "where do I answer someone?" unanswerable. Empty says so, and says why.
  return (
    <section className="group inbox">
      <h3 className="groupHead">📬 {t('inboxHead')} <span className="meta">· {fresh.length}</span></h3>
      {fresh.length === 0 && <p className="hint">{t('inboxNone')}</p>}
      {fresh.length > 0 && kit && <p className="hint">{t('inboxAnswerHint')}</p>}
      <ul className="replyList">
        {fresh.slice(0, 20).map(({ reply, thread }) => (
          <li key={reply.id} className="reply inboxRow">
            <span className="replyMeta">
              {reply.toMe && <span className="kindTag comment">↳ {t('toYouTag')}</span>}
              <strong>{reply.author}</strong> · {age(reply.timestamp)}
              <span className="meta"> · {thread.community} · {thread.title.replace(/^\/?u\/\S+\s+on\s+/i, '').slice(0, 60)}</span>
            </span>
            {reply.body && <p>{reply.body}</p>}
            <div className="row">
              <button className="mini" onClick={() => bridge.openExternal(reply.url || thread.url)}>
                {t('open')}
              </button>
              <ReplyAction
                t={t} kit={kit} thread={thread} reply={reply}
                open={openId === reply.id}
                onToggle={() => setOpenId(id => id === reply.id ? null : reply.id)}
              />
            </div>
          </li>
        ))}
      </ul>
      {fresh.length > 20 && <p className="hint">+{fresh.length - 20}</p>}
    </section>
  );
}

/**
 * The report re-cut around the USER, not around communities: their own
 * history first, then their sub (present even when empty — an absent
 * section reads as a bug), then followed threads, then anything left.
 */
function Zones({ t, report, mySub, lastSeen, netFilter, kit }: {
  t: T; report: PresenceReport; mySub: string; lastSeen: SeenMarks;
  netFilter?: 'reddit' | 'hackernews';
  kit?: ReplyKit;
}) {
  const { mine, sub, follows, elsewhere, mySubName } = presenceZones(report, mySub, netFilter);

  return (
    <>
      <section className="group">
        <h3 className="groupHead">{t('historyHead')} <span className="meta">· {mine.length}</span></h3>
        {mine.length === 0
          ? <p className="hint">{t('historyEmpty')}</p>
          : mine.map(thr => <ThreadCard key={thr.id} t={t} thr={thr} lastSeen={lastSeen} showNet kit={kit} />)}
      </section>

      {mySubName && netFilter !== 'hackernews' && (
        <section className="group">
          <h3 className="groupHead">
            <span className="netChip rd">R</span>
            {mySubName} <span className="meta">· {t('yourSubHead')} · {sub.length}</span>
          </h3>
          {sub.length === 0
            // subEmpty = the sub WAS fetched and answered with zero posts.
            // Anything else means no run ever reached it — say that, never
            // "no posts" about a feed nobody read.
            ? <p className="hint">{report.subEmpty ? t('subNoPosts') : t('subNotFetched')}</p>
            : sub.map(thr => <ThreadCard key={thr.id} t={t} thr={thr} lastSeen={lastSeen} kit={kit} />)}
        </section>
      )}

      {follows.length > 0 && (
        <section className="group">
          <h3 className="groupHead">{t('followedHead')} <span className="meta">· {follows.length}</span></h3>
          {follows.map(thr => <ThreadCard key={thr.id} t={t} thr={thr} lastSeen={lastSeen} showNet hideNoneTag kit={kit} />)}
        </section>
      )}

      {elsewhere.length > 0 && (
        <section className="group">
          <h3 className="groupHead">{t('elsewhereHead')} <span className="meta">· {elsewhere.length}</span></h3>
          {elsewhere.map(thr => <ThreadCard key={thr.id} t={t} thr={thr} lastSeen={lastSeen} showNet hideNoneTag kit={kit} />)}
        </section>
      )}
    </>
  );
}

