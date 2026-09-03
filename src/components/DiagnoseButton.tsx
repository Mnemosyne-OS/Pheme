/**
 * Running the diagnosis — THE one implementation.
 *
 * It lived inside `Onboarding`, which meant the only way to ask Mnemosyne to
 * look at you again was to reopen the whole interview: goal, topics, subs,
 * pseudonyms, voices, all of it, to reach one button at the bottom. Every
 * "diagnosis" door in the app just set `done: false` and dropped the user
 * there. The Coach already shows the diagnosis TIMELINE — the button that adds
 * a point to it belongs beside it.
 *
 * So it moved here, and both surfaces render this. A second copy would have
 * been two sets of rules about what a diagnosis is built from, and it is built
 * from more than it used to be (`buildMeasuredBrief`).
 */
import { useState } from 'react';
import { bridge, inferText, isFramed } from '../lib/bridge';
import {
  buildDiagnosisPrompt, buildMeasuredBrief, diagnosisToText, fetchProfileFacts, parseDiagnosis,
} from '../lib/analyze';
import { LANG_NAME } from '../lib/i18n';
import type { PresenceReport } from '../lib/presence';
import {
  HN, REDDIT, netOf, pushDiagnosis, type DiagnosisSnapshot, type LedgerEntry, type Profile,
} from '../lib/store';
import type { T } from './shared';

export function DiagnoseButton({ t, profile, setProfile, ledger, presence, onDone }: {
  t: T;
  profile: Profile;
  setProfile: (fn: (p: Profile) => Profile) => void;
  ledger: LedgerEntry[];
  /** What the engine has measured rides along — see buildMeasuredBrief. */
  presence: PresenceReport | null;
  /** The new timeline, so a caller showing it can refresh without a reload. */
  onDone?: (snaps: DiagnosisSnapshot[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const redditUser = netOf(profile, REDDIT).handle;
  const hnUser = netOf(profile, HN).handle;
  const canAnalyze = !!profile.goal && !!(redditUser || hnUser);

  const run = async () => {
    if (busy || !canAnalyze || !isFramed()) return;
    setBusy(true);
    setErr(null);
    try {
      const facts = await fetchProfileFacts({ redditUser, hnUser }, bridge.fetchUrl);
      const out = inferText(await bridge.ask(
        buildDiagnosisPrompt(
          profile.goal, profile.topics, facts, LANG_NAME[profile.lang],
          buildMeasuredBrief({ profile, ledger, presence }),
        ),
        { task: 'diagnosis' },
      ));
      if (!out.trim()) { setErr(t('suggestEmpty')); return; }
      const data = parseDiagnosis(out);
      const text = data
        ? diagnosisToText(data, {
            ready: t('ready'), notReady: t('notReady'), plan: t('diagPlan'),
            perWeek: t('diagPerWeek'), weeks: t('diagWeeks'), rules: t('diagRules'),
          })
        : out.trim();
      const at = new Date().toISOString();
      // The timeline keeps EVERY analysis — a diagnosis is a dated point, not
      // a field that gets overwritten.
      onDone?.(pushDiagnosis({ at, goal: profile.goal, text, data }));
      setProfile(p => ({ ...p, diagnosis: text, diagnosedAt: at }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="row">
        <button className="mini" onClick={() => { void run(); }} disabled={busy || !canAnalyze}>
          {busy ? t('analyzing') : profile.diagnosis ? `🧠 ${t('diagRedo')}` : t('analyzeBtn')}
        </button>
        {profile.diagnosedAt && !busy && (
          <span className="karma">{t('diagLastRun')} {profile.diagnosedAt.slice(0, 10)}</span>
        )}
      </div>
      {/* What it will actually look at — so "redo it" is not a mystery box. */}
      {canAnalyze && <p className="hint">{t('diagCovers')}</p>}
      {!canAnalyze && <p className="hint">{t('analyzeNeed')}</p>}
      {err && <p className="warn small">{err}</p>}
    </>
  );
}
