/**
 * The Publish tab — the voice side of reputation. Stories (multi-post
 * threads) composed from the user's memory for the promotion surfaces,
 * illustrated in SVG, tracked post by post. Composer-only by design in V1:
 * the app never touches a publish API — the HUMAN posts, then marks it
 * here. A promo marked posted writes the 9:1 ledger the Coach reads.
 */
import { useState } from 'react';
import { bridge, inferText } from '../lib/bridge';
import { LANG_NAME, type StringKey } from '../lib/i18n';
import { promotionNetworks } from '../lib/networks';
import { netOf, type Profile } from '../lib/store';
import { NetIcon } from './NetIcon';
import {
  PUB_NETWORKS, buildStoryPrompt, downloadDataUrl,
  loadStories, newStory, parseStoryPosts, saveStories, svgToPng,
  type PosterState, type PubNetwork, type Story, type StoryKind, type StoryPost,
} from '../lib/stories';
import {
  FORMATS, TEMPLATES, buildPosterPrompt, parsePosterCopy, renderPoster, sizeFor, templateFits,
  type PosterTemplate,
} from '../lib/poster';
import type { T } from './shared';

const KIND_LABEL: Record<StoryKind, StringKey> = { promo: 'kindPromo', story: 'kindStory' };

/** One label per layout — what it is FOR, not what it looks like. */
const TEMPLATE_LABEL: Record<PosterTemplate, StringKey> = {
  lockup: 'tplLockup', quote: 'tplQuote', stat: 'tplStat', cover: 'tplCover',
};

export function PublishTab({ t, framed, profile, fixedNet, onWit, onPromo }: {
  t: T; framed: boolean;
  /**
   * The whole profile, not three fields off it: the composer needs the
   * PER-NETWORK answers (publishing language, audience) as well as the global
   * ones, and the network it composes for can change under a picker.
   */
  profile: Profile;
  /** v2: the network tab decides — the studio shows ONE network, no picker. */
  fixedNet?: PubNetwork;
  onWit: (w: 0 | 1 | 2) => void;
  onPromo: (community: string) => void;
}) {
  const { topics, wit } = profile;
  const [allStories, setAllStories] = useState<Story[]>(() => loadStories());
  const stories = fixedNet ? allStories.filter(s => s.network === fixedNet) : allStories;
  const [selId, setSelId] = useState<string | null>(stories[0]?.id ?? null);
  const [pickedNet, setPickedNet] = useState<PubNetwork>('x');
  const net = fixedNet ?? pickedNet;
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  const [preview, setPreview] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const sel = stories.find(s => s.id === selId) ?? null;
  /** The registry ROW for a story's network — not to be confused with the
   *  imported netOf(profile, id), which is the user's settings on that one. */
  const defOf = (story: Story) => PUB_NETWORKS.find(n => n.id === story.network) ?? PUB_NETWORKS[0];

  const update = (story: Story) => {
    const next = allStories.map(s => (s.id === story.id ? { ...story, updatedAt: new Date().toISOString() } : s));
    setAllStories(next);
    saveStories(next);
  };

  /**
   * Patch the story as it is NOW. A model call takes seconds, and writing
   * back a whole snapshot captured at click time silently reverted every
   * title or context edit typed while it ran.
   */
  const patch = (id: string, fn: (s: Story) => Story) => {
    setAllStories(list => {
      const next = list.map(s => (s.id === id ? { ...fn(s), updatedAt: new Date().toISOString() } : s));
      saveStories(next);
      return next;
    });
  };

  const create = (kind: StoryKind) => {
    const story = newStory(net, kind, '');
    setAllStories(list => { const next = [story, ...list]; saveStories(next); return next; });
    setSelId(story.id);
  };

  const remove = (id: string) => {
    setAllStories(list => { const next = list.filter(s => s.id !== id); saveStories(next); return next; });
    setSelId(cur => (cur === id ? null : cur));
  };

  const generate = async (story: Story) => {
    if (busy || !framed) return;
    setBusy('gen');
    setError(null);
    try {
      // The STORY's network decides, not the tab: a picker can compose for a
      // surface other than the one on screen, and each surface carries its own
      // publishing language and its own readers.
      const netSettings = netOf(profile, story.network);
      const raw = inferText(await bridge.ask(
        buildStoryPrompt({
          story, topics, count, wit,
          langName: LANG_NAME[netSettings.postLang || profile.lang],
          audience: netSettings.audience,
        }),
        { task: 'story', net: story.network },
      ));
      const texts = parseStoryPosts(raw);
      if (!texts) throw new Error('unusable model answer');
      patch(story.id, s => ({
        ...s,
        posts: texts.map((text, i) => ({ id: `p${i}_${Date.now()}`, text, svg: null, posted: false })),
      }));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setBusy(null); }
  };

  /**
   * The model is asked for WORDS, never for a drawing — it has no visual
   * judgement, and every "make me an SVG" answer came back as the same grey
   * rounded rectangles on a white plate that contradicted the brand. The
   * layouts are hand-authored, at the size this poster is actually published.
   *
   * This is the PAID step, and the only one: the copy is kept beside the
   * rendering so changing the layout or the canvas afterwards is free.
   */
  const illustrate = async (story: Story, post: StoryPost) => {
    if (busy || !framed) return;
    setBusy(`svg_${post.id}`);
    setError(null);
    try {
      const raw = inferText(await bridge.ask(buildPosterPrompt(post.text), { noMemory: true, task: 'svg', net: story.network }));
      const copy = parsePosterCopy(raw);
      if (!copy) throw new Error('no usable poster copy in the answer');
      // Keep whatever layout/format this post was already using — regenerating
      // the words is not a request to go back to the default look.
      const template = post.poster?.template ?? 'lockup';
      const format = post.poster?.format ?? 'native';
      applyPoster(story, post.id, { copy, template, format });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setBusy(null); }
  };

  /**
   * Render a poster state onto a post. PURE and free — no model call — which
   * is what lets the user try four layouts and five canvases on one set of
   * words. A template the copy cannot honour (a `stat` plate with no number)
   * is refused here as well as greyed out in the UI: the guard belongs with
   * the render, not only with the button.
   */
  const applyPoster = (story: Story, postId: string, state: PosterState) => {
    // `renderPoster` refuses an impossible layout on its own; normalising the
    // STATE here as well is what keeps the two honest with each other — a
    // stored `template: 'stat'` beside a lockup rendering would make the
    // studio's chips describe a poster nobody is looking at. The chip that
    // lights up IS the explanation of what happened.
    const fits = templateFits(state.copy, state.template)
      ? state
      : { ...state, template: 'lockup' as PosterTemplate };
    const svg = renderPoster(fits.copy, sizeFor(story.network, fits.format), {
      template: fits.template,
      wordmark: profile.brand,
    });
    patch(story.id, s => ({
      ...s,
      posts: s.posts.map(p => (p.id === postId ? { ...p, svg, poster: fits } : p)),
    }));
  };

  const copyText = async (id: string, text: string) => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      document.body.removeChild(ta);
    }
    setCopied({ id, ok });
    setTimeout(() => setCopied(null), 2000);
  };

  const copy = (post: StoryPost) => copyText(post.id, post.text);
  /** The fast paste workflow: the whole series in one clipboard trip. */
  const copyAll = (story: Story) => copyText(story.id, story.posts.map(p => p.text).join('\n\n'));

  const markPosted = (story: Story, post: StoryPost) => {
    const posts = story.posts.map(p => (p.id === post.id ? { ...p, posted: !p.posted } : p));
    let promoLogged = story.promoLogged;
    // The 9:1 doctrine crosses networks: the FIRST posted mark of a promo
    // story writes one ledger entry — the Coach sees promo pressure here too.
    if (!post.posted && story.kind === 'promo' && !promoLogged) {
      onPromo(defOf(story).name);
      promoLogged = true;
    }
    update({ ...story, posts, promoLogged });
  };

  return (
    <div className="pane wide">
      <h2>{t('pubTitle')}</h2>
      <p className="lead">{t('pubLead')}</p>
      {!framed && <p className="warn small">{t('notConnected')}</p>}

      <div className="toolbar">
        {!fixedNet && (
          <span className="filters">
            {PUB_NETWORKS.map(n => (
              <button key={n.id} className={net === n.id ? 'fchip on' : 'fchip'} onClick={() => setPickedNet(n.id)}>
                <NetIcon id={n.id} size={13} />
                {n.name}
              </button>
            ))}
            {promotionNetworks().filter(n => n.status === 'soon').map(n => (
              <span key={n.id} className="fchip soonChip">
                <NetIcon id={n.id} size={13} />
                {n.name}
                <span className="netTag">{t('soonTag')}</span>
              </span>
            ))}
          </span>
        )}
        <span className="spacer" />
        <button className="primary" onClick={() => create('promo')}>+ {t('kindPromo')}</button>
        <button onClick={() => create('story')}>+ {t('kindStory')}</button>
      </div>

      {stories.length === 0 && <p className="empty">{t('storiesEmpty')}</p>}

      {stories.length > 0 && (
        <div className="filters storyList">
          {stories.map(s => (
            <button key={s.id} className={s.id === selId ? 'fchip on' : 'fchip'} onClick={() => setSelId(s.id)}>
              {s.title || t(KIND_LABEL[s.kind])} · {s.posts.length}
              {s.posts.length > 0 && s.posts.every(p => p.posted) && ' ✓'}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="card storyCard">
          <div className="row">
            <input
              value={sel.title}
              placeholder={t('storyTitlePh')}
              onChange={e => update({ ...sel, title: e.target.value })}
            />
            <span className="kindTag post">
              <NetIcon id={sel.network} size={12} /> {defOf(sel).name}
            </span>
            <span className={sel.kind === 'promo' ? 'kindTag none' : 'kindTag comment'}>{t(KIND_LABEL[sel.kind])}</span>
            <select value={count} onChange={e => setCount(Number(e.target.value))}>
              {[3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} {t('postsCount')}</option>)}
            </select>
            <span className="filters">
              {([0, 1, 2] as const).map(w => (
                <button key={w} className={wit === w ? 'fchip on' : 'fchip'} onClick={() => onWit(w)}>
                  {t(w === 0 ? 'wit0' : w === 1 ? 'wit1' : 'wit2')}
                </button>
              ))}
            </span>
            <button className="primary" onClick={() => generate(sel)} disabled={busy !== null || !framed}>
              {busy === 'gen' ? t('storyGenerating') : t('genStory')}
            </button>
            {sel.posts.length > 0 && (
              <button onClick={() => copyAll(sel)}>
                {copied?.id === sel.id ? (copied.ok ? `✓ ${t('copied')}` : t('copyFailed')) : t('copyAll')}
              </button>
            )}
            <button className="ghost danger" onClick={() => remove(sel.id)}>{t('storyDelete')}</button>
          </div>

          <label>{t('ctxLabel')}</label>
          <p className="hint">{t('ctxHint')}</p>
          <textarea
            className="ideas"
            value={sel.context}
            placeholder={t('ctxPh')}
            onChange={e => update({ ...sel, context: e.target.value })}
          />

          {error && <p className="warn small">{error}</p>}

          {sel.posts.map((p, i) => {
            const limit = defOf(sel).limit;
            const over = p.text.length > limit;
            return (
              <div key={p.id} className={p.posted ? 'draft posted' : 'draft'}>
                <div className="draftHead">
                  <span className="voiceTag">#{i + 1}</span>
                  <span className={over ? 'chars over' : 'chars'}>{p.text.length}/{limit}</span>
                  <button className="mini" onClick={() => setPreview(m => ({ ...m, [p.id]: !m[p.id] }))}>
                    {preview[p.id] ? t('editBtn') : t('previewBtn')}
                  </button>
                  <button className="mini" disabled={busy !== null || !framed}
                    onClick={() => illustrate(sel, p)}>
                    {busy === `svg_${p.id}` ? t('illustrating') : t('illustrate')}
                  </button>
                  <button onClick={() => copy(p)}>
                    {copied?.id === p.id ? (copied.ok ? `✓ ${t('copied')}` : t('copyFailed')) : t('copy')}
                  </button>
                  <button className="mini" onClick={() => markPosted(sel, p)}>
                    {p.posted ? `✓ ${t('postedTag')}` : t('markPosted')}
                  </button>
                  {/* Where it actually landed. Optional, and asked for rather
                      than guessed — a wrong URL would report "no reaction" on
                      somebody else's post (doc 75 lot 5). */}
                  {p.posted && (
                    <input
                      className="postedUrl"
                      type="url"
                      placeholder={t('postedUrlPh')}
                      title={t('postedUrlHint')}
                      value={p.url ?? ''}
                      onChange={e => update({
                        ...sel,
                        posts: sel.posts.map(x => (x.id === p.id ? { ...x, url: e.target.value } : x)),
                      })}
                    />
                  )}
                  <button className="hideX" title={t('storyDelete')}
                    onClick={() => update({ ...sel, posts: sel.posts.filter(x => x.id !== p.id) })}>×</button>
                </div>
                {preview[p.id] ? (
                  // The "screen": how the post will read, before it is pasted.
                  <div className="postPreview" style={{ borderTopColor: defOf(sel).color }}>
                    <div className="ppHead">
                      <span className="ppAvatar">Φ</span>
                      <span><strong>{t('previewYou')}</strong> <span className="meta">· {defOf(sel).name}</span></span>
                    </div>
                    <p className="ppText">{p.text}</p>
                  </div>
                ) : (
                  <textarea
                    value={p.text}
                    rows={Math.min(6, p.text.split('\n').length + 2)}
                    onChange={e => update({ ...sel, posts: sel.posts.map(x => x.id === p.id ? { ...x, text: e.target.value } : x) })}
                  />
                )}
                {p.svg && (
                  <>
                    <div className="svgPreview" dangerouslySetInnerHTML={{ __html: p.svg }} />
                    {/* Layout and canvas are FREE — the words were the paid
                        step. A template the copy cannot honour is disabled
                        and says why, instead of rendering an empty plate. */}
                    {p.poster && (
                      <>
                        <div className="row">
                          <span className="meta">{t('posterTemplate')}</span>
                          <span className="filters">
                            {TEMPLATES.map(tpl => {
                              const fits = templateFits(p.poster!.copy, tpl);
                              return (
                                <button key={tpl}
                                  className={p.poster!.template === tpl ? 'fchip on' : 'fchip'}
                                  disabled={!fits}
                                  title={fits ? undefined : t('posterNeedsStat')}
                                  onClick={() => applyPoster(sel, p.id, { ...p.poster!, template: tpl })}>
                                  {t(TEMPLATE_LABEL[tpl])}
                                </button>
                              );
                            })}
                          </span>
                        </div>
                        <div className="row">
                          <span className="meta">{t('posterFormat')}</span>
                          <span className="filters">
                            {FORMATS.map(f => (
                              <button key={f}
                                className={p.poster!.format === f ? 'fchip on' : 'fchip'}
                                onClick={() => applyPoster(sel, p.id, { ...p.poster!, format: f })}>
                                {f === 'native' ? t('posterNative') : sizeFor(sel.network, f).label}
                              </button>
                            ))}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="row">
                      {/* A download that fails must SAY so — this pair sat
                          dead for a while and reported nothing at all. */}
                      <button className="mini" onClick={() => {
                        const ok = downloadDataUrl(
                          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.svg ?? '')}`,
                          `pheme-${sel.network}-${p.id}.svg`,
                        );
                        if (!ok) setError(t('downloadFailed'));
                      }}>
                        SVG
                      </button>
                      <button className="mini" onClick={async () => {
                        // The canvas the poster was RENDERED at, not the
                        // network's default: a portrait poster exported at
                        // the landscape width came out squashed.
                        const size = sizeFor(sel.network, p.poster?.format ?? 'native');
                        const png = await svgToPng(p.svg ?? '', size.w);
                        if (!png) { setError(t('downloadFailed')); return; }
                        if (!downloadDataUrl(png, `pheme-${sel.network}-${p.id}.png`)) {
                          setError(t('downloadFailed'));
                        }
                      }}>
                        PNG · {sizeFor(sel.network, p.poster?.format ?? 'native').label}
                      </button>
                      <button className="mini" onClick={() => update({ ...sel, posts: sel.posts.map(x => x.id === p.id ? { ...x, svg: null, poster: null } : x) })}>
                        × {t('illustrate').toLowerCase()}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {sel.posts.length > 0 && (
            <button className="mini" onClick={() => update({
              ...sel,
              posts: [...sel.posts, { id: `p${sel.posts.length}_${Date.now()}`, text: '', svg: null, posted: false }],
            })}>
              + {t('addPost')}
            </button>
          )}

          {sel.kind === 'promo' && <p className="hint">{t('promoLedgerNote')}</p>}
        </div>
      )}
    </div>
  );
}
