# ONT design reference (`docs/design/`)

> The plain-language **source of truth** is **[../ONT.md](../ONT.md)** — read that first. This folder
> is the *depth behind it*: the design docs, mechanics, risks, and prototype plan. Earlier
> explorations we did *not* pursue live in `../research/` (historical, not the design).

The system, restated for this folder: ONT is one flat namespace. You claim a name by paying a small
**fixed bitcoin amount (₿1,000 ≈ $1) to miners**; if no one else claims it during a notice window it's yours
(cheap, batched into a Bitcoin-anchored accumulator); if it's contested it **escalates to an L1 bonded
auction**. Either way you get a globally unique name controlled by an owner key, verifiable against
Bitcoin — no registrar, no token, no rent.

**Current design decisions (2026-05-24):** recovery is first-class (deferred out of the first
accumulator freeze); the gate is a Bitcoin miner fee (a fixed bitcoin amount, not a USD value in
consensus); contested names escalate to L1 (no off-chain auction); upgrades are opt-in only; the
founder pledges no name pre-grab and a sunset-bound data-availability server.

---

## Start here — current design (in reading order)

1. **[ONT_SOVEREIGNTY_MAP.md](./ONT_SOVEREIGNTY_MAP.md)** — the ~7-file trust surface: why no one can take
   your name, and what a reviewer can ignore. Read this first.
2. **[ONT_DESIGN_REQUIREMENTS.md](./ONT_DESIGN_REQUIREMENTS.md)** — the invariants and requirements the
   design must meet.
3. **[ONT_REQUIREMENTS_CONFORMANCE.md](./ONT_REQUIREMENTS_CONFORMANCE.md)** — design vs. every
   requirement; current status (no invariant violated, no open conflicts).
4. **[ONT_DATA_AVAILABILITY_AGREEMENT.md](./ONT_DATA_AVAILABILITY_AGREEMENT.md)** — the convergence/DA
   rule (R1): how honest nodes agree under a withholding adversary.
5. **[ONT_HARD_PROBLEMS.md](./ONT_HARD_PROBLEMS.md)** — R2 (leaderless chaining) and R4 (now resolved:
   contests escalate to L1).
6. **[ONT_MEV_ORDERING_ANALYSIS.md](./ONT_MEV_ORDERING_ANALYSIS.md)** — R9: you can't steal a name via
   ordering.
7. **[ONT_LONG_TAIL_RECOVERY.md](./ONT_LONG_TAIL_RECOVERY.md)** — recovery for UTXO-less names (a
   committed feature; deferred out of the first accumulator freeze).
8. **[ONT_SIGNET_PROTOTYPE_SCOPE.md](./ONT_SIGNET_PROTOTYPE_SCOPE.md)** — the empirical prototype plan +
   what's been built/measured.

*(Deeper, older mechanics live in [../research/BITCOIN_ANCHORED_NAME_ACCUMULATOR.md](../research/BITCOIN_ANCHORED_NAME_ACCUMULATOR.md)
— predates these docs and has stale spots like commit-reveal name-hiding; ONT.md + this index are
authoritative. The earlier `ONT_FLAT_NAMESPACE_DESIGN` summary is superseded by ONT.md and archived.)*

### Supporting / reference (current)
- **[ONT_ISSUANCE_FEE_MECHANICS.md](./ONT_ISSUANCE_FEE_MECHANICS.md)** — how the per-name claim gate reaches miners in the batched path (the gate *is* the anchor's miner fee); resolves the fee/security-budget inconsistency.
- **[ONT_RISK_REGISTER.md](./ONT_RISK_REGISTER.md)** + **[ONT_RISKS_PLAIN_LANGUAGE.md](./ONT_RISKS_PLAIN_LANGUAGE.md)** — the living risk register and its jargon-free companion.
- **[ONT_FLAT_NAMESPACE_ONE_PAGER.md](./ONT_FLAT_NAMESPACE_ONE_PAGER.md)** — modeled $-forward one-pager (some figures annotated with measured values).
- **[PRELAUNCH_SCALING_CONFIDENCE_PLAN.md](../launch/PRELAUNCH_SCALING_CONFIDENCE_PLAN.md)** — what v1 must preserve to keep scaling additive.
- **[ONT_LAUNCH_V1_BRIEF.md](../launch/ONT_LAUNCH_V1_BRIEF.md)** — v1 launch brief.

---

## Earlier explorations (historical — NOT the current design)

Kept for provenance. These predate the current accumulator + bonded-rail design and describe ideas
that were superseded or set aside. Don't treat them as the live spec.

- **Sponsor credits (superseded):** `SPONSOR_CREDITS_THREAT_MODEL.md`, `SPONSOR_CREDITS_VARIANTS.md`,
  `SPONSORED_FLAT_ISSUANCE_SIMULATOR.md` — the old "BTC-time credits + challenge window" issuance model.
  Replaced by the permissionless-batcher accumulator rail.
- **Ark / RGB substrates (research, not a dependency):** `ARK_RGB_SCALING_NOTES.md` — evaluated as
  optional substrates; explicitly *not* a v1 or launch dependency.
- **Public-log / collider explorations:** `FLAT_NAMESPACE_LOG_SCALING.md`,
  `OPEN_COLLIDER_FLAT_NAMESPACE_EXPLORATION.md`, `OPEN_COLLIDER_DEEP_COLLISIONS.md`,
  `PUBLIC_NOTICE_RELAY_AND_RESOLVER_TRANSPARENCY.md`.
- **Early scaling survey:** `SCALING_IDEA_CATALOG.md`, `SCALING_DESIGN_SPACE.md`,
  `SCALABILITY_INVESTIGATION_AND_HYPOTHESES.md`, `ONT_SCALING_EXPLORATIONS.md`.
- **Earlier review/brief + renders:** `ONT_DESIGN_REVIEW_BRIEF.md`, `PROOF_BUNDLE_PROTOTYPES.md`,
  `subname-sovereignty-paths.html` / `.pdf`.

*This index reflects current understanding; a doc may be reclassified as the design firms up. Where a
historical doc conflicts with the "current design" section above, the current section wins.*
