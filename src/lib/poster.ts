/**
 * Branded post visuals — the model writes the WORDS, the template does the LOOK.
 *
 * The old path asked a language model to invent an entire vector illustration
 * ("3-5 flat colors on a light background, strong central metaphor"). A text
 * model has no visual judgement: asked to draw, it returns the same rounded
 * rectangles and connecting dots every time, on a white plate that contradicts
 * the brand it is supposed to represent.
 *
 * So the roles are inverted. Nothing is drawn at runtime. This is the brand
 * lockup from `apps/infinity-edition/scripts/gen-banner.cjs` — the same plate
 * gradient, the same violet blooms, the same faint constellation, the same
 * lemniscate — generalised to any canvas, with a few strings left blank for
 * the model to fill.
 *
 * The long version (0.6.6) adds the two axes a one-template studio could not
 * give: **four layouts** for four kinds of claim, and **an explicit format**
 * instead of the network's default. Both are pure re-renders — the copy is
 * paid for once, and trying a layout or a canvas afterwards costs nothing.
 * That separation is the design: the expensive step is the words.
 */
import type { PubNetwork } from './stories';

/**
 * The mark. Byte-identical to the path in `scripts/brand-mark.cjs` and in
 * `build/icon.svg` — the app icon, the boot sigil and every social asset are
 * literally the same drawing. `poster.test.ts` reads the host file and fails
 * if these two ever diverge.
 */
export const MARK = 'M32 32 C32 18 46 18 60 32 C74 46 88 46 88 32 C88 18 74 18 60 32 C46 46 32 46 32 32 Z';
const STROKE = 5.848;
/** The strand crosses in FRONT at 225/300 — a short casing dash knocks it out. */
const CROSSING = { pathLength: 300, dasharray: '14 286', dashoffset: -218 };
/** What the plate + bloom composite to at the mark's centre. Never the plate ink. */
const CASING = '#291F49';

const INK = '#F4F1FA';
const ACCENT = '#A98BFF';
const MUTED = '#8E88A0';

export interface PosterSize { w: number; h: number; label: string }

/**
 * One canvas per surface, at the size each actually publishes. The old code
 * emitted 800x450 for everything, so an Instagram post was upscaled from a
 * landscape plate and a LinkedIn card was cropped.
 */
export const POSTER_SIZES: Record<PubNetwork, PosterSize> = {
  x: { w: 1600, h: 900, label: '1600×900' },
  linkedin: { w: 1200, h: 627, label: '1200×627' },
  bluesky: { w: 1200, h: 630, label: '1200×630' },
  mastodon: { w: 1200, h: 630, label: '1200×630' },
  threads: { w: 1080, h: 1350, label: '1080×1350' },
  // Medium's article header is a wide banner, not a card.
  medium: { w: 1400, h: 787, label: '1400×787' },
};

/** Surfaces not composable yet — sized in advance so going live is one flag. */
const FUTURE_SIZES: Record<string, PosterSize> = {
  instagram: { w: 1080, h: 1350, label: '1080×1350' },
  facebook: { w: 1200, h: 630, label: '1200×630' },
  producthunt: { w: 1270, h: 760, label: '1270×760' },
  youtube: { w: 1280, h: 720, label: '1280×720' },
  tiktok: { w: 1080, h: 1920, label: '1080×1920' },
};

const DEFAULT_SIZE: PosterSize = { w: 1200, h: 630, label: '1200×630' };

/** Never throws on an id it does not know — an unknown surface gets the OG card. */
export const posterSize = (net: string): PosterSize =>
  POSTER_SIZES[net as PubNetwork] ?? FUTURE_SIZES[net] ?? DEFAULT_SIZE;

// ── Formats: the canvas is a CHOICE, not the network's opinion ───────────────

/**
 * `native` follows the surface. The rest exist because one post is often
 * published in three places, and because a portrait canvas is worth far more
 * feed height than the landscape card a network nominally asks for.
 */
export type FormatId = 'native' | 'wide' | 'og' | 'square' | 'portrait' | 'story';

const FIXED_FORMATS: Record<Exclude<FormatId, 'native'>, PosterSize> = {
  wide: { w: 1600, h: 900, label: '1600×900' },
  og: { w: 1200, h: 630, label: '1200×630' },
  square: { w: 1080, h: 1080, label: '1080×1080' },
  portrait: { w: 1080, h: 1350, label: '1080×1350' },
  story: { w: 1080, h: 1920, label: '1080×1920' },
};

export const FORMATS: FormatId[] = ['native', 'wide', 'og', 'square', 'portrait', 'story'];

/** @returns The canvas for a network + chosen format. `native` defers to the surface. */
export function sizeFor(net: string, format: FormatId = 'native'): PosterSize {
  return format === 'native' ? posterSize(net) : FIXED_FORMATS[format];
}

// ── Templates: four kinds of claim, four layouts ─────────────────────────────

/**
 * What the poster IS, not how it is decorated. Each one exists because a post
 * makes a different kind of point, and a single layout flattened all four into
 * the same headline:
 *
 *  - `lockup`  — the claim, under the brand. The default and the safe one.
 *  - `quote`   — a sentence worth reading verbatim, with who said it.
 *  - `stat`    — one number that IS the post. The number carries the canvas.
 *  - `cover`   — a title page. Long form: what this piece is, and by whom.
 */
export type PosterTemplate = 'lockup' | 'quote' | 'stat' | 'cover';

export const TEMPLATES: PosterTemplate[] = ['lockup', 'quote', 'stat', 'cover'];

export interface PosterCopy {
  /** Small tracked line above the headline — the category, not a sentence. */
  kicker: string;
  /** The claim. The only thing anyone reads. */
  headline: string;
  /** One line of support underneath. */
  sub: string;
  /**
   * `stat` only: the number itself ("72.9%", "3×", "1 200"). Absent when the
   * post carries no number — and then the stat template is not offered, rather
   * than a zero being invented to fill the hole.
   */
  stat?: string;
  /** `quote` only: who said it. */
  attribution?: string;
}

/**
 * Can this copy be rendered in this layout? A `stat` poster without a number
 * would be a large empty plate, and inventing "0" to fill it is exactly the
 * fabricated value this codebase hunts. The studio greys the template out and
 * says why, instead of rendering a lie.
 */
export function templateFits(copy: PosterCopy, template: PosterTemplate): boolean {
  if (template === 'stat') return !!copy.stat?.trim();
  return !!copy.headline.trim();
}

// ── The prompt: words, never a drawing ──────────────────────────────────────

/**
 * Ask for WORDS, never for a drawing. Returns JSON so the parse is exact and
 * a refusal is visible instead of arriving as a shape nobody can render.
 *
 * Every field for every template is asked for in ONE call: the copy is the
 * paid step, and paying again to try another layout is what would stop anyone
 * from trying another layout. `stat` and `attribution` are explicitly
 * optional — a post with no number must come back without one.
 */
export function buildPosterPrompt(postText: string): string {
  return [
    'Extract the poster copy for this social post. You are writing TEXT for a',
    'branded template — never describe, draw or output an image.',
    '',
    `POST: "${postText.slice(0, 700)}"`,
    '',
    'Answer with ONLY this JSON, nothing around it:',
    '{"kicker":"…","headline":"…","sub":"…","stat":"…","attribution":"…"}',
    '',
    'kicker: 1-3 words, the subject area (e.g. "RETRIEVAL", "LOCAL AI"). UPPERCASE.',
    'headline: the post\'s single strongest claim, max 60 characters, no hashtags,',
    '  no quotes, no trailing period. It must be a claim, not a summary.',
    'sub: one supporting line, max 90 characters.',
    'stat: the ONE number the post rests on, with its unit ("72.9%", "3×", "1.2s").',
    '  Leave it as "" if the post contains no number — never invent or round one.',
    'attribution: who the claim comes from, if the post says ("the 2026 bench",',
    '  a person, a project). "" when the post does not say.',
    'Use the post\'s own language. Invent nothing that is not in the post.',
  ].join('\n');
}

/** Strict parse — a shape we cannot use returns null rather than half a poster. */
export function parsePosterCopy(raw: string): PosterCopy | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const str = (v: unknown, max: number) =>
      (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);
    const headline = str(j.headline, 90);
    if (!headline) return null;
    const stat = str(j.stat, 12);
    return {
      kicker: str(j.kicker, 28).toUpperCase(),
      headline,
      sub: str(j.sub, 120),
      // A model asked for an optional number answers "N/A", "none", "-" as
      // often as "". Those are absences wearing a value's clothes, and one of
      // them on a stat poster is a 300px "N/A".
      ...(stat && !/^(n\/?a|none|null|-|—|0)$/i.test(stat) ? { stat } : {}),
      ...(str(j.attribution, 60) ? { attribution: str(j.attribution, 60) } : {}),
    };
  } catch { return null; }
}

const escapeXml = (v: string): string => v.replace(/[<>&'"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));

/**
 * Break a line to fit a width. SVG has no auto-wrap, and a headline that runs
 * off the plate is worse than one that wraps: the estimate is deliberate and
 * conservative (0.56em average advance for this weight).
 */
export function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length > 0 ? lines : [text.slice(0, maxChars)];
}

/** The lemniscate as a positioned group — same construction as the host's. */
function markGroup(cx: number, cy: number, width: number): string {
  const scale = width / 56;
  const { pathLength, dasharray, dashoffset } = CROSSING;
  return `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-60 -32)">
    <g filter="url(#glow)" opacity="0.5">
      <path d="${MARK}" fill="none" stroke="url(#flow)" stroke-width="${STROKE}" stroke-linecap="round"/>
    </g>
    <path d="${MARK}" fill="none" stroke="url(#flow)" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${MARK}" fill="none" stroke="${CASING}" stroke-width="${(STROKE * 1.515).toFixed(3)}" stroke-linecap="butt"
      pathLength="${pathLength}" stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset}"/>
    <path d="${MARK}" fill="none" stroke="url(#flow)" stroke-width="${STROKE}" stroke-linecap="round"
      pathLength="${pathLength}" stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset}"/>
  </g>`;
}

/** The plate: gradients, blooms, filters. Identical across every template. */
function defs(w: number, h: number): string {
  return `<defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#17131F"/>
      <stop offset="55%" stop-color="#120F19"/>
      <stop offset="100%" stop-color="#0B0910"/>
    </linearGradient>
    <radialGradient id="bloom" cx="26%" cy="${h > w ? '30%' : '46%'}" r="52%">
      <stop offset="0%" stop-color="#6C4BC4" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#6C4BC4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloom2" cx="84%" cy="14%" r="46%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7B5EA7"/>
      <stop offset="45%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="#E4D6FF"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-160%" width="220%" height="420%">
      <feGaussianBlur stdDeviation="1.418"/>
    </filter>
  </defs>`;
}

/**
 * The background. `corner` places the faint constellation away from whatever
 * the template puts in the top-right — a centred cover title ran straight
 * through it.
 */
function background(w: number, h: number, unit: number, corner: 'right' | 'left' = 'right'): string {
  const x = (f: number) => (corner === 'right' ? w * f : w * (1 - f));
  return `<rect width="${w}" height="${h}" fill="url(#plate)"/>
  <rect width="${w}" height="${h}" fill="url(#bloom)"/>
  <rect width="${w}" height="${h}" fill="url(#bloom2)"/>
  <!-- The neural constellation: evokes the map without competing with the copy. -->
  <g stroke="${ACCENT}" stroke-opacity="0.20" fill="${ACCENT}" fill-opacity="0.28">
    <g stroke-width="1" fill="none">
      <path d="M${x(0.72)} ${h * 0.10} L${x(0.84)} ${h * 0.05} L${x(0.94)} ${h * 0.14} L${x(0.83)} ${h * 0.21} Z"/>
      <path d="M${x(0.84)} ${h * 0.05} L${x(0.83)} ${h * 0.21}"/>
    </g>
    <circle cx="${x(0.72)}" cy="${h * 0.10}" r="${unit * 0.006}"/>
    <circle cx="${x(0.84)}" cy="${h * 0.05}" r="${unit * 0.008}"/>
    <circle cx="${x(0.94)}" cy="${h * 0.14}" r="${unit * 0.005}"/>
    <circle cx="${x(0.83)}" cy="${h * 0.21}" r="${unit * 0.007}"/>
  </g>`;
}

/** The signature strip every template closes on. */
const baseline = (w: number, h: number): string =>
  `<rect x="0" y="${h - 2}" width="${w}" height="2" fill="rgba(255,255,255,0.08)"/>`;

const FONT = "'Segoe UI', 'Inter', system-ui, sans-serif";

/** Geometry every template derives from, so four layouts stay one system. */
function metrics(size: PosterSize) {
  const { w, h } = size;
  // Type scales off the SHORT side, so a tall canvas does not get giant text.
  const unit = Math.min(w, h);
  return {
    w, h, unit,
    pad: Math.round(unit * 0.085),
    // A SQUARE counts as portrait: it has the same problem — placed at a
    // fraction of the height like a landscape card, the claim floats in the
    // middle and the foot of the plate reads as an unfinished export.
    portrait: h >= w,
    markW: Math.round(unit * 0.14),
    kickSize: Math.round(unit * 0.026),
    subSize: Math.round(unit * 0.032),
  };
}

/** How many characters fit on a line at this size — the wrap's only input. */
const fitChars = (w: number, pad: number, fontSize: number) =>
  Math.max(10, Math.floor((w - pad * 2) / (fontSize * 0.56)));

/**
 * Where a centred block starts, measured in the space the brand LEAVES —
 * not on the whole plate. Centring on the full height puts the block's middle
 * at the plate's middle, but the brand already occupies the top: the result
 * sits visually high and the foot of a portrait canvas reads as empty.
 */
/**
 * The baseline a bottom-anchored block sits on. A 4:5 poster is flush with the
 * foot; a 9:16 STORY is not — pinned to the bottom of a 1920px plate the claim
 * ends up below where a phone's own UI overlays it, with a void above. Tall
 * canvases stop at 80%.
 */
const footY = (m: M): number =>
  (m.h / m.w > 1.5 ? m.h * 0.80 : m.h - m.pad * 1.1);

const centeredTop = (m: M, afterY: number, blockH: number): number => {
  const top = afterY + m.pad * 0.6;
  const bottom = m.h - m.pad;
  return Math.max(top, top + (bottom - top - blockH) / 2);
};

export interface RenderOptions {
  /** Which layout. Defaults to the historical one. */
  template?: PosterTemplate;
  /**
   * The user's own brand line. It used to be the literal string
   * 'MNEMOSYNE OS', hardcoded — which is correct for exactly one user of a
   * cartridge meant to be installed by anyone else. Empty = no wordmark, and
   * the layout closes the gap rather than leaving a hole.
   */
  wordmark?: string;
}

/**
 * The poster. Everything scales off the canvas, so the same lockup holds from
 * a 1600×900 card to a 1080×1920 story — the banner script could not, which is
 * why it says in its own header that this belongs in a cartridge.
 *
 * Fonts are SYSTEM fonts on purpose: an SVG rasterised through <img> into a
 * canvas cannot fetch a webfont, and a missing face silently reflows the whole
 * lockup. A custom face would have to be embedded as a data-URI.
 */
export function renderPoster(copy: PosterCopy, size: PosterSize, opts: RenderOptions = {}): string {
  const asked = opts.template ?? 'lockup';
  /**
   * The guard lives WITH the render, not only with the button that offers the
   * layout. Asked for a `stat` plate on copy carrying no number, this used to
   * emit a 189px text node containing nothing — a hole where the whole point
   * of the poster should be. `templateFits` is the same predicate the studio
   * greys the button out with; here it is the last word.
   */
  const template = templateFits(copy, asked) ? asked : 'lockup';
  const wordmark = (opts.wordmark ?? '').trim();
  const m = metrics(size);
  const body =
    template === 'quote' ? quoteBody(copy, m, wordmark)
      : template === 'stat' ? statBody(copy, m, wordmark)
        : template === 'cover' ? coverBody(copy, m, wordmark)
          : lockupBody(copy, m, wordmark);
  const corner = template === 'cover' ? 'left' : 'right';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.w} ${m.h}" width="${m.w}" height="${m.h}">
  ${defs(m.w, m.h)}
  ${background(m.w, m.h, m.unit, corner)}
  ${body}
  ${baseline(m.w, m.h)}
</svg>`;
}

type M = ReturnType<typeof metrics>;

/** The brand block: mark, then the wordmark line under it. Returns both the
 *  markup and the y the next element may start at. */
function brandBlock(m: M, wordmark: string): { svg: string; nextY: number } {
  const markCy = m.pad + m.markW * 0.34;
  const wordY = markCy + m.markW * 0.55;
  const mark = markGroup(m.pad + m.markW * 0.5, markCy, m.markW);
  if (!wordmark) return { svg: mark, nextY: markCy + m.markW * 0.5 };
  return {
    svg: `${mark}
  <text x="${m.pad}" y="${wordY}" fill="${INK}" font-family="${FONT}" font-size="${m.kickSize * 1.25}" font-weight="600" letter-spacing="${m.kickSize * 0.34}">${escapeXml(wordmark)}</text>`,
    nextY: wordY,
  };
}

/** kicker + its fading rule. '' renders nothing at all — no empty band. */
function kickerBlock(copy: PosterCopy, m: M, y: number): string {
  if (!copy.kicker) return '';
  return `<rect x="${m.pad}" y="${y - m.kickSize * 1.5}" width="${Math.min(m.w - m.pad * 2, m.unit * 0.5)}" height="1" fill="url(#rule)"/>
  <text x="${m.pad}" y="${y}" fill="${ACCENT}" font-family="${FONT}" font-size="${m.kickSize}" font-weight="600" letter-spacing="${m.kickSize * 0.38}">${escapeXml(copy.kicker)}</text>`;
}

/** THE original layout — brand, kicker, claim, support. */
function lockupBody(copy: PosterCopy, m: M, wordmark: string): string {
  const headSize = Math.round(m.unit * 0.082);
  const { svg: brand, nextY } = brandBlock(m, wordmark);
  const kickY = nextY + m.kickSize * 2.1;
  const lines = wrapText(copy.headline, fitChars(m.w, m.pad, headSize), m.portrait ? 4 : 3);
  /**
   * Portrait is BOTTOM-anchored: brand at the top, claim at the foot, plate
   * breathing between them. Placed at a fraction of the height like the
   * landscape card, a 1080×1350 poster left a third of itself empty below
   * the last line, and a 1080×1920 story left half — dead space that reads as
   * an unfinished export, not as air.
   */
  const headTop = m.portrait
    ? footY(m) - (copy.sub ? m.subSize * 2.1 : 0) - headSize * 1.16 * (lines.length - 1)
    : Math.max(kickY + headSize * 1.5, m.h * 0.42);
  return `${brand}
  <g font-family="${FONT}">
    ${kickerBlock(copy, m, kickY)}
    <text x="${m.pad}" y="${headTop}" fill="${INK}" font-size="${headSize}" font-weight="600" letter-spacing="${(headSize * 0.005).toFixed(2)}">
      ${lines.map((l, i) => `<tspan x="${m.pad}" dy="${i === 0 ? 0 : headSize * 1.16}">${escapeXml(l)}</tspan>`).join('\n      ')}
    </text>
    ${copy.sub
      ? `<text x="${m.pad}" y="${headTop + headSize * 1.16 * lines.length + m.subSize * 0.9}" fill="${MUTED}" font-size="${m.subSize}" font-weight="400">${escapeXml(copy.sub)}</text>`
      : ''}
  </g>`;
}

/**
 * A sentence worth reading verbatim. The quote mark is a drawn glyph, not a
 * character: at this size a typographic " is a font lottery.
 */
function quoteBody(copy: PosterCopy, m: M, wordmark: string): string {
  // A quote is the copy, not a caption to it: on a landscape card 0.064 of the
  // short side read as body text sitting in a lot of plate.
  const quoteSize = Math.round(m.unit * (m.portrait ? 0.072 : 0.082));
  const lines = wrapText(copy.headline, fitChars(m.w, m.pad * 1.35, quoteSize), m.portrait ? 6 : 4);
  const { svg: brand, nextY } = brandBlock(m, wordmark);
  const blockH = lines.length * quoteSize * 1.24;
  /**
   * The WHOLE citation is centred — quote, attribution and support together.
   * Centring the quote alone hung the attribution below the optical middle
   * and left the bottom third empty on a portrait plate.
   */
  const tailH = (copy.attribution ? m.subSize * 1.3 : 0) + (copy.sub ? m.subSize * 1.5 : 0);
  const top = centeredTop(m, nextY, blockH + tailH) + quoteSize * 0.75;
  const barX = m.pad;
  const textX = m.pad + Math.round(m.unit * 0.055);
  return `${brand}
  <g font-family="${FONT}">
    <!-- The bar carries the "this is a quotation" signal; the glyph confirms it. -->
    <rect x="${barX}" y="${top - quoteSize}" width="${Math.max(3, Math.round(m.unit * 0.006))}" height="${blockH + quoteSize * 0.3}" fill="${ACCENT}" opacity="0.55"/>
    <text x="${textX}" y="${top}" fill="${INK}" font-size="${quoteSize}" font-weight="500" letter-spacing="${(quoteSize * 0.002).toFixed(2)}">
      ${lines.map((l, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : quoteSize * 1.24}">${escapeXml(i === 0 ? `“${l}` : l)}${i === lines.length - 1 ? '”' : ''}</tspan>`).join('\n      ')}
    </text>
    ${copy.attribution
      ? `<text x="${textX}" y="${top + blockH + m.subSize * 1.3}" fill="${ACCENT}" font-size="${m.subSize * 0.92}" font-weight="600" letter-spacing="${m.subSize * 0.06}">— ${escapeXml(copy.attribution)}</text>`
      : ''}
    ${copy.sub
      ? `<text x="${textX}" y="${top + blockH + m.subSize * (copy.attribution ? 2.8 : 1.3)}" fill="${MUTED}" font-size="${m.subSize * 0.86}" font-weight="400">${escapeXml(copy.sub)}</text>`
      : ''}
  </g>`;
}

/**
 * One number that IS the post. The number takes the canvas; everything else
 * is a caption to it. Never rendered without a real figure — `templateFits`
 * refuses, because a stat plate reading "0" would be a fabricated result.
 */
function statBody(copy: PosterCopy, m: M, wordmark: string): string {
  const stat = (copy.stat ?? '').trim();
  // The figure is sized to FIT, not to a fixed scale: "3×" and "1 240 ms"
  // cannot share one font size without one of them leaving the plate.
  const statSize = Math.round(Math.min(m.unit * 0.30, ((m.w - m.pad * 2) / Math.max(2, stat.length)) * 1.55));
  const headSize = Math.round(m.unit * 0.048);
  const { svg: brand, nextY } = brandBlock(m, wordmark);
  const cx = m.w / 2;
  const lines = wrapText(copy.headline, fitChars(m.w, m.pad, headSize), 2);

  /**
   * The whole figure-and-caption block is centred as ONE object. Pinning the
   * number to a fraction of the height worked on a landscape card and left
   * the bottom 40% of a portrait plate empty.
   *
   * `statSize * 0.74` is the cap height of the digits: a font-size is not a
   * visual height, and centring on the em box hangs the number high.
   */
  const kickH = copy.kicker ? m.kickSize * 2.2 : 0;
  const capH = statSize * 0.74;
  const ruleGap = headSize * 0.95;
  const headH = lines.length * headSize * 1.2;
  const subH = copy.sub ? m.subSize * 1.6 : 0;
  const blockTop = centeredTop(m, nextY, kickH + capH + ruleGap + headH + subH);
  const statY = blockTop + kickH + capH;
  // Well clear of the figure: at this size a rule 20px under the baseline
  // reads as an underline crossing the digits, not as a separator.
  const ruleY = statY + ruleGap * 0.8;
  const headTop = statY + ruleGap + headSize;

  return `${brand}
  <g font-family="${FONT}" text-anchor="middle">
    ${copy.kicker
      ? `<text x="${cx}" y="${blockTop + m.kickSize}" fill="${ACCENT}" font-size="${m.kickSize}" font-weight="600" letter-spacing="${m.kickSize * 0.38}">${escapeXml(copy.kicker)}</text>`
      : ''}
    <text x="${cx}" y="${statY}" fill="${INK}" font-size="${statSize}" font-weight="700" letter-spacing="${(statSize * -0.02).toFixed(2)}">${escapeXml(stat)}</text>
    <rect x="${cx - m.unit * 0.09}" y="${ruleY}" width="${m.unit * 0.18}" height="1" fill="${ACCENT}" opacity="0.5"/>
    <text x="${cx}" y="${headTop}" fill="${INK}" font-size="${headSize}" font-weight="600">
      ${lines.map((l, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : headSize * 1.2}">${escapeXml(l)}</tspan>`).join('\n      ')}
    </text>
    ${copy.sub
      ? `<text x="${cx}" y="${headTop + headH + m.subSize * 0.4}" fill="${MUTED}" font-size="${m.subSize * 0.88}" font-weight="400">${escapeXml(copy.sub)}</text>`
      : ''}
  </g>`;
}

/**
 * A title page. Long form (Medium) publishes a header, not a card: the piece
 * announces itself, centred, with room above and below.
 */
function coverBody(copy: PosterCopy, m: M, wordmark: string): string {
  const titleSize = Math.round(m.unit * (m.portrait ? 0.086 : 0.076));
  const cx = m.w / 2;
  const lines = wrapText(copy.headline, fitChars(m.w, m.pad * 1.6, titleSize), m.portrait ? 5 : 3);
  const blockH = lines.length * titleSize * 1.16;
  const top = (m.h - blockH) / 2 + titleSize * 0.5;
  // The mark leads, centred above the title — this is the one layout where
  // the brand is the opening beat rather than a corner signature.
  const markCy = Math.max(m.pad + m.markW * 0.4, top - blockH * 0.5 - m.markW * 0.9);
  return `${markGroup(cx, markCy, m.markW)}
  <g font-family="${FONT}" text-anchor="middle">
    ${wordmark
      ? `<text x="${cx}" y="${markCy + m.markW * 0.62}" fill="${INK}" font-size="${m.kickSize * 1.1}" font-weight="600" letter-spacing="${m.kickSize * 0.34}">${escapeXml(wordmark)}</text>`
      : ''}
    ${copy.kicker
      ? `<text x="${cx}" y="${top - titleSize * 0.95}" fill="${ACCENT}" font-size="${m.kickSize}" font-weight="600" letter-spacing="${m.kickSize * 0.38}">${escapeXml(copy.kicker)}</text>`
      : ''}
    <text x="${cx}" y="${top}" fill="${INK}" font-size="${titleSize}" font-weight="600" letter-spacing="${(titleSize * -0.005).toFixed(2)}">
      ${lines.map((l, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : titleSize * 1.16}">${escapeXml(l)}</tspan>`).join('\n      ')}
    </text>
    <rect x="${cx - m.unit * 0.06}" y="${top + blockH - titleSize * 0.5 + m.subSize * 0.9}" width="${m.unit * 0.12}" height="1" fill="${ACCENT}" opacity="0.55"/>
    ${copy.sub
      ? `<text x="${cx}" y="${top + blockH - titleSize * 0.5 + m.subSize * 2.4}" fill="${MUTED}" font-size="${m.subSize * 0.92}" font-weight="400">${escapeXml(copy.sub)}</text>`
      : ''}
    ${copy.attribution
      ? `<text x="${cx}" y="${m.h - m.pad}" fill="${MUTED}" font-size="${m.subSize * 0.8}" font-weight="500" letter-spacing="${m.subSize * 0.05}">${escapeXml(copy.attribution)}</text>`
      : ''}
  </g>`;
}
