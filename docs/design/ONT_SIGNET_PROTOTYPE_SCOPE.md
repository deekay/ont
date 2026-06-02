# ONT — Signet Prototype Scope

The empirical capstone: turn the abstract models (delta-merge, DA convergence, recovery) into
**measured behavior on real Bitcoin**, on a private signet. This is what converts "modeled in code"
into "validated at the transaction level," and settles the unvalidated numbers (R11).

Status: scope / plan, 2026-05-24. Not yet built.

---

## 1. Goal & what it settles

Anchor the **scaling design** (Bitcoin-sequenced name accumulator + sunk-fee long-tail rail) on a
private signet and measure it. Specifically, validate at the tx level:

- **R11 / T3** — real anchor tx size, per-name on-chain cost, proof sizes, contested footprint.
- **R2** — delta-merge throughput across independent publishers on real Bitcoin.
- **R1 / I1 / I4** — fail-closed DA with an on-chain availability marker; convergence under a
  withholding adversary, against real block timing.
- **I5** — the direct-L1 censorship fallback actually works.
- **R4** — the contested-name flow (sealed second-price + returnable bond) end-to-end.

## 2. Starting point — already built, reuse don't rebuild

The v1 bonded-auction model already runs **end-to-end on a private signet**:

| Asset | What it gives the prototype |
| --- | --- |
| Private-signet harness (`scripts/private-signet-*`: bootstrap, fund, mine, **auto-mine**, reset, smoke) | A controllable Bitcoin network with **deterministic block timing** — exactly what the DA windows (K/W/C, measured in blocks) need to exercise |
| `apps/indexer` + `InMemoryOntIndexer` / `engine.ts` | Reads signet blocks, replays ONT rules, rejects invalid transitions |
| `apps/resolver` (`value-store`, `recovery-store`, `recovery-proof-store`) | The resolver actor — serves lookups, value records, recovery proofs |
| `apps/web`, `apps/cli` | UX surfaces + scripted flows |
| `packages/protocol` (crypto, events, `auction-bid-package`, recovery, `value-record`, `wire`) | Tx payload encoding, signatures, auction + recovery primitives |
| `bitcoinjs-lib` + `tiny-secp256k1` (deps) | Real tx construction/signing |
| Research sims (`delta-merge-sim`, `da-convergence-sim`, `recovery-sim`) | The **validated logic** to productionize — the SMT, the merge, the DA rule, the recovery state machine |
| `private-signet-auction-smoke.mjs` / `-phase-gallery.mjs` | An existing contested-flow harness to extend for C6 |

**The gap:** the accumulator, delta-merge anchoring, DA marker, and sunk long-tail rail exist only as
*abstract sims*. There is **no production SMT** yet (only the sim's). The prototype productionizes that
logic and wraps it in real signet transactions.

**Protocol wire (done 2026-05-24):** the on-chain message formats for the rail now live in
`@ont/protocol` alongside the v1 events — `RootAnchor` (`0x0b`: prevRoot+newRoot+batchSize) and
`AvailabilityMarker` (`0x0d`: dataDigest+batchSize), same magic+version+type framing, decoded by their
own codecs (kept out of the v1 `decodeOntPayload` dispatcher so v1 is untouched). The individual
long-tail claim stays off-chain (batched in deltas); the $1-gate form is still undecided (R13).

## 3. Components

| # | Builds | Validates | Reuses | Deliverable |
| --- | --- | --- | --- | --- |
| **C1** ✅ *(built 2026-05-24)* | Production sparse Merkle accumulator with serialized **membership + non-membership** proofs | R11 (proof sizes), T3 (verifier budget) | `delta-merge-sim` SMT, `bytes`/`crypto` | `packages/core/src/accumulator.ts` (+ test). Root cross-checked against the reference tree; **measured proof size ~log₂(N): 339 B @ 100 names → 577 B @ 10k, projecting ~1.1 KB @ 1e9** |
| **C2** ✅ *(built 2026-05-24)* | **Anchored root chain** — encode a batch root in an OP_RETURN; indexer reads it back; `RootChain` rejects stale/forged transitions | R11 (anchor vB), S1/I5 (Bitcoin ordering) | `@ont/protocol` wire framing, `@ont/bitcoin` block types, bitcoinjs-lib | `packages/core/src/root-anchor.ts` (+ test). Codec + **block read-back** (`extractRootAnchors`, `RootChain.applyBlock` over real `BitcoinBlock`s) + `RootChain` validator (rejects stale-parent / no-op / malformed) + **measured anchor vBytes (finding below)**. The encode→block→read-back→validate loop is closed in code; **only the literal broadcast to the running signet node remains** (`scripts/private-signet-*`, needs the node). |
| **C3** ✅ *(built 2026-05-24)* | **Multi-publisher delta-merge** — deltas merged into the real accumulator; derived roots anchored | R2 (throughput mechanism on real BTC) | C1 accumulator, C2 `RootChain`, `delta-merge-sim` | `packages/core/src/batch-rail.ts` (+ test): commit-priority conflicts + cross-block uniqueness, into the **real accumulator**; each block's root anchored in the `RootChain`. *Live anchors/block throughput measurement needs the node.* |
| **C4** ✅ *(built 2026-05-24)* | **DA availability rule + fail-closed + withholding adversary** | R1, I1, I4 (convergence) | C1 accumulator, `da-convergence-sim` rule | In `batch-rail.ts`: honest nodes **converge on one real accumulator root** (naive rule forks), withholding is self-harm, and the resulting ownership is **provable** with C1 proofs. *Live block-timed marker tx needs the node.* |
| **C5** | **Direct-L1 fallback** — claim/settle directly on signet, bypassing publishers | I5 (censorship resistance) | engine, CLI | Direct-claim path; a publisher-censored claim still lands via L1 |
| **C6** | **Contested-name flow** — notice window → sealed second-price → returnable bond | R4, R11 (contested vB) | existing auction code + signet auction smoke | End-to-end contested settlement on signet; measured contested vB |
| **C7** *(optional)* | **Recovery tx** — arm off-chain, invoke via temporary recovery UTXO, on-chain veto, finalize | F6 (recovery at tx level) | `recovery-sim`, resolver recovery stores | Recovery flow on signet; thief-can't-steal / owner-recovers demonstrated on-chain |

## 4. Phases & build order

Dependencies: C1 → C2 → {C3, C5, C6}; C4 needs C2+C3; C7 needs C2 + transfer.

**Phase 1 — Foundation (C1 + C2).** Productionize the accumulator with real proofs; anchor a root on
private signet; indexer validates transitions.
*Done when:* a fresh verifier reads a root from the chain and validates a membership **and** a
non-membership proof against it; anchor vB and proof bytes are reported. → Closes the core of R11/T3.
**Status: Phase 1 ✅ — C1 (accumulator + serialized proofs, proof sizes measured) and C2 (anchor
codec + `RootChain` validator, anchor vBytes measured) both built. Finding: the anchor is 162–194 vB,
above the 150 vB estimate. Remaining C2 integration: broadcast to the live signet node (the harness
exists). Next major lift: Phase 2 (C3 multi-publisher delta-merge + C4 DA marker / withholding adversary).**

**Phase 2 — The scaling claim (C3 + C4).** Multiple publishers anchor deltas; all verifier nodes
converge on the same confirmed root via merge over real anchored data; the availability marker + K/W/C
windows are exercised on the auto-mined signet; a withholding adversary demonstrates self-harm +
convergence.
*Done when:* N publishers run, all honest verifiers agree on the confirmed root, the withheld delta is
fail-closed-excluded while the rest converge, and anchors/block capacity is reported from measured vB.
→ Validates the two fatal mechanisms (R2, R1) on real Bitcoin. **This is the heart of the prototype.**
**Status: built (`batch-rail.ts`) — the full pipeline (DA-filter → commit-priority merge into the real
accumulator → anchored root chain) runs in code; honest nodes converge on one real root (naive forks),
withholding is self-harm, and the resulting state is provable with C1 proofs. The remaining piece is the
*live measurement* (real multi-tx-per-block throughput + the block-timed marker tx) on the running node.**

**Phase 3 — Escape hatches & contested (C5 + C6).** Direct-L1 fallback; the contested-name flow
(Option B) end-to-end, reusing the existing auction code + signet smoke harness.
*Done when:* a publisher-censored claim still lands via L1; a contested name clears via sealed
second-price with bond settlement; contested vB is reported. → Validates I5 + R4 + contested R11.

**Phase 4 — Optional (C7).** Recovery tx, reusing `recovery-sim` logic + the resolver's recovery
stores. → Validates F6 at the tx level.

## 5. Measurement targets (confirm or replace the one-pager assumptions)

| Quantity | One-pager assumption | How measured |
| --- | --- | ---: |
| Anchor (root) tx | ~150 vB | **✅ measured (C2): 162 vB (newRoot only) / 194 vB (explicit prev+new link) — ABOVE the 150 vB estimate** (OP_RETURN root data is non-witness, full weight) |
| Per-name on-chain (batched) | 0.015 vB/name | **✅ measured (C2): 0.0162–0.0194 vB/name @ 10k batch** — still tiny; blockspace not the long-tail bottleneck |
| Contested name footprint | ~110 vB | C6 — measure the settlement + bond tx |
| SMT membership / non-membership proof | "estimated" | **✅ measured (C1):** ~log₂(N) siblings — 339/273 B (member/non-member) @ 100, 577/511 B @ 10k; projects ~1.1 KB @ 1e9 |
| Availability marker tx | (new) | C4 — measure |
| ₿1,000 (~$1) gate as miner fee | "top-of-mempool" | C2/C3 — confirm inclusion priority at signet fee rates |

The headline question these answer: **does the per-name cost and proof size actually stay small at the
sizes the billions-scale thesis (T1) needs?** If the measured numbers diverge from the assumptions,
that's a finding worth having before mainnet — not after.

## 6. What the signet prototype does NOT settle

- **R3 contest rate** — only real users reveal it; the prototype can only show *safe degradation*, not the rate itself.
- **R7 cold start, R5 price drift** — launch-time and market phenomena.
- **Governance / upgrade neutrality** — a design decision, not an empirical one.
- **Mainnet conditions** — private signet has controlled fees/adversaries; unit costs transfer, real fee-market dynamics don't.

So the prototype closes the *empirical mechanism* questions, leaving the *market bets* (launch) and the
*open decisions* (gate form, F6 status, upgrade path, bootstrap pledges).

## 7. Recommended first step

**Phase 1, starting with C1:** productionize the sim's sparse Merkle accumulator into a real module
with serialized membership/non-membership proofs, and measure the proof sizes. It's the smallest,
most foundational piece, everything else builds on it, and it immediately produces one of the most
-cited unknown numbers (proof size) — a concrete confidence increment before the larger Phase 2 lift.

See also: [`ONT_FLAT_NAMESPACE_ONE_PAGER.md`](../research/archive/ONT_FLAT_NAMESPACE_ONE_PAGER.md) (the assumptions this
measures), [`PRELAUNCH_SCALING_CONFIDENCE_PLAN.md`](../launch/PRELAUNCH_SCALING_CONFIDENCE_PLAN.md),
[`ONT_DATA_AVAILABILITY_AGREEMENT.md`](./ONT_DATA_AVAILABILITY_AGREEMENT.md),
[`ONT_REQUIREMENTS_CONFORMANCE.md`](./ONT_REQUIREMENTS_CONFORMANCE.md).
