/**
 * Settings — what belongs to the WHOLE app, and only that.
 *
 * It used to hold the Reddit pseudonym, the Hacker News pseudonym, the user's
 * own subreddit and the list of subs to watch, because those were the first
 * two networks and the page grew around them. That made a global page shaped
 * by two surfaces: a third network had nowhere to go, and someone looking for
 * "my Reddit settings" found them in a list that also held the app's language.
 *
 * Everything per-network now lives on that network's own Profile tab
 * (`NetProfile`), and the presence timer sits where presence happens. What is
 * left here is genuinely global: the goal, the expertise topics that score
 * every network, the voices, the wordmark, the skin, the language, and what
 * Mnemosyne is told to remember.
 *
 * The interview (`Onboarding`) still renders the per-network fields itself:
 * on a first run the network tabs do not exist yet, and asking is the point.
 */
import { useMemo, useState } from 'react';
import { AVAILABLE_LANGS, type Lang, type StringKey } from '../lib/i18n';
import { SKINS } from '../lib/skins';
import { forgetReceipts, memoryStats, type MemoryPrefs } from '../lib/memory';
import { promotionNetworks, reputationNetworks } from '../lib/networks';
import { REDDIT, loadProfileBackup, netOf, normalizeProfile, setNet, useProfile } from '../lib/store';
import manifest from '../../mnemo-plugin.json';
import { NetIcon } from './NetIcon';
import { GoalPicker, TopicsField, TrioPicker } from './ProfileFields';
import { age, type T } from './shared';

/**
 * What Mnemosyne is told to remember of the user's public life. Everything
 * here writes into the built-in SOCIAL vault, so it is real memory the chat
 * and the RAG can reach — which is exactly why the user, not Pheme, decides
 * what goes in. The counter below is the receipt: it counts writes that
 * actually returned, never intentions.
 */
function MemorySection({ t, profile, setProfile }: {
  t: T;
  profile: ReturnType<typeof useProfile>['profile'];
  setProfile: ReturnType<typeof useProfile>['setProfile'];
}) {
  const [stats, setStats] = useState(() => memoryStats());
  const rows: { key: keyof MemoryPrefs; label: StringKey; hint: StringKey }[] = [
    { key: 'myPosts', label: 'memPosts', hint: 'memPostsHint' },
    { key: 'myReplies', label: 'memReplies', hint: 'memRepliesHint' },
    { key: 'threadContext', label: 'memContext', hint: 'memContextHint' },
    { key: 'diagnosis', label: 'memDiagnosis', hint: 'memDiagnosisHint' },
  ];

  return (
    <>
      <label>{t('memLabel')}</label>
      <p className="hint">{t('memHint')}</p>
      <div className="memRows">
        {rows.map(r => (
          <label key={r.key} className="memRow">
            <input
              type="checkbox"
              checked={profile.memory[r.key]}
              onChange={e => setProfile(p => ({ ...p, memory: { ...p.memory, [r.key]: e.target.checked } }))}
            />
            <span>
              <strong>{t(r.label)}</strong>
              <span className="hint">{t(r.hint)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="hint">
        {stats.count > 0
          ? `✓ ${stats.count} ${t('memWritten')}${stats.lastAt ? ` · ${t('updatedAgo')} ${age(stats.lastAt)}` : ''}`
          : t('memNoneYet')}
        {stats.count > 0 && (
          <button className="mini" style={{ marginLeft: 10 }} onClick={() => { forgetReceipts(); setStats(memoryStats()); }}>
            {t('memResetReceipts')}
          </button>
        )}
      </p>
    </>
  );
}

export function SettingsTab({ t, profile, setProfile, onInterview }: {
  t: T;
  profile: ReturnType<typeof useProfile>['profile'];
  setProfile: ReturnType<typeof useProfile>['setProfile'];
  onInterview: () => void;
}) {
  const [restored, setRestored] = useState(false);
  const subs = netOf(profile, REDDIT).targets;
  const backup = useMemo(() => {
    const raw = loadProfileBackup();
    if (!raw) return null;
    // The backup may predate the per-network split — normalize it so an old
    // rescue file is still readable by the new shape.
    const b = normalizeProfile(raw);
    const bSubs = netOf(b, REDDIT).targets;
    // Only worth offering when it actually holds something we no longer do.
    const missing = b.topics.some(x => !profile.topics.includes(x))
      || bSubs.some(x => !subs.includes(x));
    return missing ? { profile: b, subs: bSubs } : null;
    // `restored` is a REFRESH SIGNAL, not an input: loadProfileBackup() reads
    // localStorage, and clicking restore is exactly when the offer should
    // re-evaluate and disappear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.topics, subs, restored]);

  return (
    <div className="pane">
      <h2>{t('settings')}</h2>

      <GoalPicker t={t} profile={profile} setProfile={setProfile} />
      <TopicsField t={t} profile={profile} setProfile={setProfile} />
      <TrioPicker t={t} profile={profile} setProfile={setProfile} />

      {/* The pseudonyms, the own sub and each network's watch list moved to
          their network's Profile tab. Saying WHERE they went matters more than
          the move: a setting that silently vanishes reads as a setting that
          was deleted. */}
      <p className="hint">{t('settingsMovedHint')}</p>

      {/* The wordmark on every poster. Global, not per-network: a brand that
          changes between LinkedIn and X is not a brand. */}
      <label>{t('brandLabel')}</label>
      <p className="hint">{t('brandHint')}</p>
      <input
        value={profile.brand} placeholder={t('brandPlaceholder')}
        onChange={e => setProfile(p => ({ ...p, brand: e.target.value.slice(0, 40) }))}
      />

      <label>{t('skinLabel')}</label>
      <p className="hint">{t('skinHint')}</p>
      <div className="skins">
        {SKINS.map(s => (
          <button
            key={s.id}
            className={profile.skin === s.id ? 'skinCard on' : 'skinCard'}
            onClick={() => setProfile(p => ({ ...p, skin: s.id }))}
          >
            <span className="skinSwatch" style={{ background: s.swatch[0] }}>
              <span className="skinDot" style={{ background: s.swatch[1] }} />
            </span>
            {s.name[profile.lang]}
          </button>
        ))}
      </div>

      <label>{t('langLabel')}</label>
      <p className="hint">{t('langHint')}</p>
      <div className="row">
        <select value={profile.lang} onChange={e => setProfile(p => ({ ...p, lang: e.target.value as Lang }))}>
          {AVAILABLE_LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>

      <MemorySection t={t} profile={profile} setProfile={setProfile} />

      <label>{t('repNetsLabel')}</label>
      <p className="hint">{t('repNetsHint')}</p>
      <div className="nets">
        {reputationNetworks().map(n => (
          <span key={n.id} className={n.status === 'live' ? 'net live' : 'net soon'}>
            <NetIcon id={n.id} />
            {n.name}
            <span className="netTag">{t(n.status === 'live' ? 'liveTag' : 'soonTag')}</span>
          </span>
        ))}
      </div>

      <label>{t('promoNetsLabel')}</label>
      <p className="hint">{t('promoNetsHint')}</p>
      <div className="nets">
        {promotionNetworks().map(n => (
          <span key={n.id} className={n.status === 'live' ? 'net live' : 'net soon'}>
            <NetIcon id={n.id} />
            {n.name}
            <span className="netTag">{t(n.status === 'live' ? 'liveTag' : 'soonTag')}</span>
          </span>
        ))}
      </div>

      {/* The backup is written whenever a save empties subs or topics — it
          existed with no way to use it, which is the same as not existing. */}
      {backup && (
        <>
          <label>{t('backupLabel')}</label>
          <p className="hint">
            {t('backupHint')} · {backup.profile.topics.length} {t('topicsLabel').toLowerCase()} · {backup.subs.length} subs
          </p>
          <button className="ghost" onClick={() => {
            // A restore only ever ADDS: it can never be the thing that loses
            // a list, which is the whole reason the backup exists.
            setProfile(p => setNet(
              { ...p, topics: [...new Set([...p.topics, ...backup.profile.topics])] },
              REDDIT,
              { targets: [...new Set([...netOf(p, REDDIT).targets, ...backup.subs])] },
            ));
            setRestored(true);
          }}>
            {restored ? `✓ ${t('backupRestored')}` : t('backupRestore')}
          </button>
        </>
      )}

      <button className="ghost" onClick={onInterview}>{t('redoInterview')}</button>

      <p className="hint">Pheme v{manifest.version} · port 5206</p>
    </div>
  );
}
