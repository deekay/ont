# @ont/consensus - purpose, scope, tests

*(Written purpose/scope/tests statement required for every new component by the
nothing-is-precious amendment to clean-build (#46).)*

## Purpose

The ownership kernel of the rebuild: the pure, audited boundary that decides
name state from witnessed inputs. `@ont/consensus` owns every rule that can
change who owns a name: anchor acceptance, data-availability eligibility,
gate-fee validation, transcript completeness, batched-path lifecycle,
auction settlement, bond continuity and maturity, transfer authority,
recovery authority, and value-record authority.

The package implements SOFTWARE_CANON layer 2:
[docs/core/SOFTWARE_CANON.md](../../docs/core/SOFTWARE_CANON.md). It must be
deterministic and replayable: ordered event bytes, prior kernel state,
witnessed chain facts, and witnessed evidence in; name state and verdicts out.
No database, network, wall clock, UI, adapter judgment, or evidence-layer
override may enter a kernel verdict.

## Scope

- IN: B2 rule families from
  [docs/core/B2_KERNEL_HARDENING.md](../../docs/core/B2_KERNEL_HARDENING.md):
  anchor acceptance (A*), DA verdicts (D*), gate-fee validation (F*),
  transcript completeness (T*), batched-path transitions (B*),
  value-record authority (V*), reorg/replay determinism (Z*), settlement
  consequences (S*), recovery authority (R*), transfer authority (X*),
  winner selection and bid acceptance (Q*), and kernel-wide glue (G*).
- IN: parameterized verdicts whose authority is legally derivable today,
  plus provisional vectors only when they carry `decisionDeps` and
  `flipMarker` for da-windows (#49) or recovery-auth (#50).
- OUT: byte-level event grammar and signature/digest construction
  (`@ont/wire` / B1), Bitcoin header and inclusion witnessing, served-bytes
  proof construction, transcript witness construction, resolver/publisher
  transport, persistence, and UI. Those layers may witness facts, but they
  never decide kernel outcomes.
- OUT until named spec PRs land: every `spec-blocked` flag in
  [docs/core/B2_SPEC_PR_REGISTRY.md](../../docs/core/B2_SPEC_PR_REGISTRY.md).

## Tests

Tests-first per clean-build (#46): the B2 conformance suite is written and
reviewed before implementation changes lock. The suite is the contract; old
code is only mining material.

- [docs/core/B2_STEP4_CLASSIFIED.json](../../docs/core/B2_STEP4_CLASSIFIED.json)
  is the triage source of truth: every attack flag is classified as
  `vector-now`, `provisional-vector`, `spec-blocked`, or
  `retired-with-reason`.
- [docs/core/B2_VECTOR_NOW_DRAFT.json](../../docs/core/B2_VECTOR_NOW_DRAFT.json)
  is the current proposed vector draft for the 68 flags legally authorable
  today. These rows are intentionally `status: "proposed"` until
  predicate-specific executable fixtures replace the draft input sketches.
- [scripts/b2-vector-now-draft.mjs](../../scripts/b2-vector-now-draft.mjs)
  regenerates and checks the vector-now draft. Its `--check` mode proves
  exact coverage: all 68 `vector-now` rows are present once, and no
  provisional, spec-blocked, or retired row is included.
- `src/b2-boundary.test.ts` is the first executable B2 gate: production
  `@ont/consensus` modules must not import filesystem, network, process,
  timer, or clock channels, and must not read host-time/browser/network
  globals such as `Date`, timers, `fetch`, or storage.
- Future executable vector tests must trace doc citation -> vector id ->
  implementation path, using `attackFlagRef` from the hardened schema. A
  vector may move from `proposed` to `locked` only after the executable input
  shape and expected verdict have passed adversarial review.
