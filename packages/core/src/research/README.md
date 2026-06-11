# `@ont/core` — research / simulations (NOT consensus)

Everything in this folder is **research**: property prototypes and numerical models that validate
scaling-design claims. **None of it is part of the sovereignty trust surface** — none of these
modules can take, move, or change ownership of a name. A reviewer auditing "can my name be taken?"
can ignore this entire directory (see the trust-surface map in [`DESIGN.md`](../../../../docs/DESIGN.md)).

| Module | What it proves |
| --- | --- |
| `delta-merge-sim.ts` | Leaderless per-block delta-merge: disjoint insertions commute, conflicts by commit priority (R2) |
| `da-convergence-sim.ts` | The data-availability agreement rule: naive rule forks, proposed Bitcoin-timed rule converges (R1) |
| `recovery-sim.ts` | Recovery state machine: thief-can't-steal, owner-recovers, prior-owner-can't-recover-sold-name |
| `batch-rail.ts` | The production long-tail rail (DA-filtered deltas → real accumulator → anchored roots). Uncontested-only: contested names **escalate to the L1 bonded auction**, they are not resolved on the accumulator |
| `sponsored-flat-issuance-sim.ts` | Numerical issuance/credit model |

These would become (or inform) the **long-tail accumulator rail** — an *additive, separately
auditable* layer that must never weaken the sovereignty of names on the frozen consensus core.
They are deliberately kept out of that core. See `feedback-freeze-minimal-auditable-core` and
[`ONT_SIGNET_PROTOTYPE_SCOPE.md`](../../../../docs/research/archive/ONT_SIGNET_PROTOTYPE_SCOPE.md).

**Graduated to production (no longer here):** `accumulator.ts` and `root-anchor.ts` moved up to
`packages/core/src/` once the live indexer began observing the anchored root chain. They are the
cheap rail's Bitcoin-anchored data layer — still *not* the frozen consensus core (a lying indexer is
caught by verifying against Bitcoin), but no longer pure simulation. The `batch-rail` simulation
imports them from `../`.
