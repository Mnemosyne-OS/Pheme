# Pheme v2 — Blueprint

> The communication wing of Mnemosyne OS. One cockpit, one board per
> network, one engine behind them all. This document is the contract for
> v2 work — read it before adding ANY surface.

## What Pheme is

Four verbs, one product:

| Verb | Surfaces |
|------|----------|
| **Listen** | Radar (threads worth a genuine reply), Presence (your pseudonym, followed as threads) |
| **Understand** | Diagnosis (public-footprint analysis, timeline), Coach (9:1 ledger, readiness floors) |
| **Speak** | Publish studio (multi-post stories per network, SVG illustrations, composer-first) |
| **Converse** | Mnemosyne drawer (live state brief + coach / researcher / critic skills) |

The doctrine that shapes everything: **reputation networks** (Reddit, HN,
…) are communities where promotion must be EARNED — Pheme listens there
and never posts. **Promotion surfaces** (X, LinkedIn, …) are the user's
own channels — the studio composes, the human posts. The 9:1 ledger
crosses both families.

## v2 information architecture

```
Header: Φ Pheme
NetworkBar: [Cockpit] [Reddit] [HN] [X] [LinkedIn] [Bluesky] [Mastodon] [Threads] [🔒 YouTube] [🔒 Instagram] …
Tabs (the system): Radar · Publier · Coach · Pseudo · Réglages
```

- **Cockpit** — the global dashboard (today's Dashboard): costs, 9:1,
  KPIs, next actions, your footprint. Scope = all networks.
- **Network board** — ONE component (`NetworkBoard`), shaped by the
  network's `role` from the registry:
  - `reputation` → its radar picks, its presence threads, its readiness,
    doors into the full tabs;
  - `promotion` → its stories (drafts / posted), a door into the studio;
  - locked tier → an honest lock screen, never a fake feature.
- The boards NEVER reimplement logic. They render **the same components
  and selectors, scoped by network**. Scope is a parameter, not a copy.

## Hard invariants (learned the hard way — see memory)

1. **One registry** (`lib/networks.ts`) — role, status, tier, limits.
   Every menu, picker, gate and prompt reads it. Never a second list.
2. **One place per datum** — profile fields in `ProfileFields` (Settings +
   interview), derived state in `lib/selectors.ts`. A new surface consumes
   selectors; it never recomputes.
3. **Absent ≠ zero** — an unfetched feed says "not fetched", never "empty".
4. **No publish path in code** for reputation networks — structurally.
   Promotion surfaces are composer-first; API hookups (X OAuth…) are a
   host-level chantier (actions + `social:post` permission), phase 4.

## Business model (decided 2026-08-04)

- **Free tier**: everything live today — Reddit, HN, X, LinkedIn, Bluesky,
  Mastodon, Threads. Pheme free during beta: it is the killer app that
  opens the OS daily and burns credits (markup is the existing revenue).
- **Licensed tier**: visual/video networks (YouTube, Instagram, TikTok,
  Facebook, Product Hunt) — `tier: 'licensed'` in the registry, gated via
  the OS license (`useLicensed()` pattern), honest lock screens until real.
- **Post-beta**: Pheme becomes a PAID cartridge (one-time, founder price
  ~24 €) — free = listening, paid = the voice. Requires the in-app
  cartridge purchase rail in MnemoHub (serves every future cartridge;
  Pheme is the proof of the cartridge economy).
- **Later**: per-network in-app unlocks through the wallet.

## Phases

1. ✅ v1 loop: scan → draft → post (human) → replies → coach.
2. **v2 skeleton**: registry `tier`, NetworkBar, NetworkBoard (both roles
   + locked), Cockpit label. ← current
3. Boards deepen: per-network readiness, per-network costs split,
   cross-links (thread → story seed).
4. Rails: in-app purchase (hub chantier), X API OAuth (host chantier),
   YouTube/Instagram machinery (needs image/video gen — doc 68).
5. YouTube as BOTH families: comments-of-followed-videos (reputation) and
   own-channel publishing (promotion).
