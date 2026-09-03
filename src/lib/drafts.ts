/**
 * Draft generation — one model call, N voices, zero fabrication.
 *
 * The pipeline is deliberately two-step:
 *  1. recall — ask the user's own memory what it knows about the thread's
 *     subject (host RAG). This is the substance, and it is what makes a
 *     draft something only THIS user could have written.
 *  2. infer — ONE call that renders that substance into the chosen
 *     archetype voices. The archetype shapes the voice, never the facts
 *     (same measured rule as the host's chat lens).
 */
import { TONE, type MbtiType } from './archetypes';
import type { ScoredItem } from './score';
import { cleanListItem } from './suggest';
import { rulesFor } from './rulebook';

/**
 * How much of the post each prompt gets to see.
 *
 * The drafter gets the LOT: it is writing an answer TO this text, and a reply
 * grounded in the first third of a post is the one that reads beside the
 * point. The two cheap steps (angles, recall) only need the subject, so they
 * stay short — that is a cost decision, and it is safe because neither of
 * them produces the reply.
 */
const BODY_CLIP = 4000;
const ANGLE_CLIP = 700;

/** Three possible TAKES on the thread — cheap, before committing to drafts. */
export function buildAnglesPrompt(item: ScoredItem): string {
  return [
    `Thread on ${item.network === 'reddit' ? item.target : 'Hacker News'}: "${item.title.slice(0, 140)}"`,
    item.body ? `Context: ${item.body.slice(0, ANGLE_CLIP)}` : '',
    '',
    'Give 3 DIFFERENT angles for a genuine reply (contrarian take, personal-experience take, technical-depth take, question-back…).',
    'One line each, max 15 words, numbered 1-3. No drafts, no preamble, no commentary — output the three lines and nothing else.',
  ].filter(Boolean).join('\n');
}

export function parseAngles(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const cleaned = cleanListItem(line);
    // A preamble ("Here are 3 angles:") passes any length test and, once
    // picked, is fed to the drafter as "the take the author chose".
    if (/[:：]\s*$/.test(cleaned)) continue;
    if (/^(here|voici|sure|bien sûr|certainly|these are)\b/i.test(cleaned)) continue;
    if (cleaned.length >= 8 && cleaned.length <= 160) out.push(cleaned);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * How much weight the author's memory deserves on THIS thread.
 *
 * The middle value is the one that was missing. A thread about getting hired
 * as an AI engineer IS in the same field as the author's RAG work, so recall
 * returned the whole stack and the drafter — told memory was substance — wrote
 * about pipelines, PDF ingestion and failover latency. Neither "always use it"
 * nor "never use it" is right: the question is whether it ANSWERS this post,
 * and that is a judgement, made once, per thread.
 */
export type MemoryRelevance = 'answers' | 'adjacent' | 'none';

export interface Recall {
  relevance: MemoryRelevance;
  /** The bullets, without the verdict line. '' when there is nothing. */
  notes: string;
}

/**
 * Read the recall answer back.
 *
 * @returns `adjacent` when the model skipped the verdict line — the cautious
 *   middle. Defaulting to `answers` would restore the old behaviour on every
 *   malformed reply, which is precisely the failure being fixed; defaulting to
 *   `none` would silently throw away memory the user paid a call for.
 */
export function parseRecall(raw: string): Recall {
  const text = (raw ?? '').trim();
  // The pre-verdict contract, still honoured: older prompts said this.
  if (!text || /NOTHING_RELEVANT/i.test(text)) return { relevance: 'none', notes: '' };
  const m = text.match(/^\s*RELEVANCE\s*[:=]\s*(answers|adjacent|none)\b/im);
  const relevance = (m?.[1]?.toLowerCase() ?? 'adjacent') as MemoryRelevance;
  const notes = (m ? text.replace(m[0], '') : text)
    // A model that echoes the option list back is not giving notes.
    .replace(/^\s*[-—]?\s*(answers|adjacent|none)\b.*$/gim, '')
    .trim();
  return relevance === 'none' || !notes ? { relevance: 'none', notes: '' } : { relevance, notes };
}

export function buildRecallPrompt(item: ScoredItem, matched: string[]): string {
  return [
    `Someone posted this on ${item.network === 'reddit' ? item.target : 'Hacker News'}:`,
    `"${item.title}"`,
    item.body ? `Context: ${item.body.slice(0, ANGLE_CLIP)}` : '',
    '',
    `What do I actually know, from my own work and notes, that bears on this${matched.length ? ` (topics: ${matched.join(', ')})` : ''}?`,
    'Give concrete facts, experiences, numbers or hard-won lessons — 5 bullet points maximum.',
    '',
    // The verdict rides along with the notes: one call, and the drafter stops
    // having to guess how much weight to give them. "Adjacent" is the honest
    // middle that was missing — a thread about getting hired IS adjacent to
    // the author's RAG work, and treating that as substance is how the reply
    // filled up with pipelines and latency figures nobody asked about.
    'FIRST LINE, exactly one of these three, then the bullets:',
    'RELEVANCE: answers — what I know actually answers the question this post asks.',
    'RELEVANCE: adjacent — same subject area, but it does not answer what is being asked.',
    'RELEVANCE: none — my memory holds nothing that bears on this. Then write nothing else.',
    'Be strict about the difference. Sharing a field with the post is `adjacent`, not `answers`, and `none` is a normal, useful outcome.',
  ].filter(Boolean).join('\n');
}

/**
 * Wit is a CRAFT setting, not a gimmick: what communities upvote is dry,
 * specific, self-deprecating — and what they punish is forced jokes. The
 * levels encode that taste; substance always carries the reply.
 */
export function witLine(wit: 0 | 1 | 2): string {
  switch (wit) {
    case 0: return 'Tone: sober and substantive — no jokes.';
    case 2: return 'Wit: make it genuinely funny — dry, specific, self-aware humor woven through, the kind these communities upvote. Substance still carries the reply. No memes, no emoji.';
    default: return 'Wit: ONE dry aside is welcome when it lands naturally — specific beats clever, self-deprecation beats snark, never at the expense of substance. No emoji.';
  }
}

/**
 * What makes a draft read as a PEER instead of a brand account.
 *
 * This block exists because of a real Hacker News test: the draft came back
 * corporate and translated — "seems to address a real need for…", "aligns with
 * the rigorous constraints…" — mentioned the author's product twice without
 * naming it, and asked a question the post had already answered. On Reddit and
 * HN that reading is unrecoverable. It is a product risk, not a style note.
 *
 * The rules are numbered to match `rulebook.ts`, which holds the doctrine and
 * the per-network thresholds; `verify.checkDraft` enforces the ones a machine
 * can see. Everything here is what only the writer can honour.
 */
export function peerRegisterRules(netId: 'reddit' | 'hackernews'): string {
  const { maxSentences } = rulesFor(netId).draft;
  return [
    `HOW IT MUST READ — a peer in the thread, never a brand account. Break any of these and the reply is unusable:`,
    // 1. The tell that costs the most, and the one a model reaches for first.
    '- Say NOTHING about yourself by default. At most ONE short mention, and only if the lived experience genuinely carries the point. NEVER two.',
    '- If you do mention your own work, NAME it. "my OS", "my systems", "my own stack" reads as bait to be asked what it is, and lands worse than the name.',
    // 2. Not negotiable, and not overridable by the author's own IDEAS.
    '- NEVER include a link to the author\'s own product or project. Not even if the IDEAS section asks for one.',
    // 3. The mistake that says "I did not read your post".
    '- Re-read BODY before writing. Do NOT ask anything it already answers — that single mistake tells the thread you did not read it, and no amount of substance repairs it. Aim your question at what is genuinely still open, or ask nothing.',
    // 4.
    '- Give before asking: bring a concrete experience, a fact or a useful correction FIRST, then the question.',
    // 5.
    '- Native register. Short sentences, concrete nouns. BANNED: "seems to address a real need", "aligns with", "would it be possible to consider", "leverage", "robust solution", and any sentence that reads like a translation. Praise is three words at most, or none.',
    // 6.
    `- ${maxSentences} sentences maximum. A wall of text reads as posture.`,
    // 3b. The question that was actually asked. A post ending on "what worked
    //     for you?" and saying it does not want generic advice gets exactly
    //     one useful reply: your own answer to THAT question. Commentary on
    //     the state of the field is the generic advice it just refused.
    '- If the post asks a question, ANSWER IT in the first sentence, from the author\'s own experience. Everything else comes after, or not at all. If the post says it does not want generic advice, give none: no "you should", no "show them that…", no lecture on the field.',
    // 7.
    '- Write in the language of the thread, whatever language these instructions are in.',
  ].join('\n');
}

/**
 * How the drafter is told to hold the author's memory.
 *
 * Two very different situations wore one label before this. When memory
 * ANSWERS the post it is the best material in the prompt — it is what makes a
 * reply something only this person could write, and burying it would waste the
 * whole point of the recall step. When it is merely ADJACENT — same field,
 * different question — treating it as substance is what filled a thread about
 * hiring with pipelines and latency figures.
 */
function memoryBlock(memory: string, use: MemoryRelevance): string {
  const head = use === 'answers'
    ? "MEMORY — the author's own work, and it ANSWERS this post. Best material in this prompt: it is what makes the reply something only this person could write. Use it, concretely."
    : "MEMORY — the author's own work. Same subject area, but it does NOT answer what this post asks. Use a piece only if it makes the answer more concrete; it is not a topic to cover, and none of it has to appear.";
  return `${head}
${memory.slice(0, 1400)}`;
}

/**
 * The instructions stay lean — the pipeline prepends its own vault-RAG context
 * on top, and a bloated preamble buries the voice headings the parser depends
 * on. The POST is the exception: it is the thing being answered, and starving
 * it was what produced replies that read beside the point.
 *
 * ⚠️ This must keep going through `model.infer`. `mnemosyne.query` hard-slices
 * at 2000 characters, which would silently amputate the body again.
 */
export function buildDraftPrompt(
  item: ScoredItem,
  trio: MbtiType[],
  memory: string | null,
  opts?: {
    angle?: string; recentComments?: string[]; ideas?: string; wit?: 0 | 1 | 2;
    /** Answering ONE person who replied, instead of the thread at large. */
    replyingTo?: { author: string; body: string; mine?: string };
    /** Images/video carried by the post that NOBODY read. */
    unreadMedia?: number;
    /**
     * What a vision model actually read in the post's images. Distinct from
     * the warning above and mutually exclusive with it, image by image: the
     * warning says "do not guess", this says "here is what is in it, and a
     * machine is what read it".
     */
    mediaRead?: string[];
    /**
     * How much weight memory deserves HERE, decided once by the recall step.
     * The drafter used to get one instruction for both cases and had to guess.
     */
    memoryUse?: MemoryRelevance;
  },
): string {
  const voices = trio.map(t => `### ${t}\n(voice: ${TONE[t]})`).join('\n');
  const rt = opts?.replyingTo;
  // Answering a person: the freshest comments elsewhere in the thread are
  // noise at best, and at worst the model answers one of THOSE instead.
  const recent = rt ? [] : (opts?.recentComments ?? []).filter(Boolean).slice(0, 2);
  return [
    rt
      ? 'Draft a reply to ONE person who answered in a thread. A real person will edit and post it THEMSELVES.'
      : 'Draft a reply a real person will edit and post THEMSELVES.',
    // MEMORY used to be listed as a SOURCE OF SUBSTANCE, alongside the thread
    // and the author's own notes. So the model went looking for something to
    // say in it — and a thread asking "what got you hired?" came back full of
    // RAG pipelines, PDF ingestion and Gemini failover, because that is what
    // the vault happened to hold. Memory grounds a point the reply is already
    // making. It never decides what the reply is about.
    'Rules: never invent facts or experiences (no fake lived experience, ever); write in the thread\'s language; no greeting, no signature.',
    // How MUCH to lean on memory is no longer this call's guess: the recall
    // step judged it once, per thread, and says so with the notes themselves.
    'THE SUBJECT is set by the THREAD and by what the author wants to say — never by MEMORY. How much to lean on memory is stated with it below.',
    peerRegisterRules(item.network === 'reddit' ? 'reddit' : 'hackernews'),
    witLine(opts?.wit ?? 1),
    `THREAD (${item.target}): "${item.title.slice(0, 140)}"`,
    // 350 was the reason a draft could read beside the point: the model was
    // answering a third of a post the human had just read in full. The same
    // file already learned this on the recall step ("clipping at 450 threw
    // ~75% of what was paid for away"); the POST itself deserved it more —
    // it is the thing being answered. model.infer applies no truncation of
    // its own, and a self-post is a couple of thousand characters at most.
    item.body ? `BODY: ${item.body.slice(0, BODY_CLIP)}` : '',
    // Their words come LAST of the context block and carry the imperative:
    // the thread is only the room this exchange happens in.
    rt?.mine ? `YOUR EARLIER MESSAGE (what they are answering): "${rt.mine.slice(0, 400)}"` : '',
    rt ? `THEIR REPLY — answer THIS, engage ${rt.author} directly, and match the language they used: "${rt.body.slice(0, 600)}"` : '',
    recent.length ? `LATEST COMMENTS (land in the discussion as it is now): ${recent.map(c => `"${c.slice(0, 120)}"`).join(' · ')}` : '',
    // The recall step asks for 5 substantial bullets; clipping at 450 threw
    // ~75% of what was paid for away. model.infer applies no truncation of
    // its own (the 2000-char slice lives on mnemosyne.query, unused here).
    // Without this line the model fills the hole: it describes a chart it
    // never saw, confidently, and the author posts it under their own name.
    opts?.unreadMedia
      ? `WARNING: this post carries ${opts.unreadMedia} image(s)/video NOT read by anyone. Its real substance may be in there. Never describe, quote or assume their content; if a reply cannot stand without seeing them, say the honest thing and ask.`
      : '',
    // Named as a machine reading on purpose. The author is the one who posts
    // the reply: if the description is wrong, they must be able to see that
    // the claim came from an OCR pass and not from the thread itself.
    opts?.mediaRead?.length
      ? `IMAGE(S) IN THE POST, as read by a vision model (a machine reading — treat it as reported, not as your own observation):\n${opts.mediaRead.map((d, i) => `[image ${i + 1}] ${d.slice(0, 900)}`).join('\n')}`
      : '',
    // Framed by the recall step's own verdict, not by one blanket rule.
    memory
      ? memoryBlock(memory, opts?.memoryUse ?? 'adjacent')
      : 'MEMORY: none — answer from the thread and from what the author wants to say.',
    // "Weave these in" is what produced a reply ABOUT the state of RAG with
    // the author's actual answer buried in sentence three. When the author has
    // written what they want to say, that IS the reply — the rest is framing,
    // and framing is optional.
    opts?.ideas?.trim()
      ? `WHAT THE AUTHOR WANTS TO SAY — this IS the reply, not an ingredient in one.\n`
        + `Open with it. Do not lead with a general observation about the field and slip this in later; do not pad it with context it does not need. Everything else in this prompt exists to help you say THIS well:\n`
        + `${opts.ideas.trim().slice(0, 400)}`
      : '',
    opts?.angle ? `ANGLE (the author chose this take — follow it): ${opts.angle.slice(0, 120)}` : '',
    `Write ${trio.length} versions of the SAME reply — same substance, different voice — each under its exact heading:`,
    voices,
    '### COACH',
    rt
      ? 'Two sentences: does this reply deserve an answer at all, and one thing to check before posting.'
      : 'Two sentences: is this thread worth the author\'s time, and one thing to check before posting.',
  ].filter(Boolean).join('\n');
}

export interface DraftSet {
  drafts: { type: MbtiType; text: string }[];
  coach: string;
}

// ── Polish — a pass over words the AUTHOR wrote ──────────────────────────────

/**
 * `fix` corrects, `flow` rephrases. They are kept apart on purpose: correcting
 * a typo and rewriting a sentence are not the same act, and a single "improve
 * this" button silently performs the second while the user asked for the first.
 */
export type PolishMode = 'fix' | 'flow';

/**
 * The whole point of Pheme is that the reply is the AUTHOR's. So this pass has
 * exactly one job — remove the friction of typing — and is forbidden the two
 * things that would quietly turn a human reply into a model one: adding
 * substance, and changing the language it was written in.
 */
export function buildPolishPrompt(text: string, mode: PolishMode): string {
  return [
    mode === 'fix'
      ? 'Correct the spelling, grammar, punctuation and syntax of the text below.'
      : 'Rewrite the text below so it reads smoothly.',
    '',
    'ABSOLUTE RULES:',
    '- Keep the SAME LANGUAGE as the input. Never translate.',
    '- Add NOTHING: no fact, no number, no link, no example, no politeness formula, no closing line that is not already there.',
    '- Remove no idea. Every point the author makes must survive.',
    '- Keep the author\'s register, their vocabulary and their level of directness. Do not make it more formal, more corporate or more enthusiastic.',
    mode === 'fix'
      ? '- Change ONLY what is wrong. A clumsy but correct sentence stays exactly as it is.'
      : '- Stay close to the original length. Fix awkward phrasing and repetition; keep the sentences the author would recognise as theirs.',
    '- Keep any markdown, line breaks and lists as they are.',
    '',
    'Output ONLY the resulting text — no preamble, no commentary, no quotes around it.',
    '',
    'TEXT:',
    text.slice(0, BODY_CLIP),
  ].join('\n');
}

/**
 * How far the result may drift before it stops being the author's text.
 * `fix` is tight because a correction that halves a paragraph deleted an idea;
 * `flow` is looser because rephrasing legitimately moves length around.
 */
const POLISH_BOUNDS: Record<PolishMode, [number, number]> = {
  fix: [0.75, 1.35],
  flow: [0.5, 1.8],
};

/**
 * Guard between the model and the author's own words. A polish that OVERWRITES
 * a draft has to be right, and the two ways it goes wrong are both silent: an
 * empty answer wipes the text, and a "helpful" model returns an essay built on
 * facts nobody wrote. Both are refused here, by name, rather than saved.
 *
 * Pure so a test can pin it: this is the last thing standing between a failed
 * call and a destroyed draft.
 */
export function acceptPolish(
  original: string, raw: string, mode: PolishMode,
): { text: string; same: boolean } | { fail: 'empty' | 'drift' } {
  let out = raw.trim();
  // Models fence prose they were told not to decorate. Unwrap it, do not
  // paste the backticks into a reply the user is about to post.
  const fence = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n?```$/.exec(out);
  if (fence) out = fence[1].trim();
  // Only unwrap quotes the ORIGINAL did not have — a draft that genuinely
  // opens and closes on a quotation keeps it.
  const base = original.trim();
  if (out.length > 1 && !base.startsWith('"') && out.startsWith('"') && out.endsWith('"')) {
    out = out.slice(1, -1).trim();
  }
  if (!out) return { fail: 'empty' };
  const [lo, hi] = POLISH_BOUNDS[mode];
  const ratio = out.length / Math.max(1, base.length);
  if (ratio < lo || ratio > hi) return { fail: 'drift' };
  return { text: out, same: out === base };
}

/** Tolerant section splitter — models decorate headings in creative ways. */
export function parseDrafts(text: string, trio: MbtiType[]): DraftSet {
  const sections = new Map<string, string>();
  const marks: { key: string; index: number }[] = [];
  const keys = [...trio, 'COACH'];
  for (const key of keys) {
    // `\s` used to sit in this class — and \s matches NEWLINES, so the match
    // began on an earlier blank line and the heading itself ("ENFP", "COACH")
    // was kept as the first line of the body. Horizontal space only.
    const re = new RegExp(`^[#*\\t ]*${key}\\b.*$`, 'mi');
    const m = re.exec(text);
    if (m && typeof m.index === 'number') marks.push({ key, index: m.index });
  }
  marks.sort((a, b) => a.index - b.index);
  for (let i = 0; i < marks.length; i++) {
    const start = text.indexOf('\n', marks[i].index);
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    if (start !== -1 && start < end) {
      sections.set(marks[i].key, text.slice(start, end).replace(/^[\s#*-]+|[\s]+$/g, ''));
    }
  }
  return {
    drafts: trio
      .map(t => ({ type: t, text: sections.get(t) ?? '' }))
      .filter(d => d.text.length > 0),
    coach: sections.get('COACH') ?? '',
  };
}
