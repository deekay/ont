# B5 — surfaces: the user/operator front doors over the audited stack

> **Status: DESIGN-FIRST (plan only). Writer: ClaudeleLunatique. Reviewer: ChatLunatique.** Opens after
> B4 complete (all five adapters green; `clean-build-b4` @ `6a32a03`, awaiting DK merge/push). Per the B0
> phase-sequencing rule, **B5 _implementation_ may not begin until B4 is merged to `main`** — but reviewed
> design plans / interface tests / spikes for the next phase are allowed earlier and merge as notes, never as
> implementation (SOFTWARE_CANON "Phase sequencing"). This document is that allowed design-first note.
>
> **Branch:** `clean-build-b5` will stack on `main` once B4 merges (else on `clean-build-b4`). **No
> implementation lands until B4 is merged.**
>
> **CL design-concur @ `543f6807`** (all 5 open calls, with refinements folded in §7): (2) claim-site signing
> boundary must be explicit — a named mock-wallet fixture, never a hidden signer; (3) the walkthrough harness is
> **hermetic synthetic-block FIRST** (reuse the B4 synthetic block/header machinery + fixture DA/resolver
> stores), regtest/live smoke optional once a target exists; (4) a **low-cost scripted boundary lint ships in
> the FIRST B5 slice** (B5-CLAIM), not later. **B5-CLAIM design-first is open** (this doc §7); B5 implementation
> still held for the DK merge gate.

## 1. The gap

B1–B4 built the rules (`@ont/wire` / `@ont/protocol` / `@ont/bitcoin` / `@ont/consensus` audited kernel /
`@ont/evidence` witnesses / `@ont/claim-path` B3 orchestrator) and the real adapters that feed them from the
network (`@ont/adapter-{header,indexer,da,publisher,resolver}`). **Nothing user-facing consumes them yet.**
B5 = the **surfaces** (L5, `apps/*`): the web/explorer, wallet, CLI, and claim site — the front doors a human
or operator actually touches.

The L5 boundary is ratified (SOFTWARE_CANON L5): **surfaces consume L1–L4 APIs and NEVER reimplement a rule.**
A surface assembles a tx via `@ont/adapter-publisher`, reads chain-derived state via `@ont/adapter-resolver` /
`@ont/adapter-indexer`, verifies via the audited predicates / proof bundles — it decides nothing itself. A
surface that inlines a predicate (re-derives ownership, re-checks a signature to gate a decision, hard-codes a
window) is a B5 bug.

## 2. The bar (how a surface is "done")

Surfaces are not firewall-minting and mostly not pure-deciding, so the B4 hostile-input red→green bar does not
transfer wholesale. The B5 bar, per SOFTWARE_CANON (Item 6 nothing-is-precious; clean-build #46):

1. **Written purpose/scope/tests statement** per surface (every new component needs one).
2. **Consume-don't-reimplement** — all rules via `@ont/*`; a review/lint that the surface inlines no predicate,
   window, or digest. The audited stack is the single source of truth.
3. **Pure cores get red→green** — any deterministic logic a surface *does* own (request/response shaping,
   display projection, gap-scan union, key handling, copy rendering) is tested-first like an adapter slice.
4. **Operate/demo walkthroughs** are the cross-cutting gate — scripted end-to-end runs that drive the surface
   against the REAL adapters (assemble → [sign] → the read firewall accepts; resolve → render). The gate is
   "the walkthrough passes on the new stack," **NOT behavioral parity** with the quarantined old surfaces.
5. **Copy obeys the GLOSSARY** (doc-canon #45 one-concept-one-name) and the **not-authority discipline**: a
   surface must never present resolver/indexer convenience data as ownership authority — the
   `authority:"not-ownership-authority"` / `provenance:"resolver-indexed-mirror"` stamps from the B4 read
   firewalls carry through to the UI copy.

Old `apps/*` are quarantined — mined for documenting tests / walkthroughs only, never for behavioral parity.

## 3. Surface inventory (SOFTWARE_INVENTORY L5; all "rewrite (B5)")

| Surface | old size | role | clean-build consumes |
|---|---|---|---|
| **claim site** (`apps/claim`) | ~1.0k | self-contained "claim with any wallet" front door; serves one page + browser client, proxies the spend-triggering claim endpoint server-side (rate-limited), optional resolver owner→names gap-scan (liveness, not authority) | `@ont/adapter-publisher` (assemble), `@ont/adapter-resolver` (read), `@ont/adapter-{indexer,header,da}` (confirm) |
| **CLI** (`apps/cli`) | ~6.5k | operator/prototype CLI | the adapters + `@ont/claim-path`; **classify-first** (demo residue suspected — inventory flagged) |
| **wallet** (`apps/wallet`) | ~4.7k | wallet CLI; the B5 home for **W17 wallet-handoff** (transfer / auction-bid envelopes, PSBT signing) | `@ont/protocol` (sign/verify), `@ont/adapter-publisher` (assemble), `@ont/wire` |
| **web/explorer** (`apps/web`) | ~17.0k | largest; marketing/docs site + explorer + tools | the read adapters + proof-bundle verification; static explainer already retained |
| mobile | — | **separate effort after B5** (ruled call) — a named consumer of `@ont/*`, NOT in the B5 gate | — |

## 4. Proposed slice order

1. **B5-CLAIM (claim site) FIRST** — smallest (~1k), self-contained, and exercises the **full read+write stack
   end-to-end**: assemble a claim/anchor tx (`@ont/adapter-publisher`) → broadcast → the B4-INDEX read firewall
   confirms → resolve name state (`@ont/adapter-resolver`). It is the cleanest first walkthrough and shakes out
   the surface-over-adapter API ergonomics before the bigger surfaces. (Note: the old claim site's faucet is
   signet-only and signet is decommissioned — the clean-build claim walkthrough runs against whatever target
   exists; no faucet dependency in the gate.)
2. **B5-CLI** — classify-first (drop demo residue), then the operator commands over the adapters.
3. **B5-WALLET** — the W17 wallet-handoff home (transfer/auction-bid envelopes + PSBT signing); the only place
   that owns signing (B4 assemblers are deliberately unsigned).
4. **B5-WEB/EXPLORER** — last (largest); read-only explorer + tools + static site.

Each surface: purpose/scope/tests note → pure-core red→green (where any exists) → walkthrough → CL review.

## 5. B5 design-concur — open calls (my leans)

1. **Tests-first shape for surfaces.** Pure cores get red→green; the cross-cutting gate is operate/demo
   walkthroughs against real adapters; plus a consume-don't-reimplement review. **Lean: this.** (Surfaces are
   not firewall-minting, so no hostile-input-no-false-accept bar — they decide nothing.)
2. **Slice order = claim site first.** Smallest, self-contained, full read+write loop. **Lean: this.**
3. **Walkthrough harness.** What drives the end-to-end walkthrough with signet decommissioned? Options: (a) a
   local regtest/synthetic-block harness (reuse the B4 synthetic-block round-trip machinery); (b) defer live
   walkthroughs until a target exists and gate on the synthetic harness + pure-core tests. **Lean: (a)** —
   a deterministic local harness keeps B5 unit-gateable without a live network. Confirm.
4. **No-rule-reimplementation enforcement.** A lint/review rule (e.g. surfaces may import `@ont/*` but must not
   re-derive a predicate/window/digest inline). **Lean: a documented review check now; consider a scripted
   import-boundary lint later.** Confirm depth.
5. **Signing lives only in B5-WALLET.** B4 assemblers are unsigned by design (write→read round-trip); the W17
   wallet-handoff (PSBT / envelopes) is B5-WALLET's job, and other surfaces hand off to it rather than signing
   inline. **Lean: this.** Confirm.

On concur (esp. #1 the surface bar + #2 claim-site-first + #3 the harness) I open **B5-CLAIM design-first**
(the claim-site purpose/scope + its first walkthrough + any pure core). **No B5 implementation until B4 is
merged to `main` (DK gate).**

## 6. Parked / carried forward

- **W17 wallet-handoff** envelopes (transfer / auction-bid) land in B5-WALLET (reserved at B1).
- **Not-authority discipline** — the resolver read firewalls' `not-ownership-authority` stamps must surface in
  UI copy (apps/claim requalification precedent, da-trust-model firewall doctrine).
- DK-parked items unaffected by B5: B4-PUB-REFUND loss-accounting encoding; DA provisional served-transport
  format; `>80B` carrier.

## 7. B5-CLAIM design-first (the claim site) — CL design-concur pending

The first surface. Smallest, self-contained, exercises the full read+write loop. **Design only — no
implementation until B4 merges to `main`.** Package: `apps/claim` (clean-build rewrite; old `apps/claim`
quarantined, mined for the walkthrough + documenting tests only).

### 7.1 Purpose

The low-friction "claim a name" front door: serve one page + a self-contained browser client; **assemble** the
unsigned claim/anchor transaction via `@ont/adapter-publisher`; **hand off** signing (never sign here);
**read/render** chain-derived name state via `@ont/adapter-resolver` (+ `@ont/adapter-indexer` confirmation).
Runs on its own origin (key-handling stays off this origin — see signing boundary). It decides nothing:
ownership is on-chain + the audited kernel; the resolver view is convenience, stamped not-authority.

### 7.2 Scope + the signing boundary (CL #2)

- **Assembles + hands off + renders/reads.** The claim site calls the B4 assemblers (unsigned
  `LegacyTransaction`) and the read adapters. It **MUST NOT sign** — no private keys, no PSBT finalization on
  this surface. Any signing in a walkthrough crosses a **named mock-wallet fixture boundary** (a test double
  standing in for B5-WALLET), or is deferred to B5-WALLET. A hidden signer here is a B5 bug.
- **Spend-triggering endpoint stays server-side + rate-limited** (the old claim site's posture): the publisher
  URL is not exposed to the browser; the claim/broadcast proxy is rate-limited (public, spend-adjacent).
- **Resolver gap-scan is liveness, not authority** — the owner→names union for display carries the
  `not-ownership-authority` / `resolver-indexed-mirror` stamps through to the rendered copy.

### 7.3 Pure cores (red→green, when B4 merges)

- **request/response shaping** — parse a claim request → call the assembler → return the unsigned tx + the
  next-step handoff descriptor (deterministic; malformed request → structured reject; never throws).
- **served-state projection for display** — fold resolver/indexer reads into the page view-model, preserving
  the not-authority stamps; never presents unverified data as authoritative.
- (key handling does NOT live here — it moves to B5-WALLET per the signing boundary.)

### 7.4 The boundary lint (CL #4 — ships in THIS slice)

A low-cost scripted check (e.g. `scripts/check-surface-boundaries.mjs`) run as a B5 gate:
- `apps/*` may import **published `@ont/*` package entrypoints only** — NO package-internal `src/`/`dist/`
  deep imports.
- NO imports of quarantined old-app logic (`legacy/`).
- NO direct crypto / bitcoin rule libraries (e.g. `@noble/*`, `bitcoinjs-lib`) from a surface — **except inside
  B5-WALLET**, where signing is in scope.
- Literal window/digest/predicate-reimplementation checks stay **CL review** for now (the lint learns more from
  the first real violation rather than over-specifying up front).

### 7.5 Tests / gate

- The pure cores above, red→green.
- **The claim walkthrough — hermetic synthetic-block harness (CL #3):** assemble claim tx → (mock-wallet
  signing fixture) → drop into a synthetic 1-tx block (reuse the B4 synthetic block/header machinery) → the
  B4-INDEX read firewall ACCEPTS → resolve + render the resulting state. Unit-gateable without signet;
  regtest/live smoke optional once a target exists.
- The boundary lint (§7.4) passes.
- Copy obeys the GLOSSARY + the not-authority discipline.

### 7.6 B5-CLAIM design-concur — open calls (my leans)

1. **Signing boundary** = named mock-wallet fixture for walkthroughs; the claim site never holds keys / signs.
   **Lean: this** (CL #2). Confirm the fixture shape (a minimal `signTx(unsignedTx) → signedTx` test double).
2. **Hermetic harness** reusing B4's synthetic block/header machinery + fixture DA/resolver stores. **Lean:
   this** (CL #3). Confirm whether the harness lives in `apps/claim` test scope or a shared B5 test util.
3. **Boundary lint scope** as §7.4. **Lean: this** (CL #4). Confirm the exact allow/deny lists.
4. **What "claim" assembles here** — the claim site's tx is the RootAnchor batch path (operator) vs a
   per-name claim. My read: the claim site drives the **operator claim/anchor** flow (assemble RootAnchor via
   `assembleRootAnchorTx` + the batch), since per-name Transfer/AuctionBid are B5-WALLET wallet-handoff (W17).
   **Flag for your ruling** — this pins exactly which assembler the first walkthrough exercises.

On concur I draft the B5-CLAIM red battery — but it stays uncommitted-as-implementation until B4 merges; only
the design note + (if useful) reviewed interface-test stubs land now.
