# `@ont/core` — research / simulations (NOT consensus)

Everything in this folder is **research**: property prototypes and numerical models that validate
scaling-design claims. **None of it is part of the sovereignty trust surface** — none of these
modules can take, move, or change ownership of a name. A reviewer auditing "can my name be taken?"
can ignore this entire directory (see [`ONT_SOVEREIGNTY_MAP.md`](../../../../docs/research/ONT_SOVEREIGNTY_MAP.md)).

| Module | What it proves |
| --- | --- |
| `accumulator.ts` | Sparse-Merkle name accumulator + serialized proofs; measures proof size (~log₂ N) |
| `delta-merge-sim.ts` | Leaderless per-block delta-merge: disjoint insertions commute, conflicts by commit priority (R2) |
| `da-convergence-sim.ts` | The data-availability agreement rule: naive rule forks, proposed Bitcoin-timed rule converges (R1) |
| `recovery-sim.ts` | Recovery state machine: thief-can't-steal, owner-recovers, prior-owner-can't-recover-sold-name |
| `root-anchor.ts` | Anchored root chain: OP_RETURN codec, stale-transition rejection, anchor vByte measurement |
| `batch-rail.ts` | The production long-tail rail tying the above together (DA-filtered deltas → real accumulator → anchored roots) |
| `sponsored-flat-issuance-sim.ts` | Numerical issuance/credit model |

These would become (or inform) the **long-tail accumulator rail** — an *additive, separately
auditable* layer that must never weaken the sovereignty of names on the frozen consensus core.
They are deliberately kept out of that core. See `feedback-freeze-minimal-auditable-core` and
[`ONT_SIGNET_PROTOTYPE_SCOPE.md`](../../../../docs/research/ONT_SIGNET_PROTOTYPE_SCOPE.md).
