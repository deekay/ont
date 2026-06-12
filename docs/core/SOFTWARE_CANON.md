# ONT Software Canon — the clean-build plan

> **Status: RATIFIED 2026-06-11.** This is the B0 artifact for
> **clean-build (#46)**: the blank-page reimplementation of all ONT software
> from the canon docs. Synthesized 2026-06-11 from DK's directive (assume all
> existing software is bad; rewrite with the care the docs got),
> ClaudeleLunatique's B0 brief, and ChatLunatique's adversarial passes.
> DK ratified all seven items in an item-by-item walk (Sprout 'ONT - dev',
> Items 1–7), including two amendments raised during the walk
> (normative hardening; nothing-is-precious), and ruled all six open calls.
> This doc is the standing plan; the decision record is the clean-build
> entry in [DECISIONS.md](./DECISIONS.md).

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

**Normative-hardening amendment (ratified during the walk).** R1–R3
battle-tested the docs' *structure and vocabulary*, not the content of the
rules, so nothing is grandfathered: at initial classification **no section
enters the ledger as `normative`** — rule-bearing sections enter as
`candidate` (the rest as `analysis`), and `normative` is a status **earned by
surviving attack**. Promotion runs a five-step hardening per section:

1. **Rule extraction** — the section's binding rules restated as crisp,
   testable invariants;
2. **Source check** — each rule cites its authority
   ([ONT.md](../ONT.md), [DECISIONS.md](./DECISIONS.md), STATUS) or stays
   `candidate`;
3. **Adversarial content pass** — ChatLunatique attacks the rules themselves:
   old-model leakage, server-authority leakage, grief/economic edges,
   reorg/timing, missing-data, omitted-bid/transcript cases;
4. **Attacks become tests** — every accepted attack lands as an executable
   negative test or vector in the phase's conformance suite;
5. **Section-level sign-off** — DK ratifies the promotion.

Roles: ClaudeleLunatique extracts, classifies, and proposes tests;
ChatLunatique attacks content; DK ratifies every promotion and resolves
conflicts. Timing is **per-phase, just-in-time**: phase N's implementation is
blocked until the sections it implements are hardened; hardening for phase
N+1 may run during phase N (it is review work, not implementation — B2 kernel
hardening may start during B1).

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
Old code moves to quarantine — the in-tree `legacy/` directory (ruled
calls), excluded from build/test/lint — with pointers, mirroring
`research/archive/`. Nothing is deleted.

**Item 4 — Tests before implementation; traceability as the acceptance
standard.** Each phase opens with its conformance suite written and reviewed
*before* implementation. The standard, per ownership-affecting rule:
**doc citation → executable test/vector → implementation path.** A rule
without a normative doc citation doesn't get implemented (spec PR first); a
doc rule without a test isn't done. Negative tests are first-class: a lying
resolver, a withholding publisher, an omitted auction bid, or a forged
summary must provably be unable to mint, steal, or falsely finalize a name.

**Item 5 — Inside-out phasing with hard gates.** Each phase opens with its
spec sections **hardened** (Item 1 amendment) and its conformance suite
written and reviewed, and closes through its gate:

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
  folded into the anchor — **decided 2026-06-11: marker-fold (#47), fold**
  (the separate marker is retired, wire event 0x0d retired-never-reuse;
  all deadlines key off the anchor's mined height — see
  [DECISIONS.md](./DECISIONS.md) entry 47 and
  [research/DA_MARKER_FOLD.md](../research/DA_MARKER_FOLD.md)). B0
  deliberately did not choose it; the choice was made by named ruling as
  this section required. The kernel's deadline verdict implements the
  folded form.
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
- **B5 — surfaces.** Web/explorer, wallet, CLI, claim site (mobile is a
  separate effort after B5 — see ruled calls). All rules consumed via L1–L4
  APIs. *Gate:* the operate/demo walkthroughs pass on the new stack;
  user-facing copy obeys the glossary. No parity review against the old
  surfaces — the bar is the hardened spec and the walkthroughs, never
  behavioral equivalence with quarantined code (Item 6).

**Phase sequencing:** implementation for phase N+1 may not begin until phase
N is merged. *Reviewed* interface tests and design spikes for N+1 are allowed
earlier — encouraged, even, since B3's witness shapes may expose B2 interface
mistakes — but they merge as tests/notes, never as implementation.

**Item 6 — Nothing is precious; the new system replaces, it does not
coexist** *(inverted from the drafted "one live system / parity cutover" by
DK during the walk)*. The deployed signet components — claim site, explorer,
publisher, resolver — have **no protected status**. They may be taken down
and stay down until the new stack earns deployment through its own gates;
being out of commission for a while is an accepted cost of getting the new
software right.

- **No parity requirement.** The bar for new software is the hardened spec
  and its conformance + negative suites — never behavioral equivalence with
  code we officially assume is bad.
- **Every new component states its purpose before it is built.** A written
  purpose/scope/tests statement (what it is for, why it exists, what is
  included, how it is tested) is part of each component's opening — rigor
  about why each piece of software exists replaces rigor about keeping old
  pieces alive.
- **Deliberate decommission replaces deliberate cutover.** Taking a live
  component down is an announced event with STATUS.md updated in the same
  change — visible, never silent.
- Old code is still quarantined readable-not-running (Item 3); quarantine is
  for mining, not for keeping services warm.

**Item 7 — Process and review.** One branch per phase (`clean-build-b1`, …);
each phase merges whole through its gate or doesn't merge. Writer:
ClaudeleLunatique. Adversarial reviewer: ChatLunatique, at **two layers** —
spec *content* before a phase (the Item 1 hardening pass) and *code* at the
gate, with an explicit hunting list per gate: old-model leakage
(pre-bond-opens semantics, retired vocabulary), server-authority leakage (an
adapter or the evidence layer deciding anything), accidental preservation of
dead experiments, missing negative tests, and doc-rule gaps. The hunting
list is written down per phase so review is checkable, not vibes. DK merges.
STATUS.md is updated in the same PR that changes what is real — including
components decommissioned under Item 6. Spec gaps produce named spec PRs,
never inline improvisation.

## Pre-inventory snapshot (B0, @ main 60d4673) — SUPERSEDED

> This table is the initial-read snapshot the B0 plan was written from,
> preserved for the record. The Item 3 deliverable that supersedes it is
> [SOFTWARE_INVENTORY.md](./SOFTWARE_INVENTORY.md) — fates, doc-rule
> mappings, the spec normativity ledger, and the resolution of every
> `unknown` below (including the out-of-workspace `mobile/` app this
> snapshot missed). Where the two disagree, the inventory wins.

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

## Ruled calls (DK, 2026-06-11, at ratification)

1. **Where new code lives: parallel packages in this repo**, with in-place
   quarantine. Spec and code share one repo and one history; traceability
   (doc-cite → test → impl) and same-PR STATUS.md updates depend on it. A
   second repo would reintroduce spec/code drift.
2. **Quarantine location: `legacy/` directory in-tree.** Old code is mining
   material for golden vectors and documenting tests, so it stays readable
   without branch-switching; excluded from build/test/lint so it cannot leak
   into the new stack.
3. **Package names ratified: `@ont/wire`, `@ont/consensus`,
   `@ont/evidence`.** Adapter and surface package names are coined at B4/B5
   when their shapes are real.
4. **Mobile: a separate effort after B5.** The B5 gate is not hostage to
   mobile toolchains. B3/B4 design the wallet-proof and resolver interfaces
   with mobile as a *named consumer*, so the later effort consumes `@ont/*`
   packages rather than re-deriving them.
5. **Decommission timing: live signet components come down at B1 start.**
   One announced decommission event, STATUS.md updated in the same change
   (Item 6). Signet returns only when new phases earn deployment through
   their gates.
6. **B2 test bar: the conformance/negative/property suites (plus hardened
   spec) gate B3.** An external audit is scheduled when the kernel freezes
   and runs concurrently; findings become named spec PRs. The audit becomes
   a hard gate before anything mainnet-facing (interacts with
   boundary-manifest (#44)).
