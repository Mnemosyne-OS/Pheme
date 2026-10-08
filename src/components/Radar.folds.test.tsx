/**
 * What the radar grid DRAWS by default, exercised through the real component.
 *
 * The fold arithmetic has its own unit tests (lib/radarFolds.test.ts). This one
 * exists because every piece can be green while the seam is never exercised —
 * the lesson the To-do card paid for twice. Here the seam is `visible`: the
 * props go in, the <li>s come out, and a chip click has to change them.
 *
 * Mounted with react-dom directly, like Ariadne's component tests — no
 * testing-library, so this adds no dependency.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RadarTab } from './Radar';
import { bridge } from '../lib/bridge';
import { makeT } from '../lib/i18n';
import type { FoldPile } from '../lib/radarFolds';
import type { ScoredItem } from '../lib/score';

const t = makeT('en');
const HOUR = 3_600_000;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function item(id: string, hoursOld: number): ScoredItem {
  return {
    id, title: `thread ${id}`, body: '', author: 'someone',
    url: `https://www.reddit.com/r/LocalLLaMA/comments/${id}/x/`,
    timestamp: new Date(Date.now() - hoursOld * HOUR).toISOString(),
    network: 'reddit', target: 'r/LocalLLaMA', matched: [], score: 50,
  };
}

const fresh = item('fresh', 2);
const answered = item('answered', 3);
const old1 = item('old1', 30 * 24);
const old2 = item('old2', 20 * 24);
const gone = item('gone', 4);

type Extra = Partial<Parameters<typeof RadarTab>[0]>;

/** Holds `openPiles` for real, so a chip click round-trips through App's state. */
function Board({ items, extra }: { items: ScoredItem[]; extra?: Extra }) {
  const [openPiles, setOpenPiles] = useState<FoldPile[]>([]);
  return (
    <RadarTab
      t={t} framed items={items} topics={['rag']} scanning={false}
      failed={[]} uncovered={[]} rateLimited={false} scannedAt={null}
      hidden={['gone']} repliedUrls={new Set([answered.url])}
      netFilter="reddit" subsCovered={null} pinned={[]} onTogglePin={() => {}}
      openPiles={openPiles} onOpenPiles={setOpenPiles}
      tierFilter="all" onTierFilter={() => {}}
      targets={['LocalLLaMA']} subFilter={null} onSubFilter={() => {}}
      onHide={() => {}} onUnhideAll={() => {}} onScan={() => {}} onOpenDetail={() => {}}
      {...extra}
    />
  );
}

const mount = (items: ScoredItem[], extra?: Extra) =>
  act(() => { root.render(<Board items={items} extra={extra} />); });
const titles = () => [...host.querySelectorAll('ul.grid > li .cardTitle strong')]
  .map(e => e.textContent?.replace(/^R/, '') ?? '');
const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.fchip')];
const chip = (label: string) => {
  const found = chips().find(c => c.textContent?.includes(label));
  if (!found) throw new Error(`no chip "${label}" in [${chips().map(c => c.textContent).join(' | ')}]`);
  return found;
};
const click = (el: HTMLElement) => act(() => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
/** Click and let the awaits inside the handler settle before asserting. */
const clickAndSettle = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
};
const passBtn = () => host.querySelector<HTMLButtonElement>('.mnemoBtn')!;

describe('the radar grid', () => {
  it('opens on fresh, unanswered, unhidden threads only', () => {
    mount([fresh, answered, old1, old2, gone]);
    expect(titles()).toEqual(['thread fresh']);
  });

  /** 🎭 counted, never "and others" — and the sub-counts add up to the total. */
  it('says how many it folded, and what each pile holds', () => {
    mount([fresh, answered, old1, old2, gone]);
    const text = host.textContent ?? '';
    expect(text).toContain('4 folded');
    expect(text).toContain('1 hidden');
    expect(text).toContain('1 answered');
    expect(text).toContain('2 finished');
  });

  it('opens a pile when its chip is clicked, and only that pile', () => {
    mount([fresh, answered, old1, old2, gone]);
    click(chip('finished'));
    expect(titles()).toEqual(['thread fresh', 'thread old1', 'thread old2']);
    expect(host.textContent).toContain('2 folded');
  });

  it('folds the pile back on a second click', () => {
    mount([fresh, answered, old1, old2, gone]);
    click(chip('finished'));
    click(chip('finished'));
    expect(titles()).toEqual(['thread fresh']);
    expect(host.textContent).toContain('4 folded');
  });

  /**
   * The unhide-all door only exists once the hidden pile is open. Offered
   * while the pile is shut, it would clear a list the human cannot see.
   */
  it('offers unhide-all only once the hidden pile is open', () => {
    mount([fresh, answered, old1, old2, gone]);
    expect(chips().some(c => c.textContent?.includes('Unhide all'))).toBe(false);
    click(chip('hidden'));
    expect(titles()).toEqual(['thread fresh', 'thread gone']);
    expect(chips().some(c => c.textContent?.includes('Unhide all'))).toBe(true);
  });

  /**
   * Nothing folded means no row at all — not a row of zeros, and not an empty
   * container either. On this board (`netFilter` set, one target, no rank) the
   * fold row is the only `.filters` there is, so its absence is checkable.
   */
  it('shows no fold row when every thread is on the board', () => {
    mount([fresh]);
    expect(titles()).toEqual(['thread fresh']);
    expect(host.textContent).not.toContain('folded');
    expect(chips()).toHaveLength(0);
    expect(host.querySelector('.filters')).toBeNull();
  });

  /**
   * An empty board still has to say so. With everything folded the grid is
   * empty, and a grid that is empty in silence reads as a broken scan.
   */
  it('says the board is empty while still offering the piles', () => {
    mount([answered, old1, gone]);
    expect(titles()).toEqual([]);
    expect(host.querySelector('.empty')).not.toBeNull();
    expect(host.textContent).toContain('3 folded');
  });
});

/**
 * ONE status line (§15.2 D). The rule it has to keep is that every segment is
 * a measured fact or absent: the failure mode being designed out is a header
 * that reassures ("OK", "0 ranked", a bar at 0%) about something nobody
 * measured.
 */
describe('the status line', () => {
  const line = () => host.querySelector('.statusLine')?.textContent ?? null;
  const K_COOL = 'pheme:reddit:cooldownUntil';

  it('says nothing at all before the first scan', () => {
    mount([fresh]);
    expect(line()).toBeNull();
  });

  it('carries the scan age and the sub coverage as one line', () => {
    mount([fresh], {
      scannedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      subsCovered: { ok: 15, total: 44 },
    });
    expect(line()).toContain('scanned');
    expect(line()).toContain('15/44 subs this pass');
  });

  /** 🎭 A throttle that is not running prints no segment — never an "OK". */
  it('prints no throttle segment when there is no throttle', () => {
    mount([fresh], { scannedAt: new Date().toISOString() });
    expect(line()).not.toContain('Reddit throttled');
    expect(host.querySelector('.notice')).toBeNull();
    expect(host.querySelector('.cooldownOver')).toBeNull();
  });

  /**
   * The clock is a fact and goes on the line. The red banner is an
   * INSTRUCTION, and it is owed only when the throttle actually cut the scan
   * short — a throttle tripped by another surface changes nothing the human
   * has to do here.
   */
  it('shows a running throttle on the line, without the banner', () => {
    localStorage.setItem(K_COOL, String(Date.now() + 9 * 60_000));
    mount([fresh], { scannedAt: new Date().toISOString(), rateLimited: false });
    expect(line()).toContain('Reddit throttled');
    expect(host.querySelector('.notice')).toBeNull();
  });

  it('raises the banner only when the throttle cut this scan short', () => {
    localStorage.setItem(K_COOL, String(Date.now() + 9 * 60_000));
    mount([fresh], { scannedAt: new Date().toISOString(), rateLimited: true });
    expect(host.querySelector('.notice')?.textContent).toContain('Reddit stopped this scan');
  });

  it('turns the banner into the refresh it is owed once the throttle clears', () => {
    mount([fresh], { scannedAt: new Date().toISOString(), rateLimited: true });
    expect(host.querySelector('.notice')).toBeNull();
    expect(host.querySelector('.cooldownOver')).not.toBeNull();
  });
});

/**
 * The Mnemosyne pass costs money and classifies what the board SHOWS (§11).
 * Before the default view, "what the board shows" was everything the scan
 * retained — which is how a pass came back "8 of 307 ranked", most of it spent
 * on month-old finished threads. The scope is therefore worth pinning at the
 * seam: this is the one place in the radar where being wrong is billed.
 */
describe('the Mnemosyne pass', () => {
  it('pays only for the threads the board is showing', async () => {
    const ask = vi.spyOn(bridge, 'ask').mockResolvedValue('{"ranks":[]}');
    try {
      mount([fresh, answered, old1, old2, gone]);
      await clickAndSettle(passBtn());
      expect(ask).toHaveBeenCalledTimes(1);
      const prompt = ask.mock.calls[0][0];
      expect(prompt).toContain('thread fresh');
      for (const folded of ['thread answered', 'thread old1', 'thread old2', 'thread gone']) {
        expect(prompt).not.toContain(folded);
      }
    } finally { ask.mockRestore(); }
  });

  it('grows to cover a pile the human opened', async () => {
    const ask = vi.spyOn(bridge, 'ask').mockResolvedValue('{"ranks":[]}');
    try {
      mount([fresh, answered, old1, old2, gone]);
      click(chip('finished'));
      await clickAndSettle(passBtn());
      const prompt = ask.mock.calls[0][0];
      expect(prompt).toContain('thread old1');
      expect(prompt).not.toContain('thread gone');
    } finally { ask.mockRestore(); }
  });
});
