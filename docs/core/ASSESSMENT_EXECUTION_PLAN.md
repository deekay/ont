# ONT — Assessment → Execution Plan to Closure (v2, post-convergence)

> **STATUS: DRAFT (ClaudeleLunatique), 2026-07-02 — post ChatLunatique adversarial pass.**
> For DK ratification. Graduate / fold into `GO_LIVE_PLAN.md` on merge. Writer/reviewer/merge
> protocol: I draft → ChatLunatique reviews → DK merges.
> (v1 lived in `~/.sprout/PLANS/ONT_ASSESSMENT_EXECUTION_PLAN_20260702.md` — my drafting workspace,
> which is NOT on the Buzz/repo path other agents read; that's why ChatLunatique couldn't find it.
> This repo copy is canonical; v1 is superseded.)

**Source:** Fabilist's independent review (event `774ec8c6`, almost certainly Opus). Grounded against
the repo and hardened by ChatLunatique's adversarial pass (event `effed31d`).

**Closure = a credible signet, bootstrap-operator launch.** Mainnet is out of scope — hard-gated
behind the external kernel audit (SOFTWARE_CANON.md ruled call 6).

**The framing correction (ChatLunatique):** keep three categories separate —
1. **Ratified launch gates** = the #89 must-ship set **G-A..G-E** (below).
2. **Launch-act gates** = parameter/trigger freezes (do before the launch *act*, not before build).
3. **Post-launch ladder** = Rungs 2–4 (buy back liveness after launch).

**Three corrections I own (my v1 was wrong):**
- **LE-DA-SERVE is Rung 3, not a launch blocker.** The ladder table (BOOTSTRAP_OPERATOR.md:129)
  puts "the already-designed LE-DA-SERVE transport + bonded challenge game" at Rung 3
  (permissionless availability). Day-one DA = **G-C** (operator-funded archive + portability) +
  **G-D** (deadline conformance battery green). v1 wrongly made LE-DA-SERVE a launch blocker.
- **v1 under-enumerated the spine** — it missed **G-D** (DA-deadline conformance battery) and
  **G-E** (non-authoritative product copy). The real spine is G-A..G-E.
- **Mobile is ratified in-scope for G-A** (STATUS.md:196; "mobile in scope (ratified)"), not a
  harmless parallel track. Mobile-client verification is part of delivering G-A.

---

## Phase 0 — Preflight (mandatory, not polish)

| # | Item | Home | Status | Owner |
|---|---|---|---|---|
| A1 | **SPLIT: A1a** downgrade STATUS's "Wired" (cheap, now) · **A1b** build daemon enforcement selectors (`batchMaterial`/`nameStateStore`/`policy`) + acceptance test that writes names (guards the null-material silent-skip) | LE-INDEX design `LIVE_ENFORCEMENT_PLAN.md` §3; bug untracked | daemon has no live enforcement selectors (`enforce-batched-claims.ts:39-44`); `batchMaterial` source ties to LE-DA-SERVE. Ruling: **bug**. | A1a me · A1b builder |
| A2 | Doc-truth fixes (F4, expanded) | `DESIGN.md`, `RISKS.md` | STALE: "~7 files" (§4:207), settlement "migrating/outside" (:154-156), **gate-fee "not implemented"** (contradicts STATUS built+wired); RISKS R1/R2/R4/R11 call now-`legacy/` `batch-rail.ts`/accumulator "production". | me → ChatLunatique → DK |
| A3 | Generated audit map replacing "~7 files" prose (F3) | NET-NEW (manifest in `trust-surface.test.ts`) | Surface is ~26 pure files / 4 tiers (#57-59). | me + builder |
| A4 | OP_RETURN standardness/relay validation **spike, early** (F6) | `RISKS.md` R11; `WIRE_FORMAT.md` | 184-byte carrier > 80-byte default policy; anchor 162-194 vB. De-risk before over-building on the carrier. | builder + DK |

## Phase 1 — Launch build spine = #89 G-A..G-E (treat G-A/G-B/G-C as ONE spine)

*ChatLunatique's key insight: G-A/G-B/G-C share the same archive/proof/header-source reality — build
together so replay/archive/header formats stay consistent, don't let param work interleave and cause
G-A to prove a path the archive format later contradicts.*

| Gate | What ships | Source | Status |
|---|---|---|---|
| **G-A** Light-client gate (**#1 blocker; delivers I4; addresses F2**) | clients (**incl. mobile, ratified**) require `bitcoinInclusion` + `verifyProofBundleAgainstBitcoin` vs bundled-checkpoint+PoW header source | RC-1 / #82 inv.4 | design-first; verifier+PoW built, no client wires it |
| **G-B** Re-derive verifier | CLI/replay + fixtures + documented mirror/archive format; recompute full name-state from Bitcoin+archive | RC-3 | designed-only |
| **G-C** Portable material | content-addressed export + portable receipts/material + mirror instructions + ≥1 operator-funded public archive (**DK committed to host+fund**) | RC-2 | designed-only |
| **G-D** DA-deadline conformance battery green | bare-anchor / missing / late / valid-in-window as conformance tests | RC-3 semantics | **kernel/unit coverage exists** (`da-verdict.test.ts`, `batch-completeness.test.ts`; e2e covers valid/withheld/bad-header/bare-anchor/atomicity) — but the **#89 late-material "no cheap-path priority revival" case + formal G-D conformance packaging/live-shell are still owed** (not "mostly done") |
| **G-E** Honest product copy | non-authoritative framing wired into surfaces ("ONT secures the string; verification/discovery non-authoritative") | RC-5 | not started |

## Phase 2 — Deploy / reality check

| # | Item | Home | Status |
|---|---|---|---|
| C1 | Stand up G3 on signet + point surfaces G4 | `GO_LIVE_PLAN.md` | G3 infra-as-code ready, not deployed; G4 not started. DK operator action + builder. |

## Phase 3 — Launch-act gates (freeze before the launch act, NOT before build)

| # | Item | Ruling |
|---|---|---|
| D1 | Launch-parameter freeze: DA windows (K,W,C) → notice-window + cold-start → bond/maturity → **set #83 batch-size-cap value** | Freeze *values* before the launch act / user-facing constants / any live-signet claim modeling launch economics. Build with **parametric tests at multiple values** meanwhile (#49 kept integer values as launch-freeze work). |
| D2 | Rung 2-4 numeric triggers (RC-4) | Ratify placeholders (ChatLunatique's proposal below); DK sets final numbers. |

**Proposed Rung triggers (ChatLunatique — placeholders for DK ratification; byte-thresholds need a
cost-rationale tie):**
- **Rung 2 (replicated):** earliest of 10k accepted names / 1 GiB archive / any archive-missing or
  censorship incident unresolved 24h / operator downtime >4h on public signet / before mainnet candidate.
- **Rung 3 (permissionless availability = LE-DA-SERVE):** earliest of 100k long-tail names / 50 GiB
  archive / two withholding incidents / one incident operator-attested DA can't resolve cleanly.
- **Rung 4 (permissionless discovery):** ≥3 independent operators/mirrors stable 30d / one resolver
  >70% of client traffic 30d / before any mainnet copy claims decentralization beyond bootstrap.

## Owed before external review (not signet-blocking)

| # | Item | Ruling |
|---|---|---|
| E3 | DA archival-economics note (#49 owed, external-review priority #1) | **Ratify minimum obligations now** (→ decision #90 archival-floor), don't defer behind "the operator will archive it": day-one floor = owner bundle carrying the **batch completeness witness** (not just the leaf — #83) + operator-funded public archive + deterministic mirror instructions (**= G-C**); **assumeUTXO-style snapshots = documented obligation** for full-state bootstrapping, **never authority** (replay-equivalent-only). **Day-one G-B replay must work** from the day-one export or RC-3 fails; only long-term public replay is the non-guaranteed subsidized service. Defer *only* the subsidy/market design as a later note. |

## Post-launch ladder (NOT launch blockers)

- **Rung 2** — ≥1 independent mirror (replicated).
- **Rung 3** — **LE-DA-SERVE transport + bonded challenge game** (permissionless availability). ← was
  mis-classified as a launch blocker in v1.
- **Rung 4** — permissionless discovery (on-chain seed announcements).

## Mainnet gate
- External audit of the frozen kernel — concurrent from kernel freeze; hard-gate before mainnet.

## Still open (NOT settled this pass)
- **Auction form for MAINNET (sealed-second-price vs open-ascending).** #35 is a *working assumption*;
  RISKS.md MEV analysis votes sealed if ordering-resistance matters. **Converged ruling:** keep
  open-ascending for **signet/prototype** *with two conditions* — model the soft-close extension-grief
  cost, and specify the direct-L1 relay fallback. Decide the **mainnet** form later with live signet
  relay-bid-timing data (Fabilist: it's a post-launch measurement). Do **not** claim it settled for mainnet.

---

## Decision rulings for DK (converged ClaudeleLunatique + ChatLunatique)
1. **F1** → bug. Fix daemon wiring, else STATUS says "runner/hermetic wiring only; daemon enforcement not selected." No unqualified "Wired."
2. **DA-windows freeze** → launch-act gate, not build gate. Parametric tests meanwhile.
3. **E3 archival economics** → ratify minimum obligations now (floor + snapshots-as-obligation); defer only the subsidy market.
4. **F3 audit surface** → retire the literal "~7 files"; keep "small, manifest-enforced, per-file-allowlist consensus package + generated audit map."
5. **Rung 2-4 triggers** → adopt the placeholders above pending DK's numeric ratification.
6. **Auction form** → don't close mainnet this pass; open-ascending for signet with the two conditions; mainnet decided later on live data.

## For DK to confirm
- The restructured spine (G-A..G-E; LE-DA-SERVE → Rung 3; mobile in-scope per #89).
- Whether the *first* signet demo ships mobile or defers it to a fast-follow (the **gate** is ratified; only the demo-scope timing is a call).
- The six rulings above.
