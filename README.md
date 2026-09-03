<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com) — for organizations&ensp;·&ensp;📖 [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# Pheme

> Φήμη — the goddess of renown. She rewards remarkable deeds with fame, and
> punishes cheaters with rumor. This cartridge keeps you on her good side.

**Pheme is a communication cockpit for people who build in public.**
Communities (rightly) delete launch posts from accounts with no history. The
only fix is genuine participation, built over weeks. Pheme makes that
affordable — and it never crosses the line.

It is a **cartridge for [Mnemosyne OS](https://mnemosyne-os.io)**: it runs in
an iframe, talks to the host over `postMessage`, and every draft it writes is
grounded in *your own memory* rather than in a model's imagination.

> [!IMPORTANT]
> **Pheme is a cartridge, so it runs inside Mnemosyne OS.** Install the host
> app first, then add this repository from MnemoHub.
>
> [![Download latest release](https://img.shields.io/badge/⬇%20Download-Mnemosyne%20OS%20latest-0ea5e9?style=for-the-badge)](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest) &nbsp; [![Mnemosyne OS repository](https://img.shields.io/badge/GitHub-Mnemosyne%20OS-181717?style=for-the-badge&logo=github)](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)

---

## Installing it

You need the host first ([latest release](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest)).
Then, in the app:

1. Open **MnemoHub**.
2. **Add an external cartridge**, then **A repository**.
3. Paste `https://github.com/Mnemosyne-OS/Pheme` and press **Read it**.
4. Mnemosyne downloads the manifest and shows you the name, the version and the
   permissions *before* installing anything. Confirm with **Install**.

Two things worth knowing before you do that:

- **It spends your free external-cartridge slot.** Mnemosyne allows one
  cartridge from outside the store without a license, and a second one needs an
  active Engramm. A repo install and a local folder link draw on the same slot.
- **Updates come from this repo.** The manifest declares `updateStrategy: git`,
  so the app checks this URL rather than a catalog. Nothing is fetched on its
  own between those checks.

Pheme is at **0.9.8**, which is to say it has not reached 1.0 and says so. It
carries 263 tests and has been developed on Windows. It has not been exercised
on macOS or Linux, and no one outside its author has run it yet. If it breaks
on your setup, that is the interesting case: open an issue.

---

## The hard rule

**Pheme never posts. Structurally.**

There is no code path that publishes anywhere. The bridge can fetch, recall
and infer; posting is a thing only the human does, in their own browser, with
their own account. Anything else is astroturfing, and Pheme exists to build
the opposite.

The second rule, applied everywhere: **absent is not zero**. A score the
source never sent is omitted, never written `0`. A network that was never
called shows `—`. A request that was refused says it was refused — it never
reports "nothing found".

---

## What it does

### Reputation surfaces — Reddit, Hacker News

- **Radar** — scans the subreddits and search queries *you* chose and scores
  each thread on one question: *can you add real value here, soon?* The
  heuristic is transparent and visible: matched topics show as chips,
  freshness and conversation temperature weigh in, and a thread that is over
  is tagged **⌛** and decayed rather than hidden.
- **Studio** — drafting, in four steps: reply angles (optional) → a memory
  recall pass → your own ideas woven in → 2–3 drafts in distinct cognitive
  voices. Before drafting it re-reads the thread, and it **shows you the post
  it read**; if a post carries images nobody read, it says so and is forbidden
  to guess what is in them.
- **Pseudo** — your pseudonym followed as *conversations*: your posts, who
  replied to them, what landed in your own subreddit. Replies arrive in an
  inbox, and **you answer from there** — the Studio opens under the words it
  is answering, with the other person's comment and your earlier message as
  its ground.
- **Coach** — the participation ledger: genuine replies vs. promo (logged by
  you), the 9:1 gauge, per-community readiness, and which of your voices you
  actually post.

### Promotion surfaces — X, LinkedIn, Bluesky, Mastodon, Threads, Medium

- **Publish studio** — multi-post stories composed from your memory, with each
  network's own register (Medium gets an essay, X gets a thread).
- **Branded visuals** — the model writes the *words*; the picture is the
  Mnemosyne OS lockup rendered at the size each surface actually publishes.
  Nothing is drawn by a language model.

### Across everything

- **Per-network profile** — each surface owns its handle, the places it
  watches, and your bio there. The first visit to a network asks for it.
- **Memory** — what you publish is written into your `SOCIAL` vault as real
  chronicles, so Mnemosyne can recall it later. You choose what counts
  (Settings → *What Mnemosyne remembers*); posts only, by default.
- **Background watch** — the host keeps looking while the cartridge window is
  closed, and tells you what arrived.
- **Three skins** (Host follows the OS tokens live, Writer is paper-and-ink,
  Noir is deep dark), EN/FR, and a dock that puts every network one icon away.

---

## Development

```bash
pnpm --filter @mnemosyne-plugins/pheme run dev:cartridge   # port 5206
pnpm --filter @mnemosyne-plugins/pheme run build
pnpm --filter @mnemosyne-plugins/pheme run test            # 76 tests
pnpm --filter @mnemosyne-plugins/pheme run lint
```

### Architecture

`App.tsx` owns **state and wiring only**. Every surface lives in
`components/`, every behaviour in `lib/`. The rule is structural: no code path
posts anywhere.

| Layer | What lives there |
|---|---|
| `lib/scan.ts` · `presence.ts` | Fetching and reconstructing what is public |
| `lib/score.ts` · `selectors.ts` | Derived state — defined once, never recomputed per surface |
| `lib/drafts.ts` · `poster.ts` | What the model is asked, and what it is forbidden to invent |
| `lib/store.ts` · `mirror.ts` | Local persistence, and surviving an origin change |
| `lib/memory.ts` | What is written back into the user's vault |

Host actions used: `social.fetch` (host-side HTTP — every scan and presence
run), `model.infer` (the one inference door; RAG on by default),
`social.ingest` (memory), `watch.*` (background), `state.*` (host mirror),
`permissions.refresh`, `shell.openExternal`.

### Constraints baked into the code

- Reddit's `.json` endpoints are 403-walled for many clients — Atom `.rss`
  everywhere, one **multireddit** request per pass, an app-wide gate with 5 s
  spacing and a persisted 10-minute cooldown on 429.
- Presence reconstructs a few threads per run with a rotation cursor: a
  partial pass says it was partial rather than claiming the rest is empty.
- A throttle belongs to the **host** that issued it, never to the whole pass.

---

## Tests

263 tests, and every one of them is a bug that actually shipped: a parser that
emptied a filter tier on a synonym, a cap that dropped the entry just added, a
count that turned an unknown into a zero, a migration that could have lost ten
subreddits. They are pinned so the next change has to break a test before it
can break the product.

---

## Which Pheme is this?

The name is crowded. This is not [PolyAI-LDN/pheme](https://github.com/PolyAI-LDN/pheme),
the speech synthesis model, nor the PHEME rumour-detection dataset used in NLP
research, nor anything to do with Phemex, the cryptocurrency exchange.

This Pheme is a cartridge for **Mnemosyne OS**, a local-first memory operating
system: [mnemosyne-os.io](https://mnemosyne-os.io) ·
[mnemosyne-os.com](https://mnemosyne-os.com) ·
[docs.mnemosyne-os.io](https://docs.mnemosyne-os.io). It is named for the Greek
goddess of renown, who spread the reputation people earned, which is the only
kind this cartridge will help you build.

## License

MIT — see [LICENSE](LICENSE). © 2026 Tony Trochet — Mnemosyne OS.

---

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
