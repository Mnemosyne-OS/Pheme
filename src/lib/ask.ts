/**
 * Talking WITH Mnemosyne inside Pheme. The drawer's substance comes from
 * two places: the host's RAG pipeline (the user's own memory rides along
 * every call) and a STATE BRIEF built from what the app actually knows
 * right now — goal, ledger, radar, presence, latest diagnosis. Honest by
 * construction: the brief only states what is on screen, never invents.
 *
 * Skills are lenses on the same knowledge — they shape the stance, never
 * the facts (same measured rule as the archetype voices).
 */
import { ledgerStats, presenceZones } from './selectors';
import { HN, REDDIT, netOf, type LedgerEntry, type Profile } from './store';
import type { PresenceReport } from './presence';
import type { ScoredItem } from './score';

export type AskSkill = 'coach' | 'researcher' | 'critic';

export const ASK_SKILLS: AskSkill[] = ['coach', 'researcher', 'critic'];

const SKILL_STANCE: Record<AskSkill, string> = {
  coach: 'You are the user\'s REPUTATION COACH. Push toward the goal with the app\'s own doctrine: genuine participation before promotion (9:1), readiness floors, next concrete action. Be direct, numbers over vibes.',
  researcher: 'You are the user\'s RESEARCHER. Dig into their own memory and the state below for facts, prior work, numbers and sources they already own. Substance only — say plainly when their memory holds nothing on a point.',
  critic: 'You are the user\'s CRITIC. Adversarial but fair: attack weaknesses in their plans, drafts and assumptions before Reddit or HN does. Name the strongest objection first, then what survives it.',
};

export interface AskMsg { role: 'user' | 'assistant'; text: string; at: string }

const K_ASK = 'pheme:ask:history';
const ASK_CAP = 60;

export function loadAskHistory(): AskMsg[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(K_ASK) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveAskHistory(msgs: AskMsg[]): void {
  try { localStorage.setItem(K_ASK, JSON.stringify(msgs.slice(-ASK_CAP))); }
  catch { /* quota — the on-screen thread still lives this session */ }
}

/** What the app knows RIGHT NOW, compact. States facts, never guesses. */
export function buildStateBrief(p: {
  profile: Profile;
  ledger: LedgerEntry[];
  items: ScoredItem[];
  scannedAt: string | null;
  presence: PresenceReport | null;
  unseen: number;
}): string {
  const { profile, ledger, items, scannedAt, presence, unseen } = p;
  const { participation, solo, promo, ratioOk } = ledgerStats(ledger, presence);
  const reddit = netOf(profile, REDDIT);
  const hn = netOf(profile, HN);
  const { mine, sub, mySubName } = presenceZones(presence, reddit.home);
  const top = items[0];
  return [
    `Goal: ${profile.goal || 'not set'}. Topics: ${profile.topics.join(', ') || 'none'}.`,
    // Each network's own watch list — they are no longer one shared field.
    `Watching: reddit ${reddit.targets.join(', ') || 'nothing'}; HN ${hn.targets.join(', ') || 'nothing'}.`,
    `Pseudonyms: reddit u/${reddit.handle || '—'}, HN ${hn.handle || '—'}${mySubName ? `, own sub ${mySubName}` : ''}.`,
    // Two separate counts: what they logged here, and what only their public
    // feed knows about. Never a total and a share of it.
    `Ledger: ${participation} genuine replies logged, ${solo} further ones written without this app, ${promo} promos (9:1 rule ${ratioOk ? 'holds' : 'BROKEN'}).`,
    scannedAt
      ? `Radar: ${items.length} scored threads (last scan ${scannedAt})${top ? `; top: "${top.title.slice(0, 80)}" (score ${top.score})` : ''}.`
      : 'Radar: never scanned.',
    presence
      ? `Presence: ${mine.length} threads of their own tracked${mySubName ? `, ${sub.length} in ${mySubName}` : ''}, ${unseen} unread replies.`
      : 'Presence: not fetched yet.',
    profile.diagnosis ? `Latest diagnosis (${profile.diagnosedAt.slice(0, 10)}): ${profile.diagnosis.slice(0, 500)}` : 'No diagnosis yet.',
  ].join('\n');
}

export function buildAskPrompt(opts: {
  skill: AskSkill;
  langName: string;
  stateBrief: string;
  history: AskMsg[];
  question: string;
}): string {
  const recent = opts.history.slice(-6)
    .map(m => `${m.role === 'user' ? 'USER' : 'YOU'}: ${m.text.slice(0, 300)}`);
  return [
    'You are Mnemosyne — the user\'s sovereign memory OS — speaking inside Pheme, their reputation coach for Reddit and Hacker News.',
    SKILL_STANCE[opts.skill],
    'Never invent facts about the user; their memory context and the state below are the ground truth. Pheme never posts anything — the human does.',
    '',
    'CURRENT STATE OF THE APP (live):',
    opts.stateBrief,
    recent.length ? `\nRECENT CONVERSATION:\n${recent.join('\n')}` : '',
    '',
    `USER: ${opts.question.slice(0, 1200)}`,
    `Answer in ${opts.langName}, under 180 words, concrete. No markdown headings, no asterisks.`,
  ].filter(Boolean).join('\n');
}
