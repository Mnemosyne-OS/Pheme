/**
 * Readable-text extraction for LINK posts. Half of Hacker News is a URL with
 * no story text — the conversation is about a page Pheme has not read. The
 * host fetch brings the page in (no CORS wall), and this trims it to the
 * prose: article/main first, chrome elements dropped, whitespace collapsed.
 * Best-effort by design — a paywall or an SPA returns little, and the UI
 * says so instead of pretending.
 */

type FetchUrl = (url: string) => Promise<{
  status: number; body: string; contentType?: string; encoding?: string;
}>;

/**
 * HTML fragment → readable text. Algolia serves story/comment text as HTML
 * (`<p>`, `&#x2F;`…) and Reddit's Atom content is HTML too. Block tags become
 * line breaks BEFORE parsing so paragraphs survive; DOMParser decodes the
 * entities. Cheap no-op for plain text.
 */
export function htmlToText(raw: string): string {
  const s = raw ?? '';
  if (!/[<&]/.test(s)) return s.trim();
  const withBreaks = s.replace(/<\/?(p|br|li|div|blockquote|h[1-6])[^>]*>/gi, '\n');
  let text: string;
  try { text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? ''; }
  catch { text = withBreaks.replace(/<[^>]*>/g, ''); }
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const STRIP = ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'svg', 'form', 'iframe', 'figure'];
const MAX_CHARS = 6000;

/**
 * Why an article is not on screen. "Could not extract" covered all of these
 * at once, which sent the reader looking for a parser bug when the site had
 * simply refused the request — try.agentoid.io answers 403 to anything that
 * is not a browser, and the UI said nothing about it.
 */
export type ArticleFail = 'refused' | 'empty' | 'unreachable' | 'notText';

/**
 * What this reader can actually read. Anything else — a PDF, an image, a zip —
 * is not a page with prose in it, and it must be SAID rather than parsed.
 *
 * Half of Hacker News links straight at a PDF. Decoded as UTF-8 and run
 * through DOMParser, a PDF yields several kilobytes of replacement characters,
 * which sails past the "at least 200 chars" check and becomes "the article":
 * displayed to the user as what the thread is about, and translatable — a paid
 * call on binary noise. An unreadable document is not an article, and guessing
 * that it is, is the same fabricated value as the rest.
 */
const TEXTUAL = /^(text\/|application\/(xhtml\+xml|xml|json))/i;

export interface ArticleRead {
  text: string;
  reason: ArticleFail | null;
  /** The HTTP status, when there was one — the difference between 403 and 500. */
  status?: number;
}

export async function fetchArticleText(url: string, fetchUrl: FetchUrl): Promise<ArticleRead> {
  try {
    const r = await fetchUrl(url);
    // The site answered, and its answer was no. Not a parsing problem.
    if (r.status < 200 || r.status >= 300) return { text: '', reason: 'refused', status: r.status };
    // Not prose, and the host said so — either explicitly (it handed back
    // base64 because the body is binary) or through the content type. Parsing
    // it anyway is how a PDF became "the article" (see TEXTUAL above).
    const type = (r.contentType ?? '').split(';')[0].trim();
    if (r.encoding === 'base64' || (type && !TEXTUAL.test(type))) {
      return { text: '', reason: 'notText', status: r.status };
    }
    const doc = new DOMParser().parseFromString(r.body, 'text/html');
    for (const sel of STRIP) doc.querySelectorAll(sel).forEach(el => el.remove());
    const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
    const text = (root?.textContent ?? '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // A page that yields almost nothing is an extraction failure, not an
    // article — an SPA shell or a paywall, and the reader deserves the word.
    return text.length >= 200
      ? { text: text.slice(0, MAX_CHARS), reason: null, status: r.status }
      : { text: '', reason: 'empty', status: r.status };
  } catch {
    return { text: '', reason: 'unreachable' };
  }
}

/**
 * The media a post carries. Half of r/antiai (and most of Reddit) is a
 * SCREENSHOT with two lines of caption: strip the HTML and you keep
 * "[link] [comments]" while the entire substance — the thing the thread is
 * actually about — walks out with the href. Pulling the urls back means Pheme
 * can at least SAY the post is an image it has not read, instead of drafting
 * a confident reply to a caption.
 *
 * Extraction only. Reading them is another matter (OCR/vision), and the point
 * of this function is that the difference stops being invisible.
 */
const MEDIA_HOST = /(i\.redd\.it|preview\.redd\.it|v\.redd\.it|i\.imgur\.com|pbs\.twimg\.com)/i;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|mp4|webm)(\?|$)/i;

export function extractMedia(html: string): string[] {
  const out = new Set<string>();
  for (const m of (html ?? '').matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    // Feeds carry &amp; inside urls; a half-decoded url opens nothing.
    const url = (m[1] ?? '').replace(/&amp;/gi, '&').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (MEDIA_HOST.test(url) || MEDIA_EXT.test(url)) out.add(url);
  }
  return [...out].slice(0, 4);
}

/** True when a stored "body" is actually just the outbound link of a link post. */
export function isBareUrl(body: string): string | null {
  const trimmed = (body ?? '').trim();
  return /^https?:\/\/\S+$/.test(trimmed) ? trimmed : null;
}
