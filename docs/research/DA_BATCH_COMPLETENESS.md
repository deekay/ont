# Decision paper: batched-set completeness enforcement (proposed name: `batch-completeness`)

> **Status: PROPOSED — decision-ready for DK. Writer ClaudeleLunatique; awaits
> ChatLunatique adversarial pass.** This is **new consensus law** (a kernel
> gating requirement), **NOT agent-decided — DK ratifies.** Surfaced from the
> 2026-06-15 DA thread with DK; sibling to `availability-height` and
> da-trust-model ([DECISIONS](../core/DECISIONS.md) #82). Marker-fold-style
> paper, in the form of [`DA_WINDOWS.md`](./DA_WINDOWS.md) (#49) and
> [`DA_MARKER_FOLD.md`](./DA_MARKER_FOLD.md) (#47).

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
`includable(anchor, evidence, W, C)` requires the served-bytes witness to
reconstruct the anchored root over **all N committed leaves** (or prove
non-membership for absent slots) by `h+W+C`; any missing leaf → the **whole
batch** fails closed. Withholding becomes self-harm (a producer only kills its
own batch) and detectable (a count mismatch is loud).

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
- **Cost (stated plainly):** an honest producer must keep all N retrievable
  through the `h+W+C` window or lose the whole batch. Mitigated by the
  da-trust-model honest-mirror-market + content-addressed mirroring (anyone can
  re-serve digest-matching bytes). The granularity cost (one missing leaf kills
  N) is acceptable because the producer controls its own batch (self-harm), and
  high-value names route to direct-L1 / bonded anyway.

## The convergence with D-CV (why this is not extra scope)

O2 requires the canonical-root derivation (D-CV) **projection to carry per-leaf
identity** — at minimum `(name, ownerKey or owner-commitment, anchor coords)` —
so completeness can be checked **and** a same-owner duplicate distinguished from
a distinct-owner collision. That is exactly ChatLunatique's open D-CV blocker
(the projection emits only `{name, contributingBatchIds}`, no owner key). So
`batch-completeness` and the D-CV fix land **together**: ratifying O2 gives D-CV
the richer projection it already needs.

## Ratification gate — the 6-test matrix (tests-first; no implementation until ratified)

Each becomes a conformance vector before any kernel change:

1. **full-N required** — a witness covering N−1 of N leaves → batch *not*
   includable (fail closed).
2. **hidden-claim no-effect** — a withheld/absent leaf cannot nullify, open an
   auction, or beat a visible claim (inherits #37 / #69).
3. **mirror-lies-fail** — bytes that do not reconstruct the anchored root →
   rejected, regardless of source.
4. **projection-carries-owner** — the D-CV input identifies per-leaf owner so a
   distinct-owner collision ≠ a same-owner duplicate; fail closed if it cannot.
5. **copied-anchor grief-not-steal** — a copied anchor label starts the victim's
   clock but the copier never becomes owner; victim fails closed *(inherited
   from da-trust-model #82)*.
6. **finalize-once** — an in-window-complete verdict locks; later byte-loss does
   not revoke it *(inherited from da-trust-model #82)*.

Tests 1–4 are `batch-completeness`'s own; 5–6 are inherited invariants.

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

O2 vs O3 (and acceptance of O2's whole-batch granularity cost). On ratification:
write DECISIONS #83, build the 6-test suite, then implement the `includable`
completeness conjunct + the D-CV projection enrichment — tests-first, no
implementation before ratification.
