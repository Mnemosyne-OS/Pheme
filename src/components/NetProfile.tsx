/**
 * ONE profile page per network — who you are HERE.
 *
 * The settings were a single flat page shaped by Reddit and Hacker News: your
 * pseudonym, the places you watch and how you present yourself all lived in
 * the same list, and a third network had nowhere to go. This is the other
 * half of that split: each surface gets its own page, and the first time you
 * open a network it asks the two questions it needs instead of assuming.
 *
 * Nothing here is a draft: every field writes the profile directly, the same
 * rule as ProfileFields — a "save" step is what ate the user's subs once.
 */
import { useState } from 'react';
import { bridge, inferText, isFramed } from '../lib/bridge';
import { netProfileShape, type NetworkDef } from '../lib/networks';
import { AVAILABLE_LANGS, LANG_NAME, type Lang } from '../lib/i18n';
import { HN, REDDIT, netOf, setNet, type Profile } from '../lib/store';
import { ChipsInput } from './ProfileFields';
import { SubFinder } from './SubFinder';
import { NetIcon } from './NetIcon';
import { feedGroundLine, feedUrlFor, readProfileFeed, type FeedRead } from '../lib/profileFeed';
import { looksLikeBrandHandle } from '../lib/verify';
import { age, type T } from './shared';

type SetProfile = (fn: (p: Profile) => Profile) => void;

/**
 * What to ask for, per surface. A subreddit is not a search query is not a
 * hashtag — the label has to say which, or the field collects the wrong thing.
 * WHICH fields appear is not decided here: it comes from `netProfileShape`,
 * so the "ask only what something reads" rule lives with the registry.
 */
function fieldsFor(net: NetworkDef): {
  handleLabel: string; handlePlaceholder: string;
  targetsLabel: string; targetsPlaceholder: string;
  profilePlaceholder: string;
} {
  if (net.id === REDDIT) {
    return {
      handleLabel: 'redditUserLabel', handlePlaceholder: 'yaka0007',
      targetsLabel: 'subsLabel', targetsPlaceholder: 'LocalLLaMA, selfhosted…',
      profilePlaceholder: 'https://www.reddit.com/user/…',
    };
  }
  if (net.id === HN) {
    return {
      handleLabel: 'hnUserLabel', handlePlaceholder: 'MnemosyneOS',
      targetsLabel: 'netQueriesLabel', targetsPlaceholder: 'local AI, RAG…',
      profilePlaceholder: 'https://news.ycombinator.com/user?id=…',
    };
  }
  return {
    handleLabel: 'netHandleLabel', handlePlaceholder: '@you',
    targetsLabel: 'netTopicsLabel', targetsPlaceholder: 'local AI, RAG…',
    profilePlaceholder: PROFILE_HINT[net.id] ?? 'https://…',
  };
}

/**
 * A realistic example per surface. Mastodon's is the reason this field exists
 * at all: `@you` there is not addressable — the instance is half the address.
 */
const PROFILE_HINT: Record<string, string> = {
  x: 'https://x.com/you',
  linkedin: 'https://www.linkedin.com/in/you',
  bluesky: 'https://bsky.app/profile/you.bsky.social',
  mastodon: 'https://mastodon.social/@you',
  threads: 'https://www.threads.net/@you',
  medium: 'https://medium.com/@you',
};

export function NetProfile({ t, net, profile, setProfile, firstRun, onDone }: {
  t: T; net: NetworkDef; profile: Profile; setProfile: SetProfile;
  /** The network has never been configured — the page asks instead of showing. */
  firstRun?: boolean;
  onDone?: () => void;
}) {
  const s = netOf(profile, net.id);
  const f = fieldsFor(net);
  const shape = netProfileShape(net);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = (p: Partial<typeof s>) => setProfile(prev => setNet(prev, net.id, p));
  /** What the composer will actually write in here — never a guess. */
  const writeLang: Lang = s.postLang || profile.lang;

  /**
   * What this surface publishes under the user's name, read from its OPEN
   * feed. Ephemeral on purpose: it is a look at the outside world, not a
   * setting, and a cached list of articles is a claim that goes stale.
   *
   * This does NOT make a promotion network scanned — nothing here watches for
   * things to react to. It reads the user's OWN page, because a profile URL
   * that does nothing is the failure this release spent its time removing.
   */
  const [feed, setFeed] = useState<FeedRead | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const canRead = !!feedUrlFor(net.id, s.profileUrl);

  const readFeed = async () => {
    if (feedBusy) return;
    setFeedBusy(true);
    setErr(null);
    try {
      setFeed(await readProfileFeed(net.id, s.profileUrl, bridge.fetchUrl));
    } finally { setFeedBusy(false); }
  };

  /**
   * Mnemosyne already knows who this person is — it holds their work. Asking
   * them to retype a bio a machine could read from their own memory is the
   * kind of small stupidity that makes an app feel like paperwork.
   */
  const draftBio = async () => {
    if (busy || !isFramed()) return;
    setBusy(true);
    setErr(null);
    try {
      const out = inferText(await bridge.ask([
        `Write a public profile bio for ${net.name}, in the first person.`,
        'Ground it ONLY in what my memory actually says about my work — never invent a role, a company, a number or a credential.',
        net.limit && net.limit < 400
          ? `Hard limit: ${net.limit} characters.`
          : 'Two or three sentences, maximum 400 characters.',
        'No hashtags, no emoji, no "passionate about". Say what I build and what I know, concretely.',
        s.audience.trim() ? `Who reads me there: ${s.audience.trim().slice(0, 240)}. Speak to THEM.` : '',
        // Their OWN published titles, when they asked for them. Memory says
        // what they know; this says what they have actually put out under
        // this name — a bio written from both stops sounding like a vault
        // summary and starts describing a body of work.
        feedGroundLine(feed?.posts ?? []),
        s.bio ? `My current bio, to improve rather than replace: "${s.bio}"` : '',
        // The bio belongs to the network, so it follows the network's own
        // publishing language — not the language the app happens to run in.
        `Write it in ${LANG_NAME[writeLang]}. Output ONLY the bio.`,
      ].filter(Boolean).join('\n'), { task: 'suggest', net: net.id }));
      const bio = out.trim().replace(/^["']|["']$/g, '');
      // An empty answer is not a bio — say nothing happened rather than
      // wiping what the user already wrote.
      if (!bio) { setErr(t('netBioEmpty')); return; }
      patch({ bio });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const configured = !!s.configuredAt;

  return (
    <div className="pane">
      <h2><NetIcon id={net.id} size={20} /> {net.name}</h2>
      <p className="lead">
        {firstRun ? t('netFirstRunLead') : t('netProfileLead')}
        {configured && <span className="meta"> · {t('netConfiguredAgo')} {age(s.configuredAt)}</span>}
      </p>

      <label>{t(f.handleLabel as never)}</label>
      {/* On a surface Pheme never reads, "this is what Pheme follows" is
          simply untrue — the hint says what the handle is really for here. */}
      <p className="hint">{t(shape.publish ? 'netHandleHintPromo' : 'netHandleHint')}</p>
      <input
        value={s.handle} placeholder={f.handlePlaceholder}
        onChange={e => patch({ handle: e.target.value.replace(/^[@u]\//, '').replace(/^@/, '').trim() })}
      />
      {/* A brand account explaining why "its" product fits reads as
          astroturfing even when every word is sincere — and the author cannot
          see it from the inside, they are just using the name they always use.
          Only where a reply gets READ as coming from a peer. */}
      {!shape.publish && looksLikeBrandHandle(s.handle, profile.brand) && (
        <p className="warn small">{t('handleBrandWarn')}</p>
      )}

      {/* The profile link. A handle is not always an address: `@you` on
          Mastodon is missing the instance, and a LinkedIn vanity URL is not a
          handle at all. Asked everywhere, because everywhere it is the one
          thing that makes "who you are here" verifiable by a human. */}
      <label>{t('netProfileUrlLabel')}</label>
      <p className="hint">{t('netProfileUrlHint')}</p>
      <div className="row">
        <input
          value={s.profileUrl} placeholder={f.profilePlaceholder}
          onChange={e => patch({ profileUrl: e.target.value.trim() })}
        />
        {/^https:\/\//i.test(s.profileUrl) && (
          <button className="mini" onClick={() => { void bridge.openExternal(s.profileUrl); }}>
            {t('open')}
          </button>
        )}
        {/* Reads the surface's OWN public feed — the user's articles, not a
            scan of the network. Only where such a feed exists; elsewhere the
            page says so rather than offering a button that finds nothing. */}
        {canRead && (
          <button className="mini" disabled={feedBusy} onClick={() => { void readFeed(); }}>
            {feedBusy ? t('feedReading') : `↧ ${t('feedRead')}`}
          </button>
        )}
      </div>
      {/^https:\/\//i.test(s.profileUrl) && !canRead && (
        <p className="hint">{t('feedNone')}</p>
      )}
      {feed && (
        feed.posts.length > 0
          ? (
            <>
              <p className="hint">{t('feedFound')} · {feed.posts.length}</p>
              <ul className="feedList">
                {feed.posts.slice(0, 8).map(post => (
                  <li key={post.url || post.title}>
                    <button className="linkish" onClick={() => { void bridge.openExternal(post.url); }}>
                      {post.title}
                    </button>
                    {/* Absent is not "today": a feed without a date shows none. */}
                    {post.at && <span className="meta"> · {age(post.at)}</span>}
                  </li>
                ))}
              </ul>
              <p className="hint">{t('feedGroundsBio')}</p>
            </>
          )
          : (
            <p className="warn small">
              {t(feed.fail === 'refused' ? 'feedRefused'
                : feed.fail === 'unreachable' ? 'feedUnreachable'
                  : feed.fail === 'no-feed' ? 'feedNone' : 'feedEmpty')}
              {feed.status ? ` · HTTP ${feed.status}` : ''}
            </p>
          )
      )}

      {shape.home && (
        <>
          <label>{t('mySubLabel')}</label>
          <p className="hint">{t('netHomeHint')}</p>
          <input
            value={s.home} placeholder="MnemosyneOS"
            onChange={e => patch({ home: e.target.value.replace(/^r\//, '').trim() })}
          />
        </>
      )}

      {/* Asked ONLY where a scan reads it. A promotion surface is never
          scanned, so collecting a watch list there was collecting nothing. */}
      {shape.targets && (
        <>
          <label>{t(f.targetsLabel as never)}</label>
          <p className="hint">{t('netTargetsHint')}</p>
          <ChipsInput
            values={s.targets}
            onChange={v => patch({ targets: v })}
            placeholder={f.targetsPlaceholder}
          />
          {/* The finder followed its list here. It writes subreddits, so it
              belongs to Reddit and nowhere else — the same component the
              Reddit board already uses, never a second copy. */}
          {net.id === REDDIT && (
            <SubFinder t={t} profile={profile} setProfile={setProfile} />
          )}
        </>
      )}

      {/* What the STUDIO consumes — the questions a broadcast surface owes an
          answer to, in place of the watch list it has no use for. */}
      {shape.publish && (
        <>
          <label>{t('netPostLangLabel')}</label>
          <p className="hint">{t('netPostLangHint')}</p>
          <div className="voices">
            <button
              className={s.postLang === '' ? 'voice on' : 'voice'}
              onClick={() => patch({ postLang: '' })}
            >
              {t('netPostLangSame')} · {LANG_NAME[profile.lang]}
            </button>
            {AVAILABLE_LANGS.map(l => (
              <button
                key={l.id}
                className={s.postLang === l.id ? 'voice on' : 'voice'}
                onClick={() => patch({ postLang: l.id })}
              >
                {l.label}
              </button>
            ))}
          </div>

          <label>{t('netAudienceLabel')}</label>
          <p className="hint">{t('netAudienceHint')}</p>
          <input
            value={s.audience} placeholder={t('netAudiencePlaceholder')}
            onChange={e => patch({ audience: e.target.value })}
          />
        </>
      )}

      <label>{t('netBioLabel')}</label>
      <p className="hint">{t('netBioHint')}</p>
      <textarea
        value={s.bio} rows={3} placeholder={t('netBioPlaceholder')}
        onChange={e => patch({ bio: e.target.value })}
      />
      <div className="row">
        <button className="mini" onClick={draftBio} disabled={busy || !isFramed()}>
          {busy ? t('suggesting') : `✨ ${t('netBioDraft')}`}
        </button>
        {net.limit && s.bio && (
          <span className="meta">{s.bio.length}/{net.limit}</span>
        )}
      </div>
      {err && <p className="warn small">{err}</p>}

      {/* Marking it configured is what stops the first-run page coming back.
          It is a fact ("you have been here"), never a claim that it is
          complete — every field above stays optional. */}
      {(!configured || firstRun) && (
        <>
          <hr className="sideRule" />
          <button
            className="primary"
            onClick={() => {
              patch({ configuredAt: new Date().toISOString() });
              onDone?.();
            }}
          >
            {t('netFirstRunDone')}
          </button>
          <p className="hint">{t('netFirstRunSkip')}</p>
        </>
      )}
    </div>
  );
}
