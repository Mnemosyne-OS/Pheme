/**
 * The draft studio, EMBEDDED in every post view — not a room apart.
 * Four steps: angle (optional), memory, the author's own ideas (optional,
 * woven in by contract), drafts in the chosen voices. Each draft can be
 * translated into the UI language to be UNDERSTOOD — Copy always copies
 * the original, because the original is what gets posted.
 */
import { useEffect, useState } from 'react';
import { bridge, inferText } from '../lib/bridge';
import { MBTI_TYPES, TONE, archetypeLabel, type MbtiType } from '../lib/archetypes';
import type { ScoredItem } from '../lib/score';
import { acceptPolish, buildAnglesPrompt, buildDraftPrompt, buildPolishPrompt, buildRecallPrompt, parseAngles, parseDrafts, parseRecall, type DraftSet, type MemoryRelevance, type PolishMode } from '../lib/drafts';
import { checkDraft, refreshThread, type DraftCheck, type ThreadCheck } from '../lib/verify';
import { readImage } from '../lib/vision';
import { followRefOf, loadDraftsAs, migrateDraftKey, saveChosen, saveDraftText, saveDrafts } from '../lib/store';
import { LANG_NAME, type Lang, type StringKey } from '../lib/i18n';
import { age, type T } from './shared';

const CHECK_LABEL: Record<DraftCheck['id'], StringKey> = {
  length: 'checkLength', promo: 'checkPromo', links: 'checkLinks', language: 'checkLanguage',
  sentences: 'checkSentences', selfRef: 'checkSelfRef', vagueSelfRef: 'checkVague', ownLink: 'checkOwnLink',
};

export function DraftStudio({ t, lang, item, trio, wit, alreadyReplied, replyingTo, draftKey: keyOverride, onWit, onLogged, onUnlog }: {
  t: T; lang: Lang; item: ScoredItem;
  /** The profile trio — the DEFAULT voices, overridable per post below. */
  trio: MbtiType[];
  /** Wit level (profile) — sober / a dry aside / funny. */
  wit: 0 | 1 | 2;
  /** The ledger already holds a participation for this thread. */
  alreadyReplied?: boolean;
  /**
   * Answering ONE person who replied (the inbox flow) rather than the thread
   * at large. Changes what the model is asked to write, and what the header
   * of this box claims to be doing.
   */
  replyingTo?: { author: string; body: string; mine?: string };
  /**
   * Overrides the per-thread draft key. The inbox passes one key per REPLY,
   * so answering a second person in the same thread cannot overwrite the
   * drafts written for the first.
   */
  draftKey?: string;
  onWit: (w: 0 | 1 | 2) => void;
  onLogged: (item: ScoredItem) => void;
  /** Take the act back. Absent = the surface offers no undo. */
  onUnlog?: (item: ScoredItem) => void;
}) {
  // Drafts are deliverables: the studio BOOTS from the saved set for this
  // post — leaving and coming back never loses generated work. Keyed by
  // the STABLE thread id (radar item ids can drift between scans).
  const draftKey = keyOverride ?? followRefOf(item).id;
  // The legacy fallback only makes sense for the radar flow, where an older
  // draft may still sit under a drifting item id. A reply key has no past:
  // falling back to `item.id` would show the THREAD's drafts as if they had
  // been written for this person, and the migration below would then move
  // them under the reply's key for good.
  const legacyKey = keyOverride ? draftKey : item.id;
  const [saved] = useState(() => loadDraftsAs(draftKey, legacyKey));
  // Re-keying is a WRITE — it belongs in an effect, never in render.
  useEffect(() => { migrateDraftKey(draftKey, legacyKey); }, [draftKey, legacyKey]);
  const [ground, setGround] = useState(true);
  /**
   * The voices THIS post is drafted in. Seeded from the profile trio, but a
   * thread often calls for a register the trio does not carry — and going to
   * Settings to swap a global preference for one reply, then back, is how a
   * choice that belongs to the post gets made about the whole account.
   * A previously drafted post reopens in the voices it was written in.
   */
  const [voices, setVoices] = useState<MbtiType[]>(() =>
    saved?.voices?.length ? saved.voices : trio);
  const toggleVoice = (v: MbtiType) => setVoices(cur =>
    cur.includes(v)
      ? cur.filter(x => x !== v)
      : cur.length >= 3 ? [...cur.slice(1), v] : [...cur, v]);
  const sameAsTrio = voices.length === trio.length && voices.every(v => trio.includes(v));
  const [ideas, setIdeas] = useState(saved?.ideas ?? '');
  const [phase, setPhase] = useState<'idle' | 'verify' | 'recall' | 'infer'>('idle');
  const [memory, setMemory] = useState<string | null>(saved?.memory ?? null);
  /** Whether that memory ANSWERS the thread or is merely in the same field. */
  const [memoryUse, setMemoryUse] = useState<MemoryRelevance>('adjacent');
  const [drafts, setDrafts] = useState<DraftSet | null>(saved?.drafts ?? null);
  const [draftedAt, setDraftedAt] = useState<string | null>(saved?.at ?? null);
  const [copied, setCopied] = useState<{ idx: number; ok: boolean } | null>(null);
  // The copied voice IS the user's choice — shown and persisted per post.
  const [chosen, setChosen] = useState<MbtiType | null>(saved?.chosen ?? null);
  // "I posted" without a recorded choice → ask WHICH before logging.
  const [pickPosted, setPickPosted] = useState(false);
  // Replied is a FACT from the ledger — it survives every revisit.
  const [logged, setLogged] = useState(alreadyReplied ?? false);
  const [error, setError] = useState<string | null>(null);
  const [angles, setAngles] = useState<string[] | null>(null);
  const [angleBusy, setAngleBusy] = useState(false);
  const [angle, setAngle] = useState<string | null>(saved?.angle ?? null);
  const [thread, setThread] = useState<ThreadCheck | null>(null);
  /** Which drafts the author has reworked by hand — shown, never inferred. */
  const [edited, setEdited] = useState<Record<string, boolean>>({});
  /**
   * The text as it stood BEFORE the last polish, per draft. A pass that
   * overwrites the author's own sentences with no way back is a one-way door
   * — the same one the ledger's "I posted" used to be.
   */
  const [preFix, setPreFix] = useState<Record<string, string>>({});
  const [polishBusy, setPolishBusy] = useState<string | null>(null);
  /** Per-draft verdict of the last polish — refusals say so where they happened. */
  const [polishMsg, setPolishMsg] = useState<Record<string, string>>({});
  // Per-draft translations — ephemeral like the drafts themselves.
  const [dTrans, setDTrans] = useState<Record<string, string>>({});
  const [dShowOrig, setDShowOrig] = useState<Record<string, boolean>>({});
  const [dBusy, setDBusy] = useState<string | null>(null);
  /**
   * What a vision model read in the post's images, keyed by url. Ephemeral
   * like the drafts before them: a reading is cheap to redo and must never
   * become a stale claim about a post that changed.
   */
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [visionBusy, setVisionBusy] = useState<string | null>(null);
  const [visionErr, setVisionErr] = useState<string | null>(null);
  /**
   * Whether the ACTIVE model can see at all — the host's verdict, asked once.
   * `null` while unknown: a button that greys itself out on a guess is how a
   * working feature gets reported as broken.
   */
  const [canSee, setCanSee] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const st = await bridge.status();
        if (alive) setCanSee(st?.model?.vision?.images === true);
      } catch {
        // An unreachable host is not "no vision" — it is unknown, and the
        // button stays live so the call can report its own failure.
        if (alive) setCanSee(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  const unreadMedia = (thread?.media ?? []).filter(u => !readings[u]).length;

  const readMedia = async (url: string) => {
    if (visionBusy) return;
    setVisionBusy(url);
    setVisionErr(null);
    // `readImage` is total by contract — but a spinner that can only be
    // cleared by the happy path is one refactor away from being stuck for the
    // life of the widget, and there is no reload button in a cartridge.
    try {
      const out = await readImage(
        url,
        `${item.title}\n${item.body}`,
        bridge.fetchImage,
        (prompt, images) => bridge.ask(prompt, { noMemory: true, task: 'vision', net: item.network, images }),
      );
      if (out.reading) {
        setReadings(m => ({ ...m, [url]: out.reading!.text }));
      } else {
        // Each failure names itself. "Nothing found" for a refused call is the
        // fabricated verdict this whole cartridge exists to avoid.
        const key: StringKey = out.fail === 'no-vision' ? 'visionUnavailable'
          : out.fail === 'too-large' ? 'visionTooLarge'
            : out.fail === 'unreachable' ? 'visionUnreachable'
              : out.fail === 'refused' ? 'visionRefused' : 'visionEmpty';
        setVisionErr(out.detail ? `${t(key)} · ${out.detail}` : t(key));
      }
    } catch (e) {
      setVisionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVisionBusy(null);
    }
  };

  const suggestAngles = async () => {
    if (angleBusy || phase !== 'idle') return;
    setAngleBusy(true);
    setError(null);
    try {
      setAngles(parseAngles(inferText(await bridge.ask(buildAnglesPrompt(item), { task: 'angles', net: item.network }))));
    } catch (e) {
      // A failed call is NOT "the model had no angles" — that verdict was
      // fabricated from an exception.
      setError(String(e instanceof Error ? e.message : e));
    }
    finally { setAngleBusy(false); }
  };

  const generate = async () => {
    // Zero voices would send a prompt asking for zero drafts and parse an
    // empty set out of whatever came back — the button says so instead.
    if (voices.length === 0) { setError(t('voicesNone')); return; }
    setError(null);
    setDrafts(null);
    // "I replied" is a LEDGER fact — regenerating drafts does not un-post
    // what was posted, and must not re-open the button that logs it again.
    setLogged(alreadyReplied ?? false);
    if (!alreadyReplied) setChosen(null);
    setDTrans({});
    setDShowOrig({});
    setEdited({});
    setPreFix({});
    setPolishMsg({});
    let memoryNotes: string | null = null;
    let memoryUse: MemoryRelevance = 'none';
    try {
      // Verify & update: the thread as it IS, not as the scan saw it.
      setPhase('verify');
      const check = await refreshThread(item, bridge.fetchUrl);
      setThread(check);

      // READ THE POST BEFORE ANSWERING IT. A conversation opened from the
      // inbox carries whatever presence had reconstructed, and presence only
      // reconstructs a few threads per run — so `item.body` was routinely
      // empty and the drafter answered a thread it had never read.
      //
      // Take the FULLER of the two, not "the scan wins whenever it has
      // anything". The scan entry is a listing excerpt and the re-fetch above
      // is the post itself, so a truncated stump was beating the complete
      // version Pheme had just paid to go and get.
      const grounded = check.postBody.length > item.body.trim().length
        ? { ...item, body: check.postBody }
        : item;

      if (ground) {
        setPhase('recall');
        const recalled = inferText(await bridge.ask(buildRecallPrompt(grounded, grounded.matched), { task: 'recall', net: item.network }));
        // The recall step judges its OWN relevance and says so with the notes
        // (one call). 'none' means nothing is passed on at all — the drafter
        // never sees material that does not bear on the thread.
        const r = parseRecall(recalled);
        memoryUse = r.relevance;
        if (r.relevance !== 'none') memoryNotes = r.notes;
      }
      setMemory(memoryNotes);
      setMemoryUse(memoryUse);
      setPhase('infer');
      const raw = inferText(await bridge.ask(buildDraftPrompt(grounded, voices, memoryNotes, {
        angle: angle ?? undefined,
        recentComments: check.recent,
        ideas,
        wit,
        replyingTo,
        // The warning covers only what is STILL unread — an image that was
        // read must not be both described and declared unknown in one prompt.
        unreadMedia: check.media.filter(u => !readings[u]).length,
        mediaRead: check.media.map(u => readings[u]).filter(Boolean),
        memoryUse,
      }), { task: 'drafts', net: item.network }));
      const parsed = parseDrafts(raw, voices);
      if (parsed.drafts.length === 0) throw new Error('empty model answer');
      setDrafts(parsed);
      const at = new Date().toISOString();
      setDraftedAt(at);
      // ref joins this draft to its presence thread — the replies loop.
      // `chosen` rides along: saveDrafts REPLACES the entry, and dropping it
      // erased a recorded voice from the Coach's table for good.
      saveDrafts({
        id: draftKey, at, drafts: parsed, angle, ideas, memory: memoryNotes,
        ref: draftKey, voices, ...(alreadyReplied && chosen ? { chosen } : {}),
      });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setPhase('idle');
    }
  };

  const copy = async (type: MbtiType, text: string, idx: number) => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch {
      // Clipboard API is often DENIED inside the host iframe (permissions
      // policy) — the selection path below needs no permission at all.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      document.body.removeChild(ta);
    }
    setCopied({ idx, ok });
    setTimeout(() => setCopied(null), 2000);
    if (ok) { setChosen(type); saveChosen(draftKey, type); }
  };

  /**
   * A draft is a STARTING POINT, not a verdict — the last word before posting
   * is the author's, typed in place. Kept in state while typing and written to
   * the draft cache on blur: a localStorage write per keystroke serialises the
   * whole cache forty entries deep for every letter.
   */
  const editDraft = (type: MbtiType, text: string, keepUndo = false) => {
    setDrafts(cur => cur
      ? { ...cur, drafts: cur.drafts.map(d => d.type === type ? { ...d, text } : d) }
      : cur);
    setEdited(m => ({ ...m, [type]: true }));
    // A polish stays undoable only until the author touches the text again.
    // Past that, "back to my text" would restore the PRE-polish version and
    // silently take the edits they just made with it — an undo button that
    // eats work nobody asked to undo.
    if (!keepUndo) {
      setPreFix(m => {
        if (m[type] === undefined) return m;
        const next = { ...m };
        delete next[type];
        return next;
      });
    }
  };

  /**
   * Reread what the AUTHOR typed. Two passes, kept apart: `fix` corrects,
   * `flow` rephrases — a single "improve this" button silently does the second
   * when the user asked for the first.
   *
   * A refusal never touches the draft. That is the whole contract: the model
   * gets to propose better wording, it never gets to replace a human reply
   * with something plausible because a call came back empty or strange.
   */
  const polishDraft = async (type: MbtiType, text: string, mode: PolishMode) => {
    if (polishBusy || !text.trim()) return;
    setPolishBusy(type);
    setPolishMsg(m => ({ ...m, [type]: '' }));
    try {
      const raw = inferText(await bridge.ask(buildPolishPrompt(text, mode), {
        noMemory: true, task: 'polish', net: item.network,
      }));
      const out = acceptPolish(text, raw, mode);
      if ('fail' in out) {
        setPolishMsg(m => ({ ...m, [type]: t(out.fail === 'empty' ? 'polishEmpty' : 'polishDrift') }));
        return;
      }
      if (out.same) {
        // "Nothing to correct" is a RESULT, not a failure — and it is not the
        // same statement as "it worked", so it does not get the undo button.
        setPolishMsg(m => ({ ...m, [type]: t('polishSame') }));
        return;
      }
      // `keepUndo` — this edit IS the polish, so it must not clear the undo
      // it is about to arm.
      editDraft(type, out.text, true);
      setPreFix(m => ({ ...m, [type]: text }));
      saveDraftText(draftKey, type, out.text);
    } catch (e) {
      setPolishMsg(m => ({ ...m, [type]: String(e instanceof Error ? e.message : e) }));
    } finally {
      setPolishBusy(null);
    }
  };

  /** Put the author's own sentences back, exactly as they were. */
  const undoPolish = (type: MbtiType) => {
    const back = preFix[type];
    if (back === undefined) return;
    editDraft(type, back);
    saveDraftText(draftKey, type, back);
    setPreFix(m => { const next = { ...m }; delete next[type]; return next; });
    setPolishMsg(m => ({ ...m, [type]: '' }));
  };

  const translateDraft = async (key: string, text: string) => {
    if (dBusy) return;
    setDBusy(key);
    setError(null);
    try {
      const out = inferText(await bridge.ask(
        `Translate the following reply draft into ${LANG_NAME[lang]}. Faithful and natural; keep technical terms as they are; output ONLY the translation.\n\nTEXT:\n${text.slice(0, 2000)}`,
        { noMemory: true, task: 'translate', net: item.network },
      ));
      if (out.trim()) setDTrans(m => ({ ...m, [key]: out.trim() }));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setDBusy(null); }
  };

  return (
    <div className="studioBox" id="draftStudio">
      {/* Never leave "what am I answering?" to inference: the words being
          answered sit at the top of the box that answers them. */}
      {replyingTo && (
        <div className="answering">
          <span className="meta">↳ {t('answering')} <strong>{replyingTo.author}</strong></span>
          {replyingTo.body && <p>{replyingTo.body.slice(0, 300)}</p>}
        </div>
      )}
      <p className="stepHead">1 · {t('stepAngle')}</p>
      <button className="mini" onClick={suggestAngles} disabled={angleBusy || phase !== 'idle'}>
        {angleBusy ? t('suggesting') : t('anglesBtn')}
      </button>
      {angles !== null && (
        angles.length === 0 ? <p className="hint">{t('anglesEmpty')}</p> : (
          <div className="sugRow">
            {angles.map(a => (
              <button
                key={a}
                className={angle === a ? 'angleChip on' : 'angleChip'}
                onClick={() => setAngle(cur => cur === a ? null : a)}
              >
                {a}
              </button>
            ))}
          </div>
        )
      )}
      {angles !== null && angles.length > 0 && <p className="hint">{t('anglesHint')}</p>}

      <p className="stepHead">2 · {t('stepMemory')}</p>
      <label className="toggleRow">
        <input type="checkbox" checked={ground} onChange={e => setGround(e.target.checked)} />
        <span>{t('ground')}</span>
      </label>
      <p className="hint">{t('groundHint')}</p>

      <p className="stepHead">3 · {t('stepIdeas')}</p>
      <p className="hint">{t('ideasHint')}</p>
      <textarea
        className="ideas"
        value={ideas}
        placeholder={t('ideasPlaceholder')}
        onChange={e => setIdeas(e.target.value)}
      />

      <p className="stepHead">4 · {t('stepDrafts')}</p>
      {/* The voices belong HERE, beside the button that spends them: which
          register suits a thread is a judgement about THAT thread, made while
          looking at it — not a global preference edited in Settings. The
          profile trio is the default, never a ceiling. */}
      <div className="voiceRow">
        <span className="hint">{t('postVoices')}</span>
        {!sameAsTrio && (
          <button className="mini" onClick={() => setVoices(trio)}>{t('voicesReset')}</button>
        )}
      </div>
      <div className="voices">
        {MBTI_TYPES.map(v => (
          <button
            key={v}
            className={voices.includes(v) ? 'voice on' : 'voice'}
            title={TONE[v]}
            onClick={() => toggleVoice(v)}
          >
            {archetypeLabel(v, lang)}
          </button>
        ))}
      </div>
      <p className="hint">{t('postVoicesHint')}</p>
      <div className="filters witRow">
        <span className="hint">{t('witLabel')}</span>
        {([0, 1, 2] as const).map(w => (
          <button key={w} className={wit === w ? 'fchip on' : 'fchip'} onClick={() => onWit(w)}>
            {t(w === 0 ? 'wit0' : w === 1 ? 'wit1' : 'wit2')}
          </button>
        ))}
      </div>
      <button className="primary" onClick={generate} disabled={phase !== 'idle' || voices.length === 0}>
        {phase === 'verify' ? t('verifying') : phase === 'recall' ? t('generating') : phase === 'infer' ? t('generatingLlm') : t('generate')}
      </button>
      {thread && (
        thread.alive
          ? <p className="hint">✓ {t('threadOk')}{thread.commentCount !== null ? ` · ${thread.commentCount} ${t('commentsNow')}` : ''}</p>
          : thread.limited
            ? <p className="warn small">{t('rateLimitedMsg')}</p>
            : <p className="warn small">{t(thread.unknown ? 'threadUnknown' : 'threadDead')}</p>
      )}
      {/* Whether the POST was actually read is the difference between an
          informed reply and a plausible one — never leave it to be assumed. */}
      {thread && (
        (item.body.trim() || thread.postBody)
          ? (
            <details className="postBox">
              <summary>✓ {t('postRead')}</summary>
              <pre>{item.body.trim() || thread.postBody}</pre>
            </details>
          )
          : <p className="warn small">{t('postUnread')}</p>
      )}
      {/* The most common Reddit post is a screenshot with two lines of
          caption. Drafting against the caption alone is how you answer
          confidently beside the point — so it gets READ, by a model that can
          actually see, and the reading is shown next to a door to the
          original. The verdict stays the user's: they post, not the app. */}
      {thread && thread.media.length > 0 && (
        <div className="mediaBox">
          {unreadMedia > 0 && <p className="warn small">🖼 {unreadMedia} {t('mediaUnread')}</p>}
          {thread.media.map((u, i) => {
            const reading = readings[u];
            return (
              <div key={u} className="mediaRow">
                <div className="row">
                  <span className="meta">🖼 {i + 1}/{thread.media.length}</span>
                  <button className="mini" onClick={() => bridge.openExternal(u)}>{t('open')}</button>
                  <button className="mini" disabled={visionBusy !== null || canSee === false}
                    title={canSee === false ? t('visionUnavailable') : undefined}
                    onClick={() => { void readMedia(u); }}>
                    {visionBusy === u ? t('visionReading') : reading ? t('visionReread') : `👁 ${t('visionRead')}`}
                  </button>
                </div>
                {reading && (
                  <details className="postBox" open>
                    <summary>👁 {t('visionReadBy')}</summary>
                    <pre>{reading}</pre>
                  </details>
                )}
              </div>
            );
          })}
          {canSee === false && <p className="hint">{t('visionUnavailable')}</p>}
          {visionErr && <p className="warn small">{visionErr}</p>}
        </div>
      )}
      {error && <p className="warn">{error}</p>}

      {memory && drafts && (
        <details className="memoryBox">
          {/* Which of the two it was. Without it, notes that merely share a
              subject area with the thread look like notes that answer it. */}
          <summary>
            {t('memoryNote')}
            {' '}
            <span className="sourceTag">
              {t(memoryUse === 'answers' ? 'memAnswers' : 'memAdjacent')}
            </span>
          </summary>
          <pre>{memory}</pre>
        </details>
      )}

      {angle && drafts && <p className="hint">{t('angleLabel')} · {angle}</p>}
      {drafts && draftedAt && <p className="hint">{t('draftsFrom')} {age(draftedAt)}</p>}
      {drafts && chosen && (
        <p className="choiceLine">✓ {t('yourChoice')} · {archetypeLabel(chosen, lang)}</p>
      )}
      {/* A textarea that looks writable and is not reads as a broken app. Now
          that it IS writable, say what happens to what is typed in it. */}
      {drafts && <p className="hint">{t('editHint')}</p>}

      {drafts?.drafts.map((d, i) => {
        const checks = checkDraft(d.text, `${item.title} ${item.body}`, item.network);
        const translated = dTrans[d.type];
        const showTranslated = translated && !dShowOrig[d.type];
        return (
          <div key={d.type} className={chosen === d.type ? 'draft chosen' : 'draft'}>
            <div className="draftHead">
              <span className="voiceTag" title={TONE[d.type]}>{archetypeLabel(d.type, lang)}</span>
              {edited[d.type] && <span className="editedTag">✎ {t('editedTag')}</span>}
              {preFix[d.type] !== undefined && <span className="editedTag">✓ {t('polishedTag')}</span>}
              {chosen === d.type && <span className="chosenTag">✓ {t('chosenTag')}</span>}
              <span className="checks">
                {checks.map(c => (
                  <span key={c.id} className={c.ok ? 'checkChip ok' : 'checkChip ko'}>
                    {c.ok ? '✓' : '⚠'} {t(CHECK_LABEL[c.id])}
                  </span>
                ))}
              </span>
              <span className="chars">{d.text.length} {t('charsLabel')}</span>
              <button
                className="mini"
                disabled={dBusy !== null}
                onClick={() => translated
                  ? setDShowOrig(m => ({ ...m, [d.type]: !m[d.type] }))
                  : translateDraft(d.type, d.text)}
              >
                {dBusy === d.type
                  ? t('translating')
                  : translated
                    ? (dShowOrig[d.type] ? t('showTranslation') : t('showOriginal'))
                    : '🌐'}
              </button>
              <button title={t('copyHint')} onClick={() => copy(d.type, d.text, i)}>
                {copied?.idx === i ? (copied.ok ? `✓ ${t('copied')}` : t('copyFailed')) : t('copy')}
              </button>
            </div>
            {/* Editable — but only the ORIGINAL. The translation is a reading
                aid for a language the author does not write; typing into it
                would look like editing the reply while changing nothing that
                ever gets posted. */}
            <textarea
              readOnly={!!showTranslated}
              value={showTranslated ? translated : d.text}
              rows={Math.min(10, (showTranslated ? translated : d.text).split('\n').length + 2)}
              onChange={e => { if (!showTranslated) editDraft(d.type, e.target.value); }}
              onBlur={() => { if (!showTranslated) saveDraftText(draftKey, d.type, d.text); }}
            />
            {/* A reread of the AUTHOR's words — never offered over a
                translation, which is not the text that gets posted. */}
            {!showTranslated && (
              <div className="polishRow">
                <button className="mini" title={t('polishFixHint')}
                  disabled={polishBusy !== null || !d.text.trim()}
                  onClick={() => { void polishDraft(d.type, d.text, 'fix'); }}>
                  {polishBusy === d.type ? t('polishing') : t('polishFix')}
                </button>
                <button className="mini" title={t('polishFlowHint')}
                  disabled={polishBusy !== null || !d.text.trim()}
                  onClick={() => { void polishDraft(d.type, d.text, 'flow'); }}>
                  {t('polishFlow')}
                </button>
                {preFix[d.type] !== undefined && (
                  <button className="mini" onClick={() => undoPolish(d.type)}>{t('polishUndo')}</button>
                )}
                {polishMsg[d.type] && <span className="warn small">{polishMsg[d.type]}</span>}
              </div>
            )}
          </div>
        );
      })}

      {drafts && drafts.coach && (
        <p className="coachNote"><strong>{t('coachNote')}:</strong> {drafts.coach}</p>
      )}

      {drafts && !pickPosted && (
        <div className="row">
          <button onClick={generate} disabled={phase !== 'idle'}>{t('regenerate')}</button>
          <button
            className={logged ? 'ghost' : 'primary'}
            disabled={logged}
            onClick={() => {
              // The ledger wants the WHICH, not just the that: copy already
              // recorded it — otherwise ask before logging.
              if (chosen) { onLogged(item); setLogged(true); }
              else setPickPosted(true);
            }}
          >
            {logged && chosen ? `✓ ${t('iReplied')} · ${archetypeLabel(chosen, lang)}` : t('iReplied')}
          </button>
          {/* A misclick here used to be permanent — the only way back was
              emptying the whole ledger. This act feeds the 9:1 gauge and every
              readiness verdict, so it has to be takeable back where it was
              made, not three screens away. Only for an act logged in THIS
              session: undoing one from last week needs the ledger's own list,
              and a button that silently removed the wrong row would be worse
              than no button. */}
          {logged && onUnlog && !alreadyReplied && (
            <button className="mini" onClick={() => { onUnlog(item); setLogged(false); }}>
              ↩ {t('undoReplied')}
            </button>
          )}
        </div>
      )}
      {drafts && pickPosted && !logged && (
        <div className="row">
          <span className="hint">{t('whichPosted')}</span>
          {drafts.drafts.map(d => (
            <button key={d.type} className="mini" onClick={() => {
              setChosen(d.type);
              saveChosen(draftKey, d.type);
              onLogged(item);
              setLogged(true);
              setPickPosted(false);
            }}>
              {archetypeLabel(d.type, lang)}
            </button>
          ))}
          <button className="mini" onClick={() => { onLogged(item); setLogged(true); setPickPosted(false); }}>
            {t('otherReworked')}
          </button>
        </div>
      )}
    </div>
  );
}
