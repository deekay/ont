# ONT documentation

This map is organized by reader. Pick your row, read left to right.
The structure below is the ratified documentation canon (doc-canon (#45) in
[core/DECISIONS.md](./core/DECISIONS.md)); consolidations still in flight are
marked ⏳ with today's location linked.

| You are… | Start here | Then |
| --- | --- | --- |
| **Curious newcomer** | [ONT.md](./ONT.md) — the front door | [ONT_ONE_PAGER.md](./ONT_ONE_PAGER.md) |
| **Bitcoin reviewer** | [ONT_DESIGN_BRIEF.md](./ONT_DESIGN_BRIEF.md) (⏳ becomes `DESIGN.md`) | risks + open questions (below) |
| **Implementer** | [spec/](./spec/) — the normative docs (below) | [core/STATUS.md](./core/STATUS.md) for what's wired |
| **Operator** | [operate/SELF_HOSTING.md](./operate/SELF_HOSTING.md) | demos + operators (below) |
| **The team** | [core/STATUS.md](./core/STATUS.md) — source of truth for what's real | [core/DECISIONS.md](./core/DECISIONS.md) — the memory |

## The front door

**[ONT.md](./ONT.md)** is the one document to read: what ONT is, what it
commits to, what's real today. **[ONT_ONE_PAGER.md](./ONT_ONE_PAGER.md)** is
its outreach-sized companion, parity-bound to it.
**[core/STATUS.md](./core/STATUS.md)** is the single source of truth for
what's actually wired — if any doc disagrees with it, STATUS wins.

## For Bitcoin reviewers

- **[ONT_DESIGN_BRIEF.md](./ONT_DESIGN_BRIEF.md)** — footprint numbers,
  trade-off tables, feedback questions. ⏳ Absorbs the
  [sovereignty map](./design/ONT_SOVEREIGNTY_MAP.md) and
  [design requirements](./design/ONT_DESIGN_REQUIREMENTS.md) to become `DESIGN.md`.
- **Risks** — ⏳ five docs consolidate into one `RISKS.md`. Today:
  [risk register](./design/ONT_RISK_REGISTER.md) ·
  [plain-language risks](./design/ONT_RISKS_PLAIN_LANGUAGE.md) ·
  [MEV/ordering](./design/ONT_MEV_ORDERING_ANALYSIS.md) ·
  [adversarial analysis](./research/ONT_ADVERSARIAL_ANALYSIS.md) ·
  [adversarial risk ranking](./research/ONT_ADVERSARIAL_RISK_RANKING.md)
- **Open questions** — ⏳ three docs consolidate into one `OPEN_QUESTIONS.md`. Today:
  [hard problems](./design/ONT_HARD_PROBLEMS.md) ·
  [questions for experts](./research/OPEN_QUESTIONS_FOR_EXPERTS.md) ·
  [open analysis areas](./research/ONT_OPEN_ANALYSIS_AREAS_2026_06_09.md)

## For implementers (the normative layer)

The normative layer lives in `docs/spec/`; a doc there claims normative status:

- [acquisition state machine](./spec/ONT_ACQUISITION_STATE_MACHINE.md) —
  claim, notice, uncontested finality, contested escalation
- [data-availability agreement](./spec/ONT_DATA_AVAILABILITY_AGREEMENT.md) —
  the fail-closed availability rule
- [issuance fee mechanics](./spec/ONT_ISSUANCE_FEE_MECHANICS.md)
- [contested auction reference](./spec/CONTESTED_AUCTION_REFERENCE.md)
- [publisher protocol spec](./spec/ONT_PUBLISHER_PROTOCOL_SPEC.md)
- [recovery invoke spec](./spec/ONT_RECOVERY_INVOKE_SPEC.md)

Builder orientation: [core/CURRENT_ARCHITECTURE_BRIEF.md](./core/CURRENT_ARCHITECTURE_BRIEF.md)
(⏳ merges with [core/ARCHITECTURE.md](./core/ARCHITECTURE.md) into one doc).

## For operators

Everything operational lives in `docs/operate/`:
[self-hosting](./operate/SELF_HOSTING.md) · [testing](./operate/TESTING.md) ·
[new-user testing guide](./operate/NEW_USER_TESTING_GUIDE.md) ·
[operators](./operate/) (domain, Supabase, VPS) · [demo](./operate/demo/)
(walkthroughs, signet, Sparrow)

## Launch working material

⏳ Consolidates into one `LAUNCH.md` + `spec/` + STATUS.md's parameter table. Today:
[launch v1 brief](./launch/ONT_LAUNCH_V1_BRIEF.md) ·
[settlement & ownership](./launch/AUCTION_SETTLEMENT_AND_OWNERSHIP.md) ·
[implementation & validation](./launch/ONT_IMPLEMENTATION_AND_VALIDATION.md) ·
[parameter review packet](./launch/ONT_PARAMETER_REVIEW_PACKET.md) ·
[placeholders & mechanism choices](./launch/AUCTION_PLACEHOLDERS_AND_MECHANISM_CHOICES.md) ·
[window schedule](./launch/ONT_WINDOW_SCHEDULE.md) ·
[scaling confidence plan](./launch/PRELAUNCH_SCALING_CONFIDENCE_PLAN.md)

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

- **One concept, one name**: every term is defined once (⏳ `GLOSSARY.md`,
  landing in the jargon pass); prose uses plain words with the term in parens
  at first use.
- **Decisions have stable short names** (e.g. doc-canon (#45)) — bare numbers
  don't travel; see the conventions in [core/DECISIONS.md](./core/DECISIONS.md).
- **Say what's real**: design ≠ built ≠ live. [core/STATUS.md](./core/STATUS.md)
  is where that line is drawn.
