# Changelog — Pheme

All notable changes to the Pheme cartridge. The manifest version is the single
source of truth (`mnemo-plugin.json`), displayed in the footer and Settings.

## [0.11.0] — 2026-10-08

### Changed
- **The radar opens on the threads worth a reply today.** The default view shows
  threads that are fresh, unanswered and not hidden. The others are folded under
  one counter per reason (hidden, replied, stale), one click from being shown
  again. Nothing is deleted.
- **One status line above the radar**: the scan's age, the subs covered by this
  pass, the Mnemosyne pass and the Reddit throttle, each shown only when it was
  measured. The red banner stays for the one case that asks you to act: a 429
  stopped the scan before every sub was read.

## [0.10.0] — 2026-09-08

### Added
- **An agent can edit your watch list through Mnemosyne OS.** When an agent
  changes the subs or topics Pheme watches, Pheme adopts the change and a line
  says what changed and which agent made it. An edit made while the window was
  closed is kept.
- The radar is shared with agents in a compact form, dated with its scan.
- The new posts of each sub you declared are watched in the background (up to
  9 subs).

Needs Mnemosyne OS 1.7.0 or later.

## [0.9.9] — 2026-10-08

### Changed
- **Manifest only, no code change.** Pheme now declares keywords, so Mnemosyne
  OS can propose it when someone describes what they want instead of typing its
  name.

## [0.9.8] — 2026-08-08

### Added
- **Hacker News shows your own comments, not just the stories you posted.** A
  reply written on somebody else's thread existed nowhere in the app: no
  history row, no way for an answer to reach your inbox, and — since 0.9.7 — no
  way to be credited as an act written without Pheme. Reddit had this from the
  start; HN was half a presence. One row per thread, however many times you
  spoke in it, and your own story still wins over a comment you left on it.

### Fixed
- 🚨 **"Someone replied to you" never fired on Hacker News. On any path.**
  Algolia sends `objectID` as a string and `parent_id` as a number on the same
  hit, and ids were read with `asString`, which correctly answers `''` for a
  number — so the two sides of that comparison could not match, ever. Fixed by
  `asId` (`lib/coerce`), which treats an identifier as one key whichever type
  it arrives as, while still refusing anything that is not one. Seven tests go
  red without it, and the fixtures now carry the ids exactly as Algolia sends
  them — uniformly-string fixtures had been validating broken code.

### Notes
- The thread's URL is the STORY's, never the comment's permalink: that is the
  id the radar hands the ledger, and two different keys would have made every
  assisted reply on HN read as a solo one.
- A comment carries no score on Algolia, so it stays unknown and prints a dash
  — never a zero. Past the per-run budget a thread arrives shallow, which the
  card says out loud: "never looked inside" is not "nobody replied".
- One rule for replies now (`hnReplies`), replacing three copies that had begun
  to differ on what "addressed to me" means.

## [0.9.7] — 2026-08-08

### Added
- **A reply you wrote WITHOUT Pheme now counts — and counts double.** Answering
  a thread directly, without opening the cartridge, used to make the board go
  backwards: presence saw the comment, the ledger did not, so the community
  left "nothing measured here" for "not yet — 8 more replies". A real act was
  being read as an absence. Those replies are now detected by subtracting the
  ledger's threads from the public feed's (`lib/authorship`), and weigh twice
  an assisted one: four of them open a surface that asks eight. The sign is
  deliberate — this app is a starter, not a crutch, and it has succeeded on the
  day you answer without it (doc 75 §12).
- **A `solo` badge on every thread you wrote yourself**, so the classification
  can be checked act by act rather than trusted, and a cockpit tile that counts
  them — hidden while it is zero, because "0 solo" on a fresh install reads as a
  reproach for something nobody was asked to do.

### Changed
- The 9:1 gauge counts solo replies too. Without it the app contradicted itself
  on one screen: ✗ beside the promo tile, READY in the verdict below it. The two
  counts stay disjoint — replies logged here, and further ones only the public
  feed knows about — never a total and a share of it.

### Notes
- Reddit only, in practice, and not because of this change: presence
  reconstructs your own comments on Reddit but only your own stories on Hacker
  News. A solo reply there is invisible to the count — under-counted, never
  miscounted.
- Never your own posts: a post may BE the promo and nothing can tell, so it
  stays out of the credit rather than letting a launch pay for itself.

## [0.9.6] — 2026-08-07

### Added
- **The voices are chosen on the post, not in Settings.** The sixteen
  archetypes now sit in step 4 of the studio, beside the button that spends
  them. A thread often calls for a register the profile trio does not carry —
  and the only way to get it was to leave the post, edit a GLOBAL preference,
  come back, and remember to put it back afterwards. The trio stays the
  default and is preselected; `↺ profile trio` appears only once the selection
  differs, so the global setting is one click away and never silently drifts.
- **The drafts are editable.** They were `readOnly` textareas: a field that
  looks writable and refuses the cursor reads as a broken app, and the last
  word before posting belongs to the author, not to the model. Type in place;
  Copy takes what is on screen, and the checks (length, promo, links, self-
  reference) re-run on the reworked text rather than on the generated one.
- **A reread of what the author typed** — `✓ Typos & grammar` and
  `↻ Rephrase`, under each draft. Kept as TWO buttons on purpose: correcting a
  typo and rewriting a sentence are not the same act, and one "improve this"
  button silently performs the second when the user asked for the first. The
  pass is forbidden the two things that would turn a human reply back into a
  model one — adding substance, and changing the language it was written in —
  and it keeps the register: no draft comes back more corporate than it left.

### Notes
- The chosen voices are saved with the draft set, so reopening a post shows the
  voices it was actually written in — not today's trio pretending to be them.
  One to three, same rolling rule as the profile picker; zero voices would ask
  the model for zero drafts and parse an empty set out of the answer, so the
  button greys out and says why instead.
- A hand-reworked draft is marked `✎` and written to the draft cache on blur
  (not per keystroke — that re-serialises forty entries per letter). The
  TRANSLATION view stays read-only: it is a reading aid for a language the
  author does not write, and typing into it would look like editing the reply
  while changing nothing that ever gets posted.
- `acceptPolish` is the guard on the reread, and it is pure so a test pins it:
  an empty answer and an answer that drifted (a "helpful" model returning an
  essay, or a correction that halved a paragraph) are both REFUSED, and the
  draft is left untouched. The two silent failures here would be a wiped draft,
  and facts nobody wrote posted under the user's name.
- Every polish is undoable — `↩ Back to my text` restores the author's own
  sentences exactly. Overwriting what a human typed with no way back is the
  one-way door this cartridge keeps closing. "Nothing to correct" is reported
  as a RESULT, not dressed up as a successful rewrite, and the call is counted
  under a new `polish` task like every other.

### Fixed
- **"Back to my text" could eat text the author had just written.** The undo
  armed by a polish held the pre-polish version for good, so polishing, then
  tweaking a sentence by hand, then clicking undo restored the older text and
  took the manual edits with it — silently. The undo now disarms the moment
  the author types again: it can only ever take back the polish itself.
- **An unreadable Hacker News account was reported as a karma of zero.**
  Firebase answers `200` with a literal `null` body for a user that does not
  exist, and `Number(null)` is `0`. `fetchProfileFacts` had no guard, so a
  handle with a typo in it reached the diagnosis prompt as "karma 0, 0
  stories" — a fabricated measurement the model then passed judgement on. The
  same prompt could contradict itself, since its other karma line comes from
  `presence.ts`, which fixed this on its own copy and correctly printed a dash.
  A genuine zero is still reported as zero.
- **The Atom fallback counted AutoModerator as a human reply.** Reddit walls
  its public `.json` for many clients, and every reconstruction then goes
  through the Atom feed. That path never asked who was speaking: no reply
  carried the `bot` flag and `commentCount` was the raw entry count. Since the
  sub's AutoModerator posts on EVERY submission, a thread nobody had answered
  reported "1 reply" — and it fed `freshReplies`, the history rows and the
  reply cache. The JSON path has filtered this since 0.8.x; the fallback kept
  the bug, on the exact path used when Reddit is refusing. Same predicate now,
  because two ways of asking "is this a human" is how the inbox and the badge
  came to disagree in the first place.
- **"There is no tracking of my post."** There was — it was rendering as
  nothing. A history row printed its score only when the source carried one, so
  "not inspected yet", "the source gave no score" and "nobody voted" were three
  identical blanks, and a column of blanks reads as a feature that does not
  exist. Unknown now prints `▲ —` and the tooltip says WHICH unknown it is;
  `commentCount === null` was already the flag for a thread never opened.
- Reply counts get the same treatment: a counted 0 is a MEASURED silence and
  says so, an uncounted one shows `—`. The two are not the same statement.
- The history head now states, in the open, how many threads are still
  uninspected. Pheme opens a few per scan and rotates — a tooltip is not
  discoverable, and the user had no way to learn that the dashes were a queue.
- **A capability that disappears now says so.** When Reddit walls its public
  JSON, Pheme silently falls back to the Atom feed — which carries no score and
  no parent links at all, so every score vanishes and no reply can be known to
  be addressed to the user. The Reddit board now says this while the latch is
  up (it re-probes within two hours), instead of showing an app that appears to
  measure nothing.
- **"What your posts became" now sits directly under the history**, on every
  reputation board. The two halves are one question — here is what you posted,
  here is what became of it — and the verdict table used to sit between them,
  putting the answer to *did anything happen?* below a table about something
  else. It was the surface that already did this tracking correctly, and it was
  below the fold.
- That panel counts the user's COMMENTS as well as their posts, but was headed
  "What your posts became" and its fact sheet counted "posts tracked". For
  someone whose whole activity is replies, that heading hides its own content.
  Now "posts and replies", and "threads tracked".
- `visionRefused` had no French string and fell back to English.

## [0.9.5] — 2026-08-06

### Added
- **A logged act can be taken back.** "I posted a reply" was a one-way door:
  the only undo was `clear`, which empties the WHOLE ledger. So a misclick left
  a choice between a wrong count forever and losing every real act with it.
- Undo sits where the click happened — next to the button in the studio, for
  an act logged in this session — and on the cockpit's recent activity, with a
  × per row, for one noticed later.

### Notes
- This is not cosmetic. The ledger feeds the 9:1 gauge, `standings`, and every
  readiness verdict, so one phantom act moves the app's judgement about where
  the user stands.
- Keyed on the entry's millisecond timestamp, and removing one never touches
  its neighbours. A stamp that matches nothing removes nothing — an undo that
  quietly ate the wrong row would be the same class of bug one level down, and
  `withoutAct` is pure so a test pins it rather than trust doing the work.
- The studio only offers it for an act logged in THIS session. Undoing one from
  last week goes through the ledger's own list, where the row is visible: a
  button that removed an entry the user cannot see is not an undo.

## [0.9.4] — 2026-08-06

### Fixed
- **Memory was deciding what the reply was about.** A thread asking "what
  actually got you hired?" came back full of RAG pipelines, PDF ingestion,
  Gemini failover and sub-50ms latency — none of it the subject. The prompt
  listed MEMORY as a source of substance alongside the thread, so the model
  went looking for something to say in it and found the author's whole stack.
- **Memory is now WEIGHED, per thread — not always used, and not banned.**
  Banning it would throw away the thing that makes a draft something only this
  person could write, which is the entire point of the recall step. The recall
  call returns its own verdict alongside its notes, in the same call:
  `answers` (it answers the question the post asks — best material in the
  prompt, use it), `adjacent` (same field, different question — usable only to
  make a point concrete, and fine to drop entirely), `none` (nothing reaches
  the drafter at all).
- The middle value is what was missing. A thread about getting hired IS in the
  author's field, so recall returned the stack and the drafter, told memory was
  substance, wrote about pipelines. Adjacency is not relevance, and it is not
  irrelevance either.
- The verdict is **shown** beside the notes in the studio, so notes that merely
  share a subject area stop looking like notes that answer the post.
- A malformed recall reply reads as `adjacent`, never `answers`: defaulting to
  `answers` would restore the exact behaviour being fixed, and defaulting to
  `none` would throw away a call the user paid for.

## [0.9.2] — 2026-08-06

### Changed
- **The author's own notes are the REPLY, not an ingredient in one.** The
  section said "weave these in", and that is exactly what the model did: a
  hiring manager wrote "I'm hiring, what I want is neurodivergent hyperfocus,
  worth more than any degree" — a first-hand answer to the exact question the
  thread asked — and it came back as sentence three, under two sentences about
  the state of RAG. When the author has written what they want to say, that IS
  the reply; the drafter opens with it and everything else is optional framing.
- **Answer the question that was actually asked.** The post ended on "what
  tipped the scale for YOU?" and said plainly it did not want generic advice.
  All three drafts closed on advice. The rule now: if the post asks a question,
  the first sentence answers it from the author's own experience, and a post
  that refused generic advice gets none — no "you should", no lecture on the
  field.

### Notes
- The drafts coming out in the author's language is NOT a defect: the workflow
  is to draft in your own language and translate before posting (the studio has
  the button). The `language` check still reports the mismatch, which is true
  of the draft as it stands, and turns green once translated.

## [0.9.1] — 2026-08-06

### Fixed
- **A refused Reddit BATCH was reported as thirteen broken subreddits.** The
  radar scans in multireddit batches of 15 — one URL for the whole roster, on
  a tight per-IP budget. Reddit refuses such a URL as a WHOLE and never says
  which member it objected to, but a refusal pushed every sub in the batch into
  "unreachable". A 403 (Reddit declining the request) reads there exactly like
  a dead subreddit, so a healthy roster came back listed as broken.
- **One dead sub no longer takes fourteen healthy ones down with it.** A
  refused batch is now split once and retried: the half that answers is
  recovered, in two extra calls. A full bisect would attribute the blame
  exactly and cost up to fifteen calls against the scarce resource — not worth
  it for a label.

### Notes
- Three states now, and they are different sentences. **Unreachable**: a
  request covering that sub ALONE was refused — private, banned, renamed.
  **Not covered this pass**: a batch was refused and Reddit did not say which
  member upset it. **Nothing at all**: a throttle stopped the run before those
  subs were ever asked, so there is nothing to report about a request nobody
  made.
- The salvage keeps the run honest about coverage: `subsCovered` counts what
  actually answered, so "0/28" stays "0/28" rather than being dressed up.

## [0.9.0] — 2026-08-06

A real Hacker News test produced a draft that reads instantly as "brand
comment written by an AI". On Reddit and HN that perception is unrecoverable
— a product risk, not a matter of style. This release hardens generation so a
draft passes for a peer.

### Added
- **`rulebook.DraftDoctrine`** — per-network thresholds: 4 sentences on HN, 6
  on Reddit, 14 where launching is the point. The venues are not comparable, so
  one global number would have been wrong everywhere.
- **`drafts.peerRegisterRules`** states the eight rules to the model with the
  venue's own numbers, and the author's own IDEAS explicitly cannot override
  them.
- **Four new post-draft checks**, beside the existing ones: `sentences`,
  `selfRef`, `vagueSelfRef`, `ownLink`. They inform, they never block — but
  they are the difference between noticing here and learning it from the thread.
- **A warning when a handle reads like a product** (`looksLikeBrandHandle`) on
  the surfaces where a reply is read as coming from a peer. A brand account
  explaining why "its" product fits lands as astroturfing however sincere the
  words are, and the author cannot see it from the inside.

### The rules
1. Self-reference: zero by default, one at most, never two. And never the
   UNNAMED kind ("my OS", "my systems") — it reads as bait to be asked, and
   lands worse than the name.
2. No link to the user's own product until the rulebook's gate is open. The
   generator cannot produce one, even on request.
3. Never ask what the source post already answered. The single most expensive
   mistake: it says "I did not read your post", and no substance repairs it.
4. Give before asking.
5. Native register. Corporate filler and translation-ese banned by name.
6. Length per venue. A wall reads as posture.
7. The thread's language, never the interface's.
8. A product-shaped handle is flagged.

### Notes
- Rules 1, 2, 6 and 8 are enforced and tested; 3, 4, 5 and 7 are prompt-side
  and documented in `rulebook.ts` beside the thresholds.
- **Self-references are counted in SENTENCES, not tokens.** "I wrote my own 2D
  layout" is ONE act of self-reference; counting possessives scored it three
  and failed a draft that mentions itself exactly the amount allowed.
- The shipped HN draft is pinned as a test fixture, with the calibrated version
  beside it. Worth noting what does NOT catch it: at four sentences it sits
  exactly on HN's ceiling, so a length check alone would have waved it through.
  The register was the problem.
- Untouched, as instructed: standing/readiness, the 9:1 gate, `authors.ts`.

### Changed
- The model's judgement now carries its "estimated by a model" tag on the
  `DiagPanel` itself, so it travels to every surface that renders it. On the
  Coach it sits directly above the COUNTED verdict table, and untagged the two
  read as one thing (doc 75 §5.3).

## [0.8.5] — 2026-08-06

### Added
- **A button to run the diagnosis again**, on the Coach, beside the timeline it
  adds a point to. There was none: the only way to ask Mnemosyne to look at you
  again was to reopen the whole onboarding interview — goal, topics, subs,
  pseudonyms, voices — to reach one button at the bottom. Every "diagnosis"
  door in the app just set `done: false` and dropped you there.
- The button says when it last ran, and what it will actually look at. "Redo
  it" should not be a mystery box.

### Changed
- **The diagnosis now judges on everything measured**, not on a re-fetch of
  the Reddit feed. `buildMeasuredBrief` hands the model the ledger and the 9:1,
  the verdict per community WITH the rules those communities publish, public
  karma on both networks, and what each post became. The app had grown all of
  that while the diagnosis kept looking at a fraction of it.
- `DiagnoseButton` is the ONE implementation; the interview and the Coach both
  render it. A second copy would have been two definitions of what a diagnosis
  is built from.

### Notes
- Anything unmeasured reaches the model as `NOT MEASURED`, never as 0 — a
  judgement about a person built on a fabricated zero is the worst place for
  one. An unread rulebook is passed with its reason and an explicit
  "do not treat them as open".
- The model is told not to state a number that is not in the brief. It still
  judges — that is its job, and the cockpit labels it "estimated by a model"
  beside the counts.

## [0.8.4] — 2026-08-06

### Added
- **The radar can be narrowed to one watched target.** It had no such filter
  at all: on a dozen subs the only way to look at one of them was to read past
  the other eleven, or leave for the board. Click a chip to narrow, click it
  again to come back.

### Changed
- **The target chips are sorted alphabetically**, on the radar and on the
  board. They came out in the order they were ADDED, which is arbitrary past
  the third sub. Sorting by hit count was the tempting alternative and it is
  worse: the row would reshuffle after every scan, so the chip you clicked
  last time is somewhere else now. The count rides on the chip instead.
- `sortedTargets` and `targetLabel` live in `lib/selectors.ts`, so the two
  surfaces cannot drift. `r/Foo` and `Foo` are the same target, and a filter
  built on the wrong one matches nothing — which reads as "the scan found
  nothing here".

### Notes
- The chip count is taken over the network's items, never over what is
  currently visible: a count that dropped to 0 because another chip is active
  would read as "this sub brought nothing", which is a different sentence.
- The Mnemosyne pass follows the sub filter — filtered to one sub, it no
  longer pays to classify the other twenty. It deliberately ignores the TIER
  filter: you run the pass to obtain tiers, so filtering on them first would
  be circular.

## [0.8.3] — 2026-08-06

### Added
- **What it all added up to**, at the top of "What your posts became": points
  brought back, human replies received, posts tracked. The satisfying figures
  were already fetched — they were just spread across a sober list, one row at
  a time, and never totalled.

### Notes
- A sum is the easiest place in this cartridge to fabricate a value, so two
  things carry the design. Posts whose score the source never published are
  **excluded** from the total rather than added as zero — a silent 0 in a sum
  is indistinguishable from a measurement and drags the total down with a
  number nobody read. And the total states what it rests on: "2/3 posts", with
  the others named as excluded, because 52 points over two posts and over
  forty are different sentences.
- No score published anywhere means **no total**, printed as a dash. Not a
  total of zero. Replies are counted, so zero replies stays a real, measured
  silence.
- ⛔ Still no OAuth, and none is needed for any of this: every figure here is
  public. OAuth would only add views and impressions on the closed platforms.

## [0.8.2] — 2026-08-06

Closes the three open points doc 75 left behind. The fourth, OAuth, stays
shut: it is a product decision, not a missing feature.

### Added
- **`lib/history.ts` — the counts, written down and dated.** The report
  offered no period comparison because Pheme kept no history of its own
  figures: a "+3 since last month" would have been invented at the SOURCE,
  before the model ever saw it. Now one snapshot per day per scope is recorded
  passively on every presence refresh, and the report shows what moved since a
  DATED baseline.
- A delta needs **two real measurements**. Karma unread last week and read
  today is not "+340 karma" — that rise is unknowable, so no badge appears.
  Nothing is back-filled: a fresh install says the first comparison is about a
  week away.
- The measured movements join the fact sheet, so `auditNumbers` accepts them.
  They are counted figures like any other; a percentage is still always refused.

### Fixed
- **DEV, Indie Hackers and Quora were filed as `reputation` surfaces** while
  the rulebook has them `open` (doc 75 §2a). The one combination that cannot
  be true: it applied a doctrine of restraint to places where publishing your
  own work is the norm, and made their profile page collect a watch list no
  code path reads. A test now fails on any `role: reputation` + `demand: open`
  pair.

### Notes
- **Mastodon and Bluesky counters verified against the live services.**
  `https://mastodon.social/@Mastodon/117043346514398510` resolves to
  `/api/v1/statuses/117043346514398510` (200, favourites/reblogs/replies), and
  a bsky.app post URL resolves to the public AppView `getPostThread` with the
  HANDLE in the at:// authority position — no DID resolution step. Both shapes
  are pinned in the tests; the counts move, the derivation does not.

## [0.8.1] — 2026-08-06

### Changed
- **Settings stopped being a Reddit page.** It held the Reddit pseudonym, the
  Hacker News pseudonym, the user's own subreddit and the subs to watch —
  because those were the first two networks and the page grew around them. A
  third network had nowhere to go, and someone looking for "my Reddit
  settings" found them in a list that also held the app's language.
- **Everything per-network moved to that network's own Profile tab.** The
  Reddit page now carries the watch list AND the sub finder that followed it;
  Hacker News carries its own handle and queries. Same components, one home
  each — never a second copy.
- **The auto-recheck timer moved to Pseudo**, next to the button it automates.
  One pass covers Reddit and Hacker News together, so it reads the same on
  either tab and the hint says so rather than letting it look per-network.
- Settings now says WHERE those settings went. A control that silently
  vanishes reads as a control that was deleted.

### Notes
- The interview still asks for the pseudonyms and the subs itself: on a first
  run the network tabs do not exist yet, and asking is the point of that
  screen. `SubsField` and `PseudoFields` live on for exactly that.
- What stayed in Settings is what is genuinely global: the goal, the expertise
  topics that score every network, the voices, the wordmark, the skin, the
  language, and what Mnemosyne is told to remember. The list-recovery block
  stays too — it is a rescue for a save bug, not a network setting.

## [0.8.0] — 2026-08-06

Lot 5 of the reputation engine (doc 75) — the loop closes. With it, doc 75 is
delivered end to end: lots 1 through 5, and the OAuth line untouched.

### Added
- **"What your posts became."** Pheme said what to write and where, then never
  mentioned it again. Now every post the user published carries its score, the
  human replies it drew, and when it last moved — on the cockpit and on each
  network board.
- **Three days of silence is stated as a result.** A post with no reply this
  morning is young; one past three days has been answered, with nothing. That
  sentence is the difference between a coach and a dashboard.
- **`lib/outcomes.ts` reads the public counters** of the two promotion
  surfaces that publish them: Mastodon (`/api/v1/statuses/:id`) and Bluesky
  (the public AppView `getPostThread`). Favourites, boosts and replies, on
  demand, with no account.
- **A published post can carry its address.** Marking a post as published in
  the studio now offers a field for the link. Optional, and asked for rather
  than guessed — a wrong URL would report "no reaction" on somebody else's post.

### Notes
- Two kinds of nothing, drawn differently and never mixed: a **counted zero**
  (the thread was read, nobody answered) is a result; an **unknown** (no score
  published, no public counter on that surface) is a dash with a reason. A post
  shown at 0 points reads as rejected by people who never saw it.
- Only URL shapes we are sure of are recognised. X, LinkedIn, Threads and
  Medium publish no counter, and the app says so instead of trying an endpoint
  that would 404 forever and be reported as silence.
- The Mastodon and Bluesky endpoints are unauthenticated public APIs; they have
  not been exercised against the live services from this machine, and every
  failure path is named rather than folded into a zero.
- ⛔ Still nothing behind OAuth. Views and impressions remain out of scope,
  as a product decision rather than a missing feature.

## [0.7.6] — 2026-08-06

Lot 4 of the reputation engine (doc 75) — the report, global or per network.

### Added
- **`lib/report.ts` + the report panel.** A fact sheet rendered by the code
  from the ledger, from what the networks publish and from the verdict engine;
  Mnemosyne writes three paragraphs of prose around it.
- **The inversion rule, ENFORCED.** The model is handed the figures and asked
  for words. `auditNumbers` then reads the prose back and lists every number in
  it that is not in the fact sheet. One automatic retry, and if it still cites
  something nobody measured the narrative is **discarded** — the counts stand
  alone and the user is shown which figure was invented.
- Copy the whole thing as plain text: counts, verdicts, what could not be read,
  and the prose if it survived.

### Notes
- Refused, not caveated. A report is a document people forward, and the caveat
  is the first thing that gets dropped on the way. "+40 % engagement this
  month" inside an otherwise accurate report is worse than no report.
- A percentage is **always** rejected: Pheme computes no rate anywhere, so
  there is no reading of the fact sheet under which one could be a quotation.
- No comparison with a previous period exists, because Pheme keeps no history
  of these counts — a "+3 since last month" would be invented at the source
  rather than by the model.
- An unmeasured figure prints as a dash in the sheet. The one thing the audit
  cannot see is a zero (a real 0 and an invented one are the same character);
  that case is documented where it lives, and the dash is what guards it.

## [0.7.5] — 2026-08-06

Lot 3 of the reputation engine (doc 75) — the verdict reaches the screen.
Lots 1 and 2 built an engine nothing displayed; this is the day Mnemosyne
starts ruling instead of handing over numbers.

### Added
- **The move that unblocks the most**, alone at the top of the cockpit. A
  closed door outranks everything, because it is the only verdict that changes
  WHAT to do rather than how much.
- **One line per community**, with the verdict, what it rests on, and the
  sample behind every figure. The community's own rules sit one click away, in
  its own words, untranslated.
- **`selectors.standingBoard`** — standing, verdicts and the next move,
  composed once. Three surfaces show readiness and they each used to compute
  it; now they read one answer.
- Reddit karma has its own tile beside the HN one, and the HN tile finally
  says which network it belongs to.

### Changed
- **The verdict is no longer an invented floor.** `communityStats.ready`
  (`8 replies && a local 9:1`) was printed as the answer on three screens, the
  same threshold for a subreddit that BANS self-promotion and for a surface
  where launching is the point. It is gone; readiness reads the community's
  own rules, and the 9:1 is one signal among others.
- **The engine writes no sentences.** A verdict is codes and figures, and the
  view says them — so a French reader gets a French reason. Lot 1 generated
  English prose that would have shipped untranslated. The one string still
  carried through is the community's own wording: a translated ban is a
  paraphrase, and that is the sentence someone gets banned over.
- The network-level gates moved from `lib/rulebook.ts` prose into locale keys,
  EN and FR. The rulebook stays the dated editorial record and now points at
  one copy instead of holding an English-only one.
- **The model's judgement is labelled as such**, dated, and kept beside the
  counts rather than mixed into them. Both used to live under the word
  "diagnostic": one is what the user did, the other is one inference at one
  moment.

### Notes
- `unknown` reaches the screen as "can't tell", with the reason — a walled
  endpoint, a throttle, or simply not read yet. It is never drawn as "not
  ready" and never as a clean slate.
- A karma that was never read shows a dash, not a zero.

## [0.7.4] — 2026-08-06

Lot 2 of the reputation engine (doc 75) — the fetch that turns it on. Lot 1
was pure logic answering `unknown` for every Reddit community, because the
rules of a place outrank everything counted and nothing had ever read them.

### Added
- **`lib/redditPublic.ts`** — the two things Reddit publishes to anyone, with
  no account and no OAuth: `/user/<handle>/about.json` (post and comment
  karma, account age) and `/r/<sub>/about/rules.json` (the community's rules,
  in its own words). Both through `redditGate`, in probe mode.
- **Reddit karma is finally read.** It is the hardest free standing signal
  there is, and Pheme walked past it until now. It shows next to the HN one on
  the presence bar, and fills `Standing.karma` on every Reddit row — one karma
  per ACCOUNT, because Reddit publishes nothing per subreddit.
- **A community's rules are quoted, never summarised.** Title and description
  land verbatim; a rule too long to keep whole is cut with a visible ellipsis,
  because a silent trim is a paraphrase. Asking a model what a subreddit
  forbids would have been a fabricated claim about a real ban.
- Rules rotate two per run, oldest first, and are cached for a week; karma for
  six hours. The per-IP bucket is the scarce resource and presence already
  spends most of it.

### Fixed
- **A negated permission no longer cancels a ban.** Descriptions arrive with
  the rules now, and they spell the ban out twice — "No advertising. Ads are
  not allowed here." The allow-words guard read "allowed" inside "not allowed"
  and waved a closed door through as open. The framed exception ("allowed in
  the Friday thread") still passes, which is what that guard is for.
- A stray NUL byte in `lib/presence.ts` — inside what should have been an
  empty string. Harmless at runtime, but it made git and ripgrep treat the
  whole file as binary.

### Notes
- **A wall is an unknown, never a zero.** A suspended account answers 200 with
  no karma in it, and Reddit walls public `.json` for many clients: every
  failure here leaves the fact absent and says why (`walled`, `limited`,
  `error`, `not-read`). A "0 karma" or a "no rules" invented from a refusal
  would be Pheme fabricating good news about someone's launch.
- An EMPTY rulebook is a different answer from an unread one, and a real one:
  the sub replied and publishes nothing.
- ⛔ Nothing here crosses the OAuth line. Views and impressions stay out.

## [0.7.3] — 2026-08-06

Lot 1 of the reputation engine (doc 75). Pure logic, tested, no interface yet
— the foundation everything else reads.

### Added
- **`lib/rulebook.ts`** — what each surface really demands. The 9:1 ratio is
  folklore; what bites is the community's own rule, then the posting gate
  (account age, karma), then the imposed format. Editorial and DATED: a model
  asked for a subreddit's rules invents them with confidence, and that would
  be a fabricated claim about a real ban. Per-community rules are a different
  thing — fetched and shown verbatim (lot 2).
- **`lib/standing.ts`** — where you stand, community by community. No global
  figure and no score: reputation is not fungible, and 500 karma in one place
  buys nothing in another. Every count carries its sample size, and anything
  unmeasured stays `null` — Reddit karma is public and not read yet, so it is
  `null`, never 0.
- **`lib/readiness.ts`** — the verdict, because Mnemosyne has to RULE rather
  than hand over numbers. `blocked` when the community forbids promotion (no
  amount of participation unlocks that, and saying so saves three weeks);
  `unknown` as a first-class answer, because "you are not ready" and "I cannot
  tell" are different sentences. Every verdict cites what it rests on and what
  is missing — which is also the advice.
- Promotion RAISES the bar rather than lowering it: a community you already
  pitched in owes you less patience than one you only gave to.

## [0.7.2] — 2026-08-06

### Added
- **"Read what I publish there".** A profile URL that does nothing is the
  failure this release spent its time removing everywhere else. Medium and
  Mastodon expose an open feed of what YOU wrote, so the network profile page
  reads it: the titles are listed, each one a door to the original.
- **Those titles ground the bio.** "Draft it from my memory" described what
  you know; with the feed it describes what you have actually put out under
  that name. The difference between a vault summary and a body of work.

### Notes
- **This does NOT make a promotion network scanned.** The doctrine holds:
  Pheme listens where reputation is earned and never watches your own
  channels for things to react to. This reads your OWN page, on demand, when
  you press the button.
- Only surfaces with a feed we are sure of are offered — Medium and Mastodon.
  X, LinkedIn, Bluesky and Threads say plainly that there is no public feed
  rather than showing a button that finds nothing: a guessed URL would 404
  forever and report "nothing found", which reads as *you have published
  nothing* — a fabricated verdict about the user's own work.
- One parser for RSS and Atom, and a date the feed did not send stays absent
  instead of becoming today.

## [0.7.1] — 2026-08-06

The Reddit board answers "what is it actually watching, and can I change it
from here?"

### Added
- **The watched subs are a visible, clickable list**, not a sentence of names
  joined by dots. Each carries the number of radar picks it brought in the
  last scan — a sub sitting at 0 is a fact worth seeing.
- **Click one to filter the whole board.** The radar picks AND your history
  below follow it: a filter that moved one and not the other would be a screen
  half-answering the question it was just asked. It is view state, not a
  setting — leaving the board and coming back shows everything again.
- **Add a sub without going to Settings.** Type a subject on the board and
  Mnemosyne goes looking for subreddits about it; every name is still checked
  against Reddit in ONE request before it is offered. Leave the box empty and
  it searches from your own topics, exactly as Settings does.

### Changed
- The search moved into `components/SubFinder.tsx` and Settings now renders
  THAT. It spends a model call and a Reddit call, and two copies of it would
  have become two different sets of rules about what reaches the profile.
- A seeded search does not mix in your posting history: you asked about a
  subject, not about where you already post.
- The board's ⚙︎ button now opens this network's Profile — the page that owns
  these lists since 0.6.4 — instead of global Settings.

## [0.7.0] — 2026-08-06

**The drafter was answering a third of the post.** Found in the running app,
on a real r/AI_Agents thread: the reader saw the text cut mid-word at
"…OpenHands, bu", and the model saw far less than that.

### Fixed
- Four clips compounded, each reasonable alone:
  - the scan cached a Reddit body at **800** characters — that is the stump on
    screen (now 2400: a hundred cached items is ~240KB, well inside quota);
  - the post view re-clipped it to **800** again on the way to the studio (now
    passes what it has — an extracted article runs to 6000);
  - the re-fetch that exists to be *more* complete stopped at **1400**, below
    the scan's own cap, so a "refresh" was a downgrade (now 4000);
  - and the draft prompt sliced the body to **350**. That is the one that made
    replies read beside the point: the model was answering an excerpt of a
    post the human had just read in full (now 4000).
- **The fuller body was fetched and then thrown away.** The studio kept
  `item.body` whenever it was non-empty, so the listing excerpt beat the
  complete post Pheme had just paid to go and get. It takes the longer of the
  two now.
- The two cheap steps (angles, recall) stay short at 700 — a cost decision,
  and safe, because neither of them writes the reply.

### Notes
- The draft prompt must keep going through `model.infer`: `mnemosyne.query`
  hard-slices at 2000 characters and would amputate the body all over again.

## [0.6.9] — 2026-08-06

A bot was ringing the doorbell.

### Fixed
- **AutoModerator arrived in the inbox as "someone replied to you".** Every
  subreddit's AutoModerator posts boilerplate on EVERY submission, as a direct
  child of the post — so on the user's own post it satisfied "the parent is
  you", lit the 📬 badge, and opened a draft studio to answer a bot. Nothing
  filtered it, anywhere.
- The same comment was counted in six more places, each of which turned it
  into a small lie: the thread reported **"1 comment"** on a conversation
  nobody had; the per-network badge and the global KPI both counted it; the
  **liveness sort** treated a bot's timestamp as the thread still being alive
  (and AutoModerator answers within seconds, so a dead thread floats forever);
  the Coach credited a voice with a **reply it did not earn**; and the board
  showed the inflated count.
- 🚨 **It was written into PERMANENT memory.** With "the thread around them"
  on, the SOCIAL vault got the bot's wiki blurb filed under *what people
  answered* — retrievable by the chat and the RAG for good, and removable only
  by hand in the Vault Manager.
- Same family, one step further: a **`[deleted]` / `[removed]` comment** was a
  reply that no longer exists. Counted as a conversation, and its placeholder
  body handed to the drafter as if it were speech.
- `verify.ts` also quoted both to the model as "the freshest comments in the
  thread" — the drafter could react to a wiki link.

### Notes
- The rule lives once, in `lib/authors.ts`, and it is an EXPLICIT list of
  automated accounts: a `/bot$/i` heuristic matches Talbot, Abbot and every
  human whose handle ends that way, and deleting a real person's reply from
  the inbox is far worse than letting one bot through.
- **Nothing is hidden.** A bot's comment still renders in the thread, tagged
  `bot` — the same doctrine as the ⌛ on a decayed thread. It is simply never
  counted, never routed to the inbox, never remembered, never quoted.

## [0.6.8] — 2026-08-06

Second review pass, on the code around the changes rather than the changes.

### Fixed
- **A PDF became "the article".** Half of Hacker News links straight at a
  document. `fetchArticleText` never looked at the content type: decoded as
  UTF-8, a PDF yields kilobytes of replacement characters, which sails past the
  "at least 200 characters" floor and was then displayed as what the thread is
  about — and offered for translation, a paid call on binary noise. A
  non-textual body is now named as one (`notText`), read from and assumed
  nothing. Pre-existing; the `encoding` field added for vision made it visible.
- **A truncated image was handed over as the image.** The host caps a body at
  4MB, which a phone screenshot passes easily. Half a JPEG is not a small JPEG;
  `fetchImage` refuses it rather than letting a vision model describe whatever
  it can make of the fragment.
- **An unnamed refusal read as "the model returned nothing".** That is a
  verdict about the model, and nobody asked it anything — the same fabrication
  one layer up. `refused` is now its own outcome, with its own sentence.

### Notes
- Host side: `image/svg+xml` stays TEXT (it is markup — a caller wants to read
  it, not decode it), and `hostFetch` reports `truncated`. Doc 74 §1.

## [0.6.7] — 2026-08-06

Review pass over 0.6.4–0.6.6. Three real defects, found by reading the code
rather than by running the tests — two of the tests were *passing while
asserting something the code did not do*.

### Fixed
- **A Number poster with no number rendered a 189px empty text node** — a hole
  exactly where the point of the poster belongs. The studio greys the layout
  out, but `renderPoster` is exported and had no guard of its own. It falls
  back to the Claim layout now. The test that "covered" this asserted only that
  the headline appeared — which it does, in the caption, while the figure was
  blank. A poster is not verified by grepping for a string it happens to
  contain elsewhere.
- **`readMedia` cleared its spinner only on the happy path.** `readImage` is
  total by contract, so it worked — and was one refactor away from a spinner
  stuck for the life of the widget, in a surface with no reload button.
- `applyPoster` re-looked-up the story by id in a snapshot captured before an
  await; it takes the story it was already given.

### Notes
- The host-side half of this pass (the `hybrid` vision hole, image shape
  validation) is in `74_cartridge-vision-and-binary-fetch.md` §2.

## [0.6.6] — 2026-08-06

The visual studio, long version.

### Added
- **Four layouts, not one.** A post makes one of four kinds of point, and a
  single template flattened all of them into the same headline: `Claim` (the
  original lockup), `Quote` (a sentence worth reading verbatim, with who said
  it), `Number` (one figure that IS the post), `Cover` (a title page, for long
  form). Same brand plate, same mark, four compositions.
- **The canvas is a choice.** `native` still follows the surface; wide, OG,
  square, portrait and story are one click away — a post published in three
  places needs three plates, and portrait buys far more feed height than the
  landscape card a network nominally asks for.
- **Changing either is FREE.** The copy is kept beside the rendering, so
  trying a layout or a canvas is a re-render, not another inference. Paying
  again to look at an alternative is the same as not offering one.
- **`pnpm posters`** renders every layout × canvas to `.preview/` with a
  contact sheet. The tests pin the structure; they cannot tell you whether the
  thing is good to look at, and a poster nobody has seen is a poster nobody
  should ship.

### Fixed
- **The wordmark was the literal string `MNEMOSYNE OS`, hardcoded** — correct
  for exactly one user of a cartridge anyone can install. It is a profile
  field now (Settings → your wordmark); empty prints no wordmark at all and
  the layout closes the gap, because a blank line beats someone else's brand.
- **Portrait and square left a third of the plate empty.** They were composed
  like a landscape card — the claim pinned to a fraction of the height — so
  the foot of a 1080×1350 read as an unfinished export. Portrait and square
  are bottom-anchored now (brand at the top, claim at the foot, air between);
  a 9:16 story stops at 80% instead of sliding under the phone's own UI.
- The rule under a Number poster crossed the digits; the quote block was
  centred on the plate rather than on the space the brand leaves.
- The PNG export used the network's default width even when the poster had
  been rendered portrait — a squashed export.
- A model asked for an optional number answers `"N/A"`, `"none"` or `"-"` as
  readily as `""`. Those are absences wearing a value's clothes, and one of
  them on a Number plate is a 300px "N/A". They now read as absent, and the
  Number layout is refused — with the reason — rather than rendered empty.

## [0.6.5] — 2026-08-06

### Added
- **Post images get READ.** Half of Reddit is a screenshot with two lines of
  caption; Pheme could only flag "N image(s) nobody read" and order the
  drafter never to guess. It now fetches the bytes through the host and hands
  them to a model that can actually see, shows the reading beside a button
  that opens the original, and feeds it to the draft prompt labelled as *a
  machine reading* — the author posts, so they must be able to tell where the
  claim came from. The "do not guess" warning survives, image by image, for
  whatever is still unread.
- Every failure names itself: the model cannot see (the host refuses the call
  outright rather than answering blind), the image is too large, it could not
  be fetched, or the answer was empty. `{success:false}` arrives as an
  ordinary resolved value from the host — flattened to a string it read as
  "the model had nothing to say", which is a verdict nobody produced.

### Notes
- Requires host doc 74 (`74_cartridge-vision-and-binary-fetch.md`): before it,
  `social.fetch` decoded every body as UTF-8 and destroyed the image, and
  `model.infer` dropped attachments in silence. An older host is detected and
  says so (`HOST_TOO_OLD`) instead of sending mangled bytes.
- Vision is a CLOUD multimodal capability (Gemini, Vertex, OpenAI, Anthropic,
  Grok). A local model cannot see, and Pheme says that instead of trying.

## [0.6.4] — 2026-08-06

### Fixed
- **A first visit to X, LinkedIn, Bluesky, Mastodon, Threads or Medium asked
  for a list of "topics to watch here" that nothing has ever read.** Only
  `reddit` and `hackernews` targets reach a scan (`scanRadar`) or a background
  watch (`watchTargetsFor`); everywhere else the answer went into storage and
  died there. A question whose answer does nothing is worse than no question —
  it teaches the user their answers are decoration. What a network's profile
  page asks now comes from its ROLE (`netProfileShape`), not from a component
  `if`, and the rule is one line: **ask only what something reads.**
- The handle hint on a promotion surface claimed "this is what Pheme follows
  to find your posts". Pheme never reads those surfaces. It now says what the
  handle is actually for there.

### Added
- **The language you publish in, per network.** The composer took the UI
  language unconditionally, so a French interface could not compose an English
  LinkedIn post — most people's actual situation. `postLang` (empty = follow
  the app) now drives both the story prompt and the bio drafter.
- **Who reads you here**, one line per network, fed to the composer so it
  writes for those readers instead of a generic audience.
- **The link to your profile**, asked on every network. A handle is not always
  an address: on Mastodon it is missing the instance, on LinkedIn it is not a
  handle at all. Opens in the OS browser when it is a real https URL.
- The promotion board states what the studio will do here (language ·
  audience), the same way the reputation board shows what the scan watches: a
  setting you can see is a fact, one you cannot is a hunch.

### Changed
- `netOf` and `normalizeProfile` complete a stored network entry from
  `EMPTY_NET`. An entry written before a field existed carried a PARTIAL
  object, and `undefined` reads as "off" — the silent-downgrade-on-upgrade the
  profile itself was already guarded against, one level down.
- `PublishTab` takes the profile instead of three fields off it: the network it
  composes for carries its own language and its own readers.

## [0.6.3] — 2026-08-06

### Fixed
- **`String(x ?? '')` on foreign JSON could write `"[object Object]"` into
  memory.** Every field from Reddit and Algolia is `unknown`; the day one of
  them arrives as an object, that literal text becomes the author's name, the
  post body, or a chronicle in the user's vault. ESLint's `no-base-to-string`
  found 40 such sites on its very first run. New `lib/coerce.ts`: a non-string
  reads as absent, a non-number reads as **null** — never a coercion, never a
  guess. This is the fabricated-value failure the whole codebase hunts, and it
  was sitting in the parsers.
- Four discarded promises made explicit (`void bridge.openExternal(...)`).

### Changed
- `type Scope = 'cockpit' | 'settings' | string` collapsed to `string` — the
  union promised a narrowing the compiler never gave. Named in a comment
  instead of pretended in the type.
- The three `exhaustive-deps` warnings were REFRESH SIGNALS, not missing
  inputs (`items` and `restored` trigger a re-read of localStorage). Kept, and
  each now says why in place of a silent suppression.

### Notes
- `pnpm install` ran (app closed, dev server stopped first). **Lint is green
  at `--max-warnings 0`**, along with tsc, 76 tests and the build.

## [0.6.2] — 2026-08-06

Housekeeping, ahead of the code being public.

### Added
- **ESLint** — the cartridge had *none*, which is the real gap a "senior dev
  panoply" audit turns up. Flat config with the rules that caught real bugs
  here: `no-floating-promises` (an un-awaited fetch is how a scan silently
  half-runs), `no-empty` with `allowEmptyCatch: false` (CLAUDE rule 7),
  `exhaustive-deps` (a stale closure kept the auto-refresh watching a
  pseudonym the user had renamed), `no-explicit-any`. ⚠️ **Needs
  `pnpm install` with the app CLOSED** before `pnpm lint` runs.
- **LICENSE** (MIT, same holder as the repo root) and **.editorconfig**.
- `Dock.tsx` — the navigation left `App.tsx` (611 → 540 lines).

### Changed
- **README rewritten for 0.6** — it still described a two-room app when the
  cartridge had become a cockpit: per-network profiles, memory, the inbox,
  the branded posters, Medium, the honesty rules, the architecture table.
- JSDoc pass over the domain files a newcomer reads first (`networks.ts`,
  `selectors.ts`, `scan.ts`): contracts, `@param`/`@returns`, and *why* a
  field is optional — `points` and `comments` are absent when the source
  never sent them, and an absent count must never render as zero.

## [0.6.1] — 2026-08-06

### Added
- **A profile page per network.** Who you are HERE: the pseudonym Pheme
  follows, the places it watches on this surface, and your bio. The first
  visit to a live network opens it instead of a board built on nothing — once
  per network, marked by `configuredAt`, including surfaces that did not exist
  when you set the app up. Everything stays optional: the board opens either
  way, it just has less to show.
- **"Draft it from my memory".** Mnemosyne already holds your work; retyping a
  bio it could read is the kind of small stupidity that makes an app feel like
  paperwork. Grounded in memory only — it is told never to invent a role, a
  company, a number or a credential — and an empty answer leaves what you
  wrote untouched rather than wiping it.
- **Medium**, as the one long-form surface in the roster: its composer is told
  to write an ESSAY, not a status — no hashtags, no thread numbering, no
  hook-bait. Poster at 1400×787, the article-header ratio.

### Fixed
- **Downloading an illustration did nothing, silently.** Three causes, all
  real: the cartridge iframe had no `allow-downloads` sandbox token so
  Chromium blocked every download from every cartridge; the anchor was never
  put IN the document, and a detached anchor's click is not honoured; and a
  1600×900 PNG as a `data:` URL is several megabytes of href. It goes through
  a Blob now, and a refusal says so instead of leaving you clicking a dead
  button. The file is named per network and post, and the PNG button shows the
  size it will produce.

## [0.6.0] — 2026-08-06

### Changed
- **Settings became per-network.** They were shaped by Reddit and Hacker News
  without ever saying so: `subs` was Reddit-only, and `topics` doubled as the
  HN query. A third network had nowhere to put its own pseudonym, its own
  places to watch or its own presentation — every new surface would have
  widened the same flat bag. Each network now owns `handle`, `home`,
  `targets`, `bio` and `configuredAt`.
- **Each network scans its OWN list.** Subreddits on Reddit, search queries on
  Hacker News — they were one list wearing two hats. `topics` stays global on
  purpose: it is what the user KNOWS, and it scores every network's radar. A
  query you search is not a subject you know.
- Migration runs once, on load, in the single place that knows the old shape —
  and it is pinned by tests, including one that carries the ten real
  subreddits across. Those took the user real time to collect, and a migration
  that loses them is worse than no migration at all.
- The mirror's "is there a profile here?" guard reads raw JSON, so it now
  knows **both** shapes. It is what decides whether a cartridge booting on a
  new origin restores or shows onboarding — the blind spot that produced
  "AUCUN PROFIL" once already.

### Next
- Per-network first-run setup (ask for the pseudonym on first visit) and the
  "pre-fill my profile from memory" button are designed but **not built** —
  the model change had to land first, and it had to land verified.

## [0.5.2] — 2026-08-06

### Fixed
- **The app opened in its narrow mode on a maximised window.** Moving the nav
  into the header broke the measurement with it: the compact decision was
  taken from the NAV element, which now sits in the header and is sized by its
  own content — so it reported ~200px whatever the window did, and everyone
  got the mobile picker. It measures the shell ROOT now, which is what
  "how much room was this cartridge given" actually means. The threshold moved
  620 → 700 because the dock shares the mark's line: the header needs the
  brand *and* the icons before it is cramped.
- **Native controls follow the skin instead of the platform.** The picker's
  dropdown came back white-on-white on a dark skin — `color-scheme` is the
  only property that reaches inside a native popup, and it was never
  declared. Set per skin (dark for Host/Noir, light for Writer), so the
  select, the memory checkboxes and the scrollbars all obey. The picker also
  has a real surface now instead of a transparent one.

## [0.5.1] — 2026-08-06

### Changed
- **The post visuals stopped being ugly, by taking the pencil away from the
  model.** It was asked to invent an entire vector illustration ("3-5 flat
  colors on a light background, strong central metaphor") — a text model has
  no visual judgement, so every answer came back as the same grey rounded
  rectangles and blue dots, on a *white* plate that contradicted the brand it
  was illustrating. And at 800×450 for every network.
  The roles are inverted now: the model writes **words only** (kicker,
  headline, sub, as JSON), and the picture is the real brand lockup from
  `scripts/gen-banner.cjs` — plate gradient, violet blooms, the constellation,
  the lemniscate, the type scale — generalised to any canvas and rendered at
  the size each surface actually publishes (X 1600×900, LinkedIn 1200×627,
  Threads 1080×1350…). The banner script's own header says this generalisation
  belongs in a cartridge; it does now.
  The mark is the *same drawing* as the app icon: a test reads
  `scripts/brand-mark.cjs` and fails if this third copy ever drifts.
  Fonts stay system fonts on purpose — an SVG rasterised through `<img>` into
  a canvas cannot fetch a webfont, and a missing face reflows the lockup
  silently. A custom face would have to be embedded as a data-URI.
- Removed the SVG sanitizer with its only caller: there is no untrusted markup
  to clean once we render the picture ourselves, and a guard nobody calls
  reads like protection that isn't.

## [0.5.0] — 2026-08-06

### Added
- **The networks moved onto the mark's own line, as a dock.** Icons only —
  names cost the width of a monitor and are read slower than a logo. The label
  lives in the tooltip and the board proves it; hover magnifies the way a dock
  does. **The unread count now rides ON the icon**, so "where are my replies"
  is answerable at a glance instead of by reading twelve words. The narrow
  pane keeps its picker.
- **Each network board opens with its own numbers** — arrivals, radar picks,
  your history, participations, real cost. The cockpit answers "across all my
  networks"; this answers "here". Every tile is a door, so a number you doubt
  is one click from the list behind it. A network never called shows a dash,
  not a zero.
- **Re-read the permission, without restarting.** Enforcement uses the
  registry built at startup, so the run that added `vault:write` still refused
  every write — with a message that read like a bug. The refusal now carries a
  button that asks the host to re-read the manifest and retries. New ungated
  bridge action `permissions.refresh`: it grants nothing, it re-scans the
  manifests the user owns on disk and answers with a boolean, for the calling
  cartridge only.

### Fixed
- **Translation looked broken because the button did not exist.** It was
  rendered only when there was body text, so a link post whose article was
  refused (403, SPA, paywall) offered nothing at all. A post always has a
  title, and a title is translatable — the button is always there now, and a
  translated title has somewhere to be displayed.

## [0.4.5] — 2026-08-05

### Fixed
- **A screenshot post no longer reads as an empty post.** The most common
  shape on Reddit is an image with two lines of caption — and stripping the
  HTML kept `[link] [comments]` while the entire substance walked out with the
  href. The drafter then wrote a confident reply to a caption. The media urls
  are now recovered before the HTML is flattened, the Studio says **how many
  images nobody read** and opens them, and the prompt carries an explicit
  order never to describe, quote or assume what is in them — without that
  line a model fills the hole, fluently, and the author posts it under their
  own name.

### Known gap
- Reading those images (OCR / vision) is **not** built. The host's
  `ocr:extract` takes a file path, needs an installed engine and gates some of
  them behind a licence, so a url→bytes→temp-file→extract path is a host
  chantier of its own. Until then Pheme names the gap instead of hiding it.

## [0.4.4] — 2026-08-05

### Fixed
- **The drafter was answering threads it had never read.** Presence only
  reconstructs a few threads per run (the Reddit budget is tight), so a
  conversation opened from the inbox usually carried an EMPTY post body — and
  the prompt simply omitted the `BODY:` line. The model then wrote from the
  title, your own message and the comment alone, which produces something
  plausible and uninformed. `refreshThread` (which already runs before every
  draft) now brings the post back with it, and the Studio grounds on it. A
  link post with no text is described by what it points at rather than by
  nothing.
- **You can see what it read.** The Studio shows the exact post the draft was
  written against, and says so plainly when the post could not be read at all
  — the difference between an informed reply and a plausible one is not
  something to leave to assumption.
- **The unfolded thread stopped painting over the cards below it.** The card
  header carried a 100% height, which became circular the moment its row held
  a second child: the header grew to the whole row while the conversation
  overflowed outside it, on top of everything underneath.

## [0.4.3] — 2026-08-05

### Changed
- **A conversation unfolds where you clicked, and you follow it like a
  thread.** A radar pick and a *your history* row could be the SAME
  conversation, shown twice on one screen with nothing joining them: one said
  "✓ replied", the other said nothing, and neither could show you what came
  back. Clicking either now expands the whole exchange in place — the post,
  your own words, every answer beneath, each with **✍️ Answer** and the
  Studio right under it. The join was always there and never used: a radar
  item's follow-ref and a presence thread id are the same string.
- The thread card moved out of Pseudo into `components/ThreadCard.tsx` and is
  now shared. Writing a second one for the board would have been two
  renderings of one conversation, drifting apart by the week.

## [0.4.2] — 2026-08-05

### Changed
- **The network board stops sprawling.** On a maximised window every list row
  stretched edge to edge, so a label and its own button ended up a full screen
  apart, and the eye had to travel the width of the monitor to act. The lists
  are now a wrapping grid of cards where **the whole card is the door** — no
  distant button to aim at — and a wide pane caps at 1440px instead of
  growing forever.
- **The rows you could only look at are now doors.** *Your history* carried no
  action whatsoever: your own posts and comments were listed with no way to
  reach them. Each card now opens Pseudo, with a **↗** next to the title that
  goes straight to the thread in your browser.
- **Work already done is visible from the board.** A radar pick you have
  drafted for shows **✎ draft**, one you have answered shows **✓ replied**,
  and a dead thread shows **⌛**. The drafts and the voice you picked were
  always one click away — the board just never said which cards had them.

## [0.4.1] — 2026-08-05

### Fixed
- **A dead thread no longer looks like an opportunity.** HN 48875483 ("Vector
  Search Is Dead") sat in the picks at score 50: three weeks old, 2 points, 2
  comments — one of them written by the submitter, pointing at their own
  landing page. It scored well because the temperature bonus paid +10 for
  "2 comments = a live discussion" without ever asking how old the thread was,
  and because the freshness term floors at zero but never penalises. On a
  three-week-old post two comments means nobody read it. The bonus now
  requires the thread to still be alive, a thread past a week decays, and the
  card says **⌛ thread is over** — a low score alone reads as "weakly
  relevant", never as "you are three weeks late".
- **A link post that fails to open now says why.** "Could not extract the
  article" covered a refusal, an empty page and an unreachable host alike, and
  never named the URL — on exactly the runs where the URL was the diagnosis.
  The three cases are now distinct, the HTTP status is shown, and the source
  link is always there. (The case that surfaced it: `try.agentoid.io` answers
  **403** to anything that is not a browser.)

## [0.4.0] — 2026-08-05

Pheme starts writing — into your memory, never into a feed.

### Added
- **Mnemosyne remembers what you publish.** Until now Pheme read the world
  and kept none of it: everything lived in localStorage, invisible to the
  chat, to the RAG and to the dream layer. What you produce publicly now goes
  into your **SOCIAL vault** as real chronicles — so "what did I say about
  local RAG last month" is a question Mnemosyne can answer. Only your own
  work, never other people's threads, and never twice (each memory carries a
  stable `sourceRef`; the receipts live in `pheme:memory:written`).
- **You choose what is remembered** (Settings → *Ce dont Mnemosyne se
  souvient*). Four independent switches: your posts, your replies, the thread
  around them, your reputation diagnoses. Default: **posts only** — memory is
  permanent, and a default that writes more than the user expected cannot be
  undone by unticking a box later. Deleting stays human, in the Vault Manager.
- Requires the `vault:write` permission, which this cartridge had dropped in
  0.3.0 for being unused. It is used now, for exactly one thing.

### Changed
- **The cockpit is a cockpit again.** The two Reddit-shaped tile streams (your
  history, your sub) are gone from the home: every one of those rows now
  exists on the network's own board and in Pseudo — scoped, and with a reply
  button — so the home was a third copy you had to scroll past. In their place,
  one card per live network (arrivals, radar picks, your posts, participations,
  real cost) and a memory strip. Dead CSS removed with them.

## [0.3.1] — 2026-08-05

Answering back.

### Added
- **Answer a reply, with the Studio, where the reply landed.** The inbox
  could tell you someone had answered, and then offered exactly one thing:
  a link to your browser. Drafting only ever existed on the radar, on a
  thread the scan had found — never on a person who had answered *you*, which
  is the reply that matters most. Every arrival in 📬 and every reply under a
  thread card now carries **✍️ Answer**, and the Studio opens right there.
  It is aimed differently than the radar's: the model is given THEIR comment
  and the message of yours they were answering, told to engage them by name
  and match their language, and the thread's other comments are withheld so
  it cannot drift into answering someone else. Drafts are keyed per reply, so
  answering a second person in the same thread never overwrites the first.
- **The network Overview leads with arrivals.** 📬 sat in the Cockpit and in
  Pseudo, but not on the board you land on when you click Reddit — so a reply
  could be waiting while the screen in front of you showed radar picks. It is
  now the first section of every reputation board, above everything else.

## [0.3.0] — 2026-08-05

The first complete brick.

### Added
- **Mini mode** — squeezed beside another window, twelve network tabs wrapped
  onto three rows and ate the view. Below 620px the row becomes one picker
  carrying the same map (current scope, unread counts, the locked ones still
  visible), and the chrome gives up its margins — measured on the PANE, not
  the screen, because the same window can hold Pheme wide on one monitor and
  narrow beside an app on the next.
- **Your profile outlives the origin** (host doc 73). Pheme mirrors what
  cannot be recomputed — profile, ledger, recorded voices, diagnosis
  timeline, pins, seen marks — into the host. If a window ever opens on a
  fresh store (a dev port, a packaged copy, a launcher passing an incomplete
  manifest), it restores instead of showing onboarding, and says so.
- **The host watches while Pheme is closed** (host doc 72). A cartridge is
  an iframe: it dies with its window, so it could never notice a reply that
  landed meanwhile. Pheme now hands the host a declarative watch — its user
  feed, its own sub, its HN comments — and reads what arrived on the next
  open ("N new items spotted while Pheme was closed"). Requires the new
  `watch:background` permission; the app works untouched without it, and
  nothing is watched while Mnemosyne OS itself is closed.
- **An inbox — the answer to "did someone reply?"** Pheme tracked replies
  from the start, but a reply was a line, inside a thread card, inside a
  zone: you had to hunt for it. Fresh replies are now flattened to the top
  of Pseudo and onto the cockpit — author, snippet, where it landed, the
  "replies to you" badge first — and clear per network when marked seen.
  Auto-recheck now defaults to 30 minutes for new profiles, and says so
  plainly when it is off: an app that only looks when asked cannot tell you
  someone replied.
- **The cartridge has tests.** 24 of them, over the pure logic: every case
  is a bug that actually shipped and was found by reading the code, not by
  using the app. The suite earned its keep on the first run — it caught the
  archetype heading leaking into the draft body (drafts opened with a bare
  "ENFP" line, the coach note read "COACH Ce fil est…") because the heading
  pattern matched newlines. `pnpm test` in `apps/pheme`.

### Fixed (second pass — the remaining list, closed)
- **"Mark all as seen" is per network.** One global high-water mark meant
  clearing Reddit also cleared the Hacker News badge, destroying an unread
  state over replies that screen never showed. Legacy marks are read as
  applying to both, so nothing resurfaces.
- **The voice table is all-time again.** Recorded choices live in their own
  log instead of riding on the rolling 40-draft cache, so the Coach's
  voices no longer contradict the ledger counted beside them. And reading a
  draft set no longer WRITES: merely opening an old post could evict
  another post's drafts.
- **The timeline keeps its first analysis** — trimming the oldest deleted
  the very reference point it exists to compare against.
- **"Spent today" follows the local calendar day**, not UTC — it used to
  reset mid-session for anyone west of Greenwich.
- **A scan started from a board only scans that network**, and reports only
  its own failures; the followed-thread loop is budgeted and rotating (a
  hundred follows meant up to two hundred sequential Reddit calls per
  refresh, every N minutes with the timer on).
- **Radar filters survive a trip into a post** — they lived in a component
  that unmounts.
- **The lost-list backup is reachable.** It was written faithfully and
  restorable by nothing; Settings now offers to merge it back.
- Seven dead locale strings removed; version bumped so the hub can accept a
  republish.

### Fixed (adversarial audit of the whole cartridge)
- **A throttle is no longer mistaken for a wall.** A 429 during the `.json`
  probe used to be filed as "endpoint blocked" — blinding the "replies to
  you" badge for hours — while the throttle itself went unrecorded. 429
  always arms the cooldown now; only a 403 while probing means walled.
- **Replies past the 4th thread were never discovered — ever.** The
  reconstruction budget always spent itself on the same newest threads. The
  two freshest are still rebuilt every run; the rest now rotate through a
  persisted cursor, and attempts (not successes) spend the budget, so a
  failing run can no longer walk the whole feed at 5s a call.
- **Pins, follows and dismissals survived only until reload.** All three
  append to the end of their list but persisted `slice(0, N)` — the entry
  just added was the one dropped. They cap in the updater now, keeping the
  newest.
- **A participation could be logged twice.** Regenerating drafts re-enabled
  "I replied" on an already-answered thread, inflating the 9:1 gauge and
  every readiness verdict; it also erased the recorded voice. The ledger
  now refuses a duplicate at the source, and `chosen` rides through a
  regeneration.
- **The presence timer polled a stale identity.** Renaming a pseudonym left
  it refreshing the old account forever, newly followed threads were never
  auto-updated, and a tick during a manual refresh started a second
  concurrent run — the very thing that trips the throttle.
- **Fabricated values, hunted down:** HN karma read `0` for an unknown user
  (`Number(null)`), and that zero fed the paid diagnosis as a measured
  fact; a followed HN thread carried "now" as its date, adding a permanent
  phantom to the unread badge and double-counting every real reply; the HN
  reply count kept a listing number while showing "no replies yet".
- **A topic with a quote or a "1." prefix matched nothing, forever** — an
  empty radar with no explanation. List items are now cleaned the same way
  whether they come from a model or from your keyboard.
- **Failures stopped posing as verdicts:** a failed angles call said "no
  angles found", an unreachable thread said "this thread is dead", the
  Mnemosyne pass and draft translation failed in silence, and the sub
  finder blamed your memory for a Reddit cooldown.
- **The Mnemosyne pass now ranks what the board shows** (it billed for
  cross-network threads), merges instead of erasing the other board's
  tiers, and counts only what is actually on screen.
- **Scoped boards stopped leaking:** the HN presence tab no longer lists
  `r/…` failures, sub warnings or the Reddit throttle, and a "3 hidden"
  button no longer promises Reddit posts on the HN grid.
- The diagnosis Stop button no longer sticks until the TTS timeout, and a
  silent voice engine says so. The recall step's substance is no longer
  clipped to a quarter of what it paid for.

### Added
- **A sense of humour, dialled** — drafts and stories take a wit setting
  (sober · a dry aside · funny), persisted in the profile: what these
  communities upvote is dry, specific and self-aware, and what they punish
  is a forced joke. Substance still carries the reply; no emoji, no memes.
- **Finding subs stops being a chore** — one button now chains three
  steps: the model proposes candidates (your memory rides along, and it
  costs ZERO Reddit budget — the old per-topic search endpoint is gated,
  which is why it kept returning nothing), your own history contributes
  the subs you already post in (★), and ONE multireddit request proves
  which candidates exist AND are alive. Unverified names never reach the
  profile; "Add all" takes the lot.
- **Your upvotes show up** — every thread of yours carries the score of
  YOUR post/comment (▲ n, green) in Pseudo and on the cockpit tiles, read
  from the Reddit JSON tree and HN points. Shown only when the source
  actually provides it — a blocked .json means no number, never a fake 0.
- **The pass stops eating its own tiers** — models answer "medium" or
  "maybe" where the parser demanded "mid", and those entries were dropped
  silently (an empty Maybe filter born from vocabulary, not judgment):
  tiers now normalize. The prompt calibrates the distribution (high rare,
  mid ≈ a quarter, rest low), the toolbar shows how many threads are
  actually ranked ("30/164 ranked"), and a stale pass — older than the
  last scan — says so instead of letting filters hide the new threads.
- **What you marked never washes away** — a ★ pin on every radar tile
  keeps a thread through EVERY rescan until unpinned; and anything already
  carrying your intent (saved drafts ✎, followed threads) is retained
  automatically even when a fresh listing rotated it out of the window.
  The merge only drops what never mattered to you.
- **The whole roster in ONE request** — the Reddit scan now uses a
  multireddit fetch (`r/a+b+c/new.rss?limit=100`, chunked at 15): ten subs
  cost one call instead of ten, which is what actually survives a stingy
  per-IP budget. Each entry carries its own sub as target; an answered
  chunk covers every sub in it (no fresh post ≠ missing); banned/private
  subs are silently omitted by Reddit without sinking the chunk.
- **The scan rotates** — Reddit's per-IP budget rarely covers ten subs in
  one pass; each scan now STARTS where the throttle stopped the last one,
  so every sub gets its turn across passes while merge keeps what earlier
  passes brought. The toolbar says it plainly: "3/10 subs this pass". And
  each reputation board lists exactly WHAT it watches, with the door to
  the suggestion pass in Settings.
- **Replied is a fact, not a session mood** — drafts are keyed by the
  STABLE thread id (radar ids can drift between scans — how a revisit
  "lost" its drafts; legacy entries migrate on first load), the detail
  view and studio boot from the ledger ("✓ replied" survives every
  return), and the cockpit's best NEXT action skips threads already
  answered — a victory is not a suggestion.
- **The loop closes (blueprint phase 3)** — the Coach's voice table gains a
  REPLIES column (drafts join their presence threads by ref; untracked =
  unknown, shown as —, never 0); every thread grows a "Make it a story"
  door that seeds the X studio with title, link and excerpt; and each
  network board shows its attributable model costs (calls tagged at the
  source: drafts, angles, recall, translate, stories, illustrations).
- **The .json wall no longer poisons Reddit** (social-engine lesson
  re-learned) — Reddit blocks public .json for many clients while .rss
  stays open; the thread rebuild now PROBES .json once (24h memory) and
  falls back to the Atom feed. An endpoint refusal is a verdict, not an IP
  throttle: it never trips the app-wide cooldown that was starving every
  Reddit feed for 10 minutes at a time. On the Atom path "replies to you"
  stays unknown rather than guessed.
- **Brand icons, self-contained** — every network wears its mark as inline
  SVG (badge style: brand color + white glyph, hand-simplified for 13-20px),
  zero external assets. One NetIcon component feeds the tabs, the boards,
  the studio picker, the Settings rosters and the locked page. The tab row
  itself stays quiet: icons + names, locked networks folded behind one door,
  Settings as a gear.
- **v2 navigation — the network IS the tab** — primary tabs are Cockpit ·
  one tab per network (with per-network unread badges) · Settings; clicking
  a network opens ITS functions as sub-tabs: reputation → Overview / Radar /
  Pseudo (scoped, no redundant pickers), promotion → Overview / Studio
  (network fixed), licensed → the honest lock. Cockpit keeps the global
  views (dashboard, coach).
- **v2 skeleton — cockpit and boards** (see `V2_BLUEPRINT.md`) — the
  dashboard becomes the Cockpit; a NetworkBar generated from THE registry
  opens one board per network: reputation boards show that network's radar
  picks, presence and readiness; promotion boards show its stories; the
  licensed tier (YouTube, Instagram, TikTok, Facebook, Product Hunt) shows
  an honest lock, never a fake feature. Boards render the same selectors
  as the tabs, scoped — nothing is recomputed, nothing is duplicated.
- **Every network, classified** — ONE registry of 18 networks split by
  doctrine: reputation-first (Reddit, HN live; Lobsters, Stack Overflow,
  DEV, Indie Hackers, Discord, Quora named) where promotion is earned, and
  promotion surfaces (X, LinkedIn, Bluesky, Mastodon, Threads composable
  now; Instagram, TikTok, YouTube, Facebook, Product Hunt waiting on image
  machinery). Five live composers with per-network voice and limits, a
  network picker at story creation, "copy the whole series" for the
  paste-fast workflow, and a per-post PREVIEW card — how it reads before
  it ships.
- **The Publish studio — reputation grows a voice** — a Publier tab for
  the promotion surfaces: multi-post stories (promo or récit) composed
  from the user's memory with per-network character limits (X live,
  LinkedIn named next), SVG illustrations generated as text and sanitized
  before touching the DOM (PNG export for upload), per-post copy and
  "mark posted". Composer-only by design: no code path publishes — the
  human posts. A promo marked posted writes the 9:1 ledger the Coach
  reads: the doctrine now crosses networks.
- **A throttled scan never empties the radar** — same doctrine as presence:
  only targets that ANSWERED this run replace their items; every sub or
  query the throttle (or an outage) kept out carries its previous items
  forward. Reddit can no longer vanish from the grid mid-cooldown.
- **The Mnemosyne pass on the radar** — one user-triggered inference ranks
  every scanned thread by how much first-hand substance YOU could bring
  (memory rides along). Relevant tiles turn green with the reason on them,
  weak ones fade, and tier filters (Relevant / Maybe / Weak) cut the grid.
  Persisted — a reload never re-bills it; counted as its own cost task.
- **Talk WITH Mnemosyne** — a left drawer (Φ handle on the edge) to converse
  from any tab. She answers through the host pipeline (your memory rides
  along) plus a live state brief — goal, ledger 9:1, radar, presence,
  latest diagnosis — under a chosen skill lens: Coach, Researcher, Critic.
  Thread persisted, costs counted (chat task), never opens itself.
- **The diagnosis becomes a panel** — structured verdicts as tiles (✓/✗ per
  platform), the plan in numbers, the rules as a list, and a TIMELINE of
  every analysis since the first scan (pre-timeline diagnoses migrate as
  point one). Shown in onboarding and the Coach.
- **Your footprint on the dashboard** — a standing box with your latest
  posts/comments and your own sub's feed, read from the cached presence
  report (the dashboard still never fetches); every row is a door to Pseudo.
- **The voice behaves** — follows the engine/voice/speed configured in the
  OS (reader.voiceConfig) instead of hardcoded Piper, never reads markdown
  decoration, speaks long texts whole (sentence chunks), and STOPS on
  demand — including the system-voice path.
- **A real countdown** — the throttle banner ticks live (m:ss) on Presence
  and Radar, and flips to a green "throttle over — refresh" the second the
  wall comes down.
- **The throttle tells the truth** — the cooldown banner shows whenever the
  app-wide Reddit cooldown is live (the radar trips it too), and an
  unfetched sub says "not fetched — throttle in the way", never "no posts"
  about a feed nobody read.
- **Presence is about YOU now** — zones instead of community groups: your
  full history (every listing entry kept — 25, not 4 — reconstruction is a
  bonus, never the price of appearing), your subreddit as a standing
  section even when empty, followed threads, elsewhere. Shallow rows say
  "replies not fetched", never a fake "no replies yet".
- **The choice is recorded** — Copy works even where the iframe denies the
  clipboard API (selection fallback), says so when it truly fails, and the
  copied voice is marked ✓ chosen, persisted per post.
- **Replies TO you are identified** — Reddit threads rebuilt from the JSON
  tree (parent links) instead of the flat RSS; HN via parent ids. A reply
  addressed to you wears its badge in Presence.
- **Your sub can no longer starve** — presence fetches listings before
  thread reconstructions, so a mid-run Reddit throttle keeps the user feed
  and the sub; and when the sub answers with zero PUBLIC posts, Pheme says
  so (likely Reddit filtering — not a Pheme failure).
- **Operating costs in the tiles** — every model call tallied per task; spend
  and cloud balance live in the top KPI tiles (balance fetched only on click);
  the spend tracker filters by week / month / quarter / half-year / year over
  a rolling year of local history. Local engines cost 0 — that is the point.
- **Presence (« Pseudo »)** — threads reconstructed (full post, your side,
  replies nested), grouped by community, unseen badges on a persisted
  high-water mark, HN karma, auto-recheck timer (15m/30m/1h/3h, pausable),
  cached across reloads with merge-on-refresh (a throttled run never erases
  what a good run brought).
- **Follow any thread** from the radar's detail view — it joins Presence like
  your own posts.
- **In-app post view** — full width, options in a sticky sidebar; link posts
  fetch and extract their article; one shared HTML→text pass everywhere.
- **Translation** — per-post, into the UI language, side-by-side bilingual
  view, persisted per post+language (paid once).
- **Studio steps** — reply angles, verify-and-update (thread re-checked, fresh
  comments become context), four transparent per-draft checks, character
  counts, regenerate.
- **Radar UX** — tile grid, network badges (Y/R), network filters, persistent
  scans, hide with ×, replied threads dimmed from the ledger.
- **Onboarding interview** — goal (launch/authority/watch), public-profile
  analysis (Reddit feed, HN karma+counts), Mnemosyne's frank diagnosis
  (RAG-grounded), spoken through the local voice (reader.ttsSpeak).
- **Coach** — weekly activity bars; the diagnosis follows you there.
- **Skins** — Host (live OS tokens), Writer (paper & ink), Noir; Settings with
  language picker built for every future locale.
- **Reddit gate** — ONE app-wide politeness gate: 5s spacing, 429 trips a
  persisted 10-minute cooldown, countdown shown; throttle is never reported
  as "thread dead" or "unreachable".

### Changed
- **Centralized, not bespoke** — ONE set of profile fields (ProfileFields)
  writing the profile directly, rendered permanently in Settings (goal,
  topics, subs with the suggestion pass, pseudonyms, own sub, voices) and
  reused by the interview; the Presence config duplicate is gone. Derived
  state lives in `lib/selectors.ts` (one 9:1 formula, one presence cut) —
  Dashboard, Coach, Presence and the drawer read the same numbers. Kills
  the whole class of "draft state overwrote my subs on save" bugs.
- Full refactor: `App.tsx` (state and wiring only, ~200 lines) + 7 surface
  components + `styles.ts`; version read from the manifest everywhere.

### The hard rule
Pheme never posts. Structurally — no code path publishes anywhere.

## [0.1.0] — 2026-08-03

Birth. Radar (Reddit `/new` Atom + HN Algolia, transparent scoring), Studio
(2-3 drafts in archetype voices, grounded in the user's memory through the
host RAG), Coach (participation ledger, 9:1 gauge, readiness floor), EN/FR.
