/**
 * Publication studio — the VOICE side of reputation. Stories are threads
 * composed for the promotion/expression surfaces (X now, LinkedIn next),
 * generated from the user's own memory, illustrated in SVG, and tracked.
 *
 * The boundary that keeps Pheme honest: participation networks (Reddit,
 * HN) never see a publish path — and even here, V1 is composer-only: the
 * app builds the story, the HUMAN posts it. Marking a promo story as
 * posted writes the 9:1 ledger, so the Coach sees promo pressure across
 * every network, not just where it listens.
 */

import { witLine } from './drafts';
import { NETWORKS, type NetworkDef } from './networks';
import type { FormatId, PosterCopy, PosterTemplate } from './poster';

/** The composable promotion surfaces. Widens as networks go live. */
export type PubNetwork = 'x' | 'linkedin' | 'bluesky' | 'mastodon' | 'threads' | 'medium';

export interface PubNetworkDef extends NetworkDef { id: PubNetwork; limit: number }

/** Typed view over THE registry (networks.ts) — never a second list. */
export const PUB_NETWORKS: PubNetworkDef[] = NETWORKS.filter(
  (n): n is PubNetworkDef =>
    n.role === 'promotion' && n.status === 'live' && typeof n.limit === 'number',
);

/** How each surface wants to be written — voice per network, facts from memory. */
const NET_STYLE: Record<PubNetwork, string> = {
  x: 'X thread: punchy, concrete, zero filler. Post 1 hooks without clickbait.',
  linkedin: 'LinkedIn: each post is a STANDALONE long-form post (a series over days, not a thread). The first line is the hook and must survive the "…see more" fold. Short paragraphs with line breaks, professional but human — no corporate filler. Up to 3 niche hashtags at the very end of a post.',
  bluesky: 'Bluesky thread: conversational and direct, tech-literate audience, allergic to marketing speak.',
  mastodon: 'Mastodon thread: community-first tone, no growth-hacking vocabulary; hashtags are functional there (1-2 useful ones allowed).',
  threads: 'Threads: casual and personal, lighter than X, story beats over claims.',
  medium: 'Medium: long form. Each "post" is a full ESSAY section, not a status — a real title, paragraphs that breathe, a concrete example carrying every claim, and a close that lands. No hashtags, no thread numbering, no hook-bait. Write for a reader who chose to sit down.',
};

export type StoryKind = 'promo' | 'story';

export interface StoryPost {
  id: string;
  text: string;
  /** The rendered poster, if one was generated. */
  svg: string | null;
  /**
   * The WORDS the model produced for the poster, kept beside the rendering.
   * The copy is the paid step; the layout and the canvas are pure re-renders.
   * Storing only the SVG made trying a second template cost another
   * inference, which is the same as not offering a second template.
   */
  poster?: PosterState | null;
  posted: boolean;
  /**
   * WHERE the human actually posted it. Optional, and asked for rather than
   * guessed: without it, "posted" is a checkbox and the app can never say what
   * became of the post (doc 75 lot 5). With it, the surfaces that publish a
   * counter can be read — and the ones that do not say so plainly.
   */
  url?: string;
}

/** What the studio needs to re-render a poster without asking the model again. */
export interface PosterState {
  copy: PosterCopy;
  template: PosterTemplate;
  format: FormatId;
}

export interface Story {
  id: string;
  network: PubNetwork;
  kind: StoryKind;
  title: string;
  /** Raw material: the launch, the facts, a heated Reddit conv to retell… */
  context: string;
  posts: StoryPost[];
  /** The promo ledger entry is written ONCE per story, on first posted mark. */
  promoLogged: boolean;
  createdAt: string;
  updatedAt: string;
}

const K_STORIES = 'pheme:stories';
const STORY_CAP = 30;

export function loadStories(): Story[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(K_STORIES) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveStories(stories: Story[]): void {
  try { localStorage.setItem(K_STORIES, JSON.stringify(stories.slice(0, STORY_CAP))); }
  catch { /* quota — the on-screen story is still copyable */ }
}

export function newStory(network: PubNetwork, kind: StoryKind, title: string): Story {
  const now = new Date().toISOString();
  return {
    id: `story_${now}_${Math.random().toString(36).slice(2, 8)}`,
    network, kind, title, context: '',
    posts: [], promoLogged: false,
    createdAt: now, updatedAt: now,
  };
}

/**
 * A story born from a thread — a heated conversation becomes material.
 * Seeded on X (the flagship voice); the user retargets in the studio.
 */
export function seedStoryFromThread(seed: { title: string; url: string; body?: string; target?: string }): Story {
  const story = newStory('x', 'story', seed.title.slice(0, 80));
  story.context = [
    `Source: ${seed.target ? `${seed.target} — ` : ''}${seed.url}`,
    `"${seed.title}"`,
    (seed.body ?? '').slice(0, 800),
  ].filter(Boolean).join('\n');
  return story;
}

export function buildStoryPrompt(opts: {
  story: Story;
  topics: string[];
  count: number;
  /**
   * The language of THIS network, resolved by the caller (the network's own
   * publishing language, falling back to the UI's). It used to be the UI
   * language unconditionally, so a French interface could not compose an
   * English LinkedIn post.
   */
  langName: string;
  /** One line describing who reads the user on this surface, if they said. */
  audience?: string;
  wit?: 0 | 1 | 2;
}): string {
  const net = PUB_NETWORKS.find(n => n.id === opts.story.network) ?? PUB_NETWORKS[0];
  const kindLine = opts.story.kind === 'promo'
    ? 'This is a PROMOTION: it may present the user\'s product/work openly — but it must earn the read: concrete, first-hand, zero hype-speak.'
    : 'This is a STORY (récit): narrative first — an experience, a lesson, an arc across posts. Any product mention stays incidental.';
  return [
    `Compose a ${opts.count}-post series for ${net.name}.`,
    NET_STYLE[net.id],
    // The user's own description of their audience OVERRIDES nothing above —
    // it narrows it. NET_STYLE is how the surface is written; this is who is
    // on the other side of it, and only the user knows that.
    opts.audience?.trim()
      ? `Who reads them there: ${opts.audience.trim().slice(0, 240)}. Write for THOSE readers, not a generic audience.`
      : '',
    witLine(opts.wit ?? 1),
    `Author's expertise: ${opts.topics.slice(0, 8).join(', ') || 'unknown'}. You also know their ACTUAL work from memory context — the substance comes from there and from the MATERIAL below. Never invent facts, numbers or events.`,
    kindLine,
    opts.story.title ? `Working title: ${opts.story.title.slice(0, 120)}` : '',
    opts.story.context.trim() ? `MATERIAL (facts, links, a conversation to retell…):\n${opts.story.context.trim().slice(0, 1500)}` : 'MATERIAL: none — draw only from memory context.',
    '',
    `Rules: each post MAX ${Math.max(80, net.limit - 15)} characters; one idea per post; the last post lands the point (a promo may end with ONE link placeholder [LINK]); no numbering like "1/7" — the series reads as prose.`,
    'Answer with ONE JSON object and NOTHING else:',
    '{"posts":["text of post 1","text of post 2"]}',
    `Every post in ${opts.langName}.`,
  ].filter(Boolean).join('\n');
}

/** Tolerant parse of the generated thread. Null = keep whatever exists. */
export function parseStoryPosts(raw: string): string[] | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as { posts?: unknown };
    if (!Array.isArray(j.posts)) return null;
    const posts = j.posts.map(p => String(p).trim()).filter(Boolean).slice(0, 12);
    return posts.length > 0 ? posts : null;
  } catch { return null; }
}

// ── Illustration ────────────────────────────────────────────────────────────
// The prompt that asked a language model to DRAW an SVG lived here, with a
// sanitizer to make its output safe to mount. Both are gone: the model is now
// asked for words and the picture is a brand template we render ourselves
// (lib/poster.ts), so there is no untrusted markup to clean in the first
// place. Deleting the sanitizer with its only caller keeps the security
// surface honest — a guard nobody calls reads like protection that isn't.

/** Rasterize the SVG to a PNG data URL (for networks that reject SVG uploads). */
export function svgToPng(svg: string, width = 1200): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      img.onload = () => {
        try {
          const ratio = img.height > 0 ? img.height / img.width : 450 / 800;
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = Math.round(width * (Number.isFinite(ratio) && ratio > 0 ? ratio : 0.5625));
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch { resolve(null); }
  });
}

/**
 * Trigger a browser download. Returns false when the browser refused, so a
 * caller can say so instead of leaving the user clicking a dead button.
 *
 * Two things made this fail in silence:
 *  - the anchor was never put IN the document, and a detached anchor's
 *    programmatic click is not honoured;
 *  - a 1600×900 PNG as a `data:` URL is several megabytes of href, which is
 *    its own failure mode. It goes through a Blob now, revoked after the
 *    click so the object does not leak for the life of the widget.
 *
 * (The third cause was host-side: the cartridge iframe had no
 * `allow-downloads` sandbox token, so Chromium blocked all of it.)
 */
export function downloadDataUrl(dataUrl: string, filename: string): boolean {
  try {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, comma);
    const mime = header.slice(5).split(';')[0] || 'application/octet-stream';
    const payload = dataUrl.slice(comma + 1);
    const bytes = header.includes(';base64')
      ? Uint8Array.from(atob(payload), c => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch (err) {
    console.error('[pheme] download refused:', err);
    return false;
  }
}
