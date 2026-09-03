/**
 * Render every poster layout, at every canvas, to files you can look at.
 *
 * The tests pin the STRUCTURE — that the copy is escaped, that the mark is the
 * host's, that a portrait headline wraps. None of that says whether the thing
 * is any good to look at, and a poster nobody has seen is a poster nobody
 * should ship. This is the human's eye, on demand:
 *
 *     pnpm --filter @mnemosyne-plugins/pheme run posters
 *
 * Writes `.preview/` (gitignored) plus a contact sheet that opens in a browser.
 * No host, no model, no network — the copy below is fixed sample text.
 *
 * `tsx` comes from the workspace root, not from this package: a dev-only
 * preview tool is not worth a dependency in a cartridge people install.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMATS, TEMPLATES, renderPoster, sizeFor, templateFits,
  type PosterCopy, type PosterTemplate,
} from '../src/lib/poster';

/** Sample copy carrying every optional field, so no layout renders half-empty. */
const COPY: PosterCopy = {
  kicker: 'RETRIEVAL',
  headline: 'Auditable memory beats a bigger context window',
  sub: 'Measured on 48 full-haystack questions, not claimed.',
  stat: '83.3%',
  attribution: 'the 2026 bench',
};

// ESM: no __dirname. The package root is one level up from scripts/.
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '.preview');
mkdirSync(OUT, { recursive: true });

const cells: string[] = [];
let written = 0;

for (const template of TEMPLATES) {
  for (const format of FORMATS) {
    const size = sizeFor('x', format);
    const fits = templateFits(COPY, template as PosterTemplate);
    if (!fits) continue;
    const svg = renderPoster(COPY, size, { template, wordmark: 'MNEMOSYNE OS' });
    const name = `${template}-${format}-${size.w}x${size.h}.svg`;
    writeFileSync(join(OUT, name), svg, 'utf-8');
    written++;
    cells.push(
      `<figure><figcaption>${template} · ${format} · ${size.label}</figcaption>`
      + `<img src="${name}" alt="${template} ${format}"/></figure>`,
    );
  }
}

// One page, every plate, sorted the way you compare them: by layout, then by
// canvas — so "does the quote hold up in portrait?" is one glance, not a
// folder of files opened one at a time.
writeFileSync(join(OUT, 'index.html'), `<!doctype html>
<meta charset="utf-8"><title>Pheme posters</title>
<style>
  body { margin:0; padding:28px; background:#0B0910; color:#F4F1FA;
         font:14px/1.5 'Segoe UI', system-ui, sans-serif; }
  h1 { font-size:18px; font-weight:600; letter-spacing:.04em; margin:0 0 4px; }
  p.lead { color:#8E88A0; margin:0 0 24px; }
  .grid { display:grid; gap:22px; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); align-items:end; }
  figure { margin:0; }
  figcaption { color:#A98BFF; font-size:11px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:8px; }
  img { width:100%; height:auto; display:block; border-radius:10px; }
</style>
<h1>Pheme — poster layouts × canvases</h1>
<p class="lead">${written} plates. Same copy every time: only the layout and the canvas change.</p>
<div class="grid">${cells.join('\n')}</div>
`, 'utf-8');

console.log(`[pheme] ${written} posters → ${OUT}`);
console.log(`[pheme] open ${join(OUT, 'index.html')}`);
