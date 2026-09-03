/**
 * "Find me subs" — ONE implementation, several places.
 *
 * It lived inside `SubsField` in the global Settings. It now runs from the
 * Reddit Profile tab, the Reddit board, and the interview, and the wrong
 * answer at every step would have been a second copy: the search costs a
 * Reddit call and a model call, and two versions of that drift into two
 * different sets of rules about what reaches the profile.
 *
 * Three steps, unchanged: the model proposes (memory rides along), the user's
 * own history contributes what they already post in, and ONE multireddit
 * request proves which of those exist and are alive. Nothing unverified ever
 * reaches the profile.
 *
 * The board's version adds a SEED — a keyword typed right there. Without it,
 * "find me subs about Firecracker" meant editing the profile's topics first:
 * a trip to Settings to ask one question.
 */
import { useState } from 'react';
import { bridge, inferText, isFramed } from '../lib/bridge';
import { loadCachedPresence } from '../lib/presence';
import {
  buildSubsPrompt, parseSubNames, subsFromHistory, verifySubs, type SubCandidate,
} from '../lib/suggest';
import { REDDIT, netOf, setNet, type Profile } from '../lib/store';
import type { T } from './shared';

const notSeen = (list: string[], values: string[]) =>
  list.filter(s => !values.some(v => v.toLowerCase() === s.toLowerCase()));

export function SubFinder({ t, profile, setProfile, seeded }: {
  t: T;
  profile: Profile;
  setProfile: (fn: (p: Profile) => Profile) => void;
  /** Show the keyword box — the board's "search for something else" entry. */
  seeded?: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'asking' | 'verifying'>('idle');
  const [found, setFound] = useState<SubCandidate[] | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [seed, setSeed] = useState('');
  const subs = netOf(profile, REDDIT).targets;

  const suggest = async () => {
    if (phase !== 'idle' || !isFramed()) return;
    setDiag(null);
    setFound(null);
    try {
      setPhase('asking');
      const raw = inferText(await bridge.ask(
        buildSubsPrompt(profile.topics, subs, seed),
        { task: 'suggest', net: 'reddit' },
      ));
      const fromModel = notSeen(parseSubNames(raw), subs);
      // A seeded search is about the keyword, not about where the user already
      // posts — mixing their history in would answer a question nobody asked.
      const fromHistory = seed.trim()
        ? []
        : notSeen(subsFromHistory(loadCachedPresence(), subs), subs);
      const candidates = [...fromHistory, ...notSeen(fromModel, fromHistory)].slice(0, 30);
      if (candidates.length === 0) { setFound([]); return; }

      setPhase('verifying');
      const { alive, unreachable } = await verifySubs(candidates, bridge.fetchUrl);
      // Candidates the model proposed but Reddit could not confirm are NOT
      // rejected when Reddit was simply unreachable — they are offered with
      // the caveat, instead of vanishing behind a message blaming memory.
      if (unreachable) setDiag(t('subsUnverified'));
      const histLower = new Set(fromHistory.map(s => s.toLowerCase()));
      const rows: SubCandidate[] = candidates
        .filter(name => alive.has(name) || histLower.has(name.toLowerCase()) || unreachable)
        .map(name => ({
          name,
          origin: histLower.has(name.toLowerCase()) ? 'history' as const : 'model' as const,
          posts: alive.get(name) ?? 0,
        }))
        .sort((a, b) => (a.origin === b.origin ? b.posts - a.posts : a.origin === 'history' ? -1 : 1));
      setFound(rows);
    } catch (e) {
      setFound([]);
      setDiag(String(e instanceof Error ? e.message : e));
    } finally { setPhase('idle'); }
  };

  const add = (name: string) => {
    setProfile(p => {
      const cur = netOf(p, REDDIT).targets;
      return cur.some(s => s.toLowerCase() === name.toLowerCase())
        ? p
        : setNet(p, REDDIT, { targets: [...cur, name] });
    });
    setFound(cur => cur?.filter(c => c.name !== name) ?? null);
  };

  const busy = phase !== 'idle';
  return (
    <>
      <div className="row">
        {seeded && (
          <input
            value={seed}
            placeholder={t('subSeedPh')}
            onChange={e => setSeed(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void suggest(); }}
          />
        )}
        <button className="mini" onClick={() => { void suggest(); }} disabled={busy}>
          {phase === 'asking' ? t('suggesting')
            : phase === 'verifying' ? t('verifyingSubs')
              : `✨ ${seeded && seed.trim() ? t('findSubsFor') : t('findSubs')}`}
        </button>
      </div>
      {seeded && <p className="hint">{t('subSeedHint')}</p>}

      {found !== null && (
        found.length === 0
          ? <p className="hint">{t('suggestEmpty')}</p>
          : (
            <>
              <div className="sugRow">
                {found.map(c => (
                  <button key={c.name} className="sugChip" onClick={() => add(c.name)}
                    title={c.origin === 'history' ? t('fromHistory') : t('fromMemory')}>
                    + r/{c.name}
                    <span className="subMeta">
                      {c.origin === 'history' ? ' ★' : ''}{c.posts > 0 ? ` ${c.posts}` : ''}
                    </span>
                  </button>
                ))}
                <button className="sugChip all" onClick={() => {
                  setProfile(p => {
                    const cur = netOf(p, REDDIT).targets;
                    const have = new Set(cur.map(s => s.toLowerCase()));
                    const fresh = found.filter(c => !have.has(c.name.toLowerCase())).map(c => c.name);
                    return setNet(p, REDDIT, { targets: [...cur, ...fresh] });
                  });
                  setFound([]);
                }}>
                  {t('addAll')}
                </button>
              </div>
              <p className="hint">{t('subsVerifiedHint')}</p>
            </>
          )
      )}
      {diag && <p className="warn small">diag · {diag}</p>}
    </>
  );
}
