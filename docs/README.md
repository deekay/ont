# ONT documentation

This map is organized by reader. Pick your row, read left to right.
The structure below is the ratified documentation canon (doc-canon (#45) in
[core/DECISIONS.md](./core/DECISIONS.md)); consolidations still in flight are
marked ⏳ with today's location linked.

| You are… | Start here | Then |
| --- | --- | --- |
| **Curious newcomer** | [ONT.md](./ONT.md) — the front door | [ONT_ONE_PAGER.md](./ONT_ONE_PAGER.md) |
| **Everyone** | [GLOSSARY.md](./GLOSSARY.md) — every term, defined once | — |
| **Bitcoin reviewer** | [DESIGN.md](./DESIGN.md) | [RISKS.md](./RISKS.md) + [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) |
| **Implementer** | [spec/](./spec/) — the normative docs (below) | [core/STATUS.md](./core/STATUS.md) for what's wired |
| **Operator** | [operate/SELF_HOSTING.md](./operate/SELF_HOSTING.md) | [publisher onboarding](./operate/PUBLISHER_ONBOARDING.md) + demos/operators (below) |
| **The team** | [core/STATUS.md](./core/STATUS.md) — source of truth for what's real | [core/DECISIONS.md](./core/DECISIONS.md) — the memory |

## The front door

**[ONT.md](./ONT.md)** is the one document to read: what ONT is, what it
commits to, what's real today. **[ONT_ONE_PAGER.md](./ONT_ONE_PAGER.md)** is
its outreach-sized companion, parity-bound to it.
**[core/STATUS.md](./core/STATUS.md)** is the single source of truth for
what's actually wired — if any doc disagrees with it, STATUS wins.

## For Bitcoin reviewers

- **[DESIGN.md](./DESIGN.md)** — the full design: model, trust surface
  (sovereignty map), scaling and data availability, economics, footprint
  numbers, trade-off tables, prior art, and the clean-sheet requirements.
- **[RISKS.md](./RISKS.md)** — the consolidated risk doc: the register
  (R-numbers are stable anchors), the plain-language walkthrough, the
  MEV/ordering analysis, the whole-system threat model, and the ranked
  launch assessment.
- **[OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)** — the genuinely open design
  and analysis questions, consolidated for an external reviewer deciding
  where to push.

## For implementers (the normative layer)

The normative layer lives in `docs/spec/`; a doc there claims normative status:

- [acquisition state machine](./spec/ONT_ACQUISITION_STATE_MACHINE.md) —
  claim, notice, uncontested finality, contested escalation
- [data-availability agreement](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md) —
  the fail-closed availability rule
- [auction](./spec/AUCTION.md) — contested-auction mechanism, parameters, and
  window schedule
- [conformance](./spec/CONFORMANCE.md) — requirement-by-requirement code mapping
- [issuance fee mechanics](./spec/ONT_ISSUANCE_FEE_MECHANICS.md)
- [contested auction reference](./spec/CONTESTED_AUCTION_REFERENCE.md)
- [publisher protocol spec](./spec/ONT_PUBLISHER_PROTOCOL_SPEC.md)
- [recovery invoke spec](./spec/ONT_RECOVERY_INVOKE_SPEC.md)

Builder orientation: [core/ARCHITECTURE.md](./core/ARCHITECTURE.md) — the one
architecture doc: active design, active code entrypoints, retired paths, and
next work.

## For operators

Everything operational lives in `docs/operate/`:
[self-hosting](./operate/SELF_HOSTING.md) ·
[publisher onboarding](./operate/PUBLISHER_ONBOARDING.md) · [testing](./operate/TESTING.md) ·
[new-user testing guide](./operate/NEW_USER_TESTING_GUIDE.md) ·
[operators](./operate/) (domain, Supabase, VPS) · [demo](./operate/demo/)
(walkthroughs and signet demos)

## Launch

**[LAUNCH.md](./LAUNCH.md)** — the launch narrative: v1 scope, scaling
confidence gates, and the external review packet. Mechanism details live in
[spec/AUCTION.md](./spec/AUCTION.md); every pinned or placeholder number lives
in [core/STATUS.md](./core/STATUS.md)'s parameter table.

## Research (live inputs)

Open analyses that still feed decisions:
[multi-publisher convergence](./research/ONT_MULTI_PUBLISHER_CONVERGENCE.md) ·
[owner-key recovery](./research/OWNER_KEY_RECOVERY.md) ·
[post-quantum & signature agility](./research/POST_QUANTUM_AND_SIGNATURE_AGILITY.md) ·
[decentralization & discovery](./research/ONT_DECENTRALIZATION_AND_DISCOVERY.md) ·
[ONT vs Pubky/PKARR](./research/ONT_VS_PUBKY_PKARR.md) ·
[Bitcoin-anchored name accumulator](./research/BITCOIN_ANCHORED_NAME_ACCUMULATOR.md)

**[research/archive/](./research/archive/)** holds superseded explorations and
completed analyses, each behind a SUPERSEDED banner naming its successor.
Nothing is deleted; if you land on an archived doc, the banner tells you where
the living version is.

## House rules

- **One concept, one name**: every term is defined once, in
  [GLOSSARY.md](./GLOSSARY.md); prose uses plain words with the term in parens
  at first use.
- **Decisions have stable short names** (e.g. doc-canon (#45)) — bare numbers
  don't travel; see the conventions in [core/DECISIONS.md](./core/DECISIONS.md).
- **Say what's real**: design ≠ built ≠ live. [core/STATUS.md](./core/STATUS.md)
  is where that line is drawn.
