# ONT Software Canon — the clean-build plan

> **Status: DRAFT — pre-ratification.** This is the B0 artifact for
> **clean-build (#46, proposed)**: the blank-page reimplementation of all ONT
> software from the canon docs. Synthesized 2026-06-11 from DK's directive
> (assume all existing software is bad; rewrite with the care the docs got),
> ClaudeleLunatique's B0 brief, and ChatLunatique's adversarial passes.
> Nothing below is binding until DK ratifies item by item; the ratified
> version becomes the clean-build entry in [DECISIONS.md](./DECISIONS.md)
> and this doc becomes the standing plan.

## The premise

The docs are now a recurated, reviewed canon (doc-canon (#45)). The software
is not: it grew code-first through speculative and dead-end experiments, and
the docs were written to catch up with it. clean-build inverts that for good:
**the software becomes an implementation of the docs.** Every package is
rewritten from the spec as if no code existed, with the same
writer → adversarial review → DK-merge discipline the recuration used.
Careful planning over fast implementation.

## Layer vocabulary (ratify these names; "core" retires as a loose word)

| Layer | Name | What it is | New package |
| --- | --- | --- | --- |
| L1 | **wire layer** | name grammar, canonical encoding/decoding, event/payload formats, signatures, constants | `@ont/wire` |
| L2 | **ownership kernel** | **the audited boundary (frozen at launch), complete**: every rule that decides name state, as pure deterministic predicates — ordered, witnessed inputs in; name state out. Includes claim lifecycle, settlement, *and* the eligibility rules (anchor acceptance, the fail-closed data-availability deadline verdict, aggregate gate-fee validation, auction-transcript completeness) and the batched-path state transitions (merge, first-anchor-wins). No DB, no network, no clock, no UI | `@ont/consensus` (keeps its earned name) |
| L3 | **evidence layer** | non-deciding: constructs and verifies the *witnessed facts* the kernel consumes, and the proofs clients carry — Bitcoin header/inclusion verification, accumulator membership-proof construction, proof-bundle assembly, witness gathering | `@ont/evidence` (working name) |
| L4 | **adapters** | non-authoritative services: publisher (write side), indexer/resolver (read side). They convey and convince; they never decide | `apps/publisher`, `apps/resolver` |
| L5 | **surfaces** | web/explorer, wallet, CLI, claim site, mobile — all consuming L1–L4 APIs, never reimplementing rules | `apps/*` |

**The boundary rule, stated once:** if a rule can change who owns a name —
whether an anchor counts, whether a batch's bytes surfaced in time, whether
the fees covered the batch, whether a transcript is complete enough to award —
it lives in the kernel, as a pure predicate over witnessed inputs. The
evidence layer *witnesses* facts (and can be swapped, sharded, or distrusted);
it can never override a kernel verdict. This closes, rather than re-creates,
today's split where settlement and finalization rules sit outside the audited
boundary (settlement-into-core (#42), and the queued anchor-acceptance and
gate-fee rules per STATUS's Known-incomplete).

The word "core" without qualification is retired (glossary law applied to
architecture vocabulary). `packages/core`'s name dies with the rewrite.

## The rules (B0 items for ratification)

**Item 1 — Docs are the spec; only ratified sections are law.** New code
implements the **normative** sections of `docs/spec/`, the glossary, and
STATUS parameters, with [`ONT.md`](../ONT.md) as the plain-language tiebreak.
Not everything in `spec/` is equally normative today — some files carry
candidate/design-analysis status. A **spec normativity ledger** (part of the
Item 3 inventory) classifies every spec file/section as `normative`,
`candidate`, or `analysis`; code implements only `normative`. A `candidate`
section becomes law only through a named spec PR (writer/reviewer/merge).
Code never invents a rule: when implementation finds a gap or contradiction,
the loop is **stop → named spec PR → then code**, even when it slows a phase.

**Item 2 — Existing code is evidence and test material, not source of
truth.** Nothing is copied forward by default. Two artifact classes are
*mined*: golden/conformance vectors (wire-size pins, root-anchor codec
vectors pinned byte-identical against the BDK spike, the 12-word-secret
cross-surface vectors, proof-bundle fixtures) and documenting tests that
encode decided behavior — re-expressed against new APIs, with
pre-bond-opens (#37) ones rewritten to the current rule, never ported blind.
Old code may be read to answer "how did we handle X," but the answer routes
through the spec (Item 1) before entering new code.

**Item 3 — Inventory, normativity, and quarantine before anything else.**
The B1-blocking deliverable is a ledger (`SOFTWARE_INVENTORY.md`) with two
halves:
- **Code:** every current package and app classified
  **keep-as-reference** / **rewrite** / **retire** / **unknown**, each entry
  naming the doc rule(s) it maps to. Unknowns (today: `packages/architect`,
  `packages/db`, the `apps/indexer` vs `apps/resolver` split) must resolve
  before their layer's phase starts.
- **Spec:** the normativity classification from Item 1, recorded as a status
  header in each spec file.
Old code moves to quarantine (location: DK call, see open calls) with
pointers, mirroring `research/archive/`. Nothing is deleted.

**Item 4 — Tests before implementation; traceability as the acceptance
standard.** Each phase opens with its conformance suite written and reviewed
*before* implementation. The standard, per ownership-affecting rule:
**doc citation → executable test/vector → implementation path.** A rule
without a normative doc citation doesn't get implemented (spec PR first); a
doc rule without a test isn't done. Negative tests are first-class: a lying
resolver, a withholding publisher, an omitted auction bid, or a forged
summary must provably be unable to mint, steal, or falsely finalize a name.

**Item 5 — Inside-out phasing with hard gates.**

- **B1 — wire layer.** Pure functions, no I/O. Name grammar, canonical
  encode/decode, owner-key derivation/signatures, transfer/recovery/
  value-record shapes, bid/claim payloads, constants. *Gate:* all mined
  vectors pass byte-identical; line-for-line conformance map to the spec's
  wire sections.
- **B2 — ownership kernel.** The complete audited boundary as pure
  deterministic predicates: claim gate, notice window, uncontested finality,
  no-bond nullification (bond-opens (#37) native), bond-opens-auction,
  highest-qualifying-bond wins, **settlement-into-core (#42) built in
  natively** (winner-becomes-owner inside the kernel), bond
  maturity/continuity, transfer/recovery/value-record authority, **and the
  eligibility rules**: anchor acceptance, the ratified fail-closed
  data-availability deadline verdict (mechanism per the pre-B2 spec decision
  below), aggregate gate-fee validation, auction-transcript completeness,
  and the batched-path state transitions (merge, first-anchor-wins). The
  boundary-manifest (#44) CI lock is born with the package. *Gate:* a
  documenting test for every DECISIONS entry that names a consensus rule;
  property tests over event orderings (reorg/permutation invariance where
  the spec claims it); ChatLunatique signs the CONSENSUS_PARAMS surface;
  zero I/O imports (enforced by a research-quarantine-style test).
  **Required pre-B2 spec decision (named spec PR):** the fail-closed
  data-availability mechanism's form — separate availability marker vs
  folded into the anchor — is an open first-class question
  ([OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) §1.1) and must be ratified
  before the kernel's deadline verdict implements. B0 does not choose it.
- **B3 — evidence layer.** Non-deciding construction and verification:
  Bitcoin header/inclusion verification, accumulator membership-proof
  construction, proof-bundle assembly (including the auction transcript the
  kernel's completeness predicate consumes), witness gathering. The research
  sims retire to quarantine the way superseded docs did. *Gate:* the
  convergence adversarial cases (withholding, hide-then-reveal,
  multi-publisher merge) pass as production tests against the B2 kernel;
  scale numbers measured and R11 in [RISKS.md](../RISKS.md) updated; a
  swapped or hostile evidence implementation cannot change any kernel
  verdict (negative-test battery).
- **B4 — adapters.** Publisher (pay-first, quotes, anchoring,
  data-availability serving, per-leaf loss detection + refund), indexer/
  resolver consuming the B2+B3 path end-to-end (the canonical-root
  derivation today's resolver never wired), multi-publisher-ready shape even
  if deployed single-writer. *Gate:* the full batched-claim-path loop runs
  on signet on the new stack; the negative-test battery passes against live
  adapters.
- **B5 — surfaces.** Web/explorer, wallet, CLI, claim site, mobile (scope:
  DK call). All rules consumed via L1–L4 APIs. *Gate:* the operate/demo
  walkthroughs pass on the new stack; user-facing copy obeys the glossary;
  parity review against the old surfaces before cutover.

**Phase sequencing:** implementation for phase N+1 may not begin until phase
N is merged. *Reviewed* interface tests and design spikes for N+1 are allowed
earlier — encouraged, even, since B3's witness shapes may expose B2 interface
mistakes — but they merge as tests/notes, never as implementation.

**Item 6 — One live system; deliberate cutover.** The signet deployment
(claim site + explorer) keeps running on the old stack until the relevant
phase passes parity, then cuts over visibly. No silent breakage of the live
demo. Cutover schedule per phase vs big-bang: DK call (open calls).

**Item 7 — Process and review.** One branch per phase (`clean-build-b1`, …).
Writer: ClaudeleLunatique. Adversarial reviewer: ChatLunatique, with an
explicit hunting list per gate — old-model leakage (pre-bond-opens
semantics, retired vocabulary), server-authority leakage (an adapter or the
evidence layer deciding anything), accidental preservation of dead
experiments, missing negative tests, and doc-rule gaps. DK merges. STATUS.md
is updated in the same PR that changes what is real. Spec gaps produce named
spec PRs, never inline improvisation.

## Current inventory (snapshot @ main 60d4673; ledger to follow as Item 3's deliverable)

| Unit | Lines (TS) | Initial read | Likely fate |
| --- | --- | --- | --- |
| packages/protocol | ~3.8k | wire layer, vector-rich | rewrite → `@ont/wire` (B1) |
| packages/consensus | ~2.0k | audited core, 3 CI-locked files | rewrite → `@ont/consensus` (B2) |
| packages/core | ~11.1k | machinery + research sims; most experiment-infected; name collision | rewrite → split across `@ont/consensus` (state transitions) and `@ont/evidence` (proofs); name retires |
| packages/bitcoin | ~2.2k | RPC/Esplora plumbing | audit; likely rewrite (B3/B4 support) |
| packages/architect | ~1.4k | **unknown** | classify at inventory |
| packages/db | ~1.1k | persistence | **unknown**; classify (adapters-only by the boundary rule) |
| apps/publisher | ~2.3k | write-side adapter | rewrite (B4) |
| apps/resolver + apps/indexer | ~3.4k | read-side; split unclear | classify, then rewrite (B4) |
| apps/web | ~17.0k | largest unit; site/explorer/tools | rewrite (B5) |
| apps/wallet | ~4.7k | wallet CLI; 2/72 pre-existing test failures | rewrite (B5) |
| apps/cli | ~6.5k | operator/prototype CLI; demo residue suspected | classify, then rewrite (B5) |
| apps/claim | ~1.0k | self-contained claim site | rewrite (B5) |

~57k lines total. Calibration: the docs recuration covered ~60 files in three
phases at ~4 review rounds each.

## Open calls (DK decides at ratification)

1. **Where new code lives:** parallel packages in this repo with in-place
   quarantine (continuous history, existing CI/deploy plumbing — writer's
   lean) vs a greenfield repo (cleanest psychology, costs history).
2. **Quarantine location:** `legacy/` directory vs a frozen branch.
3. **Package names:** ratify `@ont/wire`, `@ont/consensus`, `@ont/evidence`
   (or better names) now, so they never churn.
4. **Mobile:** in B5 or a separate effort.
5. **Cutover policy:** per-phase signet cutover (faster feedback, riskier)
   vs big-bang at B4/B5 parity (safer, longer double-maintenance).
6. **B2 test bar for a freeze candidate:** vectors + property + documenting
   tests, or additionally an external audit before the boundary freezes
   (interacts with the launch timeline and boundary-manifest (#44)).
