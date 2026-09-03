/**
 * The interview — a thin shell over the SAME profile fields Settings
 * renders (ProfileFields). Everything writes the profile directly; the
 * only thing "Start" does is open the doors (done: true). The diagnosis
 * (analysis of the public footprint) lives here because it is a ritual,
 * not a setting — its timeline persists app-wide.
 */
import { useState } from 'react';
import { ensureDiagnosisSeed, useProfile, type DiagnosisSnapshot, type LedgerEntry } from '../lib/store';
import { DiagPanel } from './DiagPanel';
import { DiagnoseButton } from './DiagnoseButton';
import type { PresenceReport } from '../lib/presence';
import { GoalPicker, PseudoFields, SubsField, TopicsField, TrioPicker } from './ProfileFields';
import type { T } from './shared';

export function Onboarding({ t, profile, setProfile, ledger, presence }: {
  t: T;
  profile: ReturnType<typeof useProfile>['profile'];
  setProfile: ReturnType<typeof useProfile>['setProfile'];
  /** Fed to the diagnosis: it judges on everything measured, not the feed alone. */
  ledger: LedgerEntry[];
  presence: PresenceReport | null;
}) {
  // The timeline boots from storage; a pre-timeline diagnosis becomes its
  // first point (dated by the original analysis) — nothing is lost.
  const [snaps, setSnaps] = useState<DiagnosisSnapshot[]>(() => ensureDiagnosisSeed(profile));
  const valid = profile.topics.length > 0 && profile.trio.length >= 2;

  return (
    <div className="onboard">
      <h2>{t('onboardTitle')}</h2>
      <p className="lead">{t('onboardLead')}</p>

      <GoalPicker t={t} profile={profile} setProfile={setProfile} />
      <TopicsField t={t} profile={profile} setProfile={setProfile} />
      <SubsField t={t} profile={profile} setProfile={setProfile} />
      <PseudoFields t={t} profile={profile} setProfile={setProfile} />

      {/* The SAME runner the Coach uses — one definition of what a diagnosis
          is built from, and it is built from more than the feed now. */}
      <DiagnoseButton
        t={t} profile={profile} setProfile={setProfile}
        ledger={ledger} presence={presence} onDone={setSnaps}
      />
      {snaps.length > 0 && <DiagPanel t={t} snaps={snaps} />}

      <TrioPicker t={t} profile={profile} setProfile={setProfile} />

      <button
        className="primary"
        disabled={!valid}
        onClick={() => setProfile(p => ({ ...p, done: true }))}
      >
        {profile.done ? t('save') : t('start')}
      </button>
    </div>
  );
}
