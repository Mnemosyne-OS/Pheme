/**
 * The left drawer — talking WITH Mnemosyne from anywhere in Pheme. She
 * answers through the host pipeline (the user's memory rides along) plus a
 * live STATE BRIEF of the app, under a chosen skill lens. The thread
 * persists; the drawer never opens itself and never fetches on its own.
 */
import { useEffect, useRef, useState } from 'react';
import { bridge, inferText, isFramed } from '../lib/bridge';
import { ASK_SKILLS, buildAskPrompt, buildStateBrief, loadAskHistory, saveAskHistory, type AskMsg, type AskSkill } from '../lib/ask';
import { LANG_NAME } from '../lib/i18n';
import type { StringKey } from '../lib/i18n';
import type { LedgerEntry, Profile } from '../lib/store';
import type { PresenceReport } from '../lib/presence';
import type { ScoredItem } from '../lib/score';
import type { T } from './shared';

const SKILL_LABEL: Record<AskSkill, StringKey> = {
  coach: 'skillCoach', researcher: 'skillResearcher', critic: 'skillCritic',
};

export function AskDrawer({ t, open, onClose, profile, ledger, items, scannedAt, presence, unseen }: {
  t: T;
  open: boolean;
  onClose: () => void;
  profile: Profile;
  ledger: LedgerEntry[];
  items: ScoredItem[];
  scannedAt: string | null;
  presence: PresenceReport | null;
  unseen: number;
}) {
  const [skill, setSkill] = useState<AskSkill>('coach');
  const [msgs, setMsgs] = useState<AskMsg[]>(() => loadAskHistory());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const framed = isFramed();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs, busy, open]);

  const send = async () => {
    const question = draft.trim();
    if (!question || busy || !framed) return;
    setError(null);
    setDraft('');
    const mine: AskMsg = { role: 'user', text: question, at: new Date().toISOString() };
    const withMine = [...msgs, mine];
    setMsgs(withMine);
    saveAskHistory(withMine);
    setBusy(true);
    try {
      const prompt = buildAskPrompt({
        skill,
        langName: LANG_NAME[profile.lang],
        stateBrief: buildStateBrief({ profile, ledger, items, scannedAt, presence, unseen }),
        history: msgs,
        question,
      });
      const out = inferText(await bridge.ask(prompt, { task: 'chat' })).trim();
      if (!out) throw new Error('empty model answer');
      const reply: AskMsg = { role: 'assistant', text: out, at: new Date().toISOString() };
      const next = [...withMine, reply];
      setMsgs(next);
      saveAskHistory(next);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const clear = () => { setMsgs([]); saveAskHistory([]); };

  return (
    <aside className={open ? 'askDrawer open' : 'askDrawer'} aria-hidden={!open}>
      <div className="draftHead">
        <span className="voiceTag">Φ {t('askTitle')}</span>
        <span className="filters">
          {ASK_SKILLS.map(s => (
            <button key={s} className={skill === s ? 'fchip on' : 'fchip'} onClick={() => setSkill(s)}>
              {t(SKILL_LABEL[s])}
            </button>
          ))}
        </span>
        <button className="mini" onClick={onClose} aria-label="close">×</button>
      </div>

      {!framed && <p className="warn small">{t('notConnected')}</p>}

      <div className="askMsgs">
        {msgs.length === 0 && <p className="hint">{t('askEmpty')}</p>}
        {msgs.map((m, i) => (
          <div key={`${m.at}_${i}`} className={m.role === 'user' ? 'askMsg user' : 'askMsg ai'}>
            {m.text}
          </div>
        ))}
        {busy && <div className="askMsg ai">…</div>}
        {error && <p className="warn small">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="askInput">
        <textarea
          value={draft}
          placeholder={t('askPlaceholder')}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <div className="askInputSide">
          <button className="primary" onClick={send} disabled={busy || !framed || !draft.trim()}>
            {busy ? '…' : t('askSend')}
          </button>
          {msgs.length > 0 && <button className="mini" onClick={clear}>{t('askClear')}</button>}
        </div>
      </div>
    </aside>
  );
}
