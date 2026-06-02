# ONT documentation

## Start here

**[ONT.md](./ONT.md) — the single source of truth** for what ONT is, why it matters, and how it
works. If you read one thing, read that. Everything below is secondary to it.

For a fresh builder or reviewer, read **[core/CURRENT_ARCHITECTURE_BRIEF.md](./core/CURRENT_ARCHITECTURE_BRIEF.md)**
next. It is the current handoff after the cleanup pass: active design, active code entrypoints,
retired paths, verification baseline, and recommended next work.

## Design reference (the depth behind ONT.md)

- **[design/ONT_SOVEREIGNTY_MAP.md](./design/ONT_SOVEREIGNTY_MAP.md)** — the minimal set of rules
  that guarantee no one can take your name, mapped to the code.
- **[core/CURRENT_ARCHITECTURE_BRIEF.md](./core/CURRENT_ARCHITECTURE_BRIEF.md)** — current builder
  handoff and anti-archaeology map for humans and LLMs.
- **[design/ONT_ACQUISITION_STATE_MACHINE.md](./design/ONT_ACQUISITION_STATE_MACHINE.md)** — the
  current acquisition reference: claim, notice, uncontested finality, and contested auction escalation.
- **[design/README.md](./design/README.md)** — the curated design index: requirements,
  conformance, the data-availability rule, the scaling design, risks, and the signet prototype.
- **[core/SIMPLIFICATION_AUDIT.md](./core/SIMPLIFICATION_AUDIT.md)** — current cleanup map for
  collapsing historical exploration into the main protocol path.

## Launch & review (`docs/launch/`)

Working material for getting to launch. The current launch brief is
[`ONT_LAUNCH_V1_BRIEF.md`](./launch/ONT_LAUNCH_V1_BRIEF.md). Retired launch
paths have been moved out of this folder so the active launch docs stay clean:

- Current: `ONT_LAUNCH_V1_BRIEF`, `CONTESTED_AUCTION_REFERENCE` (contested-auction reference),
  `ONT_IMPLEMENTATION_AND_VALIDATION`, `ONT_PARAMETER_REVIEW_PACKET`.
- Historical snapshots: `research/archive/retired-launch/`.
- Bitcoin reviewers: [ONT_ONE_PAGER](./ONT_ONE_PAGER.md) + [ONT_DESIGN_BRIEF](./ONT_DESIGN_BRIEF.md) (older review packets are archived under `research/archive/`).
- Auction working docs: `AUCTION_*`.

## Running it (operational)

How to run the prototype and demos — not conceptual reading.

- [core/SELF_HOSTING.md](./core/SELF_HOSTING.md), [core/ARCHITECTURE.md](./core/ARCHITECTURE.md),
  [core/TESTING.md](./core/TESTING.md), [core/NEW_USER_TESTING_GUIDE.md](./core/NEW_USER_TESTING_GUIDE.md)
- Demo flows: [demo/](./demo/) · Operators: [operators/](./operators/)

## Notes & explorations (`docs/research/`)

- **`docs/research/`** — secondary notes not part of the core design: product/strategy/messaging
  (`NARRATIVE_FRAMEWORK`, `USE_CASE_SCENES`, `NOSTR_STRATEGY`, …), forward-looking ideas
  (`POST_QUANTUM_AND_SIGNATURE_AGILITY`, `FUTURE_EXPLORATIONS`), and assorted design notes.
- **[research/archive/](./research/archive/)** — **superseded explorations**, isolated and kept only for provenance
  (sponsor credits, Ark/RGB, the "open collider" / public-log passes, the early scaling survey, and
  retired launch paths).

**Authoritative: [ONT.md](./ONT.md) + [design/](./design/).**
