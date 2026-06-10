# ONT Adversarial E2E Findings — 2026-06-09

Context: a multi-agent adversarial campaign drove the full name lifecycle (cheap
claim → notice → collision/bond → auction → soft close → settle → maturity →
transfer → recovery) plus DA and resolver-integrity attacks. 53 scenarios across
four areas, executed in-process (`InMemoryOntIndexer` + `@ont/consensus` engine)
and on a **proven local-regtest full stack** (bitcoind regtest + esplora shim +
publisher + resolver + CLI — full lifecycle in ~4 min, no droplet). Every
"fail" was adversarially re-verified in a fresh worktree; **0 of 9 confirmed
bugs were refuted.**

Status legend: **consensus** (ownership can diverge or be taken) >
**funds-misdirection** > **grief-enabler** > **integrity** (verifier/soundness) >
**UX**.

Reproducing tests for the proof-bundle gaps are committed at
`packages/consensus/src/proof-bundle.soundness-gaps.test.ts` (CI-safe `it.fails`
pattern — they pass today documenting the gap and fail loudly when fixed).

---

## A. The frozen-core soundness gaps (highest value — they touch the audited surface)

> **Update 2026-06-10: PB1/PB2/PB3 are FIXED.** Per DK's call (don't contort to
> avoid touching the core during dev; the freeze is at launch), the sparse-Merkle
> fold was lifted into `@ont/protocol` (`accumulator-membership.ts`) so the
> builder (`@ont/core`) and the verifier (`@ont/consensus`) share **one**
> implementation — verified byte-identical by the 84 accumulator tests. The
> verifier now recomputes the root from `(leaf, value, siblings)` and binds the
> value commitment to the claimed owner; the shipped fixtures were regenerated
> with real proofs; the trust-surface lock is intact (only `@ont/protocol` was
> added, already an allowed dep). Reproductions flipped to assert rejection.
>
> **PB5 is also FIXED (2026-06-10).** `validateValueRecordChain` now recomputes
> `computeValueRecordHash` from the signed fields and verifies the owner
> signature (`verifyValueRecord`) — a forged value-record chain
> (attacker-chosen payment destination) no longer verifies. The direct-L1
> fixture was regenerated with a real owner keypair + real signed value record.
> **All four proof-bundle soundness gaps (PB1/PB2/PB3/PB5) are closed.**

The portable proof-bundle verifier is the project's headline trust claim: a
wallet or recipient can verify *why* a name is owned **offline**, trusting no
resolver. `verifyProofBundleStructure` is in the CI-locked frozen core
(`@ont/consensus`). The campaign found it does not cryptographically check the
accumulator membership proof — it validates *shape*, not *soundness*.

The shipped fixture `fixtures/proof-bundles/accumulator-batch-claim-proof.json`
is itself the proof: its `accumulatorProof.value` (`3333…`) ≠ its
`ownershipProof.currentOwnerPubkey` (`2222…`), and its `root`/`siblings` are
placeholder bytes that cannot recompute — yet it returns `valid: true`.

| ID | Gap | Where |
| --- | --- | --- |
| **PB1/PB3** (integrity→funds) | `validateAccumulatorBatchClaimBundle` never recomputes the sparse-Merkle root from `(leaf, value, siblings)` and never ties `root` to the on-chain `batchAnchor`. A fabricated membership proof for a name the bundle is **not** a member of verifies. | `packages/consensus/src/proof-bundle.ts:503-534` |
| **PB2** (integrity→funds) | The `value` commitment is never required to equal `currentOwnerPubkey` — the verifier blesses ownership the proof doesn't commit to. | same |
| **PB5** (integrity→funds) | `validateValueRecordChain` trusts the **declared** `recordHash` for predecessor linkage and never recomputes `computeValueRecordHash` or checks signatures — a bundle can carry a forged value-record chain (attacker-chosen payment destination) and verify. | `packages/consensus/src/proof-bundle.ts:536+` |

**Why it isn't already catastrophic:** live resolution is unaffected — the
indexer independently re-verifies every membership proof against the anchored
root before accepting ownership (`packages/core/src/indexer.ts:~711`). The gap
bites exactly where the bundle is *meant* to be used: offline, by a counterparty
who gates a name purchase/transfer on `verifyProofBundleStructure` /
`verifyProofBundleAgainstBitcoin`. Both report `valid` for a fabricated
membership. **Undisclosed in STATUS.md.**

**The fix is an architecture decision, not a mechanical edit.** The canonical
recompute (`verifyAccumulatorProof`) lives in `@ont/core`, which the frozen core
**may not import** — `trust-surface.test.ts` locks `@ont/consensus` deps to
`@ont/protocol` + `@ont/bitcoin`. To close PB1/PB3 the recompute primitive must
be available inside the boundary. Two options for DK:

1. **Move the sparse-Merkle recompute into `@ont/protocol`** (one implementation,
   shared by the core verifier and `@ont/core`'s accumulator). Cleanest; grows
   `@ont/protocol`, not the audited surface.
2. **Reimplement inline in `proof-bundle.ts`** from the `sha256`/`concat`
   primitives already imported. No boundary change, but a second copy to keep in
   sync — a divergence risk on the one thing that must never diverge.

PB2/PB5 are pure additions inside the verifier (thread `currentOwnerPubkey` into
the accumulator check; recompute hashes + verify signatures in the value-chain
check) and don't need the boundary decision.

**Recommendation:** highest priority, but the frozen core is a guarded surface
and the primitive-placement choice is DK's. I did not edit it autonomously.

---

## B. Live cheap-rail: a collision *takes* a name instead of nullifying it

| ID | Finding | Where |
| --- | --- | --- |
| **CR-02 / CR-11** (consensus) | On the live rail, a second chained anchor mapping an existing cheap-rail name to a new owner **overwrites** it (last-writer-wins). Two honest indexers with the same on-chain view but different DA-merge order converge to **different owners** (a resolver-level consensus split), and a later anchor can **take** an already-claimed name — the exact R16 award-by-ordering failure Decision #37 was written to close. | `packages/core/src/indexer.ts` `mergeVerifiedLeaves` ~707-728 |
| **ONT-AUC-001** (grief-enabler) | The only notice-window implementation (`packages/core/src/research/batch-rail.ts`) predates #37: ≥2 bare claims classify `contested`→escalate-to-auction with **no bond gate** — the superseded rule. The exported reference-lifecycle classifier and the "acquisition state machine" test suite pin **pre-#37 consensus semantics** while the spec says the opposite. | `research/batch-rail.ts` |

The root cause is the same as the disclosed DA gap: **Decision #37's
nullification has no enforcement point anywhere** — `nullif` appears in zero
source files. STATUS discloses that the fail-closed deadline is design-only, but
it does **not** disclose that, in the meantime, the live rail's conflict
behavior is last-writer-wins **and that a later anchor can re-map an existing
name**. Today it's masked only by the honest single-writer signet posture.

**Recommended near-term fix (does not require building the full notice window):**
in `mergeVerifiedLeaves`, before overwriting, look up the existing
`accumulatorNames` record; if one exists with a *different* owner from a
*different* anchor, **do not overwrite** — hold the name in a contested/nullified
set pending the (designed) notice-window resolution. That removes the
take-an-existing-name vector immediately. Pair with a STATUS disclosure of the
current behavior.

---

## C. Settlement / recovery: authority gaps (consensus)

| ID | Finding | Where |
| --- | --- | --- |
| **REC-09** (consensus) | `applyRecoverOwnerRequest` performs **no owner-key signature check** (unlike `applyTransfer`) — authorization is bond-spend + off-chain proof availability only. A `RECOVER_OWNER` on a name that never armed recovery, carrying no valid owner signature, is accepted. Decision #40's opt-in **arming** is unenforced: `NameRecord` stores no committed `recoveryDescriptorHash`. | `engine.ts applyRecoverOwnerRequest` |
| **XFER-07** (consensus, Decision #30) | A mature transfer authorization commits only to `prevStateTxid + newOwnerPubkey + flags + successorBondVout` — **not to the paying transaction**. A free-floating mature-sale signature can be lifted into an attacker-built tx spending an unrelated outpoint and still transfers the name (no cooperative-PSBT payment binding). | `events.ts computeTransferAuthorizationDigest` |

Both are consensus-authority gaps in code that Decision #42 is slated to fold
*into* the frozen core — so they become the correctness gate for that move.
The recovery-signature gap (REC-09) is the sharper of the two: it's an
authorization bypass independent of the unbuilt notice window.

---

## D. Resolver integrity (funds-misdirection + reorg correctness)

| ID | Finding | Where |
| --- | --- | --- |
| **MR1** (funds-misdirection) | Client-side multi-resolver fanout picks canonical by **longest chain with zero cryptographic verification** — one malicious resolver serving a forged-but-longer value-record chain is promoted canonical, honest resolvers labeled "lagging." Where value payloads carry payment destinations, this misdirects funds. **Not in the frozen core** — fixable in `apps/web`. | `apps/web/src/resolver-fanout.ts:~297` |
| **REORG3** (integrity) | After a shallow reorg that orphans then re-mines a cheap-rail anchor, the resolver poll loop does not auto-recover the accumulator name — state stays permanently inconsistent (a confirmed anchor missing) until manual checkpoint restore. | `apps/resolver/src/index.ts:276,305-317` |
| (gap) | `getCurrentValueRecordHistory` hardcodes `hasForks: false` — the resolver can never surface a value-chain fork, defeating the multi-resolver "conflict via hasForks" detection. | `apps/resolver/src/index.ts:~1555` |
| (gap) | In-process `ingestBlock` has no continuity/reorg guard (no `height == currentHeight+1`, no prevHash linkage) — reorg replay relies entirely on the caller. | `packages/core/src/indexer.ts:~260` |

MR1 is the most actionable here: gate canonical selection behind per-record
`computeValueRecordHash` recompute + signature verification *before* any
longest-chain comparison. Self-contained, outside the frozen core.

---

## E. What actually works (the reassuring half)

The auction rail is solid where it's built. **Passing** (sample of 40 green
scenarios): bond-opens-auction and bond-first escalation; below-floor-bond
rejection; **soft close** — a bid inside the closing window extends it
(125→126) and a late bid after true close is rejected; highest-bond-wins with
3+ bidders; duplicate-bid-txid and non-highest-winner rejection by the proof
bundle; settle→immature→mature→transfer; early-losing-bond-spend flagged
`spent_before_allowed_release`; value-record sequence replay / gap /
wrong-owner / ownershipRef-mismatch rejection; snapshot save/restore round-trip
preserving **both** L1 and accumulator names (the PR #15 regression stays
fixed); proof-bundle highest-listed-bid + distinct-bid well-formedness. The
soft-close mechanics in particular behaved exactly to spec.

---

## Suggested sequencing

1. **PB2/PB5** — pure additions inside the verifier; close them now (no boundary
   decision). **PB1/PB3** — bring DK the primitive-placement choice (§A), then
   close. Highest value: it's the audited surface and the headline claim.
2. **CR-02/CR-11 overwrite guard** — small change in `mergeVerifiedLeaves`,
   removes the take-an-existing-name vector before the notice window is built;
   plus a STATUS disclosure.
3. **REC-09** — add the owner-key signature check to `applyRecoverOwnerRequest`
   (mirror `applyTransfer`); enforce recovery arming.
4. **MR1** — verify-before-longest-chain in `resolver-fanout.ts`.
5. **REORG3** + reorg guards — resolver auto-recovery after re-mined anchors.
6. **STATUS.md** — disclose the live-rail conflict behavior and the proof-bundle
   soundness scope until §A lands.

## Promotable test assets

The campaign wrote self-contained, twice-green test files for each area
(acquisition, auction, settlement, resolver-integrity). The proof-bundle
reproductions are committed here; the others are reconstructable from the
scenario catalogs in the run record and should be promoted into CI alongside
each fix (a fix without its reproducing test re-opens the gap).

## Sources
- `packages/consensus/src/proof-bundle.ts`, `proof-bundle.soundness-gaps.test.ts`
- `packages/core/src/indexer.ts`, `research/batch-rail.ts`
- `apps/resolver/src/index.ts`, `apps/web/src/resolver-fanout.ts`
- `docs/core/DECISIONS.md` #27, #30, #37, #40, #42 · `docs/core/STATUS.md`
