/** The coach - ratio gauge, weekly pulse, voice usage, per-community readiness. */
import { useEffect, useMemo, useState } from 'react';
import { archetypeLabel } from '../lib/archetypes';
import type { PresenceReport } from '../lib/presence';
import { ledgerStats, standingBoard } from '../lib/selectors';
import { chosenVoiceStats, communityStats, ensureDiagnosisSeed, useLedger, useProfile, weeklyActivity } from '../lib/store';
import { DiagPanel } from './DiagPanel';
import { DiagnoseButton } from './DiagnoseButton';
import { VerdictTable } from './VerdictBoard';
import { age, type T } from './shared';

export function CoachTab({ t, ledger, profile, setProfile, presence, onPromo, onReset }: {
  t: T;
  ledger: ReturnType<typeof useLedger>['ledger'];
  profile: ReturnType<typeof useProfile>['profile'];
  setProfile: ReturnType<typeof useProfile>['setProfile'];
  presence: PresenceReport | null;
  onPromo: (community: string) => void;
  onReset: () => void;
}) {
  const [promoCommunity, setPromoCommunity] = useState('');
  // Keyed on the diagnosis TEXT, not the profile object: the seed only needs
  // recomputing when a new analysis lands, and depending on the whole profile
  // would re-seed on every unrelated setting change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seeded = useMemo(() => ensureDiagnosisSeed(profile), [profile.diagnosis]);
  // State, not a memo: running a diagnosis from here must show its own result
  // without waiting for a re-render driven by something else.
  const [snaps, setSnaps] = useState(seeded);
  useEffect(() => setSnaps(seeded), [seeded]);
  const stats = communityStats(ledger);
  const board = useMemo(() => standingBoard(ledger, presence), [ledger, presence]);
  const voices = chosenVoiceStats(presence);
  const voiceMax = Math.max(1, ...voices.map(v => v.total));
  // One formula for 9:1 — this tab once grew its own and drifted.
  const { participation, promo, ratioOk } = ledgerStats(ledger, presence);

  return (
    <div className="pane">
      <h2>{t('coachTitle')}</h2>

      {/* The button that ADDS a point to the timeline, beside the timeline.
          It used to live at the bottom of the onboarding interview, so asking
          Mnemosyne to look again meant reopening goal, topics, subs,
          pseudonyms and voices to reach it. */}
      <DiagnoseButton
        t={t} profile={profile} setProfile={setProfile}
        ledger={ledger} presence={presence} onDone={setSnaps}
      />
      {snaps.length > 0 && <DiagPanel t={t} snaps={snaps} />}

      <div className="gauge">
        <span className="big">{participation}</span> {t('replies').toLowerCase()}
        <span className="sep">·</span>
        <span className="big">{promo}</span> {t('promo').toLowerCase()}
        <span className={ratioOk ? 'ok' : 'ko'}>{t('ratio')} {ratioOk ? '✓' : '✗'}</span>
      </div>
      <p className="hint">{t('ratioHint')}</p>

      <label>{t('weekLabel')}</label>
      <div className="spark">
        {weeklyActivity(ledger).map((n, i) => (
          <span key={i} className={n > 0 ? 'sparkBar on' : 'sparkBar'}
            style={{ height: `${6 + Math.min(n, 6) * 5}px` }} title={String(n)} />
        ))}
      </div>

      {voices.length > 0 && (
        <>
          <label>{t('voicesLabel')}</label>
          <p className="hint">{t('voicesHint')}</p>
          <table className="stats">
            <thead>
              <tr>
                <th></th><th></th><th>{t('voicesTotal')}</th><th>Reddit</th><th>HN</th>
                <th>{t('voicesReplies')}</th><th>{t('voicesScore')}</th>
              </tr>
            </thead>
            <tbody>
              {voices.map(v => (
                <tr key={v.type}>
                  <td>{archetypeLabel(v.type, profile.lang)}</td>
                  <td className="voiceBarCell">
                    <span className="voiceBar" style={{ width: `${Math.round((v.total / voiceMax) * 100)}%` }} />
                  </td>
                  <td><strong>{v.total}</strong></td>
                  <td>{v.reddit}</td>
                  <td>{v.hackernews}</td>
                  {/* Replies join only through threads still tracked in
                      Pseudo — none tracked = unknown, shown as —, never 0. */}
                  <td>{v.tracked > 0 ? `${v.replies} (${v.tracked})` : '—'}</td>
                  <td className={v.avgScore !== null ? 'ok' : undefined}>
                    {v.avgScore !== null ? `▲ ${v.avgScore} (${v.scored})` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="row">
        <input
          value={promoCommunity}
          placeholder={t('promoFor')}
          onChange={e => setPromoCommunity(e.target.value)}
        />
        <button
          disabled={!promoCommunity.trim()}
          onClick={() => { onPromo(promoCommunity.trim()); setPromoCommunity(''); }}
        >
          {t('logPromo')}
        </button>
      </div>

      {stats.length === 0
        ? <p className="empty">{t('ledgerEmpty')}</p>
        : (
          <table className="stats">
            <thead>
              <tr>
                <th>{t('community')}</th><th>{t('replies')}</th><th>{t('promo')}</th>
                <th>{t('last')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.community}>
                  <td>{s.community}</td>
                  <td>{s.participation}</td>
                  <td>{s.promo}</td>
                  <td>{age(s.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      {/* The verdict is the ENGINE's now, not a "ready" column derived from a
          floor this table invented. Same component and same composition as the
          cockpit — three surfaces answering one question, one answer. */}
      <label>
        <span className="sourceTag">{t('vCounted')}</span>{t('vHead')}
      </label>
      <p className="hint">{t('vHint')}</p>
      <VerdictTable t={t} board={board} rules={presence?.rules ?? {}} />

      {ledger.length > 0 && <button className="ghost danger" onClick={onReset}>{t('reset')}</button>}
    </div>
  );
}
