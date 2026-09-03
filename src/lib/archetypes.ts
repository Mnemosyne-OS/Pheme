/**
 * The sixteen cognitive archetypes — the same characters as the host's chat
 * lens (infinity-edition mbtiLens.ts / Psyche's buildLiquidPrompt.ts, which
 * stays the source of truth for their vocabulary).
 *
 * Same design rule as the host, measured on the 2026-08 bench: an archetype
 * changes ONE thing — THE VOICE. The substance of a draft comes from the
 * user's memory (bridge.recall) and from the thread itself; the archetype
 * only shapes how that substance speaks. Tone lines are English on purpose:
 * a French tone line inside an English prompt is a language instruction.
 */

export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;

export type MbtiType = typeof MBTI_TYPES[number];

export const TONE: Record<MbtiType, string> = {
  INTJ: 'analytical, strategic, direct. Long-term vision. Little small talk.',
  INTP: 'curious, precise, abstract. Loves nuance. May ignore conventions.',
  ENTJ: 'direct, ambitious, structuring. A natural commander. Impatient with inefficiency.',
  ENTP: 'quick, provocative, creative. Challenges ideas. Starts more than it finishes.',
  INFJ: 'empathetic, deep, visionary. Feels before analysing. Speaks in metaphors.',
  INFP: 'gentle, idealistic, poetic. Authenticity above all. Sensitive to pressure.',
  ENFJ: "charismatic, inspiring, warm. Seeks others' growth.",
  ENFP: 'enthusiastic, spontaneous, creative. Unexpected connections. Contagious energy.',
  ISTJ: 'precise, reliable, structured. Honours commitments. Wary of rapid change.',
  ISFJ: 'considerate, loyal, discreet. Practical care. Avoids direct conflict.',
  ESTJ: 'authoritative, efficient, direct. Structure and results. Little room for ambiguity.',
  ESFJ: 'warm, attentive, social. Group harmony. Sensitive to rejection.',
  ISTP: 'calm, precise, pragmatic. Direct action. Minimal with words.',
  ISFP: 'gentle, artistic, present. Aesthetics and authenticity. Reluctant about rules.',
  ESTP: 'energetic, direct, opportunistic. Lives in the moment. Adapts in real time.',
  ESFP: 'enthusiastic, warm, spontaneous. Present and alive. Flees rigidity.',
};

/**
 * Display names — the classic archetype nicknames, so the picker speaks to
 * people who know "Architect" but not "INTJ". Shown beside the code, never
 * instead of it.
 */
export const NAMES: Record<MbtiType, { en: string; fr: string }> = {
  INTJ: { en: 'Architect', fr: 'Architecte' },
  INTP: { en: 'Logician', fr: 'Logicien' },
  ENTJ: { en: 'Commander', fr: 'Commandant' },
  ENTP: { en: 'Debater', fr: 'Innovateur' },
  INFJ: { en: 'Advocate', fr: 'Avocat' },
  INFP: { en: 'Mediator', fr: 'Médiateur' },
  ENFJ: { en: 'Protagonist', fr: 'Protagoniste' },
  ENFP: { en: 'Campaigner', fr: 'Inspirateur' },
  ISTJ: { en: 'Logistician', fr: 'Logisticien' },
  ISFJ: { en: 'Defender', fr: 'Défenseur' },
  ESTJ: { en: 'Executive', fr: 'Directeur' },
  ESFJ: { en: 'Consul', fr: 'Consul' },
  ISTP: { en: 'Virtuoso', fr: 'Virtuose' },
  ISFP: { en: 'Adventurer', fr: 'Aventurier' },
  ESTP: { en: 'Entrepreneur', fr: 'Entrepreneur' },
  ESFP: { en: 'Entertainer', fr: 'Amuseur' },
};

/** "ENTJ · Commandant" — one label, code first so the mapping teaches itself. */
export function archetypeLabel(type: MbtiType, lang: 'en' | 'fr'): string {
  return `${type} · ${NAMES[type][lang]}`;
}

/** Default trio — three genuinely different registers to compare at a glance. */
export const DEFAULT_TRIO: MbtiType[] = ['INTP', 'ENFP', 'ISTJ'];
