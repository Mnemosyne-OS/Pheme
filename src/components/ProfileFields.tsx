/**
 * ONE set of profile-editing fields for the whole app. They write the profile
 * DIRECTLY — no parallel draft state to fall out of sync with, and no "save"
 * step that can overwrite a list with a stale copy (the bug class that ate the
 * user's subs).
 *
 * Who renders what, since the per-network split:
 *  - `GoalPicker`, `TopicsField`, `TrioPicker` — global, so Settings keeps them.
 *  - `SubsField`, `PseudoFields` — Reddit and Hacker News, so their home is
 *    each network's own Profile tab (`NetProfile`). They stay here because the
 *    INTERVIEW still renders them: on a first run the network tabs do not
 *    exist yet, and asking is the whole point of that screen.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { bridge, inferText, isFramed } from '../lib/bridge';
import { MBTI_TYPES, TONE, archetypeLabel, type MbtiType } from '../lib/archetypes';
import { buildTopicsPrompt, cleanListItem, parseTopics } from '../lib/suggest';
import { HN, REDDIT, netOf, setNet, type Profile } from '../lib/store';
import { SubFinder } from './SubFinder';
import type { T } from './shared';

type SetProfile = Dispatch<SetStateAction<Profile>>;

const notSeen = (list: string[], values: string[]) =>
  list.filter(s => !values.some(v => v.toLowerCase() === s.toLowerCase()));

export function GoalPicker({ t, profile, setProfile }: { t: T; profile: Profile; setProfile: SetProfile }) {
  return (
    <>
      <label>{t('goalLabel')}</label>
      <p className="hint">{t('goalHint')}</p>
      <div className="voices">
        {(['launch', 'authority', 'watch'] as const).map(g => (
          <button
            key={g}
            className={profile.goal === g ? 'voice on' : 'voice'}
            onClick={() => setProfile(p => ({ ...p, goal: g }))}
          >
            {t(g === 'launch' ? 'goalLaunch' : g === 'authority' ? 'goalAuthority' : 'goalWatch')}
          </button>
        ))}
      </div>
    </>
  );
}

export function TopicsField({ t, profile, setProfile }: { t: T; profile: Profile; setProfile: SetProfile }) {
  const [busy, setBusy] = useState(false);
  const [sug, setSug] = useState<string[] | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const suggest = async () => {
    if (busy) return;
    setBusy(true);
    setDiag(null);
    try {
      const raw = isFramed() ? inferText(await bridge.ask(buildTopicsPrompt(), { task: 'suggest' })) : '';
      setSug(notSeen(parseTopics(raw), profile.topics));
    } catch (e) {
      setSug([]);
      setDiag(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };
  return (
    <>
      <label>{t('topicsLabel')}</label>
      <p className="hint">{t('topicsHint')}</p>
      <ChipsInput
        values={profile.topics}
        onChange={v => setProfile(p => ({ ...p, topics: v }))}
        placeholder="local AI, RAG, Electron…"
      />
      <button className="mini" onClick={suggest} disabled={busy}>
        {busy ? t('suggesting') : t('suggestTopics')}
      </button>
      <Suggestions t={t} items={sug} setItems={setSug}
        onAdd={v => setProfile(p => ({ ...p, topics: [...p.topics, v] }))} />
      {diag && <p className="warn small">diag · {diag}</p>}
    </>
  );
}

/**
 * Reddit's watch list. INTERVIEW ONLY now — the permanent home is the Reddit
 * Profile tab, which renders the same list and the same finder.
 */
export function SubsField({ t, profile, setProfile }: { t: T; profile: Profile; setProfile: SetProfile }) {
  const subs = netOf(profile, REDDIT).targets;
  return (
    <>
      <label>{t('subsLabel')}</label>
      <p className="hint">{t('subsHint')}</p>
      <ChipsInput
        values={subs}
        onChange={v => setProfile(p => setNet(p, REDDIT, { targets: v }))}
        placeholder="LocalLLaMA, selfhosted…"
      />
      {/* The search itself lives in SubFinder — the Reddit board offers the
          same thing, and a second copy of a flow that spends a Reddit call
          and a model call is two sets of rules about what reaches the
          profile. */}
      <SubFinder t={t} profile={profile} setProfile={setProfile} />
    </>
  );
}

/**
 * The three identity fields Reddit and Hacker News need. INTERVIEW ONLY —
 * each one is edited afterwards on its own network's Profile tab, which is
 * where someone looks for "my Reddit handle".
 */
export function PseudoFields({ t, profile, setProfile }: { t: T; profile: Profile; setProfile: SetProfile }) {
  return (
    <>
      <label>{t('pseudosLabel')}</label>
      <div className="presConfig">
        <div>
          <label>{t('redditUserLabel')}</label>
          <input value={netOf(profile, REDDIT).handle} placeholder="yaka0007"
            onChange={e => setProfile(p => setNet(p, REDDIT, { handle: e.target.value.replace(/^u\//, '').trim() }))} />
        </div>
        <div>
          <label>{t('hnUserLabel')}</label>
          <input value={netOf(profile, HN).handle} placeholder="yaka"
            onChange={e => setProfile(p => setNet(p, HN, { handle: e.target.value.trim() }))} />
        </div>
        <div>
          <label>{t('mySubLabel')}</label>
          <input value={netOf(profile, REDDIT).home} placeholder="MnemosyneOS"
            onChange={e => setProfile(p => setNet(p, REDDIT, { home: e.target.value.replace(/^r\//, '').trim() }))} />
        </div>
      </div>
    </>
  );
}

export function TrioPicker({ t, profile, setProfile }: { t: T; profile: Profile; setProfile: SetProfile }) {
  const toggle = (v: MbtiType) =>
    setProfile(p => ({
      ...p,
      trio: p.trio.includes(v)
        ? p.trio.filter(x => x !== v)
        : p.trio.length >= 3 ? [...p.trio.slice(1), v] : [...p.trio, v],
    }));
  return (
    <>
      <label>{t('trioLabel')}</label>
      <p className="hint">{t('trioHint')}</p>
      <div className="voices">
        {MBTI_TYPES.map(v => (
          <button
            key={v}
            className={profile.trio.includes(v) ? 'voice on' : 'voice'}
            title={TONE[v]}
            onClick={() => toggle(v)}
          >
            {archetypeLabel(v, profile.lang)}
          </button>
        ))}
      </div>
    </>
  );
}

function Suggestions({ t, items, setItems, onAdd }: {
  t: T;
  items: string[] | null;
  setItems: Dispatch<SetStateAction<string[] | null>>;
  onAdd: (v: string) => void;
}) {
  if (items === null) return null;
  if (items.length === 0) return <p className="hint">{t('suggestEmpty')}</p>;
  return (
    <div className="sugRow">
      {items.map(s => (
        <button key={s} className="sugChip"
          onClick={() => { onAdd(s); setItems(cur => cur?.filter(x => x !== s) ?? null); }}>
          + {s}
        </button>
      ))}
      <button className="sugChip all"
        onClick={() => { for (const s of items) onAdd(s); setItems([]); }}>
        {t('addAll')}
      </button>
    </div>
  );
}

export function ChipsInput({ values, onChange, placeholder }: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    // Same cleaning as model output: a pasted `1. "local AI"` would become
    // a needle that matches nothing and quietly empties the radar.
    const parts = draft.split(',').map(cleanListItem).filter(Boolean);
    if (parts.length) {
      const have = new Set(values.map(v => v.toLowerCase()));
      onChange([...values, ...parts.filter(p => !have.has(p.toLowerCase()))]);
    }
    setDraft('');
  };
  return (
    <div className="chips">
      {values.map(v => (
        <span key={v} className="chip">
          {v}
          <button onClick={() => onChange(values.filter(x => x !== v))} aria-label={`remove ${v}`}>×</button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
        onBlur={commit}
      />
    </div>
  );
}
