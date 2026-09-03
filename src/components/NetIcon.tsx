/**
 * Brand marks as SELF-CONTAINED inline SVG — a cartridge iframe loads no
 * remote asset, ever. One consistent badge style (brand-colored rounded
 * square, white mark) so the row reads as a system, not a sticker sheet.
 * Marks are hand-simplified for 13-20px legibility, not logo-exact.
 */
import type { ReactNode } from 'react';
import { NETWORKS } from '../lib/networks';

const MARKS: Record<string, (c: string) => ReactNode> = {
  reddit: (c) => (
    <>
      <path d="M12 9.2 L13.7 4.6" stroke="#fff" strokeWidth="1.3" fill="none" />
      <circle cx="14.1" cy="4.2" r="1.4" fill="#fff" />
      <circle cx="5.4" cy="11.4" r="1.9" fill="#fff" />
      <circle cx="18.6" cy="11.4" r="1.9" fill="#fff" />
      <ellipse cx="12" cy="14.2" rx="6.9" ry="5.1" fill="#fff" />
      <circle cx="9.3" cy="13.4" r="1.15" fill={c} />
      <circle cx="14.7" cy="13.4" r="1.15" fill={c} />
      <path d="M9.1 16.3 Q12 18.2 14.9 16.3" stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  ),
  hackernews: () => (
    <path d="M7 6 h2.9 L12 9.6 14.1 6 H17 l-3.9 6 v6 h-2.2 v-6 Z" fill="#fff" />
  ),
  x: () => (
    <path d="M5.8 5 h3.4 L12 9.2 15 5 h3.2 L13.6 11.2 18.6 19 h-3.4 L12 13.9 8.6 19 H5.4 l5-7.6 Z" fill="#fff" />
  ),
  linkedin: () => (
    <>
      <circle cx="7.6" cy="7.4" r="1.7" fill="#fff" />
      <rect x="6.3" y="10" width="2.6" height="8" fill="#fff" />
      <path d="M10.8 10 h2.5 v1.1 c.5-.8 1.5-1.3 2.7-1.3 2.1 0 3.3 1.3 3.3 3.7 V18 h-2.6 v-4 c0-1.1-.5-1.8-1.5-1.8 -1 0-1.8.7-1.8 2 V18 h-2.6 Z" fill="#fff" />
    </>
  ),
  bluesky: () => (
    <path d="M12 10.6 C10.8 8 7.8 5.2 5.8 5.2 c-1 0-1.3.8-1.3 2 0 2.9 1.7 5.6 4.6 6.1 -1.6.4-2.7 1.3-2.7 2.6 0 1.5 1.4 2.3 2.9 2.3 1.4 0 2.3-1.2 2.7-2.4 .4 1.2 1.3 2.4 2.7 2.4 1.5 0 2.9-.8 2.9-2.3 0-1.3-1.1-2.2-2.7-2.6 2.9-.5 4.6-3.2 4.6-6.1 0-1.2-.3-2-1.3-2 -2 0-5 2.8-6.2 5.4 Z" fill="#fff" />
  ),
  mastodon: () => (
    <path d="M6.2 18 v-6.3 c0-2.7 1.7-4.2 4-4.2 1.4 0 2.5.6 3.1 1.7 .6-1.1 1.7-1.7 3.1-1.7 2.3 0 4 1.5 4 4.2 V18 h-2.7 v-6 c0-1.1-.5-1.7-1.4-1.7 -1 0-1.6.7-1.6 1.9 V18 h-2.7 v-5.8 c0-1.2-.6-1.9-1.6-1.9 -.9 0-1.4.6-1.4 1.7 v6 Z" fill="#fff" transform="translate(-1.2 0)" />
  ),
  threads: () => (
    <text x="12" y="16.9" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">@</text>
  ),
  // Medium's mark: the three circles, largest to smallest.
  medium: () => (
    <>
      <ellipse cx="7.6" cy="12" rx="3.4" ry="4.6" fill="#111" />
      <ellipse cx="14.6" cy="12" rx="1.5" ry="4.6" fill="#111" />
      <ellipse cx="18.6" cy="12" rx="0.7" ry="4.6" fill="#111" />
    </>
  ),
  instagram: () => (
    <>
      <rect x="4.8" y="4.8" width="14.4" height="14.4" rx="4.4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.6" cy="7.4" r="1.2" fill="#fff" />
    </>
  ),
  tiktok: () => (
    <path d="M13.2 4 h2.6 c.3 1.9 1.5 3.1 3.6 3.3 v2.7 c-1.4 0-2.6-.4-3.6-1.1 v5.4 a4.9 4.9 0 1 1 -4.2-4.85 v2.75 a2.2 2.2 0 1 0 1.6 2.1 Z" fill="#fff" />
  ),
  youtube: () => (
    <path d="M9.6 8 L16.6 12 9.6 16 Z" fill="#fff" />
  ),
  facebook: () => (
    <path d="M13.3 20 v-6.2 h2.1 l.4-2.7 h-2.5 V9.4 c0-.8.3-1.4 1.5-1.4 h1.1 V5.6 c-.5-.1-1.3-.2-2.2-.2 -2.3 0-3.7 1.4-3.7 3.8 v1.9 H8 v2.7 h2 V20 Z" fill="#fff" />
  ),
  producthunt: () => (
    <path fillRule="evenodd" d="M8.8 18.5 V5.5 h4.6 a4.3 4.3 0 0 1 0 8.6 h-2 v4.4 Z M11.4 11.6 h2 a1.8 1.8 0 0 0 0-3.6 h-2 Z" fill="#fff" />
  ),
};

export function NetIcon({ id, size = 14 }: { id: string; size?: number }) {
  const net = NETWORKS.find(n => n.id === id);
  const color = net?.color ?? '#8894a8';
  const mark = MARKS[id];
  return (
    <svg className="netIcon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill={color} />
      {mark
        ? mark(color)
        : <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{net?.name?.[0] ?? '?'}</text>}
    </svg>
  );
}
