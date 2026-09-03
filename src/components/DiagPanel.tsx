/**
 * The diagnosis as a control panel, not a wall of text: verdict tiles per
 * platform, the plan in numbers, the rules — and a TIMELINE of every
 * analysis since the first scan, selectable. The voice follows the user's
 * configured engine and is stoppable mid-sentence.
 */
import { useEffect, useState } from 'react';
import { speak, stopSpeaking } from '../lib/voice';
import type { DiagnosisSnapshot } from '../lib/store';
import { age, type T } from './shared';

export function DiagPanel({ t, snaps }: { t: T; snaps: DiagnosisSnapshot[] }) {
  const [sel, setSel] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceFail, setVoiceFail] = useState(false);
  // Leaving the surface must silence it — the voice cannot outlive its panel.
  useEffect(() => () => stopSpeaking(), []);

  const snap = snaps[Math.min(sel, snaps.length - 1)];
  if (!snap) return null;

  const listen = async () => {
    // Stop must free the button NOW: the original call's `finally` can be
    // blocked on a synthesis request for up to its full timeout, which left
    // "■ Stop" stuck and playback impossible to restart.
    if (listening) { stopSpeaking(); setListening(false); return; }
    setListening(true);
    try {
      const spoke = await speak(snap.text);
      if (!spoke) setVoiceFail(true);
    } finally { setListening(false); }
  };

  const d = snap.data;
  return (
    <div className="card diagCard">
      <div className="draftHead">
        {/* The label travels WITH the panel, not sprinkled on each surface.
            Everything below is the model's judgement: the ✓/✗ per platform,
            the replies-per-week, the weeks-before-launch, the rules. On the
            Coach it sits directly above the COUNTED verdict table, and
            without this tag the two read as one thing (doc 75 §5.3). */}
        <span className="sourceTag">{t('vEstimated')}</span>
        <span className="voiceTag">{t('diagnosisTitle')}</span>
        {snaps.length > 1 && (
          <span className="filters">
            {snaps.map((s, i) => (
              <button key={s.at} className={i === sel ? 'fchip on' : 'fchip'} onClick={() => setSel(i)}>
                {age(s.at)}
              </button>
            ))}
          </span>
        )}
        <button onClick={listen}>
          {listening ? `■ ${t('stopBtn')}` : t('listenBtn')}
        </button>
      </div>
      {voiceFail && <p className="warn small">{t('voiceFail')}</p>}

      {!d ? <pre className="postFull">{snap.text}</pre> : (
        <>
          {d.summary && <p className="lead">{d.summary}</p>}
          {/* The plan's figures are ADVICE the model wrote, not measurements.
              They render in the same big-number style the counted KPIs use, so
              the distinction has to be said rather than shown. */}
          <p className="hint">{t('vEstimatedHint')}</p>
          <div className="kpis diagTiles">
            {d.verdicts.map(v => (
              <div key={v.platform} className="kpi">
                <span className={v.ready ? 'kpiVal ok' : 'kpiVal ko'}>{v.ready ? '✓' : '✗'}</span>
                <span className="kpiLabel">{v.platform} · {v.ready ? t('ready') : t('notReady')}</span>
                {v.why && <p className="diagWhy">{v.why}</p>}
              </div>
            ))}
            {d.plan.repliesPerWeek !== null && (
              <div className="kpi">
                <span className="kpiVal">{d.plan.repliesPerWeek}</span>
                <span className="kpiLabel">{t('diagPerWeek')}</span>
              </div>
            )}
            {d.plan.weeksBeforeLaunch !== null && (
              <div className="kpi">
                <span className="kpiVal">{d.plan.weeksBeforeLaunch}</span>
                <span className="kpiLabel">{t('diagWeeks')}</span>
              </div>
            )}
          </div>
          {d.plan.topics.length > 0 && (
            <div className="sugRow">
              {d.plan.topics.map(topic => <span key={topic} className="chip small">{topic}</span>)}
            </div>
          )}
          {d.rules.length > 0 && (
            <>
              <label>{t('diagRules')}</label>
              <ul className="actList">
                {d.rules.map(r => <li key={r} className="actItem"><span>{r}</span></li>)}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
