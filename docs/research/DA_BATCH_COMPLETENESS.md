# Decision paper: batched-set completeness enforcement (proposed name: `batch-completeness`)

> **Status: PROPOSED — DECISION-READY for DK. Writer ClaudeleLunatique; reviewer
> ChatLunatique — ROUND-2 SIGN-OFF (event 552a49a9): O2 > O3, classification
> confirmed.** This is **new consensus law** (a kernel gating requirement),
> **NOT agent-decided — DK ratifies O2 vs O3.** Surfaced from the 2026-06-15 DA thread with DK; sibling to
> `availability-height` and da-trust-model ([DECISIONS](../core/DECISIONS.md)
> #82). Marker-fold-style paper, in the form of [`DA_WINDOWS.md`](./DA_WINDOWS.md)
> (#49) and [`DA_MARKER_FOLD.md`](./DA_MARKER_FOLD.md) (#47).

## The question

A `RootAnchor` already commits `batchSize` (u32) on-chain
(`prevRoot ‖ newRoot ‖ batchSize`, [WIRE_FORMAT §4.4](../spec/WIRE_FORMAT.md)).
Today that count is **committed-but-informational**: the kernel `includable`
predicate does not require the served-bytes witness to demonstrate *all N*
committed leaves. Should `batchSize` be promoted to **kernel-enforced
completeness** — a batch counts only when the complete N-leaf bundle is
presentable and checks against the anchored root?

## Why this is consensus-law, not byte layout or evidence construction

A rule that decides which batches/leaves are *eligible* is kernel law (the canon
boundary rule). Promoting `batchSize` from informational to a gating conjunct of
`includable` changes **what the kernel accepts**. It is not wire (the field
already exists) and not evidence construction (the witness already exists —
D-CW / D-SB-bind, the B3 evidence-layer hardening deliverables); it is the
**predicate requirement**. That is DK's.

## Options

**O1 — informational `batchSize` (status quo).** The count is committed but
unchecked; a producer can serve a subset and the predicate cannot tell the set
was truncated. **Reject** — it defeats the field's purpose and leaves both
silent omission and silent long-tail contention undetectable.

**O2 — kernel-enforced whole-batch completeness *(recommended)*.**
`includable(anchor, evidence, W, C)` requires an **exact complete delta witness**
by `h+W+C`: exactly `batchSize` unique canonical leaf keys, applied to the
specified base (`prevRoot` / the D-CV base snapshot), **recompute the anchored
`newRoot`**. Membership proofs for N presented leaves are *not* sufficient — they
do not prove that no leaf was omitted; only the full `prevRoot → newRoot` replay
does (a bad implementation could otherwise accept "N leaves verify against
`newRoot` and `N == batchSize`" while `newRoot` actually contains extra unserved
leaves). Any count mismatch, duplicate key, malformed leaf, unverifiable owner
binding, or replay that cannot derive `newRoot` from `prevRoot` fails the **whole
batch** closed. Withholding becomes self-harm (a producer only kills its own
batch) and detectable (the replay simply will not close).

**O3 — per-leaf completeness.** Each leaf is independently includable if its own
bytes serve; `batchSize` stays informational. Gentler (one missing leaf does not
kill the batch) but it **loses the completeness guarantee** — you cannot tell the
set is complete, so auditable completeness and bond-free long-tail contention
discovery are not enabled.

## Recommendation (DK rules): O2

- **Matches §6c** of the DA agreement (a batch whose bytes nobody can produce by
  `h+W+C` is uniformly excluded — already batch-level).
- **Makes the committed count meaningful:** completeness becomes auditable (the
  da-trust-model mirror market — "the box says N; this resolver shows N"), and
  contention on the cheap long tail becomes **discoverable without an L1 bond**.
- **Withholding is self-harm + detectable**, and there is no cheap hidden-
  collision grief: the bond-opens (#37) / notice-window (#69) guard already
  blocks a hidden claim from nullifying or auctioning a visible one.
- **Cost (stated plainly — it falls on users, not just the producer):** one
  malformed/missing leaf, or an honest publisher's operational failure, fails the
  **whole batch** — every user in it loses their claim until they re-anchor
  elsewhere. This is acceptable as **liveness / self-harm, never theft** (no name
  is mis-awarded), but the user-grief surface must be mitigated: **batch-size
  caps**, **pre-seal validation** (the publisher runs the full replay before
  broadcasting the anchor), **content-addressed mirrors** (any 1-of-N mirror
  satisfies availability), a **user retry/reclaim path**, and the
  **direct-L1 / bonded** path for high-value names. The granularity is the price
  of an auditable count; O3 avoids it but cannot carry the completeness story.

## The convergence with D-CV (forces part of the fix; does not fully specify it)

O2 **requires** the canonical-root derivation (D-CV) projection to carry per-leaf
owner identity, so it **closes the owner-identity hole** in ChatLunatique's open
D-CV blocker (today the projection emits only `{name, contributingBatchIds}`, no
owner key). But O2 alone does **not** fully specify D-CV — owner identity is
necessary, not sufficient. The closed projection D-CV needs is richer; per leaf,
at minimum:

- normalized name / canonical leaf key;
- owner identity, or an equality-preserving owner commitment;
- owner↔value binding material;
- anchor coordinates sufficient for deterministic ordering (plus an output-index
  / anchor-instance discriminator if multiple `RootAnchor`s per tx remain
  possible);
- batch identity + batch-local duplicate handling;
- DA verdict / first-complete-served height;
- the base-root relationship (`prevRoot` = `R_{h−K}`).

So `batch-completeness` and the D-CV fix land **together**: ratifying O2 forces
and closes the owner-identity part; the full closed projection is D-CV's own
deliverable.

## Ratification gate — the conformance matrix (tests-first; no implementation until ratified)

Each becomes a vector before any kernel change. **The core six:**

1. **full-N required** — a witness covering N−1 of N leaves → not includable
   (fail closed).
2. **hidden-claim no-effect** — a withheld/absent leaf cannot nullify, open an
   auction, or beat a visible claim (inherits #37 / #69).
3. **mirror-lies-fail** — bytes that do not recompute the anchored root →
   rejected, regardless of source.
4. **projection-carries-owner** — distinct-owner collision ≠ same-owner
   duplicate; fail closed if owner identity is absent.
5. **copied-anchor grief-not-steal** — a copied anchor starts the victim's clock
   but the copier never becomes owner *(inherited #82)*.
6. **finalize-once** — an in-window-complete verdict locks; later byte-loss does
   not revoke it *(inherited #82)*.

**Plus the exactness / timing / reorg battery (ChatLunatique's round-1
additions, the load-bearing "all N not these N" cases):**

7. **exact-N / no extras** — N−1 fails, N+1 fails, a duplicate canonical leaf key
   fails, and `batchSize = 0` / no-op anchors are **rejected** (reviewer rec,
   round-2: a zero-count exact-delta anchor must not start a DA clock or consume
   a root-chain position — matches the existing `no_op_transition` posture).
8. **replay-from-base** — membership proofs that verify against `newRoot` but
   cannot replay `prevRoot → newRoot` fail (this is what makes it "all N", not
   "these N").
9. **one bad leaf poisons the batch** — a single malformed owner-binding / bad
   proof makes the whole batch non-includable, not N−1 accepted.
10. **partial timing** — N−1 available by `h+W` with the final leaf in
    `(h+W, h+W+C]` → includable but no contested leaf holds priority; the final
    leaf after `h+W+C` → the whole batch is excluded.
11. **reorg / re-mine** — evidence bound to a stale anchor height/txid cannot
    carry to the re-mined anchor; deadlines + first-complete height re-derive from
    the current canonical anchor.
12. **projection closure** — missing owner identity, missing anchor coords,
    duplicate name/key ambiguity, or a producer-asserted `complete = true` all
    fail closed.

Tests 1, 4, 7–9, 12 are `batch-completeness`'s own; 2, 5–6 are inherited
invariants; 3, 10–11 sit on the D-SB / D-CW witness + da-windows boundary.

## Ripples

- **Wire:** none — `batchSize` is already committed. This promotes existing field
  semantics, no new event/layout.
- **Kernel (`@ont/consensus`):** `includable` gains a completeness conjunct over
  the full-N witness; the D-CV projection is enriched as above.
- **Evidence (`@ont/evidence`):** D-CW (completeness witness + range) is the
  witness this consumes — already a B3 deliverable.
- **Interaction with da-trust-model (#82):** completeness is a content/
  availability fact, checked *under* the firewall (bytes-vs-root, fail-closed);
  the count is never an authority signal, only a checkable bound.

## What DK rules

O2 vs O3 (and acceptance of O2's whole-batch granularity cost — which falls on
users in a failed batch, mitigated as above). On ratification: write DECISIONS
#83, build the full conformance matrix above, then implement the `includable`
exact-delta-replay completeness conjunct + the D-CV projection enrichment —
tests-first, no implementation before ratification.
