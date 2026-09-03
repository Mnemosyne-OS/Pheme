/**
 * Reading the picture — the substance half of Reddit keeps outside its text.
 *
 * `article.extractMedia` already made the gap VISIBLE: a post carrying a
 * screenshot is flagged, and the drafter is ordered never to guess what is in
 * it. That was the honest floor, not the answer. This is the answer: fetch the
 * bytes through the host, hand them to a model that can actually see, and show
 * the user what it read — beside a button that opens the original, so the
 * machine's reading can be checked against the thing itself.
 *
 * Two refusals matter more than the feature:
 *  - the host refuses the call outright when the active route has no vision
 *    (`NO_VISION`), instead of dropping the image and answering anyway;
 *  - an unreadable fetch throws rather than passing a mangled string along.
 * A description nobody can trust is worse than the warning it replaces.
 */
import { asString } from './coerce';

/** What a vision pass produced for ONE image. */
export interface ImageReading {
  url: string;
  /** What the model says is in the image — its words, never presented as ours. */
  text: string;
  at: string;
}

/**
 * The prompt. Deliberately narrow: describe, transcribe, do not interpret.
 * A vision model asked "what do you think of this?" writes an opinion, and the
 * opinion then travels into a reply as if it were the post's content.
 */
export function buildImageReadPrompt(context: string): string {
  return [
    'Describe this image so someone who cannot see it could answer the thread it was posted in.',
    context.trim() ? `The post it belongs to says: "${context.trim().slice(0, 300)}"` : '',
    '',
    'Rules:',
    '- TRANSCRIBE every readable text, verbatim (screenshots of posts, chats, code, charts axis labels).',
    '- Then, in two sentences at most, say what the image SHOWS.',
    '- Never guess at what is cut off, blurred or absent. Say "unreadable" instead.',
    '- No opinion on the content, no advice, no reply to it. Description only.',
  ].filter(Boolean).join('\n');
}

/** Why a reading did not happen. Each maps to a sentence the user can act on. */
export type VisionFail =
  | 'no-vision'      // the active model cannot see — the host refused
  | 'too-large'      // the payload exceeded what the host accepts
  | 'unreachable'    // the image could not be fetched
  | 'refused'        // the host said no, for a reason it did not name
  | 'empty';         // the model answered nothing usable

export interface VisionOutcome {
  reading: ImageReading | null;
  fail: VisionFail | null;
  /** The raw host/transport message — shown as a diagnostic, never swallowed. */
  detail: string | null;
}

type Ask = (prompt: string, images: { mimeType: string; data: string }[]) => Promise<unknown>;
type FetchImage = (url: string) => Promise<{ mimeType: string; data: string }>;

/**
 * A model answer is NOT always a string: the host returns
 * `{ success: false, errorCode }` as a perfectly ordinary resolved value, so
 * a refusal used to arrive here as an empty answer and read as "the model had
 * nothing to say". It is classified, not flattened.
 */
export function classifyAnswer(res: unknown): { text: string; fail: VisionFail | null; detail: string | null } {
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    if (r.success === false) {
      const code = asString(r.errorCode);
      const detail = asString(r.error) || code || 'refused';
      return {
        text: '',
        // An unnamed refusal is NOT an empty answer: "the model returned
        // nothing" is a verdict about the model, and nobody asked it anything.
        fail: code === 'NO_VISION' ? 'no-vision' : code === 'IMAGE_TOO_LARGE' ? 'too-large' : 'refused',
        detail,
      };
    }
    for (const key of ['text', 'content', 'answer', 'response', 'output']) {
      const v = r[key];
      if (typeof v === 'string' && v.trim()) return { text: v.trim(), fail: null, detail: null };
    }
    if (r.data) return classifyAnswer(r.data);
    if (r.result) return classifyAnswer(r.result);
  }
  if (typeof res === 'string' && res.trim()) return { text: res.trim(), fail: null, detail: null };
  return { text: '', fail: 'empty', detail: null };
}

/** Fetch one image and have it read. Never throws — every failure is named. */
export async function readImage(
  url: string,
  context: string,
  fetchImage: FetchImage,
  ask: Ask,
): Promise<VisionOutcome> {
  let image: { mimeType: string; data: string };
  try {
    image = await fetchImage(url);
  } catch (e) {
    return { reading: null, fail: 'unreachable', detail: e instanceof Error ? e.message : String(e) };
  }
  try {
    const { text, fail, detail } = classifyAnswer(await ask(buildImageReadPrompt(context), [image]));
    return text
      ? { reading: { url, text, at: new Date().toISOString() }, fail: null, detail: null }
      : { reading: null, fail: fail ?? 'empty', detail };
  } catch (e) {
    return { reading: null, fail: 'unreachable', detail: e instanceof Error ? e.message : String(e) };
  }
}
