/**
 * The reputation report — doc 75 §6. Global, or for one network.
 *
 * The figures below are rendered by CODE, from the ledger and from what the
 * networks publish. The model writes the prose around them and is given the
 * fact sheet; anything numeric it adds on its own is caught by `auditNumbers`
 * and the narrative is REFUSED — not shown with a caveat.
 *
 * That refusal is the whole point. A report is a document people forward, and
 * a caveat is the first thing that gets dropped on the way. "+40 % engagement
 * this month" in an otherwise accurate report is worse than no report.
 */
import { useState } from 'react';
import { bridge, inferText, isFramed } from '../lib/bridge';
import { LANG_NAME, type StringKey } from '../lib/i18n';
import type { LedgerEntry, Profile } from '../lib/store';
import type { PresenceReport } from '../lib/presence';
import { NETWORKS } from '../lib/networks';
import { auditNumbers, buildReportPrompt, reportFacts, type Fact, type ReportFacts } from '../lib/report';
import { LevelTag } from './VerdictBoard';
import { age, type T } from './shared';

const FACT_LABEL: Record<Fact['code'], StringKey> = {
  replies: 'fReplies', solo: 'fSolo', promos: 'fPromos', communities: 'fCommunities',
  threads: 'fThreads', repliesReceived: 'fRepliesReceived',
  karmaReddit: 'fKarmaReddit', karmaHn: 'fKarmaHn',
  ready: 'fReady', close: 'fClose', blocked: 'fBlocked', unknown: 'fUnknown',
  rulesRead: 'fRulesRead', rulesUnread: 'fRulesUnread',
};

/**
 * What was measured, printed by us. Never a zero standing in for a blank.
 *
 * A cell carries its movement only when TWO dated measurements exist for it.
 * No badge is not "it did not move" — it is "there is nothing to compare
 * against yet", which the line under the sheet says out loud.
 */
function FactSheet({ t, facts }: { t: T; facts: ReportFacts }) {
  return (
    <div className="factSheet">
      {facts.facts.map(f => {
        const d = facts.since?.deltas[f.code];
        return (
          <div key={f.code} className="factCell">
            <span className={f.value === null ? 'factVal absent' : 'factVal'}>
              {f.value === null ? '—' : f.value}
              {typeof d === 'number' && (
                <span className={d > 0 ? 'factDelta up' : 'factDelta down'}>
                  {d > 0 ? `+${d}` : d}
                </span>
              )}
            </span>
            <span className="factLabel">{t(FACT_LABEL[f.code])}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ReportPanel({ t, profile, ledger, presence, network }: {
  t: T;
  profile: Profile;
  ledger: LedgerEntry[];
  presence: PresenceReport | null;
  /** A network id for a scoped report; omitted for the global one. */
  network?: string;
}) {
  // Read here rather than drilled down four components: it is a property of
  // the window this cartridge is in, not of any screen inside it.
  const framed = isFramed();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prose, setProse] = useState('');
  const [refused, setRefused] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<ReportFacts | null>(null);
  const [copied, setCopied] = useState(false);

  const netName = network ? NETWORKS.find(n => n.id === network)?.name ?? network : '';

  /**
   * One generation, one automatic retry with the rule restated, then the
   * facts stand alone. The retry exists because a first draft slipping in a
   * percentage is common and cheap to fix; a second one means the model will
   * not comply, and at that point silence is the honest output.
   */
  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRefused([]);
    setProse('');
    const sheet = reportFacts(ledger, presence, network);
    setFacts(sheet);
    try {
      let unbacked: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const prompt = buildReportPrompt(sheet, LANG_NAME[profile.lang], netName)
          + (attempt === 0 ? '' : '\n\nYour previous draft contained figures that were NOT measured. Write it again with NO number at all in the prose.');
        const raw = inferText(await bridge.ask(prompt, { task: 'report', net: network }));
        const text = raw.trim();
        if (!text) { setError(t('reportEmpty')); return; }
        unbacked = auditNumbers(text, sheet);
        if (unbacked.length === 0) { setProse(text); return; }
      }
      // Twice refused: the counts below are still true, and they are the part
      // that was never at risk.
      setRefused(unbacked);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const plainText = (): string => {
    if (!facts) return '';
    const lines = [
      `${t('reportTitle')}${netName ? ` — ${netName}` : ''} · ${facts.at.slice(0, 10)}`,
      '',
      ...facts.facts.map(f => `${t(FACT_LABEL[f.code])}: ${f.value === null ? t('reportNotMeasured') : f.value}`),
      '',
      ...facts.communities.map(c => `${c.community} — ${c.level}`),
      ...(facts.unread.length ? ['', `${t('reportUnreadHead')}: ${facts.unread.map(u => u.community).join(', ')}`] : []),
      ...(prose ? ['', prose] : []),
    ];
    return lines.join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t('copyFailed'));
    }
  };

  return (
    <details className="postBox reportBox" open={open}
      onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>{t('reportTitle')}{netName ? ` · ${netName}` : ''}</summary>
      <p className="hint">{t('reportHint')}</p>

      <div className="row">
        <button className="primary" onClick={() => { void generate(); }} disabled={busy || !framed}>
          {busy ? t('reportWriting') : facts ? t('reportAgain') : t('reportBtn')}
        </button>
        {facts && (
          <button className="mini" onClick={() => { void copy(); }}>
            {copied ? t('copied') : t('copy')}
          </button>
        )}
        {facts?.presenceAt && (
          <span className="karma">{t('updatedAgo')} {age(facts.presenceAt)}</span>
        )}
      </div>
      {!framed && <p className="warn small">{t('notConnected')}</p>}
      {error && <p className="warn small">{error}</p>}

      {facts && (
        <>
          <FactSheet t={t} facts={facts} />
          {/* Dated, or absent. "since 30 July" can be checked; "this month"
              cannot, and quietly changes meaning as time passes. */}
          <p className="hint">
            {facts.since
              ? `${t('sinceLabel')} ${facts.since.day}`
              : t('sinceNone')}
          </p>

          {facts.communities.length > 0 && (
            <ul className="actList">
              {facts.communities.map(c => (
                <li key={c.community} className="actItem">
                  <span><LevelTag t={t} level={c.level} /> {c.community}</span>
                  <span className="karma">{c.acts} · {c.promo}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Named, not hidden: a report that quietly omits the communities it
              could not read is a report that overstates its own coverage. */}
          {facts.unread.length > 0 && (
            <p className="hint">
              {t('reportUnreadHead')}: {facts.unread.map(u => u.community).join(', ')}
            </p>
          )}

          {refused.length > 0 && (
            <p className="warn small">
              {t('reportRefused')} {refused.join(', ')}
            </p>
          )}
          {prose && <pre>{prose}</pre>}
        </>
      )}
    </details>
  );
}
