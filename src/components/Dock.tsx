/**
 * The dock — Pheme's primary navigation, on the same line as the mark.
 *
 * Icons only. Names cost the width of a monitor and are read more slowly than
 * a logo, so the label lives in the tooltip and the destination proves it.
 * The unread count rides ON the icon: "where are my replies" has to be
 * answerable at a glance, not by reading twelve words.
 *
 * Below the compact threshold the same map collapses into one picker — the
 * current scope, the unread counts, and the locked networks still visible
 * rather than quietly dropped.
 */
import { NETWORKS } from '../lib/networks';
import { NetIcon } from './NetIcon';
import type { T } from './shared';

export interface DockProps {
  t: T;
  /** The active scope: 'cockpit', 'settings', or a network id. */
  scope: string;
  /** Unread replies per network id — drives the badges. */
  unseenNet: Record<string, number>;
  /** True when the pane is too narrow for the icon row. */
  compact: boolean;
  /** Navigate. The parent owns what a scope change means. */
  onGo: (scope: string) => void;
}

const live = () => NETWORKS.filter(n => n.status === 'live' && n.tier !== 'licensed');
const locked = () => NETWORKS.filter(n => n.tier === 'licensed');

/**
 * @param props.unseenNet counts by network id; a missing id reads as 0, never
 *   as "unknown" — an absent badge is the honest rendering of "nothing new".
 * @returns The navigation element, meant for the shell header's corner slot.
 */
export function Dock({ t, scope, unseenNet, compact, onGo }: DockProps) {
  const unseenTotal = Object.values(unseenNet).reduce((a, b) => a + b, 0);

  if (compact) {
    return (
      <nav className="dock compact">
        <NetIcon id={scope} size={16} />
        <select className="navSelect" value={scope} onChange={e => onGo(e.target.value)}>
          <option value="cockpit">
            {t('dash')}{unseenTotal > 0 ? ` · ${unseenTotal}` : ''}
          </option>
          <optgroup label={t('navNetworks')}>
            {live().map(n => (
              <option key={n.id} value={n.id}>
                {n.name}{(unseenNet[n.id] ?? 0) > 0 ? ` · ${unseenNet[n.id]}` : ''}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('navLocked')}>
            {locked().map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </optgroup>
        </select>
        <GearItem t={t} scope={scope} onGo={onGo} />
      </nav>
    );
  }

  return (
    <nav className="dock">
      <button
        className={scope === 'cockpit' ? 'dockItem active' : 'dockItem'}
        title={t('dash')} aria-label={t('dash')} onClick={() => onGo('cockpit')}
      >
        <span className="dockGlyph">◈</span>
        {unseenTotal > 0 && <span className="dockBadge">{unseenTotal}</span>}
      </button>

      <span className="dockRule" />

      {live().map(n => (
        <button
          key={n.id}
          className={scope === n.id ? 'dockItem active' : 'dockItem'}
          title={n.name} aria-label={n.name} onClick={() => onGo(n.id)}
        >
          <NetIcon id={n.id} size={20} />
          {(unseenNet[n.id] ?? 0) > 0 && <span className="dockBadge">{unseenNet[n.id]}</span>}
        </button>
      ))}

      <span className="dockRule" />

      {/* Locked networks stay VISIBLE, dimmed: a roster that hides what you
          cannot reach yet reads as a smaller product than it is. */}
      {locked().map(n => (
        <button
          key={n.id}
          className={scope === n.id ? 'dockItem locked active' : 'dockItem locked'}
          title={`${n.name} — ${t('boardLocked')}`} aria-label={n.name}
          onClick={() => onGo(n.id)}
        >
          <NetIcon id={n.id} size={20} />
        </button>
      ))}

      <GearItem t={t} scope={scope} onGo={onGo} />
    </nav>
  );
}

/** Settings — the one item that is present in both layouts. */
function GearItem({ t, scope, onGo }: { t: T; scope: string; onGo: (s: string) => void }) {
  return (
    <button
      className={scope === 'settings' ? 'dockItem gear active' : 'dockItem gear'}
      title={t('settings')} aria-label={t('settings')} onClick={() => onGo('settings')}
    >
      <span className="dockGlyph">⚙︎</span>
    </button>
  );
}
