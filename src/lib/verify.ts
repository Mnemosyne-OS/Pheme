/**
 * Verify & update — a draft written against a stale thread is a wasted reply.
 *
 * Before generation the thread is re-fetched: is it still up, how much
 * conversation arrived since the scan, and what are the freshest comments
 * (they become drafting context, so the reply lands in the discussion as it
 * IS, not as it was). After generation each draft passes cheap, transparent
 * checks — length for the venue, promo smell, link-dropping, language match.
 * Checks inform the human; they never block anything.
 */
import type { ScoredItem } from './score';
import { redditFetch } from './redditGate';
import { extractMedia, htmlToText } from './article';
import { isHumanVoice } from './authors';
import { ownLinkAllowed, rulesFor } from './rulebook';

/** An HN story that IS an image (rare, but it happens on Show HN). */
const MEDIA_URL = /\.(png|jpe?g|gif|webp|mp4|webm)(\?|$)/i;

type FetchUrl = (url: string) => Promise<{ status: number; body: string; contentType?: string }>;

const clip = (s: string, n = 140) => (s ?? '').slice(0, n);
const strip = htmlToText;

export interface ThreadCheck {
  alive: boolean;
  /** True when we could not check because Reddit is throttling, not because the thread died. */
  limited?: boolean;
  /** True when the check could not be made at all — unreachable, NOT dead. */
  unknown?: boolean;
  /** Comment count as the source reports it now (Reddit: feed entries, capped by the feed). */
  commentCount: number | null;
  /** Freshest comment snippets — drafting context. */
  recent: string[];
  /**
   * The POST itself, as it reads right now. Presence only reconstructs a few
   * threads per run (the Reddit budget is tight), so a conversation opened
   * from the inbox often carried an empty post body — and the drafter was
   * then asked to answer a thread it had never read. This is that gap closed:
   * the check that runs before every draft brings the post back with it.
   * Empty = the source gave none (a link post with no text), never a claim.
   */
  postBody: string;
  /**
   * Images or video the post carries. Their content is NOT read — this is the
   * list of what nobody looked at, so the UI can say so and the drafter can be
   * told not to imagine it. A screenshot with two lines of caption is the most
   * common shape of a Reddit post, and it used to arrive here as two lines of
   * caption with the substance silently dropped.
   */
  media: string[];
}

// The re-fetch exists to be MORE complete than the scan's listing entry —
// below the scan's own cap it would be a downgrade dressed as a refresh.
const POST_CLIP = 4000;
const EMPTY = { commentCount: null, recent: [] as string[], postBody: '', media: [] as string[] };

export async function refreshThread(item: ScoredItem, fetchUrl: FetchUrl): Promise<ThreadCheck> {
  try {
    if (item.network === 'hackernews') {
      const id = item.id.replace(/^hn_/, '');
      const r = await fetchUrl(`https://hn.algolia.com/api/v1/items/${encodeURIComponent(id)}`);
      // Unreachable ≠ dead: a transient Algolia error must not be reported
      // as "this thread no longer exists".
      if (r.status < 200 || r.status >= 300) return { alive: false, unknown: true, ...EMPTY };
      const data = JSON.parse(r.body) as {
        text?: string; url?: string;
        children?: { text?: string; author?: string; created_at?: string }[];
      };
      // Humans only, and only present ones: a bot's boilerplate quoted to the
      // drafter as "the freshest comments in the thread" is noise it may
      // answer, and "[removed]" is a placeholder, not speech (lib/authors.ts).
      const children = (data.children ?? [])
        .filter(c => isHumanVoice({ author: String(c.author ?? ''), body: String(c.text ?? '') }));
      const recent = [...children]
        .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
        .slice(0, 2)
        .map(c => clip(strip(String(c.text ?? ''))))
        .filter(Boolean);
      // A link post has no text of its own; the URL it points at IS its
      // content, and saying so beats handing the drafter nothing.
      const postBody = data.text
        ? strip(data.text).slice(0, POST_CLIP)
        : data.url ? `Link post — points at ${data.url}` : '';
      const media = data.url && MEDIA_URL.test(data.url) ? [data.url] : [];
      return { alive: true, commentCount: children.length, recent, postBody, media };
    }
    // Reddit: the thread's own Atom feed — first entry is the post. Goes
    // through the app-wide gate: a throttled check reports `limited`, so the
    // Studio never claims a thread died when Reddit was just walling us.
    const r = await redditFetch(fetchUrl, `${item.url.replace(/\/$/, '')}/.rss`);
    // Any transport refusal (403 wall, timeout, throttle) is UNKNOWN. Only a
    // feed we actually read and found empty justifies "dead".
    if (!r.ok) return { alive: false, unknown: true, limited: r.reason !== 'error', ...EMPTY };
    const doc = new DOMParser().parseFromString(r.body, 'text/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));
    if (entries.length === 0) return { alive: false, ...EMPTY };
    // Every subreddit's AutoModerator answers EVERY submission. Counting it
    // makes a thread nobody spoke in report "1 comment", and quoting it hands
    // the drafter a wiki link to react to.
    const comments = entries.slice(1).filter(el => isHumanVoice({
      author: el.getElementsByTagName('author')[0]?.getElementsByTagName('name')[0]?.textContent ?? '',
      body: el.getElementsByTagName('content')[0]?.textContent ?? '',
    }));
    const bodies = comments.map(el =>
      clip(strip(el.getElementsByTagName('content')[0]?.textContent ?? '')),
    ).filter(Boolean);
    // Media is read from the RAW content, before stripping: the href is the
    // only pointer to the substance and htmlToText discards it.
    const rawPost = entries[0]?.getElementsByTagName('content')[0]?.textContent ?? '';
    const postBody = strip(rawPost).slice(0, POST_CLIP);
    return {
      alive: true, commentCount: comments.length, recent: bodies.slice(-2),
      postBody, media: extractMedia(rawPost),
    };
  } catch {
    return { alive: false, unknown: true, ...EMPTY };
  }
}

// ── Post-draft checks ────────────────────────────────────────────────────────

export type CheckId =
  | 'length' | 'promo' | 'links' | 'language'
  /** Rule 1 — more mentions of yourself than the venue tolerates. */
  | 'selfRef'
  /** Rule 1 — the unnamed kind: "my OS", "my systems". Worse than a name. */
  | 'vagueSelfRef'
  /** Rule 2 — a link to your own product where the gate is shut. */
  | 'ownLink'
  /** Rule 6 — longer than the venue reads as an answer. */
  | 'sentences';
export interface DraftCheck { id: CheckId; ok: boolean }

/**
 * A reference to oneself. Deliberately first-person POSSESSIVE and "I built /
 * I wrote / I use" shapes — the ones that turn a reply into a résumé — and not
 * every "I", because "I think X is wrong" is a peer speaking.
 */
const SELF_REF = /\b(my|mine|our|ours|mon|ma|mes|notre|nos)\b|\b(i|we|j'ai|nous avons)\s+(built|wrote|made|shipped|run|use|ai\s|avons\s)/gi;

/**
 * The unnamed self-reference: a possessive plus a generic noun, with no name
 * attached. "I had to implement my own 2D layout for my OS" — the reader hears
 * an invitation to ask what the OS is, which is exactly the tell. Naming the
 * thing outright lands better than dangling it.
 */
const VAGUE_SELF_REF = /\b(my|our|mon|ma|mes|notre|nos)\s+(own\s+)?(os|app|tool|stack|system|systems|platform|product|project|engine|setup|infra|infrastructure|solution|outil|système|systèmes|plateforme|produit|projet|moteur)\b/i;

/**
 * Does this handle read as a PRODUCT rather than a person?
 *
 * A brand account explaining why "its" product fits reads as astroturfing even
 * when every word is sincere, and the author cannot see it from the inside —
 * they are just using the name they always use. This warns; it never blocks,
 * and it never renames anything.
 *
 * The sharp signal is the user's OWN wordmark appearing in the handle: that is
 * the exact configuration the reader punishes. The suffix list is the weaker
 * fallback for when no wordmark is set, and it is short on purpose — a false
 * warning on someone's real nickname teaches them to ignore the next one.
 *
 * @param brand The wordmark from the profile ('' when they set none).
 */
export function looksLikeBrandHandle(handle: string, brand = ''): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const h = norm(handle);
  if (h.length < 3) return false;
  const b = norm(brand);
  // Three characters of overlap is a coincidence; a real wordmark is longer.
  if (b.length >= 4 && (h.includes(b) || b.includes(h))) return true;
  return /^[a-z]{2,}(hq|labs|app|os|ai|io|dev|studio|soft|tech)$/.test(h);
}

/** Sentence count — the venue's real unit for "is this an answer or a speech?". */
export const countSentences = (text: string): number => sentencesOf(text).length;

/**
 * How many times a draft points at its author — counted in SENTENCES.
 *
 * The unit matters. Counting tokens made "I wrote my own 2D layout" score two
 * and fail a draft that mentions itself exactly once, which is the amount the
 * doctrine allows. A self-reference is an act, and the sentence is where an
 * act lives: "I had to implement my own layout for my OS to keep my graphs
 * readable" is one boast, not four.
 */
export function countSelfRefs(text: string): number {
  return sentencesOf(text).filter(s => new RegExp(SELF_REF.source, 'i').test(s)).length;
}

/** Sentences, or the whole text when it carries no terminator at all. */
function sentencesOf(text: string): string[] {
  const found = (text.match(/[^\s.!?…]+[^.!?…]*[.!?…]+/g) ?? [])
    .map(s => s.trim())
    .filter(s => s.length > 1);
  return found.length > 0 ? found : (text.trim() ? [text.trim()] : []);
}

const FR_STOPS = [' le ', ' la ', ' les ', ' une ', ' est ', ' pour ', ' dans ', ' avec ', ' mais ', ' pas '];
const EN_STOPS = [' the ', ' is ', ' for ', ' with ', ' that ', ' this ', ' not ', ' are ', ' have ', ' you '];

function dominantLang(text: string): 'fr' | 'en' | 'unknown' {
  const t = ` ${text.toLowerCase()} `;
  const fr = FR_STOPS.reduce((n, w) => n + (t.split(w).length - 1), 0);
  const en = EN_STOPS.reduce((n, w) => n + (t.split(w).length - 1), 0);
  if (fr < 2 && en < 2) return 'unknown';
  return fr > en ? 'fr' : 'en';
}

/** The words that make a reply read as an ad. Extend with your own product names. */
const PROMO_SMELL = /mnemosyne|my (app|product|tool|startup|saas)|check out my|i built a|we built a/i;

/**
 * A link that points at the user's OWN thing. Not every URL — quoting a spec
 * or a repo is what peers do; it is the self-pointing one that turns a reply
 * into an advert, and rule 2 shuts it wherever the gate is shut.
 */
const PROMO_LINK = /https?:\/\/\S*(mnemosyne|mnemo)\S*/i;

/**
 * Every check a draft has to face before a human posts it under their name.
 *
 * They INFORM, they never block — the author is the one who decides. But they
 * are the difference between noticing "this reads like a brand account" here
 * and learning it from the thread, where the perception is unrecoverable.
 *
 * @param netId The venue, which sets the thresholds (`rulebook.DraftDoctrine`).
 *   Omitted, the strictest reading applies: it is better to over-warn on a
 *   surface we could not identify than to wave a résumé through onto HN.
 */
export function checkDraft(draft: string, threadSample: string, netId = 'hackernews'): DraftCheck[] {
  const draftLang = dominantLang(draft);
  const threadLang = dominantLang(threadSample);
  const doctrine = rulesFor(netId).draft;
  return [
    { id: 'sentences', ok: countSentences(draft) <= doctrine.maxSentences },
    { id: 'length', ok: draft.length <= 1100 },
    { id: 'selfRef', ok: countSelfRefs(draft) <= doctrine.maxSelfRefs },
    { id: 'vagueSelfRef', ok: !VAGUE_SELF_REF.test(draft) },
    { id: 'promo', ok: !PROMO_SMELL.test(draft) },
    // A bare link is always worth flagging; one pointing at the user's own
    // product where the gate is SHUT is the rule-2 violation proper.
    { id: 'links', ok: !/https?:\/\//i.test(draft) },
    { id: 'ownLink', ok: ownLinkAllowed(netId) || !PROMO_LINK.test(draft) },
    { id: 'language', ok: draftLang === 'unknown' || threadLang === 'unknown' || draftLang === threadLang },
  ];
}
