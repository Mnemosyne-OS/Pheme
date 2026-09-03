/**
 * What your posts became — doc 75 lot 5, the loop closing.
 *
 * Pheme told you what to write and where, and then never mentioned it again.
 * This is the answer to the only question anyone asks after publishing.
 *
 * Two kinds of nothing live on this screen and they are drawn differently,
 * because confusing them is the whole failure mode:
 *
 *  - **A measured silence.** The thread was fetched, three days have passed
 *    and no human replied. That is a result, and it is said out loud.
 *  - **An unknown.** No score came back, or the surface publishes no counter
 *    at all. That prints as a dash with a reason, never as a zero — a post
 *    displayed at 0 points reads as rejected by people who never saw it.
 */
import { useState } from 'react';
import { bridge } from '../lib/bridge';
import type { PresenceReport } from '../lib/presence';
import { loadStories, type Story, type StoryPost } from '../lib/stories';
import {
  bestScored, countsApiFor, harvest, outcomes, readPublicCounts, silentOnes,
  type CountsFail, type PublicCounts,
} from '../lib/outcomes';
import type { StringKey } from '../lib/i18n';
import { age, type T } from './shared';

const FAIL_LABEL: Record<CountsFail, StringKey> = {
  'no-url': 'cNoUrl', 'no-api': 'cNoApi', refused: 'cRefused',
  unreadable: 'cUnreadable', unreachable: 'cUnreachable',
};

/** One published promo post, and whatever its surface says about it publicly. */
function PublishedRow({ t, story, post }: { t: T; story: Story; post: StoryPost }) {
  const [counts, setCounts] = useState<PublicCounts | null>(null);
  const [fail, setFail] = useState<CountsFail | null>(null);
  const [busy, setBusy] = useState(false);
  const readable = !!countsApiFor(post.url ?? '');

  const read = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await readPublicCounts(post.url ?? '', bridge.fetchUrl);
      setCounts(r.counts);
      setFail(r.fail);
    } finally { setBusy(false); }
  };

  return (
    <li className="actItem">
      <span>
        <span className="kindTag post">{story.network}</span>
        {post.text.slice(0, 60) || story.title}
        {counts && (
          <span className="karma">
            {' · '}
            {counts.likes ?? '—'} ♥ · {counts.boosts ?? '—'} ↻ · {counts.replies ?? '—'} ↩
          </span>
        )}
        {/* A surface with no public counter is a fact about the SURFACE, not
            about the post. Said once, not shown as an empty score. */}
        {fail && <span className="karma"> · {t(FAIL_LABEL[fail])}</span>}
      </span>
      {readable && (
        <button className="mini" onClick={() => { void read(); }} disabled={busy}>
          {busy ? t('reportWriting') : t('cRead')}
        </button>
      )}
    </li>
  );
}

export function OutcomesPanel({ t, presence, network }: {
  t: T;
  presence: PresenceReport | null;
  /** Scope to one network; omitted on the cockpit. */
  network?: string;
}) {
  const list = outcomes(presence, network);
  // Promo posts the human marked as published AND told us where. Without the
  // URL there is nothing to look at, and inventing one is not an option.
  const published = network
    ? []
    : loadStories().flatMap(s => s.posts.filter(p => p.posted && p.url?.trim()).map(p => ({ story: s, post: p })));

  if (list.length === 0 && published.length === 0) {
    return (
      <section className="pseudoBox">
        <label>{t('outHead')}</label>
        <p className="hint">{t('outEmpty')}</p>
      </section>
    );
  }

  const silent = silentOnes(list);
  const best = bestScored(list);
  const got = harvest(list);

  return (
    <section className="pseudoBox">
      <label>{t('outHead')}</label>
      <p className="hint">{t('outHint')}</p>

      {/* What it all added up to. Same cells as the report's fact sheet, and
          the same rule: an unmeasured total is a dash, never a zero. */}
      {list.length > 0 && (
        <>
          <div className="factSheet">
            <div className="factCell">
              <span className={got.points === null ? 'factVal absent' : 'factVal'}>
                {got.points === null ? '—' : got.points}
              </span>
              <span className="factLabel">{t('hPoints')}</span>
            </div>
            <div className="factCell">
              <span className="factVal">{got.replies}</span>
              <span className="factLabel">{t('hReplies')}</span>
            </div>
            <div className="factCell">
              <span className="factVal">{got.posts}</span>
              <span className="factLabel">{t('hPosts')}</span>
            </div>
          </div>
          {/* The sample, out loud: a total over two posts and over forty are
              different sentences, and posts whose score was never published
              are left OUT of the sum rather than added as zero. */}
          <p className="hint">
            {got.scored > 0
              ? `${t('hRests')} ${got.scored}/${got.posts} ${t('hPostsLower')}${got.scored < got.posts ? ` · ${t('hExcluded')}` : ''}`
              : t('hNoScore')}
          </p>
        </>
      )}

      {best && (
        <p className="hint">
          ▲ {t('outBest')} <strong>{best.title.slice(0, 70)}</strong> · {best.score} · {best.community}
        </p>
      )}
      {/* The sentence a dashboard never says. Three days of nothing IS the
          answer, and hearing it is why the loop is worth closing. */}
      {silent.length > 0 && (
        <p className="hint">◦ {silent.length} {t('outSilent')}</p>
      )}

      <ul className="actList">
        {list.slice(0, 8).map(o => (
          <li key={o.id} className="actItem">
            <span>
              <strong>{o.title.slice(0, 70)}</strong>
              <span className="karma">
                {' · '}{o.community} · {age(o.at)}
                {' · '}{o.score === null ? '—' : o.score} ▲
                {' · '}{o.replies} {t('replies').toLowerCase()}
              </span>
            </span>
            <button className="mini" onClick={() => { void bridge.openExternal(o.url); }}>
              {t('open')}
            </button>
          </li>
        ))}
      </ul>

      {published.length > 0 && (
        <>
          <label>{t('outPublished')}</label>
          <p className="hint">{t('outPublishedHint')}</p>
          <ul className="actList">
            {published.slice(0, 8).map(({ story, post }) => (
              <PublishedRow key={post.id} t={t} story={story} post={post} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
