/**
 * Skins — Pheme is an app people live in, so the surface must be theirs.
 *
 * A skin is a set of local custom properties (--ph-*) the stylesheet consumes;
 * switching skins swaps ONE data attribute on the root. Three deliberate
 * registers, not a theme park:
 *
 *  - host   — disappears into Mnemosyne OS: maps every token to the shell's
 *             live variables (user accent included). The default.
 *  - writer — the mnemosyne-os.io editorial voice: paper, ink, serif
 *             headlines, mono eyebrows, hairline rules, a brass accent.
 *  - noir   — self-contained deep dark for late hours, whatever the host
 *             theme says.
 */

export const SKIN_IDS = ['host', 'writer', 'noir'] as const;
export type SkinId = typeof SKIN_IDS[number];

export interface SkinMeta {
  id: SkinId;
  name: { en: string; fr: string };
  /** Two swatch colours for the picker card: [surface, accent]. */
  swatch: [string, string];
}

export const SKINS: SkinMeta[] = [
  { id: 'host', name: { en: 'Host — follows the OS', fr: 'Hôte — suit l\'OS' }, swatch: ['#131318', '#7c4dff'] },
  { id: 'writer', name: { en: 'Writer — paper & ink', fr: 'Writer — papier & encre' }, swatch: ['#F5F3EE', '#8a6a1c'] },
  { id: 'noir', name: { en: 'Noir — deep dark', fr: 'Noir — sombre profond' }, swatch: ['#07070A', '#A98BFF'] },
];

/**
 * The per-skin variable blocks. `host` resolves against the shell's broadcast
 * tokens so a custom accent flows straight through; the other two are fully
 * self-contained — they must look right even outside the host.
 */
export const SKIN_CSS = `
/*
 * Native controls follow the skin, not the OS. Without this a <select>'s
 * dropdown, a checkbox and the scrollbars are painted by the platform: on a
 * dark skin the popup came back white text on a white sheet, unreadable.
 * color-scheme is the ONLY property that reaches inside a native popup.
 * (No backticks in this file: it is one big template literal.)
 */
.pheme[data-skin="host"], .pheme[data-skin="noir"] { color-scheme: dark; }
.pheme[data-skin="writer"] { color-scheme: light; }
.pheme[data-skin="host"] {
  --ph-bg: var(--bg-void, #0b0b10);
  --ph-panel: var(--bg-panel, rgba(255,255,255,.03));
  --ph-text: var(--text-primary, #e6e2f2);
  --ph-text-2: var(--text-secondary, #b8b3c8);
  --ph-muted: var(--text-muted, #8a8798);
  --ph-border: var(--border-subtle, rgba(255,255,255,.10));
  --ph-accent: var(--accent, #7c4dff);
  --ph-on-accent: #fff;
  --ph-ok: var(--accent-success-text, #6fca8f);
  --ph-warn: var(--accent-warning-text, #f0b060);
  --ph-danger: var(--accent-danger-text, #d98080);
  --ph-radius: 8px;
  --ph-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --ph-font-head: var(--ph-font);
  --ph-font-tag: var(--ph-font);
  --ph-head-case: none;
  --ph-head-spacing: .14em;
}
.pheme[data-skin="writer"] {
  --ph-bg: #F5F3EE;
  --ph-panel: #FBFAF7;
  --ph-text: #201D18;
  --ph-text-2: #4C463C;
  --ph-muted: #6F695E;
  --ph-border: #D8D3C6;
  --ph-accent: #8A6A1C;
  --ph-on-accent: #FBFAF7;
  --ph-ok: #3F6B34;
  --ph-warn: #8A4B00;
  --ph-danger: #8B1D1D;
  --ph-radius: 3px;
  --ph-font: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  --ph-font-head: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  --ph-font-tag: Consolas, 'SF Mono', Menlo, monospace;
  --ph-head-case: none;
  --ph-head-spacing: 0;
}
.pheme[data-skin="noir"] {
  --ph-bg: #07070A;
  --ph-panel: rgba(255,255,255,.035);
  --ph-text: #E8E4F4;
  --ph-text-2: #B8B3C8;
  --ph-muted: #8A8798;
  --ph-border: rgba(255,255,255,.10);
  --ph-accent: #A98BFF;
  --ph-on-accent: #0B0B10;
  --ph-ok: #6FCA8F;
  --ph-warn: #F0B060;
  --ph-danger: #D98080;
  --ph-radius: 8px;
  --ph-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --ph-font-head: var(--ph-font);
  --ph-font-tag: Consolas, 'SF Mono', Menlo, monospace;
  --ph-head-case: none;
  --ph-head-spacing: .14em;
}
`;
