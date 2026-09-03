/**
 * The guard rail this cartridge did not have.
 *
 * Every case below is a bug that actually shipped and was found by reading
 * the code, not by using the app: a parser that emptied a filter tier on a
 * synonym, a cap that dropped the entry just added, a count that turned an
 * unknown into a zero. They are pinned here so the next change has to break
 * a test before it can break the product.
 */
 
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSubsPrompt, cleanListItem, parseTopics, parseSubNames } from './suggest';
import { acceptPolish, buildAnglesPrompt, buildDraftPrompt, buildPolishPrompt, buildRecallPrompt, parseAngles, parseDrafts, parseRecall, peerRegisterRules } from './drafts';
import { parseRank } from './rank';
import { buildDiagnosisPrompt, buildMeasuredBrief, fetchProfileFacts, parseDiagnosis } from './analyze';
import { mergeScan, scanRadar } from './scan';
import { fetchPresence, mergePresence, unseenCount, seenOf, markAllSeen, getLastSeen, type PresenceReport, type ThreadNode } from './presence';
import { awaitingReplies, freshReplies, ledgerStats, presenceZones, sortedTargets, standingBoard, targetLabel, unseenByNetwork } from './selectors';
import { watchSignature, watchTargetsFor } from './watch';
import { replyDraftKey, replyItem, replyingToOf } from './replyTo';
import { diagnosisMemory, pendingMemories, postMemoryText } from './memory';
import { checkDraft, countSelfRefs, countSentences, looksLikeBrandHandle, refreshThread } from './verify';
import { extractMedia, fetchArticleText, htmlToText } from './article';
import {
  FORMATS, MARK, TEMPLATES, buildPosterPrompt, parsePosterCopy, posterSize,
  renderPoster, sizeFor, templateFits, wrapText,
} from './poster';
import { isBotAuthor, isGone } from './authors';
import { feedGroundLine, feedUrlFor, parseFeed } from './profileFeed';
import { promoBanRule, rulesFor, type CommunityRules } from './rulebook';
import { parseAccountKarma, parseSubRules, refreshRedditFacts } from './redditPublic';
import { asId } from './coerce';
import { standings, type Standing } from './standing';
import { isSoloAct, ledgerKeys, threadKey } from './authorship';
import { auditNumbers, reportFacts } from './report';
import { loadHistory, recordSnapshot } from './history';
import { bestScored, countsApiFor, harvest, outcomes, parsePublicCounts, readPublicCounts, silentOnes } from './outcomes';
import { nextMove, readiness } from './readiness';
import { NETWORKS, netProfileShape } from './networks';
import { buildImageReadPrompt, readImage } from './vision';
import { buildStoryPrompt, newStory } from './stories';
import { EMPTY_NET, REDDIT, netOf, normalizeProfile, saveDraftText, setNet, withoutAct, type LedgerEntry } from './store';
import { hasProfile, localIsBlank, restoreLocal, snapshotLocal } from './mirror';
import { isStale, scoreItems, type ScoredItem } from './score';

// ── helpers ─────────────────────────────────────────────────────────────────

const thread = (over: Partial<ThreadNode> = {}): ThreadNode => ({
  id: 'reddit_a', network: 'reddit', mine: 'none', community: 'r/x',
  title: 't', url: 'u', timestamp: '2026-01-01T00:00:00.000Z',
  postBody: '', postAuthor: 'someone', myBody: '', replies: [], commentCount: null,
  ...over,
});

const report = (threads: ThreadNode[]): PresenceReport => ({
  groups: [{ community: 'r/x', threads }],
  hnKarma: null, failed: [], rateLimited: false, at: '2026-01-02T00:00:00.000Z',
});

const item = (over: Partial<ScoredItem> = {}): ScoredItem => ({
  id: 'reddit_1', title: 't', body: '', author: 'a', url: 'https://r/1',
  timestamp: '2026-01-01T00:00:00.000Z', network: 'reddit', target: 'r/x',
  score: 10, matched: [], ...over,
});

// ── parsers: a shape the model really produces must not be discarded ─────────

describe('list cleaning', () => {
  it('undoes bullet AND numbering in one pass (an anchored /g/ regex could not)', () => {
    expect(cleanListItem('- 1. local AI')).toBe('local AI');
  });

  it('strips the quotes the prompt itself demonstrates', () => {
    // A quoted needle matches nothing in score.ts — an empty radar, silently.
    expect(cleanListItem('"local AI"')).toBe('local AI');
    expect(parseTopics('1. "RAG"\n- «vector search»')).toEqual(['RAG', 'vector search']);
  });

  it('keeps a plain topic untouched', () => {
    expect(cleanListItem('Electron')).toBe('Electron');
  });
});

describe('parseAngles', () => {
  it('drops the preamble instead of feeding it to the drafter as "the chosen take"', () => {
    const raw = [
      'Here are 3 different angles for a genuine reply:',
      '1. Contrarian: determinism beats an extra inference',
      '2. Personal: what the 12-step ingestion actually cost',
      '3. Question back: how do they audit recall failures',
    ].join('\n');
    expect(parseAngles(raw)).toEqual([
      'Contrarian: determinism beats an extra inference',
      'Personal: what the 12-step ingestion actually cost',
      'Question back: how do they audit recall failures',
    ]);
  });
});

describe('parseRank', () => {
  const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];

  it('accepts the synonyms models actually answer (this emptied the Maybe filter)', () => {
    const raw = '{"ranks":[{"i":0,"tier":"medium"},{"i":1,"tier":"relevant"},{"i":2,"tier":"weak"}]}';
    const map = parseRank(raw, items)!;
    expect(map.tiers.a.tier).toBe('mid');
    expect(map.tiers.b.tier).toBe('high');
    expect(map.tiers.c.tier).toBe('low');
  });

  it('survives a code fence and skips unusable entries without emptying the map', () => {
    const raw = '```json\n{"ranks":[{"i":0,"tier":"high"},{"i":9,"tier":"low"},{"i":1,"tier":"???"}]}\n```';
    const map = parseRank(raw, items)!;
    expect(Object.keys(map.tiers)).toEqual(['a']);
  });
});

describe('parseDiagnosis', () => {
  it('accepts quoted scalars — rejecting them hid the plan tiles and flipped a verdict', () => {
    const raw = '{"summary":"s","verdicts":[{"platform":"Reddit","ready":"true","why":"w"}],'
      + '"plan":{"repliesPerWeek":"5","weeksBeforeLaunch":3,"topics":["rag"]},"rules":["r"]}';
    const d = parseDiagnosis(raw)!;
    expect(d.verdicts[0].ready).toBe(true);
    expect(d.plan.repliesPerWeek).toBe(5);
  });
});

describe('parseDrafts / parseSubNames', () => {
  it('splits decorated headings WITHOUT leaking the heading into the body', () => {
    // This shipped: drafts opened with a bare "ENFP" line and the coach note
    // read "COACH Ce fil est…", because the heading class matched newlines.
    const raw = '### INTP\nbody one\n\n**ISTJ**\nbody two\n\n### COACH\nnote';
    const set = parseDrafts(raw, ['INTP', 'ISTJ']);
    expect(set.drafts.map(d => d.type)).toEqual(['INTP', 'ISTJ']);
    expect(set.drafts.map(d => d.text)).toEqual(['body one', 'body two']);
    expect(set.coach).toBe('note');
  });

  it('reads sub names with or without the r/ prefix', () => {
    expect(parseSubNames('r/LocalLLaMA\nselfhosted\n- r/AI_Agents')).toEqual(
      ['LocalLLaMA', 'selfhosted', 'AI_Agents'],
    );
  });
});

// ── merge: a partial run must never erase what a good run brought ────────────

describe('mergeScan', () => {
  const prev = [item({ id: 'old-reddit', target: 'r/x' }), item({ id: 'old-hn', target: 'HN · rag' })];

  it('replaces only the targets that answered', () => {
    const next = [item({ id: 'fresh', target: 'r/x' })];
    const out = mergeScan(prev, next, ['r/x']);
    expect(out.map(i => i.id).sort()).toEqual(['fresh', 'old-hn']);
  });

  it('keeps a marked item even when its target answered without it', () => {
    const next = [item({ id: 'fresh', target: 'r/x' })];
    const out = mergeScan(prev, next, ['r/x'], new Set(['old-reddit']));
    expect(out.map(i => i.id).sort()).toEqual(['fresh', 'old-hn', 'old-reddit']);
  });

  it('carries everything when nothing answered (a throttled scan)', () => {
    expect(mergeScan(prev, [], []).map(i => i.id).sort()).toEqual(['old-hn', 'old-reddit']);
  });
});

// ── unread: absent is not zero, and one network is not the other ─────────────

describe('unseen counting', () => {
  const marks = { reddit: '2026-01-01T00:00:00.000Z', hackernews: '2026-01-01T00:00:00.000Z' };

  it('counts a fresh reply once, not twice', () => {
    const t = thread({
      network: 'hackernews', followed: true, timestamp: '2026-01-03T00:00:00.000Z',
      replies: [{ id: 'r', author: 'x', body: '', url: '', timestamp: '2026-01-03T00:00:00.000Z' }],
    });
    expect(unseenCount(report([t]), marks)).toBe(1);
  });

  it('never counts a followed thread with no reply (this was a permanent phantom)', () => {
    const t = thread({ network: 'hackernews', followed: true, timestamp: '2026-06-01T00:00:00.000Z' });
    expect(unseenCount(report([t]), marks)).toBe(0);
  });

  it('still alerts on a new post in the user\'s OWN sub', () => {
    const t = thread({ inMySub: true, timestamp: '2026-02-01T00:00:00.000Z' });
    expect(unseenCount(report([t]), marks)).toBe(1);
  });

  it('keeps each network on its own mark', () => {
    const fresh = { id: 'r', author: 'x', body: '', url: '', timestamp: '2026-02-01T00:00:00.000Z' };
    const rep = report([
      thread({ id: 'reddit_1', network: 'reddit', replies: [fresh] }),
      thread({ id: 'hn_1', network: 'hackernews', replies: [fresh] }),
    ]);
    const seenReddit = { ...marks, reddit: '2026-03-01T00:00:00.000Z' };
    expect(unseenByNetwork(rep, seenReddit)).toEqual({ hackernews: 1 });
    // The global KPI and the per-tab badges must agree, always.
    expect(unseenCount(rep, seenReddit)).toBe(1);
  });
});

describe('mergePresence (a run that never looked must not erase what one did)', () => {
  const deep = thread({
    id: 'reddit_a', commentCount: 2, postBody: 'the post', myBody: 'my take',
    replies: [{ id: 'r1', author: 'them', body: 'good point', url: 'u1', timestamp: '2026-01-02T00:00:00.000Z', toMe: true }],
  });
  const only = (r: PresenceReport, id: string) => r.groups.flatMap(g => g.threads).find(t => t.id === id)!;

  it('keeps the replies when the next run only saw the thread from the feed', () => {
    const shallow = thread({ id: 'reddit_a', commentCount: null, shallowWhy: 'budget' });
    const t = only(mergePresence(report([deep]), report([shallow]), ''), 'reddit_a');
    expect(t.commentCount).toBe(2);
    expect(t.replies.map(r => r.id)).toEqual(['r1']);
    // …and it must stop announcing an absence it no longer has.
    expect(t.shallowWhy).toBeUndefined();
    expect(t.myBody).toBe('my take');
  });

  it('lets a run that DID look win, including back down to zero replies', () => {
    const emptied = thread({ id: 'reddit_a', commentCount: 0, replies: [] });
    const t = only(mergePresence(report([deep]), report([emptied]), ''), 'reddit_a');
    expect(t.commentCount).toBe(0);
    expect(t.replies).toEqual([]);
  });

  it('still carries a thread the new run missed entirely', () => {
    const out = mergePresence(report([deep]), report([thread({ id: 'reddit_b' })]), '');
    expect(out.groups.flatMap(g => g.threads).map(t => t.id).sort()).toEqual(['reddit_a', 'reddit_b']);
  });
});

describe('awaitingReplies (the to-do, which is not the inbox)', () => {
  const at = '2026-05-01T00:00:00.000Z';
  const them = { id: 'r1', author: 'them', body: 'good point', url: 'u1', timestamp: at, toMe: true };
  const mineThread = (over = {}) =>
    thread({ id: 'reddit_a', url: 'https://t/a', mine: 'comment', commentCount: 1, replies: [them], ...over });
  const logged = (atTs: string): LedgerEntry =>
    ({ at: atTs, community: 'r/x', url: 'https://t/a', kind: 'participation' });

  it('keeps a reply you READ but never answered — the inbox would have dropped it', () => {
    const got = awaitingReplies(report([mineThread()]), []);
    expect(got.map(f => f.reply.id)).toEqual(['r1']);
  });

  it('drops it once the ledger shows you posted there AFTER they spoke', () => {
    expect(awaitingReplies(report([mineThread()]), [logged('2026-05-02T00:00:00.000Z')])).toHaveLength(0);
    // A reply of yours that predates theirs answered something else.
    expect(awaitingReplies(report([mineThread()]), [logged('2026-04-01T00:00:00.000Z')])).toHaveLength(1);
  });

  it('never counts a bot, nor a reply the tree proved was aimed at someone else', () => {
    const noise = thread({
      id: 'reddit_b', url: 'https://t/b', mine: 'comment', commentCount: 2,
      replies: [
        { id: 'bot', author: 'AutoModerator', body: 'rules', url: 'u', timestamp: at, bot: true },
        { id: 'other', author: 'x', body: 'hi', url: 'u', timestamp: at, toMe: false },
      ],
    });
    expect(awaitingReplies(report([noise]), [])).toHaveLength(0);
  });

  it('ignores a thread that is not yours and holds nothing addressed to you', () => {
    const stranger = thread({ id: 'reddit_c', url: 'https://t/c', mine: 'none', commentCount: 1,
      replies: [{ id: 'r9', author: 'x', body: 'hi', url: 'u', timestamp: at }] });
    expect(awaitingReplies(report([stranger]), [])).toHaveLength(0);
  });
});

describe('freshReplies (the inbox)', () => {
  const marks = { reddit: '2026-01-01T00:00:00.000Z', hackernews: '2026-01-01T00:00:00.000Z' };
  const reply = (id: string, ts: string, toMe?: boolean) =>
    ({ id, author: `a${id}`, body: 'b', url: `u${id}`, timestamp: ts, ...(toMe ? { toMe } : {}) });

  it('flattens replies across threads and puts the ones addressed to you first', () => {
    const rep = report([
      thread({ id: 'reddit_1', replies: [reply('old', '2025-01-01T00:00:00.000Z'), reply('new', '2026-05-01T00:00:00.000Z')] }),
      thread({ id: 'reddit_2', replies: [reply('mine', '2026-02-01T00:00:00.000Z', true)] }),
    ]);
    expect(freshReplies(rep, marks).map(f => f.reply.id)).toEqual(['mine', 'new']);
  });

  it('carries the thread so the row can name where it landed', () => {
    const rep = report([thread({ id: 'reddit_1', community: 'r/x', replies: [reply('n', '2026-05-01T00:00:00.000Z')] })]);
    expect(freshReplies(rep, marks)[0].thread.community).toBe('r/x');
  });

  it('is empty once the network is marked seen — and only that network', () => {
    const rep = report([
      thread({ id: 'reddit_1', network: 'reddit', replies: [reply('r', '2026-05-01T00:00:00.000Z')] }),
      thread({ id: 'hn_1', network: 'hackernews', replies: [reply('h', '2026-05-01T00:00:00.000Z')] }),
    ]);
    const after = { ...marks, reddit: '2026-06-01T00:00:00.000Z' };
    expect(freshReplies(rep, after).map(f => f.reply.id)).toEqual(['h']);
  });
});

// ── answering a PERSON: the inbox → studio loop ──────────────────────────────

describe('replyItem (a reply becomes something the Studio can work on)', () => {
  const reply = { id: 'c9', author: 'kenneth', body: 'their words', url: 'https://x/c9', timestamp: '2026-05-01T00:00:00.000Z' };

  it('carries the THREAD id and url — refreshThread must reload the room, not one comment', () => {
    const thr = thread({ id: 'hn_42', url: 'https://news.ycombinator.com/item?id=42' });
    const it = replyItem(thr, reply);
    expect(it.id).toBe('hn_42');
    expect(it.url).toBe('https://news.ycombinator.com/item?id=42');
  });

  it('is never a radar pick: score 0 and no matched topics, because nothing scored it', () => {
    const it = replyItem(thread(), reply);
    expect(it.score).toBe(0);
    expect(it.matched).toEqual([]);
  });

  it('omits `comments` when the source never gave a count — absent is not zero', () => {
    expect(replyItem(thread({ commentCount: null }), reply).comments).toBeUndefined();
    expect(replyItem(thread({ commentCount: 7 }), reply).comments).toBe(7);
  });

  it('keys drafts per REPLY, so answering a second person cannot erase the first', () => {
    expect(replyDraftKey(reply)).toBe('reply_c9');
    expect(replyDraftKey({ ...reply, id: 'c10' })).not.toBe(replyDraftKey(reply));
  });

  it('hands the model their words AND the message of yours they answered', () => {
    const rt = replyingToOf(thread({ myBody: 'what I said before' }), reply);
    expect(rt).toEqual({ author: 'kenneth', body: 'their words', mine: 'what I said before' });
    // A post of the user's carries no `myBody` — claiming one would invent it.
    expect(replyingToOf(thread({ myBody: '' }), reply).mine).toBeUndefined();
  });
});

describe('buildDraftPrompt when answering a person', () => {
  const base = item({ target: 'r/LocalLLaMA', title: 'a thread' });

  it('aims the model at THEIR comment, by name', () => {
    const p = buildDraftPrompt(base, ['INTP'], null, {
      replyingTo: { author: 'kenneth', body: 'is it auditable?', mine: 'I built X' },
    });
    expect(p).toContain('engage kenneth directly');
    expect(p).toContain('is it auditable?');
    expect(p).toContain('YOUR EARLIER MESSAGE');
  });

  it('drops the thread\'s other comments — answering one person, not the room', () => {
    const withPerson = buildDraftPrompt(base, ['INTP'], null, {
      recentComments: ['some unrelated take'],
      replyingTo: { author: 'k', body: 'b' },
    });
    expect(withPerson).not.toContain('some unrelated take');
    // Without a person, those same comments are still the drafting context.
    expect(buildDraftPrompt(base, ['INTP'], null, { recentComments: ['some unrelated take'] }))
      .toContain('some unrelated take');
  });

  it('leaves the radar prompt exactly as it was', () => {
    const p = buildDraftPrompt(base, ['INTP'], null, {});
    expect(p).toContain('Draft a reply a real person will edit and post THEMSELVES.');
    expect(p).not.toContain('YOUR EARLIER MESSAGE');
  });
});

// ── scoring: a dead thread must not look like an opportunity ─────────────────

describe('scoreItems freshness', () => {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  const one = (over: Partial<ScoredItem>) => scoreItems([item({ title: 'vector search', ...over })], ['vector search'])[0];

  it('stops paying the "alive" bonus to a thread nobody read (this was the bug)', () => {
    // The real case: HN 48875483 — 25 days old, 2 comments, one of them the
    // author's own. It scored 50 and sat in the picks.
    const dead = one({ timestamp: at(25 * 24), comments: 2 });
    const alive = one({ timestamp: at(3), comments: 2 });
    expect(dead.score).toBeLessThan(alive.score / 2);
  });

  it('decays a stale thread instead of hiding it — it may still be worth reading', () => {
    expect(one({ timestamp: at(25 * 24) }).score).toBeGreaterThan(0);
  });

  it('leaves a fresh thread exactly as it scored before', () => {
    // 40 (one match) + ~30 freshness + 10 temperature.
    const fresh = one({ timestamp: at(0), comments: 5 });
    expect(fresh.score).toBe(80);
  });

  it('says WHEN a thread is over, so the UI never has to guess', () => {
    expect(isStale({ timestamp: at(25 * 24) })).toBe(true);
    expect(isStale({ timestamp: at(24) })).toBe(false);
    // An unparseable date is not "old" — it is unknown, and must not be tagged.
    expect(isStale({ timestamp: 'not a date' })).toBe(false);
  });
});

// ── the drafter must have READ the post ──────────────────────────────────────

describe('refreshThread brings the post back', () => {
  const hnItem = item({ id: 'hn_42', network: 'hackernews', url: 'https://news.ycombinator.com/item?id=42' });

  it('returns the HN post text, so a reply is never written blind', async () => {
    const fetchUrl = () => Promise.resolve({
      status: 200,
      body: JSON.stringify({ text: 'the original question', children: [{ text: 'a', created_at: '2026-01-01' }] }),
    });
    const check = await refreshThread(hnItem, fetchUrl);
    expect(check.postBody).toBe('the original question');
    expect(check.commentCount).toBe(1);
  });

  it('describes a link post by what it points at rather than handing back nothing', async () => {
    const fetchUrl = () => Promise.resolve({ status: 200, body: JSON.stringify({ url: 'https://example.com/x', children: [] }) });
    expect((await refreshThread(hnItem, fetchUrl)).postBody).toContain('https://example.com/x');
  });

  it('reports an empty post body on failure — never a fabricated one', async () => {
    const fetchUrl = () => Promise.resolve({ status: 500, body: '' });
    const check = await refreshThread(hnItem, fetchUrl);
    expect(check.postBody).toBe('');
    expect(check.unknown).toBe(true);
  });
});

describe('extractMedia (the substance that walks out with the href)', () => {
  it('recovers the image url a Reddit post hides behind "[link]"', () => {
    const html = '<table><tr><td><a href="https://i.redd.it/abc123.jpeg">[link]</a></td></tr></table>';
    expect(extractMedia(html)).toEqual(['https://i.redd.it/abc123.jpeg']);
    // htmlToText — what the drafter used to receive — keeps none of it.
    expect(htmlToText(html)).not.toContain('i.redd.it');
  });

  it('decodes feed entities, or the url opens nothing', () => {
    const html = '<img src="https://preview.redd.it/x.png?width=640&amp;crop=smart">';
    expect(extractMedia(html)[0]).toBe('https://preview.redd.it/x.png?width=640&crop=smart');
  });

  it('ignores ordinary links — this is about media, not every href', () => {
    expect(extractMedia('<a href="https://reddit.com/r/x/comments/1/">[comments]</a>')).toEqual([]);
  });

  it('reports nothing for a text post rather than inventing an attachment', () => {
    expect(extractMedia('<p>just words</p>')).toEqual([]);
  });
});

describe('buildDraftPrompt with unread media', () => {
  it('forbids the model from imagining what is in the image', () => {
    const p = buildDraftPrompt(item({ title: 't' }), ['INTP'], null, { unreadMedia: 1 });
    expect(p).toContain('NOT read by anyone');
    expect(p).toContain('Never describe, quote or assume their content');
  });

  it('stays silent when there is no media — no phantom warning', () => {
    expect(buildDraftPrompt(item({ title: 't' }), ['INTP'], null, {})).not.toContain('NOT read by anyone');
  });
});

// ── the two version fields must agree ───────────────────────────────────────

describe('version drift', () => {
  it('keeps package.json in step with the manifest', () => {
    // The manifest is the source of truth (the footer and Settings read it),
    // so package.json was quietly left three minor versions behind — the
    // build banner said 0.3.0 while the app shipped 0.6. Cheap to check,
    // invisible otherwise.
    const read = (f: string) =>
      JSON.parse(readFileSync(join(__dirname, '..', '..', f), 'utf-8')) as { version: string };
    expect(read('package.json').version).toBe(read('mnemo-plugin.json').version);
  });
});

// ── per-network settings: the 0.6 migration must not lose a thing ───────────

describe('normalizeProfile — the flat profile becomes per-network', () => {
  /** A real 0.5 profile: ten subs that took the user real time to collect. */
  const legacy = {
    topics: ['local AI', 'RAG'],
    subs: ['LocalAI', 'LocalLLaMA', 'Local_SEO_for_AI', 'LocalLLM', 'isthisAI',
      'LocalAIServers', 'antiai', 'aislop', 'StableDiffusion', 'AI_Agents'],
    redditUser: 'YakaaAaaAa',
    hnUser: 'MnemosyneOS',
    mySub: 'MnemosyneOS',
  } as never;

  it('carries every subreddit across — losing these is worse than no migration', () => {
    const p = normalizeProfile(legacy);
    expect(netOf(p, 'reddit').targets).toHaveLength(10);
    expect(netOf(p, 'reddit').targets).toContain('AI_Agents');
    expect(netOf(p, 'reddit').handle).toBe('YakaaAaaAa');
    expect(netOf(p, 'reddit').home).toBe('MnemosyneOS');
  });

  it('gives Hacker News its own targets, seeded from the topics it used to reuse', () => {
    const p = normalizeProfile(legacy);
    expect(netOf(p, 'hackernews').handle).toBe('MnemosyneOS');
    expect(netOf(p, 'hackernews').targets).toEqual(['local AI', 'RAG']);
    // Topics stay global: they are what the user KNOWS, and they score every
    // network's radar — not a Hacker News search string.
    expect(p.topics).toEqual(['local AI', 'RAG']);
  });

  it('never runs twice — live settings are not clobbered by the old fields', () => {
    const once = normalizeProfile(legacy);
    const edited = { ...once, nets: { ...once.nets, reddit: { ...netOf(once, 'reddit'), targets: ['only'] } } };
    expect(netOf(normalizeProfile(edited), 'reddit').targets).toEqual(['only']);
  });

  it('leaves an untouched network ABSENT, which is what marks it never set up', () => {
    const p = normalizeProfile({ topics: [], subs: [], redditUser: '', hnUser: '', mySub: '' } as never);
    expect(p.nets.reddit).toBeUndefined();
    expect(p.nets.linkedin).toBeUndefined();
    // And reading one that is absent is still safe.
    expect(netOf(p, 'linkedin')).toEqual(EMPTY_NET);
  });

  it('survives a corrupted profile instead of throwing on load', () => {
    const p = normalizeProfile({ topics: 'not a list', subs: [1, null, 'ok'] } as never);
    expect(p.topics).toEqual([]);
    expect(netOf(p, 'reddit').targets).toEqual(['ok']);
  });

  it('completes a network stored before a field existed — undefined must not read as "off"', () => {
    // Exactly the shape 0.6.3 wrote: no profileUrl, no postLang, no audience.
    const stored = { nets: { linkedin: { handle: 'me', home: '', targets: [], bio: 'b', configuredAt: 'x' } } } as never;
    const p = normalizeProfile(stored);
    const net = netOf(p, 'linkedin');
    expect(net.handle).toBe('me');
    expect(net.postLang).toBe('');
    expect(net.audience).toBe('');
    expect(net.profileUrl).toBe('');
  });

  it('completes it on READ too — a restored mirror never goes through normalize', () => {
    const raw = { nets: { x: { handle: 'me' } } } as never;
    expect(netOf(raw, 'x').audience).toBe('');
    expect(netOf(raw, 'x').targets).toEqual([]);
  });
});

// ── the reputation engine: standing, and the verdict on top of it ───────────

describe('promoBanRule', () => {
  it('catches a ban in the community OWN words, and returns them verbatim', () => {
    expect(promoBanRule(['No self-promotion'])).toBe('No self-promotion');
    expect(promoBanRule(['Be nice', 'No advertising or spam'])).toBe('No advertising or spam');
    expect(promoBanRule(['Self-promotion is not allowed'])).toBe('Self-promotion is not allowed');
  });

  it('does NOT read a framed permission as a ban', () => {
    // Over-blocking tells the user a door is shut when it is open, and they
    // never try it again — worse than letting one through.
    expect(promoBanRule(['Self-promotion allowed on Fridays only'])).toBeNull();
    expect(promoBanRule(['Be nice', 'Stay on topic'])).toBeNull();
    expect(promoBanRule([])).toBeNull();
  });

  it('does not let a NEGATED permission cancel the ban', () => {
    // Rules arrive with their description attached now, and those spell the
    // ban out twice: the allow-words guard saw "allowed" inside "not allowed"
    // and waved a closed door through as open.
    expect(promoBanRule(['No advertising — ads are not allowed here']))
      .toBe('No advertising — ads are not allowed here');
    expect(promoBanRule(['No self-promotion — self-promotion is never permitted'])).not.toBeNull();
    // …and the real exception still passes.
    expect(promoBanRule(['No self-promotion — except in the Friday thread, where it is allowed'])).toBeNull();
  });
});

// ── lot 2: what Reddit publishes for free, and what it refuses to say ───────

describe('parseAccountKarma', () => {
  it('reads the karma Reddit publishes to anyone, no account needed', () => {
    const a = parseAccountKarma('yaka0007', JSON.stringify({
      kind: 't2',
      data: { link_karma: 120, comment_karma: 3400, total_karma: 3520, created_utc: 1600000000 },
    }))!;
    expect(a.total).toBe(3520);
    expect(a.link).toBe(120);
    expect(a.createdAt.slice(0, 4)).toBe('2020');
  });

  it('sums the two halves when the newer total is absent', () => {
    expect(parseAccountKarma('y', JSON.stringify({ data: { link_karma: 10, comment_karma: 5 } }))!.total).toBe(15);
  });

  it('returns NOTHING when no karma came back — a suspended account is not a zero', () => {
    // Reddit answers 200 with a payload that simply has no karma in it, and
    // `Number(undefined) || 0` there prints a hard "0 karma" for an account
    // with thousands. Absent is absent.
    expect(parseAccountKarma('y', JSON.stringify({ data: { is_suspended: true, name: 'y' } }))).toBeNull();
    expect(parseAccountKarma('y', '{}')).toBeNull();
    expect(parseAccountKarma('y', '<html>Forbidden</html>')).toBeNull();
  });
});

describe('parseSubRules', () => {
  const payload = (rules: unknown[]) => JSON.stringify({ rules });

  it('keeps the community OWN words — the verdict rests on what the human is shown', () => {
    const r = parseSubRules('r/LocalLLaMA', payload([
      { short_name: 'No self-promotion', description: 'Links to your own product are removed.' },
      { short_name: 'Be civil', description: '' },
    ]))!;
    expect(r.rules[0]).toBe('No self-promotion — Links to your own product are removed.');
    expect(r.rules[1]).toBe('Be civil');
    expect(promoBanRule(r.rules)).toBe(r.rules[0]);
  });

  it('tells an EMPTY rulebook apart from an unread one', () => {
    // A sub that answered and publishes nothing has been READ. A payload we
    // could not parse has not, and readiness must not treat them alike.
    expect(parseSubRules('r/x', payload([]))!.rules).toEqual([]);
    expect(parseSubRules('r/x', JSON.stringify({ error: 403 }))).toBeNull();
    expect(parseSubRules('r/x', '<html>')).toBeNull();
  });

  it('shows the cut when a rule is too long to keep whole', () => {
    // A visible ellipsis is not a paraphrase; a silent trim would be.
    const r = parseSubRules('r/x', payload([{ short_name: 'Rule 1', description: 'x'.repeat(2000) }]))!;
    expect(r.rules[0].endsWith('…')).toBe(true);
    expect(r.rules[0].length).toBeLessThan(700);
  });
});

describe('refreshRedditFacts — the fetch that turns the engine on', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const ACCOUNT = { status: 200, body: JSON.stringify({ data: { link_karma: 1, comment_karma: 2, total_karma: 3 } }) };
  const RULES = { status: 200, body: JSON.stringify({ rules: [{ short_name: 'No self-promotion' }] }) };
  const answer = (url: string) => Promise.resolve(url.includes('/about.json') ? ACCOUNT : RULES);

  /** Runs the gate's 5s app-wide spacing forward instead of waiting on it. */
  const settle = async <T,>(p: Promise<T>): Promise<T> => { await vi.runAllTimersAsync(); return p; };

  it('fills the karma and the rules the verdict was missing', async () => {
    const asked: string[] = [];
    const facts = await settle(refreshRedditFacts('yaka', ['r/LocalLLaMA'], (u) => { asked.push(u); return answer(u); }));
    expect(facts.account?.total).toBe(3);
    // Keyed the way verdicts() looks a standing row up, shown the way the
    // user wrote it.
    expect(facts.rules['r/localllama'].rules).toEqual(['No self-promotion']);
    expect(facts.rules['r/localllama'].community).toBe('r/LocalLLaMA');
    expect(facts.unread).toEqual({});
    expect(asked.some(u => u.endsWith('/r/LocalLLaMA/about/rules.json'))).toBe(true);
  });

  it('calls a wall an UNKNOWN, never "this community has no rules"', async () => {
    const facts = await settle(refreshRedditFacts('yaka', ['r/walled'], () => Promise.resolve({ status: 403, body: '' })));
    expect(facts.account).toBeNull();
    expect(facts.rules['r/walled']).toBeUndefined();
    expect(facts.unread['r/walled']).toBe('walled');
    // Which is what keeps the verdict at unknown instead of "not ready".
    expect(readiness('r/walled', 'reddit', null, null).level).toBe('unknown');
  });

  it('stops asking a door that already refused — the wall is remembered', async () => {
    let calls = 0;
    const wall = () => { calls++; return Promise.resolve({ status: 403, body: '' }); };
    await settle(refreshRedditFacts('yaka', ['r/aaa', 'r/bbb', 'r/ccc'], wall));
    const spent = calls;
    await settle(refreshRedditFacts('yaka', ['r/aaa', 'r/bbb', 'r/ccc'], wall));
    expect(calls).toBe(spent);
    expect(spent).toBeLessThanOrEqual(2);
  });

  it('rotates through the subs instead of re-reading the same two', async () => {
    const asked: string[] = [];
    const fetchUrl = (u: string) => { asked.push(u); return answer(u); };
    const subs = ['r/aaa', 'r/bbb', 'r/ccc', 'r/ddd'];
    // No handle: nothing to read on the account, so every call is a rulebook.
    await settle(refreshRedditFacts('', subs, fetchUrl));
    expect(asked.length).toBe(2);
    await settle(refreshRedditFacts('', subs, fetchUrl));
    expect(new Set(asked).size).toBe(4);
  });

  it('never pays twice for a rulebook that is still fresh', async () => {
    let reads = 0;
    const fetchUrl = (u: string) => { if (u.includes('rules.json')) reads++; return answer(u); };
    await settle(refreshRedditFacts('', ['r/one'], fetchUrl));
    await settle(refreshRedditFacts('', ['r/one'], fetchUrl));
    expect(reads).toBe(1);
    // A sub rewrites its rules a few times a year — a week later, look again.
    vi.setSystemTime(Date.now() + 8 * 24 * 3_600_000);
    await settle(refreshRedditFacts('', ['r/one'], fetchUrl));
    expect(reads).toBe(2);
  });

  it('drops the karma when the pseudonym changes — it is somebody else\'s', async () => {
    const first = await settle(refreshRedditFacts('yaka', [], () => Promise.resolve(ACCOUNT)));
    expect(first.account?.handle).toBe('yaka');
    const dead = await settle(refreshRedditFacts('other', [], () => Promise.resolve({ status: 500, body: '' })));
    expect(dead.account).toBeNull();
  });

  it('hands back everything ever read, not only what this run asked for', async () => {
    await settle(refreshRedditFacts('', ['r/one'], answer));
    // r/one left the scan list, but it can still own a standing row.
    const facts = await settle(refreshRedditFacts('', ['r/two'], answer));
    expect(facts.rules['r/one']).toBeDefined();
    expect(facts.rules['r/two']).toBeDefined();
  });
});

describe('standings', () => {
  const led = (community: string, kind: 'participation' | 'promo', at = '2026-08-01T00:00:00.000Z') =>
    ({ at, community, url: 'u', kind });

  it('counts per community and never sums them into one figure', () => {
    const out = standings([
      led('r/LocalLLaMA', 'participation'),
      led('r/LocalLLaMA', 'participation'),
      led('r/selfhosted', 'participation'),
      led('r/LocalLLaMA', 'promo'),
    ], null);
    expect(out.map(s => s.community)).toEqual(['r/LocalLLaMA', 'r/selfhosted']);
    expect(out[0]).toMatchObject({ acts: 2, promo: 1, network: 'reddit' });
    expect(out[1]).toMatchObject({ acts: 1, promo: 0 });
  });

  it('leaves an unmeasured average NULL — absent is not zero', () => {
    const out = standings([led('r/x', 'participation')], null);
    expect(out[0].avgScore).toBeNull();
    expect(out[0].scored).toBe(0);
    // No report at all: karma is unknown, never 0.
    expect(out[0].karma).toBeNull();
  });

  it('carries each network\'s public karma onto its own rows, and no further', () => {
    // One karma per ACCOUNT — Reddit publishes nothing per subreddit — so the
    // same figure rides every community of that network, and HN's never
    // crosses over to a subreddit.
    const rep: PresenceReport = {
      groups: [], hnKarma: 812, failed: [], rateLimited: false, at: '2026-08-06T00:00:00.000Z',
      redditAccount: {
        handle: 'yaka', link: 20, comment: 100, total: 120,
        createdAt: '', fetchedAt: '2026-08-06T00:00:00.000Z',
      },
    };
    const out = standings([led('r/x', 'participation'), led('Hacker News', 'participation')], rep);
    const by = Object.fromEntries(out.map(s => [s.community, s.karma]));
    expect(by['r/x']).toBe(120);
    expect(by['Hacker News']).toBe(812);
    // A report that never read the account leaves it unknown, not at zero.
    expect(standings([led('r/x', 'participation')], { ...rep, redditAccount: null })[0].karma).toBeNull();
  });

  it('counts replies received on the user OWN threads, bots excluded', () => {
    const rep: PresenceReport = {
      groups: [{ community: 'r/x', threads: [
        thread({ id: 'mine', mine: 'post', community: 'r/x', myScore: 12, replies: [
          { id: 'a', author: 'someone', body: 'real', url: '', timestamp: '2026-01-01T00:00:00.000Z' },
          { id: 'b', author: 'AutoModerator', body: 'wiki', url: '', timestamp: '2026-01-01T00:00:00.000Z', bot: true },
        ] }),
        thread({ id: 'theirs', mine: 'none', community: 'r/x' }),
      ] }],
      hnKarma: null, failed: [], rateLimited: false, at: '2026-01-02T00:00:00.000Z',
    };
    const out = standings([], rep);
    expect(out[0]).toMatchObject({ threads: 1, repliesReceived: 1, avgScore: 12, scored: 1 });
  });
});

// ── an act Pheme did not write is worth MORE, and has to be recognisable ────

describe('threadKey — the join the whole autonomy count rests on', () => {
  // The three shapes Reddit hands the same thread under. If these ever stop
  // agreeing, every assisted act silently reads as an autonomous one and the
  // credit inflates — the expensive direction, and a silent one.
  const POST = 'https://www.reddit.com/r/AI_Agents/comments/abc123/some_title/';
  const BASE = 'https://www.reddit.com/r/AI_Agents/comments/abc123/';
  const COMMENT = 'https://www.reddit.com/r/AI_Agents/comments/abc123/some_title/def456/';

  it('reduces a post permalink, a thread base and a deep comment link to ONE key', () => {
    expect(threadKey(POST)).toBe('reddit:abc123');
    expect(threadKey(BASE)).toBe('reddit:abc123');
    expect(threadKey(COMMENT)).toBe('reddit:abc123');
  });

  it('keeps different threads apart, and is case-insensitive on the sub', () => {
    expect(threadKey('https://www.reddit.com/r/other/comments/zzz999/x/'))
      .not.toBe(threadKey(POST));
    expect(threadKey('https://old.reddit.com/r/ai_agents/comments/ABC123/x/')).toBe('reddit:abc123');
  });

  it('keys Hacker News on the item id, whatever rides in the query', () => {
    expect(threadKey('https://news.ycombinator.com/item?id=4242')).toBe('hn:4242');
    expect(threadKey('https://news.ycombinator.com/item?p=2&id=4242')).toBe('hn:4242');
  });

  it('returns NOTHING for an empty url — an unplaceable act joins nothing', () => {
    // The manual promo button logs `url: ''`. A key of '' must never match
    // another '' and quietly mark a thread as assisted.
    expect(threadKey('')).toBe('');
    expect(threadKey('   ')).toBe('');
    expect(ledgerKeys([{ at: 'x', community: 'r/x', url: '', kind: 'promo' }]).size).toBe(0);
  });

  it('counts a PROMO logged against a url as a thread Pheme knows about', () => {
    // Otherwise the one act the doctrine charges for would fall through as
    // "autonomous" and pay itself a bonus.
    const keys = ledgerKeys([{ at: 'x', community: 'r/x', url: POST, kind: 'promo' }]);
    expect(keys.has('reddit:abc123')).toBe(true);
  });
});

describe('isSoloAct — one rule, read by the engine AND by the card', () => {
  const POST = 'https://www.reddit.com/r/x/comments/abc123/t/';
  const written = new Set(['reddit:abc123']);

  it('agrees with what standings counts, thread by thread', () => {
    // The badge on a card and the figure in the verdict come from this one
    // function on purpose: a card saying "solo" beside a verdict that did not
    // count it would discredit both.
    const solo = thread({ mine: 'comment', community: 'r/x', url: 'https://www.reddit.com/r/x/comments/zzz/t/' });
    const assisted = thread({ mine: 'comment', community: 'r/x', url: POST });
    expect(isSoloAct(solo, written)).toBe(true);
    expect(isSoloAct(assisted, written)).toBe(false);
    // Same premise on both sides: the ledger below is what `written` above
    // stands for. Handing standings an EMPTY ledger would compare two
    // different questions and prove nothing.
    const ledger = [{ at: '2026-08-01T00:00:00.000Z', community: 'r/x', url: POST, kind: 'participation' as const }];
    expect(ledgerKeys(ledger)).toEqual(written);
    expect(standings(ledger, report([solo, assisted]))[0].autonomous).toBe(1);
  });

  it('is false for all three reasons, which are NOT the same sentence', () => {
    expect(isSoloAct({ mine: 'post', url: 'https://www.reddit.com/r/x/comments/zzz/t/' }, written)).toBe(false);
    expect(isSoloAct({ mine: 'none', url: 'https://www.reddit.com/r/x/comments/zzz/t/' }, written)).toBe(false);
    expect(isSoloAct({ mine: 'comment', url: POST }, written)).toBe(false);
    expect(isSoloAct({ mine: 'comment', url: '' }, written)).toBe(false);
  });
});

describe('standings — acts written without Pheme', () => {
  const POST = 'https://www.reddit.com/r/x/comments/abc123/some_title/';
  const mineComment = (over: Partial<ThreadNode> = {}) =>
    thread({ mine: 'comment', community: 'r/x', url: POST, ...over });

  it('counts a comment the ledger never saw as autonomous', () => {
    const out = standings([], report([mineComment()]));
    expect(out[0]).toMatchObject({ acts: 0, autonomous: 1, threads: 1 });
  });

  it('does NOT count one the ledger already has — under a different url shape', () => {
    // The ledger stores the radar's permalink; presence stores the thread base.
    // Matching on the raw string would double-count every assisted reply.
    const ledger = [{ at: '2026-08-01T00:00:00.000Z', community: 'r/x', url: POST, kind: 'participation' as const }];
    const out = standings(ledger, report([mineComment({ url: 'https://www.reddit.com/r/x/comments/abc123/' })]));
    expect(out[0]).toMatchObject({ acts: 1, autonomous: 0 });
  });

  it('never counts the user\'s own POST — it may be the promo itself', () => {
    // Nothing here can tell a genuine post from a launch, so it stays out of
    // the credit rather than funding it.
    const out = standings([], report([thread({ mine: 'post', community: 'r/x', url: POST })]));
    expect(out[0]).toMatchObject({ autonomous: 0, threads: 1 });
  });

  it('never counts somebody else\'s thread', () => {
    const out = standings([], report([thread({ mine: 'none', community: 'r/x', url: POST })]));
    expect(out).toEqual([]);
  });

  it('says nothing about a thread whose url keys to nothing', () => {
    // Unplaceable is not "written alone". It is unmeasured, and unmeasured
    // stays out of a count that pays double.
    const out = standings([], report([mineComment({ url: '' })]));
    expect(out[0]).toMatchObject({ autonomous: 0, threads: 1 });
  });
});

describe('readiness — the verdict', () => {
  const st = (over: Partial<Standing> = {}): Standing => ({
    community: 'r/x', network: 'reddit', acts: 0, autonomous: 0, promo: 0, threads: 0,
    repliesReceived: 0, avgScore: null, scored: 0, karma: null, lastActAt: '', ...over,
  });
  const rules = (list: string[]): CommunityRules =>
    ({ community: 'r/x', rules: list, fetchedAt: '2026-08-06T00:00:00.000Z' });
  const gaps = (v: { missing: { code: string }[] }) => v.missing.map(g => g.code);

  it('says BLOCKED on a ban, whatever the numbers say', () => {
    // No amount of participation unlocks a sub that forbids self-promotion.
    // Saying so immediately saves the user three weeks.
    const v = readiness('r/x', 'reddit', st({ acts: 200 }), rules(['No self-promotion']));
    expect(v.level).toBe('blocked');
    expect(v.because[0]).toMatchObject({ text: 'No self-promotion', from: 'rule' });
  });

  it('says UNKNOWN when nothing was measured — never "not yet"', () => {
    // "You are not ready" and "I cannot tell" are different sentences.
    expect(readiness('r/x', 'reddit', null, null).level).toBe('unknown');
    expect(readiness('r/x', 'reddit', st(), rules([])).level).toBe('unknown');
  });

  it('stays UNKNOWN on an earn surface while the rules are unread', () => {
    // The counted side can look fine and the door still be shut.
    const v = readiness('r/x', 'reddit', st({ acts: 40 }), null);
    expect(v.level).toBe('unknown');
    expect(gaps(v)).toContain('rules-unread');
  });

  it('rules READY on an open surface without needing a rulebook', () => {
    expect(readiness('DEV', 'devto', st({ acts: 1 }), null).level).toBe('ready');
  });

  it('makes promotion RAISE the bar, never lower it', () => {
    const clean = readiness('r/x', 'reddit', st({ acts: 8 }), rules(['Be nice']));
    expect(clean.level).toBe('ready');
    const pitched = readiness('r/x', 'reddit', st({ acts: 8, promo: 3 }), rules(['Be nice']));
    expect(pitched.level).not.toBe('ready');
    expect(pitched.missing).toContainEqual({ code: 'promo-raises-bar', n: 3 });
  });

  it('pays a solo act DOUBLE — the tool is a starter, not a crutch', () => {
    // Four replies written without Pheme clear an `earn` surface that asks
    // eight assisted ones. ⚠️ If this ever flips, someone has read the weight
    // as an inverted comparison and reversed the product's thesis.
    // `threads` rides along on every solo fixture: that is the shape
    // `standings` actually produces, since a solo act IS a tracked thread.
    expect(readiness('r/x', 'reddit', st({ autonomous: 4, threads: 4 }), rules(['Be nice'])).level).toBe('ready');
    expect(readiness('r/x', 'reddit', st({ acts: 4 }), rules(['Be nice'])).level).not.toBe('ready');
    // And they add up with the assisted ones rather than replacing them.
    expect(readiness('r/x', 'reddit', st({ acts: 2, autonomous: 3, threads: 3 }), rules(['Be nice'])).level).toBe('ready');
  });

  it('counts the remaining workload in CREDIT, not in raw acts', () => {
    // 2 solo = 4 earned against a floor of 8, so four are left — not six.
    const v = readiness('r/x', 'reddit', st({ autonomous: 2, threads: 2 }), rules(['Be nice']));
    expect(v.missing).toContainEqual({ code: 'more-replies', n: 4 });
  });

  it('is not "nothing measured" when the only acts are solo ones', () => {
    // The unknown guard has to name every counted quantity that can carry a
    // verdict, or four solo replies get announced as an empty slate.
    const v = readiness('r/x', 'reddit', st({ autonomous: 4, threads: 4 }), rules(['Be nice']));
    expect(gaps(v)).not.toContain('nothing-measured');
  });

  it('still lets promotion raise the bar on top of solo credit', () => {
    // The two gaps stay two different sentences: the workload, and the price
    // of having already pitched. A solo act must not cancel that surcharge.
    const v = readiness('r/x', 'reddit', st({ autonomous: 4, threads: 4, promo: 2 }), rules(['Be nice']));
    expect(v.level).not.toBe('ready');
    expect(gaps(v)).toContain('promo-raises-bar');
  });

  it('cites the solo acts as their own line, never folded into the logged ones', () => {
    const v = readiness('r/x', 'reddit', st({ acts: 3, autonomous: 2, threads: 2 }), rules(['Be nice']));
    const acts = v.because.find(r => r.code === 'acts')!;
    const solo = v.because.find(r => r.code === 'autonomous')!;
    expect(acts.n).toBe(3);
    expect(solo.n).toBe(2);
    // Still no sentence — codes and figures, the view does the words.
    expect(v.because.filter(r => r.text !== undefined)).toEqual([]);
  });

  it('stays silent about solo acts when there are none — no "0 written alone"', () => {
    const v = readiness('r/x', 'reddit', st({ acts: 3 }), rules(['Be nice']));
    expect(v.because.some(r => r.code === 'autonomous')).toBe(false);
  });

  it('cites what it rests on, with the sample size', () => {
    const v = readiness('r/x', 'reddit', st({ acts: 9, avgScore: 4, scored: 1 }), rules(['Be nice']));
    const avg = v.because.find(r => r.code === 'score')!;
    // An average over ONE post is a number, not a measurement.
    expect(avg).toMatchObject({ n: 4, sample: 1 });
    expect(v.because.every(r => ['counted', 'rule', 'gate'].includes(r.from))).toBe(true);
  });

  it('writes no sentence of its own — the view speaks the user\'s language', () => {
    // Everything generated is a code plus figures. The ONE string the engine
    // carries is the community's own wording, which is quoted, not written.
    const v = readiness('r/x', 'reddit', st({ acts: 9, karma: 300 }), rules(['Be nice']));
    expect(v.because.filter(r => r.text !== undefined)).toEqual([]);
    expect(v.because.map(r => r.code)).toContain('karma');
    const banned = readiness('r/x', 'reddit', st({ acts: 9 }), rules(['No self-promotion']));
    expect(banned.because[0].text).toBe('No self-promotion');
  });

  it('surfaces a blocked community first — it changes WHAT to do, not how much', () => {
    const blocked = readiness('r/a', 'reddit', st({ acts: 1 }), rules(['No self-promotion']));
    const close = readiness('r/b', 'reddit', st({ acts: 6 }), rules(['Be nice']));
    expect(nextMove([close, blocked])?.community).toBe('r/a');
    expect(nextMove([])).toBeNull();
  });
});

// ── a draft has to read as a peer, or it is unusable ────────────────────────

describe('scanRadar — a refused BATCH is not a verdict on its members', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const settle = async <T,>(p: Promise<T>): Promise<T> => { await vi.runAllTimersAsync(); return p; };
  const FEED = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>';
  const ok = { status: 200, body: FEED };

  it('names nobody when Reddit refuses a request covering many subs', () => {
    // The shipped behaviour: one 403 on a 15-sub multireddit printed
    // "unreachable: <fifteen healthy subs>". Reddit refuses the URL as a
    // WHOLE and never says which member it objected to.
    const subs = ['aa', 'bb', 'cc', 'dd'];
    return settle(scanRadar(subs, [], () => Promise.resolve({ status: 403, body: '' })))
      .then(out => {
        expect(out.failed).toEqual([]);
        expect(out.uncovered.sort()).toEqual(['r/aa', 'r/bb', 'r/cc', 'r/dd']);
        expect(out.subsCovered).toEqual({ ok: 0, total: 4 });
      });
  });

  it('salvages the healthy half instead of losing the whole roster', async () => {
    // One dead sub used to take fourteen good ones down with it, every scan,
    // forever. Splitting once recovers the half that answers.
    const dead = 'zz';
    const fetchUrl = (url: string) =>
      Promise.resolve(url.includes(dead) ? { status: 404, body: '' } : ok);
    const out = await settle(scanRadar(['aa', 'bb', 'cc', dead], [], fetchUrl));
    expect(out.okTargets.sort()).toEqual(['r/aa', 'r/bb']);
    expect(out.subsCovered.ok).toBe(2);
    // The half that still refused is named as uncovered, not as broken.
    expect(out.uncovered.sort()).toEqual(['r/cc', 'r/zz']);
    expect(out.failed).toEqual([]);
  });

  it('names a sub only when a request covering IT ALONE was refused', async () => {
    const out = await settle(scanRadar(['solo'], [],
      () => Promise.resolve({ status: 404, body: '' })));
    // Asked alone and refused: that IS a fact about the sub.
    expect(out.failed).toEqual(['r/solo']);
    expect(out.uncovered).toEqual([]);
  });

  it('reports nothing at all about subs a throttle stopped it from asking', async () => {
    // They were never requested. Reporting on them would be reporting on a
    // request nobody made.
    const out = await settle(scanRadar(['aa', 'bb'], [],
      () => Promise.resolve({ status: 429, body: '' })));
    expect(out.rateLimited).toBe(true);
    expect(out.failed).toEqual([]);
    expect(out.uncovered).toEqual([]);
  });
});

describe('draft register — the brand-comment tells, caught before posting', () => {
  /**
   * The real Hacker News draft that started this. Corporate and translated,
   * two unnamed self-references, and a question the post had already answered
   * (the author had written that the CLI is Rust, embeds the renderer and
   * stays fully local). On HN that reading is unrecoverable.
   */
  const SHIPPED = 'Your rendering engine seems to address a real need for structural optimization '
    + 'that solutions based on Dagre or ELK do not always cover satisfactorily. I had to implement '
    + 'my own 2D layout equations for my OS to preserve the readability of my data networks, and '
    + 'switching to a rank-based normalization was decisive for rendering stability. '
    + 'Would it be possible to consider integrating Line9 within a local infrastructure, as a '
    + 'library or a dedicated service? The idea of automating these design principles to avoid '
    + 'manual adjustments aligns with the rigorous constraints I apply to my own systems.';

  /** The calibration target from the same thread. */
  const TARGET = 'Nice — layout is the part everyone ends up redoing by hand. I wrote my own 2D '
    + 'layout for a graph view and rank-based normalization was what finally made renders stable, '
    + "so I'm curious how you're solving it. The post says the CLI keeps everything local — is the "
    + 'renderer available as an embeddable library too, or is the CLI the only local surface?';

  const failing = (draft: string, net = 'hackernews') =>
    checkDraft(draft, 'a thread about layout engines', net).filter(c => !c.ok).map(c => c.id);

  it('rejects the draft that actually shipped', () => {
    const bad = failing(SHIPPED);
    // Rule 1, both halves: two self-referential sentences, and both unnamed.
    expect(bad).toContain('selfRef');
    expect(bad).toContain('vagueSelfRef');
    // And note what does NOT catch it: at four sentences it sits exactly on
    // HN's ceiling. Length was never the problem — the register was. A check
    // on length alone would have waved this straight onto the thread.
    expect(countSentences(SHIPPED)).toBe(4);
    expect(bad).not.toContain('sentences');
  });

  it('lets the calibrated version through', () => {
    // It still says "I wrote my own 2D layout" — one mention, and it carries
    // the point. That is the rule, not silence.
    expect(failing(TARGET)).toEqual([]);
  });

  it('counts self-references as ACTS, not as tokens', () => {
    // "I think X is wrong" is a peer speaking, not a résumé.
    expect(countSelfRefs('I think that approach is wrong, and here is why.')).toBe(0);
    // One boast, however many possessives it packs in. Counting tokens scored
    // this 3 and failed a draft that mentions itself exactly once — which is
    // the amount the doctrine allows.
    expect(countSelfRefs('I wrote my own parser for my stack.')).toBe(1);
    // Two sentences about yourself is the thing that gets caught.
    expect(countSelfRefs('I wrote my own parser. My stack handles it well.')).toBe(2);
  });

  it('reads the unnamed self-reference as the worse one', () => {
    // Naming it lands better than dangling it — the vague form is bait.
    expect(failing('Rank normalization fixed it for my OS.')).toContain('vagueSelfRef');
    expect(failing('Rank normalization fixed it for Mnemosyne.')).not.toContain('vagueSelfRef');
  });

  it('shuts the link to your own product where the gate is shut, and only there', () => {
    const link = 'Rank normalization fixed this. See https://mnemosyne-os.io for how.';
    expect(failing(link, 'hackernews')).toContain('ownLink');
    expect(failing(link, 'reddit')).toContain('ownLink');
    // Indie Hackers is `open` in the rulebook: launching there is the point.
    expect(failing(link, 'indiehackers')).not.toContain('ownLink');
    // Somebody else's link is what peers do, and stays allowed everywhere.
    expect(failing('The spec is at https://example.com/spec.', 'hackernews')).not.toContain('ownLink');
  });

  it('applies the venue\'s own sentence ceiling, not one global number', () => {
    const five = 'One. Two. Three. Four. Five.';
    expect(failing(five, 'hackernews')).toContain('sentences');
    expect(failing(five, 'reddit')).not.toContain('sentences');
    // An unidentified venue gets the strictest reading, never the loosest.
    expect(failing(five)).toContain('sentences');
  });

  it('states the rules to the model, with the venue\'s own number', () => {
    expect(peerRegisterRules('hackernews')).toContain('4 sentences maximum');
    expect(peerRegisterRules('reddit')).toContain('6 sentences maximum');
    for (const rule of ['NEVER two', 'NAME it', 'NEVER include a link', 'already answers', 'Give before asking']) {
      expect(peerRegisterRules('hackernews')).toContain(rule);
    }
  });

  it('tells the drafter to answer the question that was actually asked', () => {
    // The post ended on "what tipped the scale for YOU?" and said it did not
    // want generic advice. The drafts opened on the state of RAG and closed on
    // "show them you understand fragility" — advice, to someone who refused it.
    const rules = peerRegisterRules('reddit');
    expect(rules).toContain('ANSWER IT in the first sentence');
    expect(rules).toContain('does not want generic advice');
  });

  it('weighs memory by whether it ANSWERS the thread, not always and not never', () => {
    // The failure: a thread about getting hired came back full of RAG
    // pipelines and failover latency, because memory was listed as substance.
    // The fix is not to drop memory — it is what makes a reply something only
    // this person could write — it is to judge it per thread.
    const notes = 'I built a RAG pipeline with local fallback and sub-50ms latency.';
    const post = item({ title: 'What got you hired?' });
    expect(buildDraftPrompt(post, ['INTP'], notes, { memoryUse: 'answers' }))
      .toContain('it ANSWERS this post');
    const adj = buildDraftPrompt(post, ['INTP'], notes, { memoryUse: 'adjacent' });
    expect(adj).toContain('does NOT answer what this post asks');
    expect(adj).toContain('none of it has to appear');
    // The subject never comes from memory, whichever verdict it got.
    for (const use of ['answers', 'adjacent'] as const) {
      expect(buildDraftPrompt(post, ['INTP'], notes, { memoryUse: use }))
        .toContain('THE SUBJECT is set by the THREAD');
    }
  });

  it('asks recall to judge its own relevance, in the same call', () => {
    const p = buildRecallPrompt(item({ title: 'What got you hired?' }), ['RAG']);
    for (const v of ['RELEVANCE: answers', 'RELEVANCE: adjacent', 'RELEVANCE: none']) {
      expect(p).toContain(v);
    }
    // The distinction that was being collapsed.
    expect(p).toContain('Sharing a field with the post is `adjacent`, not `answers`');
  });

  it('reads the verdict back, and defaults to the cautious middle', () => {
    const withNotes = 'RELEVANCE: answers\n- I hire for this and here is what I look at.';
    expect(parseRecall(withNotes)).toEqual({
      relevance: 'answers', notes: '- I hire for this and here is what I look at.',
    });
    expect(parseRecall('RELEVANCE: adjacent\n- My RAG stack.').relevance).toBe('adjacent');
    // No verdict line is `adjacent`, never `answers`: defaulting to `answers`
    // on a malformed reply would restore the exact behaviour being fixed.
    expect(parseRecall('- Some notes with no verdict line.').relevance).toBe('adjacent');
    // `none`, and the legacy sentinel, both mean nothing reaches the drafter.
    expect(parseRecall('RELEVANCE: none')).toEqual({ relevance: 'none', notes: '' });
    expect(parseRecall('NOTHING_RELEVANT')).toEqual({ relevance: 'none', notes: '' });
    expect(parseRecall('')).toEqual({ relevance: 'none', notes: '' });
  });

  it('makes the author\'s own words the reply, not an ingredient in one', () => {
    // "Weave these in" is what buried a first-hand answer from a hiring
    // manager under two sentences about the state of RAG. When the author has
    // written what they want to say, that IS the reply.
    const p = buildDraftPrompt(item({ title: 'What got you hired?' }), ['INTP'], null, {
      ideas: 'je recrute, je cherche des neurodivergents capables d\'hyperfocus',
    });
    expect(p).toContain('this IS the reply, not an ingredient in one');
    expect(p).toContain('Open with it');
    expect(p).not.toContain('weave these in');
    // No ideas, no section — an empty header would invite the model to fill it.
    expect(buildDraftPrompt(item(), ['INTP'], null)).not.toContain('WHAT THE AUTHOR WANTS TO SAY');
  });

  it('warns when the handle reads as a product, not as a person', () => {
    // A brand account explaining why "its" product fits reads as astroturfing
    // even when every word is sincere — and the author cannot see it.
    expect(looksLikeBrandHandle('mnemosyne_os', 'Mnemosyne OS')).toBe(true);
    expect(looksLikeBrandHandle('acmelabs')).toBe(true);
    // A real nickname must not trip it: one false warning and the next is
    // ignored too.
    expect(looksLikeBrandHandle('yaka0007', 'Mnemosyne OS')).toBe(false);
    expect(looksLikeBrandHandle('tony')).toBe(false);
  });
});

describe('buildMeasuredBrief — the diagnosis judges on everything measured', () => {
  const prof = (over: Record<string, unknown> = {}) => normalizeProfile({
    topics: ['RAG'], trio: [], lang: 'fr', goal: 'launch',
    nets: { reddit: { handle: 'yaka', home: '', targets: ['LocalLLaMA'] } },
    ...over,
  } as never);
  const led = (n: number, kind: 'participation' | 'promo' = 'participation') =>
    Array.from({ length: n }, () => ({ at: '2026-08-01T00:00:00.000Z', community: 'r/LocalLLaMA', url: 'u', kind }));

  it('carries the ledger, the verdict per community, and the watch list', () => {
    // The judgement used to rest on a re-fetch of the RSS feed alone, while
    // the app held a verdict per community and the rules behind it.
    const brief = buildMeasuredBrief({
      profile: prof(),
      ledger: [...led(9), ...led(1, 'promo')],
      presence: {
        groups: [], hnKarma: null, failed: [], rateLimited: false, at: '',
        rules: { 'r/localllama': { community: 'r/LocalLLaMA', rules: ['Be civil'], fetchedAt: '' } },
      },
    });
    expect(brief).toContain('9 genuine replies');
    expect(brief).toContain('1 promotional posts');
    // CLOSE and not READY: the one promo raises the bar, and that nuance is
    // exactly what the diagnosis never saw before — it judged on a feed.
    expect(brief).toContain('r/LocalLLaMA: CLOSE (9 replies logged here, 0 further ones written without this app, 1 promos)');
    expect(brief).toContain('Watching: reddit LocalLLaMA');
  });

  it('marks the unmeasured as unmeasured — never as zero', () => {
    // Karma nobody read must not reach the model as "0 karma": a judgement
    // built on a fabricated zero is a judgement about a person.
    const brief = buildMeasuredBrief({ profile: prof(), ledger: led(2), presence: null });
    expect(brief).toContain('reddit NOT MEASURED');
    expect(brief).toContain('HN NOT MEASURED');
    expect(brief).not.toMatch(/karma[^\n]*\b0\b/);
  });

  it('tells the model an unread rulebook is NOT permission', () => {
    const brief = buildMeasuredBrief({
      profile: prof(), ledger: led(2),
      presence: {
        groups: [], hnKarma: null, failed: [], rateLimited: false, at: '',
        rulesUnread: { 'r/localllama': 'walled' },
      },
    });
    expect(brief).toContain('r/localllama (walled)');
    expect(brief).toContain('do not treat them as open');
  });

  it('reaches the prompt, with the instruction that keeps it honest', () => {
    const facts = { reddit: null, hn: null, rateLimited: false };
    const measured = buildMeasuredBrief({ profile: prof(), ledger: led(1), presence: null });
    const prompt = buildDiagnosisPrompt('launch', ['RAG'], facts, 'French', measured);
    expect(prompt).toContain('WHAT PHEME HAS MEASURED SO FAR');
    expect(prompt).toContain('Judge against ALL of the above');
    expect(prompt).toContain('never call it zero');
    // And without it the prompt says nothing it cannot back — no empty header.
    expect(buildDiagnosisPrompt('launch', ['RAG'], facts, 'French'))
      .not.toContain('WHAT PHEME HAS MEASURED');
  });
});

describe('watched targets — one order, one label, two surfaces', () => {
  it('sorts alphabetically and case-insensitively, not by insertion', () => {
    // Stored order is the order things were ADDED: arbitrary past the third
    // sub, and a chip row you have to read one by one is not a filter.
    expect(sortedTargets(['selfhosted', 'LocalLLaMA', 'aiwars', 'Zig']))
      .toEqual(['aiwars', 'LocalLLaMA', 'selfhosted', 'Zig']);
  });

  it('does not touch the caller\'s array', () => {
    const stored = ['b', 'a'];
    sortedTargets(stored);
    expect(stored).toEqual(['b', 'a']);
  });

  it('labels a target the way the scanned items carry it', () => {
    // The profile stores a sub bare; the radar labels it r/…. A filter built
    // on the wrong one silently matches nothing, which reads as "the scan
    // found nothing here".
    expect(targetLabel('reddit', 'LocalLLaMA')).toBe('r/LocalLLaMA');
    expect(targetLabel('reddit', 'r/LocalLLaMA')).toBe('r/LocalLLaMA');
    // Hacker News targets are queries — stored and labelled identically.
    expect(targetLabel('hackernews', 'local AI')).toBe('local AI');
  });
});

describe('standingBoard — the one composition three surfaces share', () => {
  const led = (community: string, kind: 'participation' | 'promo' = 'participation') =>
    ({ at: '2026-08-01T00:00:00.000Z', community, url: 'u', kind });
  const rep = (over: Partial<PresenceReport> = {}): PresenceReport => ({
    groups: [], hnKarma: null, failed: [], rateLimited: false,
    at: '2026-08-06T00:00:00.000Z', ...over,
  });

  it('turns a fetched rulebook into a real verdict where there was an unknown', () => {
    const ledger = Array.from({ length: 9 }, () => led('r/LocalLLaMA'));
    // No rules read: the counted side looks fine and the verdict refuses.
    expect(standingBoard(ledger, rep()).verdicts[0].level).toBe('unknown');
    // The same ledger, once the sub's own rules have been read.
    const withRules = standingBoard(ledger, rep({
      rules: { 'r/localllama': { community: 'r/LocalLLaMA', rules: ['Be civil'], fetchedAt: '' } },
    }));
    expect(withRules.verdicts[0].level).toBe('ready');
  });

  it('rules BLOCKED off the community\'s own words, and puts it first', () => {
    const board = standingBoard(
      [led('r/open'), led('r/shut'), led('r/shut')],
      rep({ rules: { 'r/shut': { community: 'r/shut', rules: ['No self-promotion'], fetchedAt: '' } } }),
    );
    expect(board.next?.community).toBe('r/shut');
    expect(board.next?.level).toBe('blocked');
  });

  it('carries WHY a rulebook is missing, so no surface can print "no rules"', () => {
    const board = standingBoard([led('r/x')], rep({ rulesUnread: { 'r/x': 'walled' } }));
    expect(board.unread['r/x']).toBe('walled');
    expect(board.verdicts[0].level).toBe('unknown');
  });

  it('scopes to one network without a second definition of what a network is', () => {
    const ledger = [led('r/x'), led('Hacker News')];
    expect(standingBoard(ledger, rep(), 'hackernews').rows.map(r => r.community)).toEqual(['Hacker News']);
    expect(standingBoard(ledger, rep(), 'reddit').rows.map(r => r.community)).toEqual(['r/x']);
    expect(standingBoard(ledger, rep()).rows).toHaveLength(2);
  });

  it('has nothing to say when nothing was measured, and says exactly that', () => {
    const board = standingBoard([], null);
    expect(board.verdicts).toEqual([]);
    expect(board.next).toBeNull();
  });
});

// ── lot 4: the report, where the model writes words and never numbers ───────

describe('reportFacts', () => {
  const led = (community: string, kind: 'participation' | 'promo' = 'participation') =>
    ({ at: '2026-08-01T00:00:00.000Z', community, url: 'u', kind });
  const rep = (over: Partial<PresenceReport> = {}): PresenceReport => ({
    groups: [], hnKarma: null, failed: [], rateLimited: false,
    at: '2026-08-06T00:00:00.000Z', ...over,
  });
  const valueOf = (f: ReturnType<typeof reportFacts>, code: string) =>
    f.facts.find(x => x.code === code)?.value;

  it('counts what it can and leaves the rest NULL — a report never rounds up to zero', () => {
    const f = reportFacts([led('r/x'), led('r/x'), led('r/x', 'promo')], rep());
    expect(valueOf(f, 'replies')).toBe(2);
    expect(valueOf(f, 'promos')).toBe(1);
    // Karma was never read. A 0 in a forwarded document is a claim.
    expect(valueOf(f, 'karmaReddit')).toBeNull();
    expect(valueOf(f, 'karmaHn')).toBeNull();
  });

  it('counts the verdicts rather than restating a score', () => {
    const f = reportFacts(
      [led('r/shut'), led('r/fine')],
      rep({ rules: {
        'r/shut': { community: 'r/shut', rules: ['No self-promotion'], fetchedAt: '' },
        'r/fine': { community: 'r/fine', rules: ['Be nice'], fetchedAt: '' },
      } }),
    );
    expect(valueOf(f, 'blocked')).toBe(1);
    expect(valueOf(f, 'rulesRead')).toBe(2);
    expect(f.communities.map(c => c.level).sort()).toEqual(['blocked', 'not-yet']);
  });

  it('names the communities it could not read instead of quietly dropping them', () => {
    const f = reportFacts([led('r/x')], rep({ rulesUnread: { 'r/x': 'walled' } }));
    expect(f.unread).toEqual([{ community: 'r/x', why: 'walled' }]);
    expect(valueOf(f, 'rulesUnread')).toBe(1);
  });

  it('scopes to one network and drops the other network\'s karma from the sheet', () => {
    const f = reportFacts([led('r/x'), led('Hacker News')], rep({ hnKarma: 500 }), 'hackernews');
    expect(f.communities.map(c => c.community)).toEqual(['Hacker News']);
    expect(valueOf(f, 'karmaHn')).toBe(500);
    expect(f.facts.some(x => x.code === 'karmaReddit')).toBe(false);
  });
});

describe('history — the only period comparison that is not invented', () => {
  const led = (n: number) => Array.from({ length: n }, () =>
    ({ at: '2026-08-01T00:00:00.000Z', community: 'r/x', url: 'u', kind: 'participation' as const }));
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  beforeEach(() => localStorage.clear());

  it('says there is NOTHING to compare against until a baseline is old enough', () => {
    // A fresh install has no history, and back-filling one would invent the
    // very figure this whole mechanism exists to make honest.
    recordSnapshot(reportFacts(led(4), null));
    expect(reportFacts(led(9), null).since).toBeNull();
  });

  it('measures the movement against a DATED baseline once one exists', () => {
    const old = reportFacts(led(4), null);
    // Backdate by hand — a snapshot the app would have written a week ago.
    localStorage.setItem('pheme:history', JSON.stringify({
      '': [{ day: daysAgo(9).toISOString().slice(0, 10), values: { replies: 4, promos: 0 } }],
    }));
    const now = reportFacts(led(9), null);
    expect(now.since?.deltas.replies).toBe(5);
    expect(now.since?.day).toBe(daysAgo(9).toISOString().slice(0, 10));
    // A fact that did not move carries no delta — silence, not a zero badge.
    expect(now.since?.deltas.promos).toBeUndefined();
    expect(old.since).toBeNull();
  });

  it('refuses a delta when either end was never measured', () => {
    // Karma unread a week ago and read today is not "+340 karma": the rise
    // is unknowable, and printing today's figure as growth would be a lie
    // about a real account.
    localStorage.setItem('pheme:history', JSON.stringify({
      '': [{ day: daysAgo(9).toISOString().slice(0, 10), values: { replies: 1 } }],
    }));
    const rep: PresenceReport = {
      groups: [], hnKarma: 812, failed: [], rateLimited: false, at: '2026-08-06T00:00:00.000Z',
    };
    const f = reportFacts(led(2), rep);
    expect(f.since?.deltas.replies).toBe(1);
    expect(f.since?.deltas.karmaHn).toBeUndefined();
  });

  it('keeps one row per day and per scope — the last read of a day wins', () => {
    recordSnapshot(reportFacts(led(1), null));
    recordSnapshot(reportFacts(led(7), null));
    const rows = loadHistory('');
    expect(rows).toHaveLength(1);
    expect(rows[0].values.replies).toBe(7);
    // A network's history is its own; the global one is not its baseline.
    recordSnapshot(reportFacts(led(3), null, 'reddit'));
    expect(loadHistory('reddit')).toHaveLength(1);
    expect(loadHistory('')).toHaveLength(1);
  });

  it('never stores an unmeasured value, so it can never become a zero later', () => {
    recordSnapshot(reportFacts(led(1), null));
    // karmaReddit was null on the sheet: it must be ABSENT from the row, not 0.
    expect('karmaReddit' in loadHistory('')[0].values).toBe(false);
  });
});

describe('auditNumbers — the inversion rule, enforced', () => {
  const facts = reportFacts(
    Array.from({ length: 12 }, () => ({ at: '2026-08-01T00:00:00.000Z', community: 'r/x', url: 'u', kind: 'participation' as const })),
    null,
  );

  it('lets through prose that only repeats measured figures', () => {
    expect(auditNumbers('You have 12 genuine replies across 1 community.', facts)).toEqual([]);
    expect(auditNumbers('No numbers at all here, just judgement.', facts)).toEqual([]);
  });

  it('catches the invented growth figure this whole file exists for', () => {
    // The failure it prevents, verbatim: a beautiful report claiming a rise
    // nobody measured, which the user then repeats to somebody else.
    expect(auditNumbers('Engagement is up 40% this month.', facts)).toContain('40%');
    expect(auditNumbers('You reached 1,200 readers.', facts)).toContain('1,200');
  });

  it('rejects a percentage even when the bare number was measured', () => {
    // Pheme computes no rate anywhere, so there is no reading of the fact
    // sheet under which "12 %" is a quotation rather than an invention.
    expect(auditNumbers('Your reply rate is 12 %.', facts)).toContain('12 %');
  });

  it('does not reject a year, or the small integers ordinary sentences carry', () => {
    expect(auditNumbers('Since 2026 you have kept up the 9:1 rhythm; do 2 things next.', facts)).toEqual([]);
  });

  it('sees a fabricated figure even buried in an honest sentence', () => {
    const prose = 'Your 12 replies are steady, but the 47 people who saw them said nothing.';
    expect(auditNumbers(prose, facts)).toEqual(['47']);
  });

  it('cannot tell a real zero from an invented one — and that is why the sheet exists', () => {
    // The honest limit of a numeric audit: `repliesReceived` really is 0
    // here, so "0" is a quotation, and the same "0" written about the
    // NEVER-READ karma would pass too. Nothing in a set of numbers can
    // separate them. The defence against that one is upstream and visual —
    // the fact sheet prints an unmeasured value as a dash, so the reader
    // sees "—" beside karma while the prose says zero. If this ever needs
    // teeth, it is the prompt and the sheet that get them, not this regex.
    expect(auditNumbers('You received 0 replies.', facts)).toEqual([]);
    expect(reportFacts([], null).facts.find(f => f.code === 'karmaReddit')?.value).toBeNull();
  });
});

// ── lot 5: the loop — what your posts became ────────────────────────────────

describe('outcomes', () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  it('reports only what the USER published — a followed thread is not their outcome', () => {
    const rep = report([
      thread({ id: 'mine', mine: 'post', title: 'my post', myScore: 12 }),
      thread({ id: 'watched', mine: 'none', title: 'someone else' }),
    ]);
    expect(outcomes(rep).map(o => o.id)).toEqual(['mine']);
  });

  it('keeps an unpublished score UNKNOWN and a counted silence at zero', () => {
    // The two kinds of nothing, and the whole reason this file exists: a post
    // shown at 0 points reads as rejected by people who never saw it.
    const rep = report([thread({ id: 'a', mine: 'post', replies: [] })]);
    const [o] = outcomes(rep);
    expect(o.score).toBeNull();
    expect(o.replies).toBe(0);
    expect(o.lastMoveAt).toBe('');
  });

  it('does not count a bot as a human who answered', () => {
    const rep = report([thread({
      id: 'a', mine: 'post', replies: [
        { id: 'b', author: 'AutoModerator', body: 'wiki', url: '', timestamp: day(1), bot: true },
      ],
    })]);
    expect(outcomes(rep)[0].replies).toBe(0);
  });

  it('calls three days of silence a result, and this morning\'s silence nothing', () => {
    const old = thread({ id: 'old', mine: 'post', timestamp: day(9) });
    const fresh = thread({ id: 'fresh', mine: 'post', timestamp: day(1) });
    expect(silentOnes(outcomes(report([old, fresh]))).map(o => o.id)).toEqual(['old']);
  });

  it('adds up what came back WITHOUT letting an unread score weigh nothing', () => {
    // The easiest fabrication in the cartridge: a post whose score the source
    // never published, silently added as 0. It drags the total down with a
    // number nobody read, and the sum then reads as measured.
    const rep = report([
      thread({ id: 'a', mine: 'post', myScore: 40 }),
      thread({ id: 'b', mine: 'post', myScore: 12 }),
      thread({ id: 'c', mine: 'post' }),
    ]);
    const got = harvest(outcomes(rep));
    expect(got.points).toBe(52);
    // Three posts tracked, the total rests on two — and the screen says so.
    expect(got.posts).toBe(3);
    expect(got.scored).toBe(2);
  });

  it('has NO total when no score was ever published — not a total of zero', () => {
    const got = harvest(outcomes(report([thread({ id: 'a', mine: 'post' })])));
    expect(got.points).toBeNull();
    expect(got.scored).toBe(0);
    // Replies ARE counted, so zero there is a real, measured silence.
    expect(got.replies).toBe(0);
  });

  it('sums the human replies and no others', () => {
    const rep = report([thread({
      id: 'a', mine: 'post', replies: [
        { id: 'r1', author: 'someone', body: 'real', url: '', timestamp: '2026-01-01T00:00:00.000Z' },
        { id: 'r2', author: 'AutoModerator', body: 'wiki', url: '', timestamp: '2026-01-01T00:00:00.000Z', bot: true },
      ],
    })]);
    expect(harvest(outcomes(rep)).replies).toBe(1);
  });

  it('names the furthest-travelled post, or nothing when no score was published', () => {
    const rep = report([
      thread({ id: 'a', mine: 'post', myScore: 3 }),
      thread({ id: 'b', mine: 'post', myScore: 40 }),
    ]);
    expect(bestScored(outcomes(rep))?.id).toBe('b');
    expect(bestScored(outcomes(report([thread({ id: 'c', mine: 'post' })])))).toBeNull();
  });
});

describe('public post counters', () => {
  it('recognises only the two surfaces that publish one', () => {
    expect(countsApiFor('https://mastodon.social/@tony/113456789012345678')?.source).toBe('mastodon');
    expect(countsApiFor('https://bsky.app/profile/tony.bsky.social/post/3kabcd')?.source).toBe('bluesky');
    // A guessed endpoint would 404 forever and be reported as "no reaction" —
    // a fabricated verdict about the user's own work.
    expect(countsApiFor('https://x.com/tony/status/123')).toBeNull();
    expect(countsApiFor('https://www.linkedin.com/posts/tony_abc')).toBeNull();
    expect(countsApiFor('not a url')).toBeNull();
  });

  /**
   * Shapes CHECKED against the live services on 2026-08-06, not guessed:
   *
   *  - https://mastodon.social/@Mastodon/117043346514398510
   *    → GET /api/v1/statuses/117043346514398510 → 200
   *      { favourites_count: 214, reblogs_count: 170, replies_count: 10 }
   *  - https://bsky.app/profile/bsky.app/post/3mseeq5rllc2q
   *    → GET public.api.bsky.app …getPostThread?uri=at://bsky.app/app.bsky.feed.post/3mseeq5rllc2q
   *      → 200 { thread: { post: { likeCount: 2397, repostCount: 226, replyCount: 231 } } }
   *
   * The counts move; the SHAPE and the URL derivation are what is pinned.
   */
  it('derives the endpoint a real post URL actually answers on', () => {
    expect(countsApiFor('https://mastodon.social/@Mastodon/117043346514398510')?.api)
      .toBe('https://mastodon.social/api/v1/statuses/117043346514398510');
    // The public AppView takes the HANDLE in the authority position — no DID
    // resolution step, which is the whole reason this is one call.
    expect(countsApiFor('https://bsky.app/profile/bsky.app/post/3mseeq5rllc2q')?.api)
      .toBe('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?depth=0&parentHeight=0&uri='
        + encodeURIComponent('at://bsky.app/app.bsky.feed.post/3mseeq5rllc2q'));
    // Handles carry dots, and a URL can carry a DID with colons instead.
    expect(countsApiFor('https://bsky.app/profile/tony-b.bsky.social/post/3kabcd')).not.toBeNull();
    expect(countsApiFor('https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3kabcd')).not.toBeNull();
  });

  it('pulls the counters out of each surface\'s own payload', () => {
    const m = parsePublicCounts('mastodon', JSON.stringify({
      favourites_count: 12, reblogs_count: 3, replies_count: 4,
    }))!;
    expect(m).toMatchObject({ likes: 12, boosts: 3, replies: 4 });
    const b = parsePublicCounts('bluesky', JSON.stringify({
      thread: { post: { likeCount: 7, repostCount: 1, replyCount: 0 } },
    }))!;
    expect(b).toMatchObject({ likes: 7, boosts: 1, replies: 0 });
  });

  it('returns NOTHING for a payload with no counters in it', () => {
    expect(parsePublicCounts('mastodon', JSON.stringify({ error: 'Record not found' }))).toBeNull();
    expect(parsePublicCounts('bluesky', '{}')).toBeNull();
    expect(parsePublicCounts('mastodon', '<html>')).toBeNull();
  });

  it('names every failure instead of handing back a zero', async () => {
    const dead = () => Promise.resolve({ status: 404, body: '' });
    expect(await readPublicCounts('', dead)).toEqual({ counts: null, fail: 'no-url' });
    expect(await readPublicCounts('https://x.com/t/status/1', dead))
      .toEqual({ counts: null, fail: 'no-api' });
    expect(await readPublicCounts('https://mastodon.social/@t/1', dead))
      .toEqual({ counts: null, fail: 'refused' });
    const boom = () => Promise.reject(new Error('offline'));
    expect(await readPublicCounts('https://mastodon.social/@t/1', boom))
      .toEqual({ counts: null, fail: 'unreachable' });
  });
});

// ── reading what a promotion surface publishes under your name ──────────────

describe('profile feed', () => {
  it('derives the feed only where one really exists', () => {
    expect(feedUrlFor('medium', 'https://medium.com/@tony')).toBe('https://medium.com/feed/@tony');
    expect(feedUrlFor('mastodon', 'https://mastodon.social/@tony')).toBe('https://mastodon.social/@tony.rss');
    // A custom Medium domain answers at its own root.
    expect(feedUrlFor('medium', 'https://blog.example.com/')).toBe('https://blog.example.com/feed');
  });

  it('returns null where there is none, instead of guessing a 404', () => {
    // A guessed URL would 404 forever and be reported as "nothing found",
    // which reads as "you have published nothing" — a fabricated verdict
    // about the user's own work.
    for (const net of ['x', 'linkedin', 'bluesky', 'threads']) {
      expect(feedUrlFor(net, 'https://example.com/me')).toBeNull();
    }
    expect(feedUrlFor('medium', '')).toBeNull();
    expect(feedUrlFor('medium', 'not a url')).toBeNull();
  });

  it('reads RSS and Atom with the same parser', () => {
    const rss = `<rss><channel><item><title>On recall</title>
      <link>https://medium.com/p/1</link><pubDate>Mon, 04 Aug 2026 10:00:00 GMT</pubDate>
      <description>&lt;p&gt;First line&lt;/p&gt;</description></item></channel></rss>`;
    const [post] = parseFeed(rss);
    expect(post.title).toBe('On recall');
    expect(post.url).toBe('https://medium.com/p/1');
    expect(post.at.slice(0, 10)).toBe('2026-08-04');

    const atom = '<feed><entry><title>On recall</title><link href="https://x/1"/>'
      + '<published>2026-08-04T10:00:00Z</published></entry></feed>';
    expect(parseFeed(atom)[0].url).toBe('https://x/1');
  });

  it('leaves an unparseable date ABSENT rather than making it today', () => {
    const rss = '<rss><channel><item><title>t</title><pubDate>whenever</pubDate></item></channel></rss>';
    expect(parseFeed(rss)[0].at).toBe('');
  });

  it('grounds the bio on real titles, and says nothing when there are none', () => {
    expect(feedGroundLine([{ title: 'On recall', url: '', at: '', excerpt: '' }]))
      .toContain('- On recall');
    expect(feedGroundLine([])).toBe('');
  });
});

// ── searching for subs on a keyword, from the board ─────────────────────────

describe('buildSubsPrompt', () => {
  const topics = ['local AI', 'RAG'];

  it('lets a typed subject LEAD, with the profile as context only', () => {
    // Without a seed, "find me subs about Firecracker" meant editing the
    // profile's topics first — a trip to Settings to ask one question.
    const p = buildSubsPrompt(topics, ['LocalLLaMA'], 'Firecracker microVMs');
    expect(p).toContain('Firecracker microVMs');
    expect(p).toContain('That subject LEADS');
    // The profile still says WHO is asking, and what they already watch.
    expect(p).toContain('local AI');
    expect(p).toContain('Do NOT repeat');
  });

  it('falls back to the profile when nothing was typed', () => {
    for (const seed of [undefined, '', '   ']) {
      const p = buildSubsPrompt(topics, [], seed);
      expect(p).not.toContain('LEADS');
      expect(p).toContain('where these topics are genuinely discussed');
    }
  });
});

// ── the drafter must SEE the post it is answering ───────────────────────────

describe('post body clipping', () => {
  // A real r/AI_Agents self-post, the length the user actually hit: the screen
  // cut it mid-word at "…OpenHands, bu" and the drafter got even less.
  const long = 'I am exploring an idea for running AI agents inside isolated VMs. '.repeat(30);

  it('gives the drafter the whole post, not a third of it', () => {
    // 350 characters was the reason a draft could read beside the point — the
    // model answered an excerpt the human had just read in full.
    const p = buildDraftPrompt(item({ body: long }), ['INTJ'], null);
    const body = p.slice(p.indexOf('BODY: '));
    expect(body.length).toBeGreaterThan(1500);
    // The end of the post survives, which is where the ask usually sits.
    expect(p).toContain(long.slice(1400, 1500));
  });

  it('still bounds it — an unbounded body would bury the voice headings', () => {
    const p = buildDraftPrompt(item({ body: 'x'.repeat(20000) }), ['INTJ'], null);
    expect(p.length).toBeLessThan(8000);
    expect(p).toContain('### INTJ');
  });

  it('keeps the cheap steps cheap — angles and recall only need the subject', () => {
    const angles = buildAnglesPrompt(item({ body: long }));
    expect(angles.length).toBeLessThan(1200);
  });
});

// ── a bot is not someone replying to you ────────────────────────────────────

describe('AutoModerator and the removed comment', () => {
  const reply = (over: Partial<ThreadNode['replies'][number]> = {}) => ({
    id: 'r1', author: 'someone', body: 'a real answer', url: 'u',
    timestamp: '2026-01-03T00:00:00.000Z', ...over,
  });
  const marks = { reddit: '2026-01-01T00:00:00.000Z', hackernews: '2026-01-01T00:00:00.000Z' };

  it('knows the automated accounts, whatever case or u/ prefix they arrive in', () => {
    for (const a of ['AutoModerator', 'automoderator', 'u/AutoModerator', '/u/AUTOMOD']) {
      expect(isBotAuthor(a)).toBe(true);
    }
    // …and never a human whose handle merely ends in those letters. Deleting a
    // real person's reply from the inbox is far worse than one bot slipping in.
    for (const a of ['Talbot', 'Abbot', 'robotics_guy', 'bjoern2000']) {
      expect(isBotAuthor(a)).toBe(false);
    }
  });

  it('treats a removed comment as gone, by author OR by body', () => {
    expect(isGone('[deleted]', 'still here')).toBe(true);
    expect(isGone('someone', '[removed]')).toBe(true);
    expect(isGone('someone', 'a real answer')).toBe(false);
  });

  it('never counts a bot as an unread reply — the badge and the KPI together', () => {
    // The real case: AutoModerator comments on EVERY submission, as a direct
    // child of the post, so on the user's own post it satisfied "parent is
    // you" and lit the inbox with a bot.
    const t = thread({
      mine: 'post',
      replies: [reply({ id: 'bot', author: 'AutoModerator', body: 'check out our wiki', bot: true })],
    });
    expect(unseenCount(report([t]), marks)).toBe(0);
    expect(unseenByNetwork(report([t]), marks).reddit).toBeUndefined();
    expect(freshReplies(report([t]), marks, 'reddit')).toEqual([]);
  });

  it('still counts the human in the same thread', () => {
    const t = thread({
      replies: [
        reply({ id: 'bot', author: 'AutoModerator', bot: true }),
        reply({ id: 'human', author: 'bjoern2000' }),
      ],
    });
    expect(unseenCount(report([t]), marks)).toBe(1);
    expect(freshReplies(report([t]), marks, 'reddit').map(f => f.reply.id)).toEqual(['human']);
  });

  it('never writes a bot into PERMANENT memory as "what people answered"', () => {
    // The worst of the family: this write goes to the SOCIAL vault, is
    // retrievable by the chat and the RAG forever, and undoing it is a
    // human-gated operation in the Vault Manager.
    const t = thread({
      mine: 'post', title: 'my post', postBody: 'body',
      replies: [
        reply({ id: 'bot', author: 'AutoModerator', body: 'check out our wiki', bot: true }),
        reply({ id: 'human', author: 'bjoern2000', body: 'have you tried Twilio' }),
      ],
    });
    const text = postMemoryText(t, { myPosts: true, myReplies: true, threadContext: true, diagnosis: false });
    expect(text).toContain('bjoern2000');
    expect(text).not.toContain('AutoModerator');
    expect(text).not.toContain('wiki');
  });

  it('keeps the bot IN the thread — revealed, never hidden', () => {
    // Same doctrine as the ⌛ on a decayed thread: the user sees what is
    // there. Filtering it out of `replies` would be the app deciding what the
    // conversation was.
    const t = thread({ replies: [reply({ id: 'bot', author: 'AutoModerator', bot: true })] });
    expect(t.replies).toHaveLength(1);
  });
});

// ── the article reader must not parse a document into the prompt ────────────

describe('fetchArticleText — a PDF is not an article', () => {
  const fetchAs = (body: string, contentType: string, encoding?: string) =>
    () => Promise.resolve({ status: 200, body, contentType, ...(encoding ? { encoding } : {}) });

  it('refuses a binary body the host already flagged, instead of parsing it', async () => {
    const r = await fetchArticleText('https://x/paper.pdf', fetchAs('iVBORw0K', 'image/png', 'base64'));
    expect(r.reason).toBe('notText');
    expect(r.text).toBe('');
  });

  it('refuses a PDF — mojibake sails past the 200-char floor and BECOMES the article', async () => {
    // Half of Hacker News links straight at a PDF. Decoded as UTF-8 it yields
    // kilobytes of replacement characters, which the length check accepts; it
    // was then shown as what the thread is about, and translatable — a paid
    // call on binary noise.
    const noise = '�'.repeat(4000);
    const r = await fetchArticleText('https://x/paper.pdf', fetchAs(noise, 'application/pdf'));
    expect(r.reason).toBe('notText');
    expect(r.text).toBe('');
  });

  it('still reads a real page, and a content-type the host did not send', async () => {
    const page = `<html><body><article>${'word '.repeat(80)}</article></body></html>`;
    expect((await fetchArticleText('https://x', fetchAs(page, 'text/html; charset=utf-8'))).reason).toBeNull();
    // No content-type at all is UNKNOWN, not binary — refusing it would lose
    // every server that omits the header.
    expect((await fetchArticleText('https://x', fetchAs(page, ''))).reason).toBeNull();
  });
});

// ── reading a post's image: a refusal must never read as "nothing found" ────

describe('vision', () => {
  const img = () => Promise.resolve({ mimeType: 'image/png', data: 'AAAA' });

  it('reports the host REFUSING as a refusal, not as an empty answer', async () => {
    // model.infer answers `{success:false, errorCode}` as an ordinary resolved
    // value — flattened to a string it read as "the model had nothing to say",
    // and the user would have been told the image was unreadable when in fact
    // nobody ever looked.
    const out = await readImage('https://i.redd.it/x.png', 'ctx', img,
      () => Promise.resolve({ success: false, errorCode: 'NO_VISION', error: 'no vision on this route' }));
    expect(out.fail).toBe('no-vision');
    expect(out.reading).toBeNull();
    expect(out.detail).toContain('no vision');
  });

  it('separates "too large" from every other failure', async () => {
    const out = await readImage('https://i.redd.it/x.png', '', img,
      () => Promise.resolve({ success: false, errorCode: 'IMAGE_TOO_LARGE' }));
    expect(out.fail).toBe('too-large');
  });

  it('calls an UNNAMED refusal a refusal, not "the model returned nothing"', async () => {
    // "The model had nothing to say" is a verdict about the model — and
    // nobody asked it anything. Same fabrication, one layer up.
    const out = await readImage('https://i.redd.it/x.png', '', img,
      () => Promise.resolve({ success: false }));
    expect(out.fail).toBe('refused');
    // …while a genuinely empty ANSWER stays 'empty'.
    const empty = await readImage('https://i.redd.it/x.png', '', img,
      () => Promise.resolve({ success: true, text: '   ' }));
    expect(empty.fail).toBe('empty');
  });

  it('names an unfetchable image instead of asking the model about nothing', async () => {
    const asked = vi.fn();
    const out = await readImage('https://i.redd.it/x.png', '', () => Promise.reject(new Error('NOT_AN_IMAGE: text/html')), asked);
    expect(out.fail).toBe('unreachable');
    expect(out.detail).toContain('NOT_AN_IMAGE');
    expect(asked).not.toHaveBeenCalled();
  });

  it('keeps the reading when the model answers, whatever envelope it uses', async () => {
    for (const res of ['a chart', { text: 'a chart' }, { data: { response: 'a chart' } }]) {
      const out = await readImage('https://i.redd.it/x.png', '', img, () => Promise.resolve(res));
      expect(out.reading?.text).toBe('a chart');
      expect(out.fail).toBeNull();
    }
  });

  it('never lets a vision reading pass as the drafter\'s own observation', () => {
    const p = buildDraftPrompt(item(), ['INTJ'], null, { mediaRead: ['a bar chart of 4 runs'] });
    expect(p).toContain('a bar chart of 4 runs');
    expect(p).toContain('as read by a vision model');
  });

  it('drops the "do not guess" warning only for the images that WERE read', () => {
    const both = buildDraftPrompt(item(), ['INTJ'], null, { unreadMedia: 1, mediaRead: ['read one'] });
    expect(both).toContain('carries 1 image');
    expect(both).toContain('read one');
    const readAll = buildDraftPrompt(item(), ['INTJ'], null, { unreadMedia: 0, mediaRead: ['read one'] });
    expect(readAll).not.toContain('NOT read by anyone');
  });

  it('orders the vision prompt to transcribe and NOT to opine', () => {
    const p = buildImageReadPrompt('the post');
    expect(p).toContain('TRANSCRIBE');
    expect(p).toContain('No opinion');
    expect(p).toContain('the post');
  });
});

// ── what a first visit asks: only what something reads ──────────────────────

describe('netProfileShape', () => {
  const of = (id: string) => netProfileShape(NETWORKS.find(n => n.id === id)!);

  it('asks a promotion surface for the composer\'s inputs, never for a watch list', () => {
    // The bug this pins: the first visit to X/LinkedIn collected "topics to
    // watch here" and NO code path has ever read them — only reddit and
    // hackernews targets reach scanRadar or watchTargetsFor.
    for (const id of ['x', 'linkedin', 'bluesky', 'mastodon', 'threads', 'medium']) {
      expect(of(id).targets).toBe(false);
      expect(of(id).publish).toBe(true);
      expect(of(id).home).toBe(false);
    }
  });

  it('keeps asking a reputation surface what to scan — there, it is read', () => {
    expect(of('reddit')).toEqual({ home: true, targets: true, publish: false });
    expect(of('hackernews')).toEqual({ home: false, targets: true, publish: false });
  });

  it('never offers the composer\'s questions where nothing composes', () => {
    for (const net of NETWORKS.filter(n => n.role === 'reputation')) {
      expect(netProfileShape(net).publish).toBe(false);
    }
  });

  it('keeps the registry\'s role and the rulebook\'s demand from contradicting', () => {
    // The one combination that cannot be true: a surface where launching is
    // NORMAL (`demand: open`) filed as a place where promotion must be EARNED
    // (`role: reputation`). It applies a doctrine of restraint that has no
    // reason to exist, and makes the profile page collect a watch list no code
    // path reads (doc 75 §2a — devto, indiehackers and quora were all three).
    const wrong = NETWORKS.filter(n => n.role === 'reputation' && rulesFor(n.id).demand === 'open');
    expect(wrong.map(n => n.id)).toEqual([]);
    // And the reverse still holds: a scan only ever reads reddit and HN.
    expect(NETWORKS.filter(n => netProfileShape(n).targets).map(n => n.id))
      .toEqual(['reddit', 'hackernews', 'lobsters', 'stackoverflow', 'discord']);
  });
});

describe('buildStoryPrompt — the network\'s own language and readers', () => {
  const story = newStory('linkedin', 'promo', 'T');

  it('writes in the language the CALLER resolved, not the app\'s', () => {
    // A French interface composing an English LinkedIn post is the normal
    // case; the prompt used to hardcode the UI language.
    expect(buildStoryPrompt({ story, topics: [], count: 3, langName: 'English' }))
      .toContain('Every post in English.');
  });

  it('carries the audience the user described, and stays silent when they did not', () => {
    const withAud = buildStoryPrompt({ story, topics: [], count: 3, langName: 'English', audience: 'devs who self-host' });
    expect(withAud).toContain('devs who self-host');
    const without = buildStoryPrompt({ story, topics: [], count: 3, langName: 'English', audience: '   ' });
    expect(without).not.toContain('Who reads them there');
  });
});

// ── the poster: the model writes words, the template does the look ──────────

describe('poster copy', () => {
  it('asks for TEXT and forbids drawing — a text model cannot draw', () => {
    const p = buildPosterPrompt('some post about RAG');
    expect(p).toContain('never describe, draw or output an image');
    expect(p).toContain('{"kicker"');
  });

  it('parses the JSON the prompt demands, and uppercases the kicker', () => {
    const copy = parsePosterCopy('sure!\n{"kicker":"retrieval","headline":"Chunking matters less than logging","sub":"one line"}');
    expect(copy).toEqual({ kicker: 'RETRIEVAL', headline: 'Chunking matters less than logging', sub: 'one line' });
  });

  it('returns null rather than half a poster', () => {
    expect(parsePosterCopy('I cannot help with that')).toBeNull();
    expect(parsePosterCopy('{"kicker":"X","sub":"y"}')).toBeNull(); // no headline
  });

  it('publishes at each surface\'s real size, not one canvas for all', () => {
    expect(posterSize('linkedin')).toMatchObject({ w: 1200, h: 627 });
    expect(posterSize('instagram')).toMatchObject({ w: 1080, h: 1350 });
    // An unknown network gets a sane default instead of throwing.
    expect(posterSize('nope')).toMatchObject({ w: 1200, h: 630 });
  });

  it('wraps a headline instead of running it off the plate', () => {
    expect(wrapText('one two three four five six', 12)).toEqual(['one two', 'three four', 'five six']);
    // Never returns nothing — an empty poster would be worse than a tight one.
    expect(wrapText('supercalifragilistic', 5)).toHaveLength(1);
  });

  it('draws the SAME lemniscate as the app icon — a third copy must not drift', () => {
    // The mark lives in scripts/brand-mark.cjs and in build/icon.svg, kept in
    // step by appIconDrift.test.ts. This poster is the third home; without
    // this read, a redrawn brand would leave Pheme quietly on the old one.
    const host = readFileSync(
      join(__dirname, '..', '..', '..', 'infinity-edition', 'scripts', 'brand-mark.cjs'),
      'utf-8',
    );
    expect(host).toContain(MARK);
  });

  it('renders the brand plate at the asked size, and escapes the copy', () => {
    const svg = renderPoster(
      { kicker: 'RAG', headline: 'A & B <are> fine', sub: '' },
      { w: 1200, h: 627, label: '' },
    );
    expect(svg).toContain('width="1200" height="627"');
    expect(svg).toContain('A &amp; B &lt;are&gt; fine');
    expect(svg).toContain(MARK);
    // The old prompt asked for a LIGHT background — the brand plate is dark.
    expect(svg).toContain('#0B0910');
  });

  // ── the long version: four layouts, an explicit canvas, one brand ─────────

  const copy = { kicker: 'RAG', headline: 'Recall beats retrieval', sub: 'measured, not claimed' };
  const og = { w: 1200, h: 630, label: '' };

  it('prints the USER\'s wordmark, and nothing at all when they have none', () => {
    // It was the literal string 'MNEMOSYNE OS', hardcoded — which is correct
    // for exactly one user of a cartridge anyone can install.
    expect(renderPoster(copy, og, { wordmark: 'ACME LABS' })).toContain('ACME LABS');
    expect(renderPoster(copy, og)).not.toContain('MNEMOSYNE');
    // No wordmark must leave no empty band either — the mark still draws.
    expect(renderPoster(copy, og)).toContain(MARK);
  });

  it('gives each layout its own shape, on the same copy', () => {
    const quote = renderPoster({ ...copy, attribution: 'the 2026 bench' }, og, { template: 'quote' });
    expect(quote).toContain('“Recall beats retrieval”');
    expect(quote).toContain('— the 2026 bench');

    const stat = renderPoster({ ...copy, stat: '72.9%' }, og, { template: 'stat' });
    expect(stat).toContain('72.9%');
    expect(stat).toContain('text-anchor="middle"');

    expect(renderPoster(copy, og, { template: 'cover' })).toContain('text-anchor="middle"');
  });

  it('refuses a number poster with no number instead of inventing one', () => {
    expect(templateFits(copy, 'stat')).toBe(false);
    expect(templateFits({ ...copy, stat: '3×' }, 'stat')).toBe(true);
  });

  it('falls back rather than emitting a 189px hole where the number should be', () => {
    // This test's first version asserted only that the headline was present —
    // which it is, in the caption, WHILE the figure rendered as an empty text
    // node at a third of the plate's height. A poster is not verified by
    // grepping for a string it happens to contain elsewhere.
    const svg = renderPoster(copy, og, { template: 'stat' });
    const figures = [...svg.matchAll(/font-weight="700"[^>]*>([^<]*)</g)].map(m => m[1]);
    expect(figures.every(f => f.trim() !== '')).toBe(true);
    // Fell back to the lockup: left-aligned claim, no centred figure block.
    expect(svg).toContain('Recall beats retrieval');
    expect(svg).not.toContain('text-anchor="middle"');
  });

  it('reads "N/A" and "none" as the ABSENCE the prompt asked for', () => {
    // A model asked for an optional number answers with a placeholder as
    // often as with "". One of those on a stat plate is a 300px "N/A".
    for (const bad of ['N/A', 'none', '-', '—', '0', 'null']) {
      expect(parsePosterCopy(`{"headline":"h","stat":"${bad}"}`)?.stat).toBeUndefined();
    }
    expect(parsePosterCopy('{"headline":"h","stat":"72.9%"}')?.stat).toBe('72.9%');
  });

  it('lets the canvas be CHOSEN, and defers to the surface only for native', () => {
    expect(sizeFor('threads', 'native')).toEqual(posterSize('threads'));
    expect(sizeFor('x', 'portrait')).toMatchObject({ w: 1080, h: 1350 });
    expect(sizeFor('x', 'story')).toMatchObject({ w: 1080, h: 1920 });
    // Every offered format must render — a listed choice that throws is worse
    // than an absent one.
    for (const f of FORMATS) {
      const size = sizeFor('linkedin', f);
      for (const tpl of TEMPLATES) {
        const svg = renderPoster({ ...copy, stat: '3×', attribution: 'a' }, size, { template: tpl });
        expect(svg).toContain(`width="${size.w}" height="${size.h}"`);
      }
    }
  });

  it('keeps a portrait headline inside the plate', () => {
    // The wrap estimate is the only thing between a long claim and text
    // running off the canvas; a tall plate is where it bites first.
    const long = 'Auditable memory beats a bigger context window every single time';
    const svg = renderPoster({ ...copy, headline: long }, { w: 1080, h: 1350, label: '' });
    const tspans = [...svg.matchAll(/<tspan[^>]*>([^<]*)</g)].map(m => m[1]);
    expect(tspans.length).toBeGreaterThan(1);
    for (const line of tspans) expect(line.length).toBeLessThanOrEqual(30);
  });
});

// ── what Mnemosyne is told to remember ───────────────────────────────────────

describe('pendingMemories (only the user\'s own work, only once)', () => {
  const prefs = { myPosts: true, myReplies: false, threadContext: false, diagnosis: false };

  it('takes the user\'s posts and refuses everything they merely watched', () => {
    const rep = report([
      thread({ id: 'reddit_mine', mine: 'post', title: 'my post' }),
      thread({ id: 'reddit_theirs', mine: 'none', title: 'someone else' }),
    ]);
    const out = pendingMemories(rep, prefs, {});
    expect(out.map(m => m.ref)).toEqual(['pheme:reddit:reddit_mine']);
  });

  it('leaves the user\'s replies alone until that box is ticked', () => {
    const rep = report([thread({ id: 'reddit_c', mine: 'comment', myBody: 'what I said' })]);
    expect(pendingMemories(rep, prefs, {})).toEqual([]);
    const out = pendingMemories(rep, { ...prefs, myReplies: true }, {});
    expect(out[0]?.kind).toBe('reply');
    expect(out[0]?.text).toContain('what I said');
  });

  it('skips a reply whose text was never recovered — an empty memory is a lie', () => {
    const rep = report([thread({ id: 'reddit_c', mine: 'comment', myBody: '' })]);
    expect(pendingMemories(rep, { ...prefs, myReplies: true }, {})).toEqual([]);
  });

  it('never re-offers what a receipt already covers', () => {
    const rep = report([thread({ id: 'reddit_mine', mine: 'post' })]);
    const written = { 'pheme:reddit:reddit_mine': '2026-08-05T00:00:00.000Z' };
    expect(pendingMemories(rep, prefs, written)).toEqual([]);
  });

  it('omits a score the source never gave, instead of writing a zero forever', () => {
    const noScore = postMemoryText(thread({ mine: 'post', title: 'T' }), prefs);
    expect(noScore).not.toMatch(/Score/);
    const scored = postMemoryText(thread({ mine: 'post', title: 'T', myScore: 12 }), prefs);
    expect(scored).toContain('Score at the time of writing: 12.');
  });

  it('joins the thread around it only when asked', () => {
    const thr = thread({
      mine: 'post', title: 'T', postBody: 'body',
      replies: [{ id: 'r', author: 'kenneth', body: 'their take', url: 'u', timestamp: '2026-05-01T00:00:00.000Z' }],
    });
    expect(postMemoryText(thr, prefs)).not.toContain('kenneth');
    expect(postMemoryText(thr, { ...prefs, threadContext: true })).toContain('kenneth: their take');
  });

  it('keys a diagnosis by its own timestamp, so each analysis is one memory', () => {
    const a = diagnosisMemory('all good', '2026-08-01T00:00:00.000Z');
    const b = diagnosisMemory('all good', '2026-08-05T00:00:00.000Z');
    expect(a?.ref).not.toBe(b?.ref);
    expect(diagnosisMemory('', '2026-08-01T00:00:00.000Z')).toBeNull();
  });
});

describe('host mirror (surviving an origin change)', () => {
  beforeEach(() => localStorage.clear());

  it('sees a blank origin for what it is', () => {
    expect(localIsBlank()).toBe(true);
    localStorage.setItem('pheme:profile', JSON.stringify({ topics: [], redditUser: '', done: false }));
    expect(localIsBlank()).toBe(true); // an untouched profile is still blank
    localStorage.setItem('pheme:profile', JSON.stringify({ topics: ['rag'] }));
    expect(localIsBlank()).toBe(false);
  });

  it('snapshots only what cannot be recomputed', () => {
    localStorage.setItem('pheme:profile', '{"topics":["rag"]}');
    localStorage.setItem('pheme:ledger', '[]');
    localStorage.setItem('pheme:radar:cache', '{"items":[]}'); // regenerable
    expect(Object.keys(snapshotLocal()).sort()).toEqual(['pheme:ledger', 'pheme:profile']);
  });

  it('restores a snapshot into a fresh origin', () => {
    const snap = { 'pheme:profile': '{"topics":["rag"],"done":true}', 'pheme:ledger': '[{"kind":"promo"}]' };
    expect(localIsBlank()).toBe(true);
    expect(restoreLocal(snap).sort()).toEqual(['pheme:ledger', 'pheme:profile']);
    expect(localIsBlank()).toBe(false);
    expect(localStorage.getItem('pheme:ledger')).toBe('[{"kind":"promo"}]');
  });

  it('refuses to call a snapshot without a real profile a profile', () => {
    expect(hasProfile({})).toBe(false);
    expect(hasProfile({ 'pheme:profile': 'not json' })).toBe(false);
    expect(hasProfile({ 'pheme:profile': '{"topics":[]}' })).toBe(false);
    expect(hasProfile({ 'pheme:profile': '{"mySub":"MnemosyneOS"}' })).toBe(true);
  });

  it('recognises the per-network shape too — the guard reads raw JSON, so it must know both', () => {
    // A 0.6 profile: nothing at the top level, everything under `nets`.
    const modern = JSON.stringify({ nets: { reddit: { handle: 'yaka', targets: [] } } });
    expect(hasProfile({ 'pheme:profile': modern })).toBe(true);
    // Still false for a profile that holds nothing at all, in either shape.
    expect(hasProfile({ 'pheme:profile': '{"nets":{"reddit":{"handle":"","targets":[]}}}' })).toBe(false);
  });
});

describe('watch targets (what the host is asked to watch)', () => {
  // Built through the migration on purpose: the watch reads per-network
  // settings now, and this proves the old shape still produces the same watch.
  const profile = normalizeProfile(
    { redditUser: 'yaka', hnUser: 'yk', mySub: 'MnemosyneOS' } as never,
  );

  it('declares the user feed, their sub and their HN comments', () => {
    const targets = watchTargetsFor(profile);
    expect(targets.map(t => t.label)).toEqual(['u/yaka', 'r/MnemosyneOS', 'HN yk']);
    expect(targets.every(t => t.url.startsWith('https://'))).toBe(true);
  });

  it('asks for NOTHING when nothing is configured — an empty watch can only fail', () => {
    expect(watchTargetsFor(normalizeProfile({} as never))).toEqual([]);
    // And a profile that never went through the migration must not crash it.
    expect(watchTargetsFor({} as never)).toEqual([]);
  });

  it('changes its signature when a pseudonym changes, and only then', () => {
    const a = watchSignature(watchTargetsFor(profile), 30);
    expect(watchSignature(watchTargetsFor(profile), 30)).toBe(a);
    const renamed = setNet(profile, REDDIT, { handle: 'other' });
    expect(watchSignature(watchTargetsFor(renamed), 30)).not.toBe(a);
    expect(watchSignature(watchTargetsFor(profile), 60)).not.toBe(a);
  });
});

describe('seen marks', () => {
  beforeEach(() => localStorage.clear());

  it('marks one network without touching the other', () => {
    const next = markAllSeen({ reddit: 'a', hackernews: 'b' }, 'reddit');
    expect(next.hackernews).toBe('b');
    expect(next.reddit).not.toBe('a');
  });

  it('reads a legacy single timestamp as applying to every network', () => {
    localStorage.setItem('pheme:presence:seen', '2026-01-01T00:00:00.000Z');
    const marks = getLastSeen();
    expect(seenOf(marks, 'reddit')).toBe('2026-01-01T00:00:00.000Z');
    expect(seenOf(marks, 'hackernews')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('treats an unknown network as never seen, not as seen now', () => {
    expect(seenOf({}, 'reddit')).toBe(new Date(0).toISOString());
  });
});

// ── derived state: one formula, one cut ──────────────────────────────────────

describe('taking one act back', () => {
  beforeEach(() => localStorage.clear());
  const at = (n: number) => `2026-08-0${n}T00:00:00.000Z`;
  const seed = [1, 2, 3].map(n =>
    ({ at: at(n), community: `r/c${n}`, url: `u${n}`, kind: 'participation' as const }));

  it('removes exactly one entry and leaves the rest', () => {
    // The only undo used to be `clear`, which empties everything — so a
    // misclick cost either a wrong count forever or the whole history.
    expect(withoutAct(seed, at(2)).map(e => e.url)).toEqual(['u1', 'u3']);
  });

  it('does nothing at all for a stamp that matches no entry', () => {
    // An undo that silently ate a neighbouring row would be the same class of
    // bug one level down.
    expect(withoutAct(seed, '2026-01-01T00:00:00.000Z')).toHaveLength(3);
    expect(withoutAct(seed, '')).toHaveLength(3);
  });

  it('puts the counts back where they were', () => {
    // The point of the undo: the 9:1 gauge and every verdict read this list.
    const withPromo = [...seed, { at: at(4), community: 'r/c1', url: 'u4', kind: 'promo' as const }];
    expect(ledgerStats(withPromo).promo).toBe(1);
    expect(ledgerStats(withPromo.filter(e => e.at !== at(4))).promo).toBe(0);
  });
});

describe('an unreadable HN account is unknown, never a karma of zero', () => {
  // Firebase answers 200 with a literal `null` body for a user that does not
  // exist, and `Number(null)` is 0. `fetchHn` in presence.ts guards this;
  // `fetchProfileFacts` had the same line without the guard — so a name with a
  // typo in it reached the diagnosis prompt as "karma 0, 0 stories", and the
  // model passed judgement on a person it had measured nothing about.
  const algolia = { status: 200, body: JSON.stringify({ nbHits: 0 }) };
  const facts = (karmaBody: string) => fetchProfileFacts(
    { redditUser: '', hnUser: 'ghost' },
    (url: string) => Promise.resolve(
      url.includes('firebaseio') ? { status: 200, body: karmaBody } : algolia),
  );

  it('reports unknown for an account Firebase answers `null` for', async () => {
    expect((await facts('null')).hn?.karma).toBeNull();
  });

  it('reports unknown when the payload carries no karma at all', async () => {
    expect((await facts('{}')).hn?.karma).toBeNull();
  });

  it('still reports a real zero as zero', async () => {
    // A brand-new account genuinely AT zero is a measurement, and must not be
    // swept into "unknown" by an over-eager guard.
    expect((await facts(JSON.stringify({ karma: 0 }))).hn?.karma).toBe(0);
  });

  it('reports a real karma unchanged', async () => {
    expect((await facts(JSON.stringify({ karma: 412 }))).hn?.karma).toBe(412);
  });
});

describe('asId — an identifier is one key, whichever type it arrives as', () => {
  it('accepts the number and the string as the same key', () => {
    expect(asId(900)).toBe('900');
    expect(asId('900')).toBe('900');
    expect(asId(900)).toBe(asId('900'));
  });

  it('still refuses anything that is not an identifier', () => {
    // The point of `coerce` stands: a shape nobody expected reads as absent,
    // never as "[object Object]".
    for (const v of [null, undefined, {}, [], NaN, Infinity, true]) expect(asId(v)).toBe('');
  });

  it('never lets two absent ids match each other', () => {
    // '' is what an absent id keys to, and a Set of them would make every
    // parentless comment "addressed to you".
    expect(asId(null)).toBe(asId(undefined));
    expect(new Set([asId(null)].filter(Boolean)).has(asId(undefined))).toBe(false);
  });
});

describe('Hacker News — the user\'s own COMMENTS are a presence too', () => {
  // HN only ever produced the stories they POSTED, so a reply written on
  // somebody else's thread was invisible to the whole app: no history row, no
  // inbox, and no way to be credited as an act written without Pheme.
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // ⚠️ Ids exactly as Algolia sends them: `objectID` is a STRING, `story_id`
  // and `parent_id` are NUMBERS, on the same hit. Fixtures that made them all
  // strings would pass against code that drops every numeric id in production.
  const hit = (over: Record<string, unknown> = {}) => ({
    objectID: 'c1', author: 'me', comment_text: 'my take',
    story_id: 900, story_title: 'Their story',
    created_at: '2026-08-08T00:00:00.000Z', parent_id: 900, ...over,
  });

  const run = async (over: { comments?: unknown[]; stories?: unknown[]; thread?: unknown[] } = {}) => {
    const body = (hits: unknown[]) => JSON.stringify({ hits });
    const fetchUrl = (url: string) => Promise.resolve(
      url.includes('firebaseio')
        ? { status: 200, body: JSON.stringify({ karma: 100 }) }
        : url.includes('tags=story,author_')
          ? { status: 200, body: body(over.stories ?? []) }
          : url.includes('tags=comment,author_')
            ? { status: 200, body: body(over.comments ?? [hit()]) }
            : url.includes('tags=comment,story_')
              ? { status: 200, body: body(over.thread ?? []) }
              : { status: 404, body: '' },
    );
    const p = fetchPresence({ redditUser: '', hnUser: 'me', mySub: '' }, fetchUrl);
    await vi.runAllTimersAsync();
    return (await p).groups.flatMap(g => g.threads);
  };

  it('turns a comment of theirs into a thread they are present in', async () => {
    const [thr] = await run();
    expect(thr).toMatchObject({
      id: 'hn_900', mine: 'comment', community: 'Hacker News',
      title: 'Their story', myBody: 'my take',
    });
  });

  it('keys the thread on the STORY, so the ledger can match it', async () => {
    // The radar hands the ledger `item?id=<storyId>`. A thread carrying the
    // COMMENT's permalink would key differently, and every assisted reply on
    // HN would read as a solo one.
    const [thr] = await run();
    expect(thr.url).toBe('https://news.ycombinator.com/item?id=900');
    expect(threadKey(thr.url)).toBe('hn:900');
    const ledger = [{ at: '2026-08-08T00:00:00.000Z', community: 'Hacker News', url: thr.url, kind: 'participation' as const }];
    expect(isSoloAct(thr, ledgerKeys(ledger))).toBe(false);
    expect(isSoloAct(thr, new Set())).toBe(true);
  });

  it('counts a solo HN reply in the standing, like Reddit does', async () => {
    const threads = await run();
    const rep: PresenceReport = {
      groups: [{ community: 'Hacker News', threads }],
      hnKarma: 100, failed: [], rateLimited: false, at: '2026-08-08T00:00:00.000Z',
    };
    expect(standings([], rep)[0]).toMatchObject({ community: 'Hacker News', autonomous: 1 });
  });

  it('is ONE row per thread, however many times they spoke in it', async () => {
    // Three comments in one discussion are one presence. Counting them as
    // three would inflate the thread count and the solo credit at once.
    const threads = await run({
      comments: [hit({ objectID: 'c1' }), hit({ objectID: 'c2', comment_text: 'and also' })],
    });
    expect(threads).toHaveLength(1);
    // Newest first from the API, so the first hit wins the body.
    expect(threads[0].myBody).toBe('my take');
  });

  it('lets their own STORY win over a comment they left on it', async () => {
    const threads = await run({
      stories: [{ objectID: '900', title: 'My story', created_at: '2026-08-07T00:00:00.000Z', points: 12 }],
    });
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ id: 'hn_900', mine: 'post', myScore: 12 });
  });

  it('leaves a comment\'s score UNKNOWN — Algolia publishes none', async () => {
    // `myScore: 0` would read as "nobody upvoted you", which was never measured.
    const [thr] = await run();
    expect(thr.myScore).toBeNull();
  });

  it('says it never looked inside rather than reporting zero replies', async () => {
    // Past the per-run budget a thread arrives shallow, exactly like a Reddit
    // one — `commentCount: null`, which the card prints as a dash.
    const many = Array.from({ length: 5 }, (_, i) =>
      hit({ objectID: `c${i}`, story_id: 900 + i, story_title: `s${i}` }));
    const threads = await run({ comments: many });
    expect(threads).toHaveLength(5);
    expect(threads.filter(t => t.commentCount === null)).toHaveLength(2);
  });

  it('routes a reply on their OWN story to them too — this path was broken as well', async () => {
    // Pre-existing, and older than the comment feature: `parent_id` arrives as
    // a number, `asString` answered '' for it, so "someone replied to you"
    // could not fire on Hacker News at all — on any path.
    const threads = await run({
      stories: [{ objectID: '900', title: 'My story', created_at: '2026-08-07T00:00:00.000Z' }],
      thread: [
        { objectID: 'r1', author: 'someone', comment_text: 'nice', parent_id: 900, created_at: '2026-08-08T01:00:00.000Z' },
      ],
    });
    expect(threads[0].replies[0]).toMatchObject({ id: 'hn_r1', toMe: true });
  });

  it('marks a reply to their comment as addressed to them, and bots never are', async () => {
    const threads = await run({
      thread: [
        { objectID: 'c1', author: 'me', comment_text: 'my take', parent_id: 900, created_at: '2026-08-08T00:00:00.000Z' },
        { objectID: 'r1', author: 'someone', comment_text: 'good point', parent_id: 'c1', created_at: '2026-08-08T01:00:00.000Z' },
        { objectID: 'r2', author: 'someone', comment_text: 'unrelated', parent_id: 900, created_at: '2026-08-08T01:00:00.000Z' },
      ],
    });
    const replies = threads[0].replies;
    // Their own comment is never a reply to themselves.
    expect(replies.map(r => r.id)).toEqual(['hn_r1', 'hn_r2']);
    expect(replies.find(r => r.id === 'hn_r1')?.toMe).toBe(true);
    // A top-level comment on a story that is NOT theirs addresses nobody.
    expect(replies.find(r => r.id === 'hn_r2')?.toMe).toBe(false);
  });
});

describe('the Atom fallback counts humans, not bots', () => {
  // Reddit walls its public .json for many clients; every reconstruction then
  // goes through the Atom feed. That path used to skip the author question
  // entirely — no reply carried the `bot` flag and `commentCount` was the raw
  // entry count — so AutoModerator, which posts on EVERY submission, counted
  // as a human reply everywhere a caller tests `!r.bot`. The JSON path has
  // filtered it since 0.8.x; the fallback had not.
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const BASE = 'https://www.reddit.com/r/AI_Agents/comments/abc123';
  const entry = (author: string, body: string, url: string, id: string) =>
    `<entry><id>${id}</id><title>t</title><link href="${url}"/>`
    + `<author><name>${author}</name></author><content>${body}</content>`
    + `<updated>2026-08-07T00:00:00Z</updated></entry>`;
  const feed = (...items: string[]) =>
    `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${items.join('')}</feed>`;

  const run = async () => {
    // The JSON gate is DOWN — this is exactly the state the fallback exists for.
    localStorage.setItem('pheme:reddit:jsonBlockedAt', String(Date.now()));
    const fetchUrl = (url: string) => Promise.resolve(
      url.includes('/user/me/')
        ? { status: 200, body: feed(entry('me', 'my take', `${BASE}/slug/cmt001`, 'u1')) }
        : url.startsWith(BASE)
          ? {
            status: 200,
            body: feed(
              entry('someone', 'the post', `${BASE}/slug`, 'p1'),
              entry('AutoModerator', 'Beep boop, read the rules', `${BASE}/slug/bot1`, 'b1'),
            ),
          }
          : { status: 404, body: '' },
    );
    const p = fetchPresence({ redditUser: 'me', hnUser: '', mySub: '' }, fetchUrl);
    await vi.runAllTimersAsync();
    const report = await p;
    return report.groups.flatMap(g => g.threads).find(t => t.id === 'reddit_abc123')!;
  };

  it('does not count AutoModerator as a reply', async () => {
    const thr = await run();
    expect(thr).toBeDefined();
    // The whole point: "1 comment" on a thread where nobody spoke is a
    // conversation the app invented.
    expect(thr.commentCount).toBe(0);
  });

  it('still SHOWS the bot, tagged as one — nothing is hidden', async () => {
    const thr = await run();
    expect(thr.replies).toHaveLength(1);
    expect(thr.replies[0].author).toBe('AutoModerator');
    // Same doctrine as the JSON path: rendered, tagged, never counted.
    expect(thr.replies[0].bot).toBe(true);
  });
});

describe('rereading the author\'s own words', () => {
  const mine = 'Jai testé le truc sur 3 machines, ça tiens pas la charge au dela de 200 req.';

  it('forbids the two things that would make it a model reply', () => {
    for (const mode of ['fix', 'flow'] as const) {
      const p = buildPolishPrompt(mine, mode);
      expect(p).toMatch(/SAME LANGUAGE/);
      expect(p).toMatch(/Never translate/);
      expect(p).toMatch(/Add NOTHING/);
      expect(p).toMatch(/Remove no idea/);
    }
  });

  it('asks to correct, or to rephrase — never both under one word', () => {
    expect(buildPolishPrompt(mine, 'fix')).toMatch(/Change ONLY what is wrong/);
    expect(buildPolishPrompt(mine, 'flow')).toMatch(/Stay close to the original length/);
  });

  it('takes a clean correction', () => {
    const out = acceptPolish(mine, "J'ai testé le truc sur 3 machines, ça ne tient pas la charge au-delà de 200 req.", 'fix');
    expect(out).toEqual({ text: expect.stringContaining("J'ai testé"), same: false });
  });

  it('refuses an empty answer instead of wiping the draft', () => {
    // The failure mode that costs the most: a call comes back empty and the
    // author's paragraph is replaced by nothing at all.
    expect(acceptPolish(mine, '', 'fix')).toEqual({ fail: 'empty' });
    expect(acceptPolish(mine, '   \n  ', 'flow')).toEqual({ fail: 'empty' });
  });

  it('refuses an answer that drifted away from what was written', () => {
    // A "helpful" model that returns an essay is not a proofreader — and the
    // extra paragraphs would be facts nobody wrote, posted under the user's
    // name.
    expect(acceptPolish(mine, `${mine} ${'Et par ailleurs, '.repeat(40)}`, 'fix')).toEqual({ fail: 'drift' });
    expect(acceptPolish(mine, 'Ça marche pas.', 'fix')).toEqual({ fail: 'drift' });
  });

  it('is looser for a rephrasing than for a correction', () => {
    // Rephrasing legitimately moves length around; correcting does not.
    const shorter = 'Testé sur 3 machines : ça lâche au-delà de 200 req.';
    expect(acceptPolish(mine, shorter, 'fix')).toEqual({ fail: 'drift' });
    expect(acceptPolish(mine, shorter, 'flow')).toMatchObject({ text: shorter });
  });

  it('unwraps a fenced answer instead of pasting backticks into a reply', () => {
    const out = acceptPolish(mine, '```\n' + mine + '\n```', 'fix');
    expect(out).toEqual({ text: mine, same: true });
  });

  it('keeps quotes the author actually wrote', () => {
    // Only a wrapper the ORIGINAL did not have gets removed.
    const quoted = '"Ça tient pas la charge" — c\'est exactement ça.';
    expect(acceptPolish(quoted, quoted, 'fix')).toEqual({ text: quoted, same: true });
    expect(acceptPolish(mine, `"${mine}"`, 'fix')).toEqual({ text: mine, same: true });
  });

  it('says "nothing to correct" rather than pretending it worked', () => {
    expect(acceptPolish(mine, mine, 'fix')).toEqual({ text: mine, same: true });
  });
});

describe('reworking a draft by hand', () => {
  beforeEach(() => localStorage.clear());
  const entry = (id: string) => ({
    id, at: '2026-08-07T00:00:00.000Z', angle: null, ideas: '', memory: null,
    drafts: { coach: 'c', drafts: [{ type: 'INTP' as const, text: 'first' }, { type: 'ENFP' as const, text: 'second' }] },
  });
  const read = () => JSON.parse(localStorage.getItem('pheme:drafts') ?? '[]');

  it('rewrites the one draft and leaves its siblings alone', () => {
    // The text on screen is what gets posted — an edit that evaporates on
    // reopening the post is worse than no textarea at all.
    localStorage.setItem('pheme:drafts', JSON.stringify([entry('t1')]));
    saveDraftText('t1', 'INTP', 'mine');
    expect(read()[0].drafts.drafts.map((d: { text: string }) => d.text)).toEqual(['mine', 'second']);
  });

  it('never touches another post\'s drafts', () => {
    localStorage.setItem('pheme:drafts', JSON.stringify([entry('t1'), entry('t2')]));
    saveDraftText('t2', 'ENFP', 'mine');
    expect(read()[0].drafts.drafts[1].text).toBe('second');
    expect(read()[1].drafts.drafts[1].text).toBe('mine');
  });

  it('writes nothing for an id or a voice that is not there', () => {
    // Silently appending a stray draft would put a voice in the Coach's table
    // that was never generated, let alone posted.
    localStorage.setItem('pheme:drafts', JSON.stringify([entry('t1')]));
    saveDraftText('nope', 'INTP', 'x');
    saveDraftText('t1', 'ESTJ', 'x');
    expect(read()[0].drafts.drafts).toHaveLength(2);
    expect(read()[0].drafts.drafts.map((d: { text: string }) => d.text)).toEqual(['first', 'second']);
  });
});

describe('ledgerStats', () => {
  const at = '2026-01-01T00:00:00.000Z';
  it('holds at exactly 9:1 and breaks below it', () => {
    const nine = Array.from({ length: 9 }, () => ({ at, community: 'r/x', url: '', kind: 'participation' as const }));
    const promo = { at, community: 'r/x', url: '', kind: 'promo' as const };
    expect(ledgerStats([...nine, promo]).ratioOk).toBe(true);
    expect(ledgerStats([...nine.slice(1), promo]).ratioOk).toBe(false);
  });

  it('is fine with no promo at all', () => {
    expect(ledgerStats([]).ratioOk).toBe(true);
  });

  it('counts replies written WITHOUT Pheme toward the ratio', () => {
    // Otherwise the gauge prints ✗ beside the promo tile on the very screen
    // whose verdict says READY — one question, two answers.
    const promo = { at, community: 'r/x', url: '', kind: 'promo' as const };
    const solo = report(Array.from({ length: 9 }, (_, i) => thread({
      id: `s${i}`, mine: 'comment', community: 'r/x',
      url: `https://www.reddit.com/r/x/comments/a${i}/t/`,
    })));
    expect(ledgerStats([promo], solo)).toMatchObject({ participation: 0, solo: 9, ratioOk: true });
    // Without a presence report it reads the ledger alone, exactly as before.
    expect(ledgerStats([promo]).ratioOk).toBe(false);
  });

  it('keeps the two counts DISJOINT — never a total and a share of it', () => {
    const POST = 'https://www.reddit.com/r/x/comments/abc123/t/';
    const logged = { at, community: 'r/x', url: POST, kind: 'participation' as const };
    const rep = report([thread({ mine: 'comment', community: 'r/x', url: POST })]);
    // One single act, seen from both sides: logged, so it is not also solo.
    expect(ledgerStats([logged], rep)).toMatchObject({ participation: 1, solo: 0 });
  });
});

describe('presenceZones', () => {
  it('puts the user\'s own posts in the sub feed and matches casing loosely', () => {
    const rep = report([
      thread({ id: 'mine', community: 'r/MnemosyneOS', mine: 'post' }),
      thread({ id: 'theirs', community: 'r/mnemosyneos', mine: 'none' }),
    ]);
    const z = presenceZones(rep, 'MnemosyneOS');
    expect(z.sub.map(t => t.id).sort()).toEqual(['mine', 'theirs']);
    expect(z.mine.map(t => t.id)).toEqual(['mine']);
  });

  it('floats a thread by its latest reply, not its own age', () => {
    const old = thread({
      id: 'old', mine: 'post', timestamp: '2025-01-01T00:00:00.000Z',
      replies: [{ id: 'r', author: 'x', body: '', url: '', timestamp: '2026-06-01T00:00:00.000Z' }],
    });
    const recent = thread({ id: 'recent', mine: 'post', timestamp: '2026-05-01T00:00:00.000Z' });
    expect(presenceZones(report([recent, old]), '').mine.map(t => t.id)).toEqual(['old', 'recent']);
  });

  it('scopes to one network when asked', () => {
    const rep = report([
      thread({ id: 'r1', network: 'reddit', mine: 'post' }),
      thread({ id: 'h1', network: 'hackernews', mine: 'post' }),
    ]);
    expect(presenceZones(rep, '', 'hackernews').mine.map(t => t.id)).toEqual(['h1']);
  });
});
