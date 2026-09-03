/**
 * Shared across every Pheme surface: the shell (header/footer/skin root),
 * the translator function type, and the age formatter. The footer carries
 * the version straight from the manifest - one source of truth.
 */
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { cooldownRemainingMs } from '../lib/redditGate';
import { SKIN_CSS, type SkinId } from '../lib/skins';
import type { StringKey } from '../lib/i18n';
import { CSS } from '../styles';
import manifest from '../../mnemo-plugin.json';

export type T = (key: StringKey) => string;

export function age(iso: string): string {
  const h = Math.max(0, (Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? `${Math.round(h * 60)}min` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

/**
 * Live seconds left on the app-wide Reddit cooldown — a REAL countdown.
 * Keeps ticking even from 0: another surface (radar, presence, studio) can
 * trip the cooldown while this one is on screen.
 */
export function useCooldownClock(): number {
  const [secs, setSecs] = useState(() => Math.ceil(cooldownRemainingMs() / 1000));
  useEffect(() => {
    const id = setInterval(() => setSecs(Math.ceil(cooldownRemainingMs() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, secs);
}

/**
 * Width of the element, live. Pheme is a cartridge: it is as wide as the
 * user's window makes it, and a media query would measure the SCREEN, not
 * the widget. Twelve network tabs wrapping onto three rows in a narrow
 * pane is the reason this exists.
 */
export function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** m:ss for the countdown display. */
export function mmss(totalSecs: number): string {
  return `${Math.floor(totalSecs / 60)}:${String(totalSecs % 60).padStart(2, '0')}`;
}

export function Shell({ t, skin, corner, rootRef, children }: {
  t: T; skin: SkinId; corner?: ReactNode; children: ReactNode;
  /**
   * Measured for the compact decision. It has to be the ROOT: the dock now
   * lives in the header and is sized by its own content, so measuring it made
   * "am I narrow?" always true — the app opened in mobile mode on a maximised
   * window. What compacts is the PANE the user gave the cartridge.
   */
  rootRef?: RefObject<HTMLDivElement>;
}) {
  return (
    <div className="pheme" data-skin={skin} ref={rootRef}>
      <style>{SKIN_CSS + CSS}</style>
      <header className="head">
        <div className="brand">
          <span className="phi">Φ</span>
          <div>
            <h1>Pheme</h1>
            <p className="tagline">{t('tagline')}</p>
          </div>
        </div>
        {corner}
      </header>
      <main className="body">{children}</main>
      <footer className="foot"><span>{t('neverPosts')}</span><span className="ver">v{manifest.version}</span></footer>
    </div>
  );
}
