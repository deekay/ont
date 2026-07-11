# Live enforcement — wiring the audited B3/B4 enforcement into the deployed services

> **Status: DESIGN-FIRST (sequencing note, no implementation). Writer: ClaudeleLunatique.
> Reviewer: ChatLunatique — design-concur GRANTED (event c90a23a5) + re-glance (proof-bundle row green;
> §2a folded the verified-committed-entry source / `canonicalName` / `trace` / firewall-`vout` findings).**
> Opens after the go-live G3 write path
> merged to `origin/main` @ `9a482008`. Proposed stable name: **`live-enforcement`** (DK assigns the
> DECISIONS.md number on ratification). Per SOFTWARE_CANON phase-sequencing, this design note may merge;
> no implementation lands until the design is concurred. Branch: `live-enforcement-plan`.

## 1. The gap

The audited batched-claim / value / recovery / DA **enforcement is built and unit-tested** —
`@ont/claim-path` (`enforceBatchedClaim` + the contested / gate-fee / recovery enforcers, fixture-seam
tested) and the B4 adapters (`@ont/adapter-{header,indexer,da,publisher,resolver}`, all green). But the
**deployed services do not run it**: the live indexer daemon
([`apps/indexer/src/main.ts`](../../apps/indexer/src/main.ts) → `runner.ts`) ingests **RootAnchor
confirmed-anchors only** (blockSource → anchorStore), and the deployment is "RootAnchor read path ONLY"
([STATUS.md](./STATUS.md) §boundary). So the sharpest open item — the withhold-then-reveal DA defense —
is enforced over fixtures, never over the live chain.

**This front = consume the already-built adapters from the live app shells**, so `enforceBatchedClaim`
runs on real ingested data and the resolver serves the resulting name-state. No new consensus law; no
reopening a kernel call (B3/B4 boundary, #46/B0): the shells do I/O + select env; the adapters mint
validated witnesses (recompute-don't-trust); `claim-path` decides; the output is a trace + verdict +
name-state delta, **never a bare mutation**.

## 2. Seams → shells (what plugs into what)

| Built piece (green) | Lives in | The live shell that must consume it |
|---|---|---|
| `validateHeaderChain` → `BitcoinHeaderSource` | `@ont/adapter-header` | indexer: a canonical best-chain header source for inclusion (#82) |
| `buildConfirmedBatchAnchor` (inclusion firewall → `ConfirmedBatchAnchor`) | `@ont/adapter-indexer` | indexer: firewall-mint the confirmed anchor facts from a `RootAnchor` anchor |
| live **proof-bundle** source (`buildAccumulatorBatchClaimBundle` or equiv.) | `@ont/evidence` + indexer | the `proofBundle` `enforceBatchedClaim` binds — inclusion `anchors[0]` + `accumulatorProof.root` (`enforce-batched-claim.ts:76-80,166-186`); **built from firewalled batch material, never trusted from the wire** |
| `createAvailabilitySource` (`baseLeavesForPrevRoot` / served delta) | `@ont/adapter-indexer` | indexer: the availability seam (needs `da-served-transport`) |
| `buildCommittedBatchForRoot` (gate-fee projection) | `@ont/adapter-indexer` | indexer: the gate-fee seam |
| `buildConfirmedRecoverOwnerInvoke` | `@ont/adapter-indexer` | indexer: recover-owner firewall |
| `enforceBatchedClaim` / `enforceRecoveryInvoke` / … | `@ont/claim-path` | indexer: run the enforcement, emit name-state delta |
| read firewalls + store-guards | `@ont/adapter-resolver` | resolver: serve the enforced name-state, append-only submission guards |
| RootAnchor + `/da/{root}` serving | `@ont/adapter-publisher` | publisher: serve the batch bytes the availability seam reads |

## 2a. The `@ont/name-state-store` payload (LE-RESOLVE must answer *names*) — CL refinement 2(b) + re-glance

`enforceBatchedClaim`'s `NameStateDelta` is **root-level only** (`anchoredRoot`, `firstServableHeight` —
`packages/claim-path/src/enforce-batched-claim.ts:108-120,263-270`) — not enough to answer "who owns name X".
**Source the per-name material from the VERIFIED committed-entry seam, NOT claim-path's completeness
projection** (CL re-glance): `buildCompletenessInput` fabricates synthetic `name: b3-batched-leaf-${index}`
(`enforce-batched-claim.ts:325-330`) and the gate-fee adapter output drops the name to a byte-length
(`packages/adapter-indexer/src/committed-batch.ts:86-88`). The real canonical name + owner live in the
`CommittedBatchEntry[]` the loop feeds to `buildCommittedBatchForRoot` (`committed-batch.ts:18-23,52-88` —
W3-gated `isCanonicalName`, recomputed leaf key, root-bound). So **after** that adapter call returns non-null
**and** `enforceBatchedClaim` accepts, the loop writes one `NameStateRecord` per verified committed entry,
joining the entry to the accepted served/root facts:

- `canonicalName` (the store **key** — **reject-don't-normalize**: non-canonical names are rejected upstream
  by `isCanonicalName`/W3, never case-folded; `committed-batch.ts:13-16,69`,
  `apps/web/src/render-name-view.ts:31-35`) + `leafKeyHex` (`= sha256Hex(utf8ToBytes(canonicalName))`)
- `owner` — under current B3 the 32-byte lowercase-hex `ownerPubkey` (value === ownerPubkey)
- `batchLocalIndex`
- `anchoredRoot` + anchor coords `txid`, `minedHeight`, `txIndex`, **`vout` preserved from the inclusion
  candidate / firewall side** — NOT inferred: `ConfirmedBatchAnchor` does not carry vout
  (`confirmed-batch-anchor.ts:83-87`) and claim-path hard-codes `vout: 0` (`enforce-batched-claim.ts:317`)
- `firstServableHeight`
- `trace` — the accepted `BatchedClaimResult.trace` (`enforce-batched-claim.ts:114-120`), so LE-RESOLVE
  returns the evidence trace, not just ownership

Keyed by `canonicalName`; mirrors `@ont/anchor-store` (node-targeted, `file|memory`, codec, **no
resolver→indexer edge**). `enforceBatchedClaim`'s return type is unchanged — the loop owns the
verified-entry → record join. A reject writes **no** records.

## 3. Slice sequence (dependency-ordered, tests-first, hermetic first)

1. **LE-INDEX — the live enforcement loop (FIRST).** Extend the indexer runner so every confirmed anchor
   **first** runs the existing RootAnchor inclusion firewall and lands in the anchor-store read path
   (G1/G2/G3 unchanged — additive). **Then**, only when verified **batch-claim material is present** — a
   proof bundle + committed batch + served bytes / DA record that reconstruct and firewall-mint — it builds
   the `enforceBatchedClaim` inputs (proof bundle, header source, availability, committed batch), runs the
   enforcement, and on `accept` writes the **per-name records** (§2a) to a new `@ont/name-state-store`.
   **There is NO distinct "batch" event type** (CL refinement 1): `@ont/wire` decodes both a bare and a
   batch anchor as `RootAnchor` (`packages/wire/src/index.ts:111-146`); batch-ness is decided by the
   **presence + firewall-verification of batch material**, not the event class. Missing/unverifiable batch
   material ⇒ **no** name-state mutation (the anchor still lands in the read path). Hermetic first: a
   fixture/regtest block source (like the G2 restart e2e), **no network**. The loop mutates name-state ONLY
   by applying an `accept`'s per-name records; a reject records the trace and mutates nothing.
2. **LE-RESOLVE — serve the enforced name-state.** Resolver reads the name-state store via
   `@ont/adapter-resolver` read firewalls; `/name/:name` (or the agreed route) returns the enforced
   ownership + the evidence trace. Read-only; no resolver→indexer edge (same discipline as G2).
3. **LE-DA-SERVE — publisher `/da/{root}` + the availability transport.** The publisher serves the batch
   bytes; the indexer availability seam fetches them. Gated on `da-served-transport` (parked) — proceeds on
   the recommended minimal-binary transport with a flagged reopen. **Slice spec:**
   [G_B_DA_SERVE_SPEC.md](./G_B_DA_SERVE_SPEC.md) — `da-record-content` (#98) serves the **full**
   per-root batch material (not leaf-hashes alone) so a second operator re-runs the identical
   `enforceBatchedClaim` incl. gate-fee, which needs canonical name pre-images.
4. **LE-INVOKE / LE-CONTESTED — recover-owner + contested→L1 live paths**, once LE-INDEX's seams exist.
5. **Live signet smoke** (operator) — the deployed walk; needs a funded signet (DK), folds into G4.

## 4. Parked-decision assumptions (proceed + flagged reopen — the B4 pattern)

Per [B4_PARKED_DECISIONS.md](./B4_PARKED_DECISIONS.md) "recommend-and-proceed; none blocks":
- **`event-carrier`** → OP_RETURN-PUSHDATA1 (rec A; already what the adapters emit/read). Reopen if DK rules otherwise.
- **`da-served-transport`** → minimal-binary `/da/{root}` (rec A). LE-DA-SERVE carries a flagged reopen.
- **`refund-accounting`** → off-chain operator accounting (rec A); out of the enforcement path (surface concern).

DK's rulings firm these reopens; none blocks LE-INDEX (it composes the kernel + adapter calls that already
exist over a hermetic source).

## 5. Boundary + scope guards

- Shells/adapters do I/O + env-selection + witness-minting only; **never reopen a consensus call.**
- `enforceBatchedClaim` decides; the loop applies only an `accept`'s per-name records (§2a); reject → no
  mutation, trace records which stage rejected.
- Hermetic-first: every slice lands with a default-suite (no-network) test before any live wiring.
- New name-state store mirrors `@ont/anchor-store` (node-targeted, file|memory, no codec duplication).
- Additive to the live RootAnchor read/write path — does not regress G1/G2/G3.

## 6. Design calls — RESOLVED (CL design-concur, event c90a23a5; 2 refinements folded)

1. **Name-state store — CONCURRED.** New `@ont/name-state-store` (not extending anchor-store), same shared-
   infra pattern as G2, with an explicit accepted-batch / per-name projection contract (§2a) and no
   resolver→indexer edge.
2. **Firewall split point — CORRECTED (CL refinement 1):** NOT by event type — `@ont/wire` decodes both a
   bare and a batch anchor as `RootAnchor` (`packages/wire/src/index.ts:111-146`). Run the existing
   RootAnchor inclusion firewall + read path first (additive), then enforce only when batch-claim material
   is present + firewall-verified; missing material ⇒ no name-state mutation. Folded into §3 LE-INDEX.
3. **Slice-1 acceptance — CONCURRED + battery (CL):** hermetic enforce-loop e2e, no network, mirroring the
   G2 restart e2e. Red/green battery: (a) accepted batch writes per-name name-state; (b) withheld/absent
   served bytes → reject at availability, NO mutation; (c) absent/mismatched proof bundle → reject at
   inclusion; (d) a bare RootAnchor still lands in anchor-store / read path and causes NO name-state mutation.
4. **Naming — CONCURRED:** `live-enforcement`; LE-INDEX / LE-RESOLVE / LE-DA-SERVE / LE-INVOKE. Split
   LE-CONTESTED from LE-INVOKE if contested grows large.

**Net-new design from this round (for CL re-glance):** §2a `NameStateRecord` payload (the per-name
projection the store holds) + the §2 proof-bundle seam row. The split-point + battery folds apply CL's
verbatim rulings.

## 7. Availability-mode DA-fork closure — the `reduceBlock` §6 `modeAt` evidence contract

> **Status: DESIGN increment (2026-07-10; delta-3 corrected 2026-07-11). Writer: ClaudeleLunatique.
> Adversarial review: Fabilist — third-frame (events `932adaac` + `7b116ff2`) folded @ `fdba857e`;
> **fourth-frame verdict COMPLETE** (event `e2a2a736` + `OUTBOX/ONT_DA_AVAILABILITY_MODEL_ADVERSARIAL_VERDICT_20260710.md`)
> — its cites re-verified cold-frame (ClaudeleLunatique, 2026-07-11) and folded here: **§7.4 delta-3
> corrected to {mint, stall}; see §7.5.** Builder: ChatLunatique — cut the §6 `modeAt` deltas from the
> CORRECTED §7.4, NOT the original. Grounds the availability-mode arm of the composed `reduceBlock`
> reducer (the §6 `modeAt` height-keyed seam landed behavior-neutral @ `da7aa192`).** No new consensus
> law: this is imperative-shell (indexer fetch/finalize) policy; `consensus/src` stays zero-diff.

### 7.1 The defect (verified in code + confirmed from three frames)

Skip-and-advance over an **FCFS unique namespace** is a **cross-operator safety fork, not downtime.**
An operator that never received a withheld batch's bytes awards the name to a *later* claim while an
operator that did receive them reserves/nullifies it (owned-vs-nullified under #37) — a *permanent*
divergence once finalize-once (#82 invariant 3) settles it. Three independent frames converged: the
senior-architect review (2026-07-09 — "full canonical DA record, not publisher verdict"), the DA memo
(`RESEARCH/ONT_DA_VS_BITCOIN_DA_20260710.md` §1/§7), and Fabilist's third-frame adversarial read.

**Wired state today (severity = LOW — do not over-alarm):** the two live enforcement modes behave
*oppositely* —
- `fixture-file` (`select-enforcement.ts:52-55`) **throws** on missing material ⇒ tick throws ⇒ cursor
  **holds** ⇒ stalls (already the safe path).
- `http-da` (`select-enforcement.ts:74`) returns `?? null` ⇒ `enforce-batched-claims.ts:93-96`
  `skipped.push; continue` ⇒ `runner.ts:77` `cursorStore.save` advances the cursor **anyway** ⇒ skip.

And `http-da` is only a **boot-time one-shot prefetch** of a static `ONT_DA_ROOTS` list
(`loadHttpDaMaterials` silently drops unfetchable roots) — **no dynamic fetch-on-anchor, no window, no
retry.** So there is **no running multi-operator live DA loop to fork with yet**; the skip path is a
demo shim. Severity is low *today*; the reducer must close it before any second operator runs live.

### 7.2 The closure — two moves, kernel untouched

The window is NOT the fix by itself. #49's window has an **objective clock** (S1: all deadlines are
block heights from the anchor's mined height `h`) but an **operator-local predicate** —
`includable(anchor, evidence, W, C)` (#83) is a function of the *served-bytes witness a given operator
holds* (#49 S4). Withhold-then-reveal-to-*some*-within-window ⇒ divergent `includable` verdicts ⇒
finalize-once locks the split permanently. Wiring the window's *clock* without an observer-independent
*evidence source* just puts a clock on the fork.

- **Move A — `http-da` stall-not-skip (parity with `fixture-file`).** An anchored-but-unresolved batch
  must **hold the cursor** (throw/pend), never `?? null`-skip. Cheapest, highest-value. But stall
  alone does **not** close the fork: the operators that *did* see bytes still finalize — it converts
  selective-withhold from "fork" to "some operators stall."
- **Move B (LOAD-BEARING) — finalize `includable` against the canonical content-addressed archive as
  THE evidence input,** not live-fetch and not operator-local served-bytes. This is what makes the
  window's predicate observer-independent across operators. The primitive is already ratified as
  **#90 archival-floor** (RATIFIED 2026-07-02, event `ce24c1ed`) — the reducer *wires* an owed floor,
  it does not take on a new dependency.

**Cite the right leg of #90 (Fabilist's precision):** fork-closure rides on #90's **content-addressing
+ hash-reverify-on-serve** leg, **NOT** the owner-retained-portable-proofs leg. #90's own scoping is
why: owner-proofs preserve *ownership* ("a name's ownership survives even if every archive vanishes;
only discovery of others' names degrades") — but the withhold-fork is precisely a **discovery** failure
(operator-B never learns `bob`=alice existed), and owner-proofs cannot help B discover a name it never
saw. Content-addressing + hash-reverify removes the *"which mirror / which bytes"* degree of freedom —
**every honest mirror is byte-identical for a given root R** — which is exactly what makes `includable`
observer-independent.

**Kernel boundary (Fabilist confirmed):** archive-as-evidence lives in the **imperative shell** (the
indexer's fetch/finalize orchestration), not the kernel. #49 S4 keeps the kernel a pure function of the
*presented* witness that never does I/O (§5 boundary guard: "shells/adapters do I/O … never reopen a
consensus call"). So `consensus/src` zero-diff holds — **no new consensus law.**

### 7.3 The residual — a 1-of-N archive-reachability LIVENESS floor, NOT a safety hole

After Move B what remains is a **clean 1-of-N mirror-reachability liveness assumption**, bounded at
`h+W+C`: *"were root R's bytes reachable from ≥1 honest content-addressed mirror by every operator's
`h+W+C` deadline?"* That is an **eclipse-resistance property in the standard gossip class** (early-
Bitcoin's posture, #82) — **not a novel trust hole.** The whole win is the reduction
**novel-DA-safety-fork → standard-network-reachability-liveness**, and it must be **legible** in the
reducer, never silently rendered "safety-closed." **Crucially, this is a liveness floor only because
an unreachable-by-deadline root now *stalls* the name (§7.4 delta-3, §7.5), it does not *free* it** — the
earlier delta-3 "excluded, name free" terminal would have turned this same reachability question back into
a safety fork (§7.5 records why it was dropped). This is the already-flagged residual: #49's
ratification (DECISIONS L1066-1069) names the 1-of-N archive as *the DA residual, external-review
priority #1*, and #84 (L2263-2265) writes *"Fork preserved."* #90 archival-floor (operator-funded
public archive + deterministic mirror instructions = the 1-of-N floor) is the owed delivery.

### 7.4 Build increments — the four §6 `modeAt` deltas (priority order)

1. **`http-da` stall-not-skip** — Move A. Anchored-but-unresolved material holds the cursor
   (throw/pend), never `?? null`. Align to `fixture-file`.
2. **`includable` against #90's content-addressed archive as THE evidence input** — Move B, the
   load-bearing delta. Content-addressing + hash-reverify-on-serve; not live-fetch, not operator-local
   served-bytes. Everything else is a clock on the fork without this.
3. **Model `reserved-pending-material` explicitly — {mint, stall}, NO off-chain freeing.** An anchored
   batch **reserves the name** (blocks later same-name claims) and holds it reserved until its bytes
   **reconstruct-in-window against the archive** (fetch-by-root + hash — positive, observer-independent)
   ⇒ **mint**. If the bytes never reconstruct, the name stays **`reserved-pending-material` indefinitely**;
   the only transition is **stall → mint**. **There is NO off-chain `excluded → name free` terminal**
   — the original delta-3 had one ("passes `h+W+C` unreconstructed against the archive → excluded, name
   free"); it is **dropped** as unsound (§7.5). Never let an anchored-but-unresolved batch reserve
   **nothing** while the cursor moves past it — the precise defect today (`runner.ts:77`). (Freeing a
   withheld-forever name is a *separate, harder* problem escalated in §7.5 — the builder wires stall-only.)
4. **Encode #11 ≤4-char mandatory-bond-first pre-routing** in the reducer (pre-hoc-safe, length-
   objective, quarantined straight to L1 — never touches the withhold-able path), and **mark LOUDLY**
   that 5+ char (#7 gate + contention) contention-detection is **archive-dependent liveness, not
   self-closing safety** (per §7.3; the "deferral must be visible, never silent" discipline). #84's O3
   does NOT self-quarantine the tail — detection is itself DA-gated (circular, same shape #100 was
   found circular).

**Guardrails + acceptance:** `consensus/src` zero-diff (shell/driver only); hermetic-first per §5. The
§3 slice-battery (accept writes records / withheld → no mutation / bad bundle → reject / bare anchor →
read-path-only) extends with a **two-operator selective-withhold** case proving both operators reach
the *same* verdict — and per the delta-3 correction that verdict is **{mint | stay-reserved}, never
free**: a withheld root leaves the name `reserved-pending-material` on **both** operators (no divergent
"one mints, one frees"), which is the fork-closure regression test.

### 7.5 Correction — the off-chain `excluded → name free` terminal is unsound and is dropped

> **Fabilist fourth-frame verdict (event `e2a2a736`, memo `OUTBOX/ONT_DA_AVAILABILITY_MODEL_ADVERSARIAL_VERDICT_20260710.md`),
> cites re-verified from a cold frame by ClaudeleLunatique 2026-07-11. Supersedes Fabilist's earlier §7-gate
> finding-1 (a *three*-terminal fix) — that went one step too clever; the deeper pass below drops the
> exclude terminal entirely.**

The original §7.4 delta-3 said an anchored batch that *"passes `h+W+C` unreconstructed against the
archive"* is **excluded → name free**. That negative terminal is **unsound off-chain** and is dropped.
The positive terminal (reconstructs → mint) is fine; only the negative one breaks. Why:

- **It is a receipt-time / reachability predicate in disguise.** "Unreconstructed against the archive"
  is observer-independent only if the archive is a *single canonical committed object*. But #90 is
  **1-of-N mirrors**, so "unreconstructed" collapses to *"unreachable-by-**me** by **my** deadline"* — a
  per-operator reachability fact, not a chain-view-deterministic one.
- **The algebra forbids exactly this.** `docs/research/DA_WINDOWS.md:66-68` (verified verbatim): *"There
  is no wall-clock or receipt-time input anywhere in the algebra — that is the entire point … it is what
  makes the predicate pure and chain-view-deterministic."* And `docs/DESIGN.md:690-693` (verified): I4
  makes a *"non-inclusion-over-time proof … a liability."* "Unreconstructed by a deadline" is precisely
  a non-inclusion-over-time proof.
- **So it re-opens the very fork Move A/B closes.** Two honest operators with different mirror
  reachability reach *different* exclude verdicts → one frees the name, one keeps it reserved → and
  #82 finalize-once (which locks any *verifier-accepted* verdict, `DECISIONS` L2168-2171) **locks the
  split permanently.** The exclude terminal relocates the withhold-fork into the negative branch instead
  of eliminating it. (Fabilist's own §4 committed-manifest was an attempt to make "unreconstructed"
  observer-independent; it fails — it needs Bitcoin-anchoring → a funded permissioned DA layer, or a
  bonded signer → the shape #82-invariant-2 already rejects. Both give back the trusted set.)

**Corrected terminal set = {mint, stall}** (§7.4 delta-3): mint is a *positive* content-addressed fact;
stall is `reserved-pending-material` forever, transitioning only stall → mint. **No off-chain freeing.**

**Escalated open question — the real hard problem (needs DK's call, not silently resolved by a timeout):**
freeing a *withheld-forever* name. The honest tradeoff, now unmasked:

- **stall-forever** (the safe default we adopt): **never forks**, but a single withheld anchor
  **permanently freezes that name** — a cheap namespace-denial DoS (one gate-fee per name burned forever).
- **free-on-off-chain-timeout** (the dropped delta-3): prevents that griefing-freeze, but **forks**
  (unsound, above).
- **free only on a positive on-chain event** (#84's forced "O2" availability attestation): the
  principled resolution — but **#84 itself flagged O2 as circular / DA-gated** (you need the data to
  attest the data — "same shape #100 was found circular").

So the genuine open problem is **not** "how does a resolver detect availability" (solved: fetch-by-root,
else stall) but **"how does a withheld-forever name get freed without an off-chain timeout (forks) and
without a trusted party (defeats the goal)?"** That is the O2 circularity, and it is the next thing worth
breaking — flagged here, **not** closed. Confirmed non-issues from the same pass: the backfill vs
finalize-once race is a **false alarm** (#82 finalize-once + #83 uniform-reject mean two honest resolvers
can't finalize differently from the *same* bytes — a split needs *different* bytes, i.e. the equivocation
hole, which content-addressing removes).
