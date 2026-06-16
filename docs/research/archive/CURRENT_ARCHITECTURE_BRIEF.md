# ONT Current Architecture Brief

> **SUPERSEDED (2026-06-11):** absorbed into [`docs/core/ARCHITECTURE.md`](../../core/ARCHITECTURE.md)
> per doc-canon (#45). Kept for provenance; this copy is no longer updated.


Status date: 2026-06-01

This is the handoff brief for a fresh human reviewer or builder LLM. It explains
the current ONT path after the cleanup pass, names the canonical docs, and
separates active design from historical exploration.

## One-Sentence Design

ONT is a flat, Bitcoin-anchored namespace where a name is controlled by an
owner key, ordinary long-tail claims pay a small Bitcoin miner fee and settle
through a batched accumulator, contested names escalate to a returnable-bond
L1 auction, and resolvers mirror/verifiably serve data without deciding
ownership.

## Read This First

Canonical reading order:

1. [../ONT.md](../../ONT.md) - plain-language source of truth.
2. [../design/ONT_SOVEREIGNTY_MAP.md](./ONT_SOVEREIGNTY_MAP.md) - the minimal trust surface.
3. [../design/ONT_ACQUISITION_STATE_MACHINE.md](../../spec/ONT_ACQUISITION_STATE_MACHINE.md) - claim, notice, uncontested finality, and auction escalation.
4. [../README.md](../../README.md) - the reader map (the old design index is archived).
5. [../launch/ONT_LAUNCH_V1_BRIEF.md](./ONT_LAUNCH_V1_BRIEF.md) - launch/review framing.
6. [./ARCHITECTURE.md](../../core/ARCHITECTURE.md) - runtime layers and product components.
7. [./SIMPLIFICATION_AUDIT.md](./SIMPLIFICATION_AUDIT.md) - cleanup map and remaining simplification work.

Treat [../research/archive/](./) as provenance only. Do not
infer active design from archived docs.

## Current Mental Model

There is one acquisition path:

1. A user claims a valid flat name and pays the fixed claim gate, currently
   `₿1,000`, as a Bitcoin miner fee.
2. A public notice window gives others a chance to claim the same name.
3. If no one else claims it, the name becomes final through the accumulator
   rail. The owner key controls transfer, recovery setup, and value records.
4. If the name is contested, it escalates to a visible ascending auction with
   returnable Bitcoin bonds.
5. The winner receives the same owner-key-controlled name as an uncontested
   claimant. The auction path changes allocation, not the final ownership
   object.

Core invariants:

- No registrar, editorial allocation, founder carveout, token, rent, renewal,
  or admin revocation.
- Bitcoin provides ordering, settlement value, and scarce contest cost.
- Owner keys authorize mutable records, transfer, and recovery descriptors.
- Resolvers and indexers mirror, validate, and serve proof data. They do not
  decide ownership.
- Future upgrades are opt-in and must not weaken already-settled names.

## Active Implementation Map

Protocol constants and formats:

- [../../packages/protocol/src/constants.ts](../../../packages/protocol/src/constants.ts) - protocol name, name grammar, claim gate, auction minimums, bond maturity.
- [../../packages/protocol/src/names.ts](../../../packages/protocol/src/names.ts) - name normalization and validity.
- [../../packages/protocol/src/events.ts](../../../packages/protocol/src/events.ts) and [../../packages/protocol/src/wire.ts](../../../packages/protocol/src/wire.ts) - chain event encoding.
- [../../packages/protocol/src/auction-bid-package.ts](../../../packages/protocol/src/auction-bid-package.ts) - signable bid package and auction commitments.
- [../../packages/protocol/src/transfer-package.ts](../../../packages/protocol/src/transfer-package.ts) - transfer package format.
- [../../packages/protocol/src/value-record.ts](../../../packages/protocol/src/value-record.ts) - owner-signed mutable records.
- [../../packages/protocol/src/recovery-descriptor.ts](../../../packages/protocol/src/recovery-descriptor.ts) and [../../packages/protocol/src/recovery-wallet-proof.ts](../../../packages/protocol/src/recovery-wallet-proof.ts) - recovery descriptors and wallet-proof envelopes.

Consensus and state:

- [../../packages/consensus/src/state.ts](../../../packages/consensus/src/state.ts) - claim status and fixed maturity behavior.
- [../../packages/consensus/src/engine.ts](../../../packages/consensus/src/engine.ts) - event replay engine.
- [../../packages/consensus/src/proof-bundle.ts](../../../packages/consensus/src/proof-bundle.ts) - portable ownership proof bundle shape.

Auction and indexing:

- [../../packages/core/src/auction-policy.ts](../../../packages/core/src/auction-policy.ts) - one contested-auction policy shape.
- [../../packages/core/src/auction-sim.ts](../../../packages/core/src/auction-sim.ts) and [../../packages/core/src/auction-state.ts](../../../packages/core/src/auction-state.ts) - auction simulation/state surfaces.
- [../../packages/core/src/experimental-auction.ts](../../../packages/core/src/experimental-auction.ts) - current live-auction derivation code. The file name is historical; the model is now the contested-auction path.
- [../../packages/core/src/indexer.ts](../../../packages/core/src/indexer.ts) - chain replay, name state, auction observations, and resolver snapshots.

Scaling prototypes:

- [../../packages/core/src/accumulator.ts](../../../packages/core/src/accumulator.ts) - sparse Merkle accumulator.
- [../../packages/core/src/research/delta-merge-sim.ts](../../../packages/core/src/research/delta-merge-sim.ts) - leaderless per-block merge simulation.
- [../../packages/core/src/research/da-convergence-sim.ts](../../../packages/core/src/research/da-convergence-sim.ts) - data-availability convergence simulation.
- [../../packages/core/src/root-anchor.ts](../../../packages/core/src/root-anchor.ts) - Bitcoin anchor transaction measurement.
- [../../packages/core/src/research/batch-rail.ts](../../../packages/core/src/research/batch-rail.ts) - batch rail behavior.
- [../../packages/core/src/research/recovery-sim.ts](../../../packages/core/src/research/recovery-sim.ts) - recovery state machine simulation.

Apps and tools:

- [../../apps/resolver/src/index.ts](../../../apps/resolver/src/index.ts) - resolver/indexer API and runtime.
- [../../apps/web/src/](../../../apps/web/src/) - product UI, explorer, auction prep, recovery/value flows.
- [../../apps/cli/src/index.ts](../../../legacy/apps/cli/src/index.ts) - operator and power-user workflows (quarantined to legacy/ in B5).
- [../../apps/wallet/src/](../../../legacy/apps/wallet/src/) - local wallet/client prototype (quarantined to legacy/ in B5).
- [../../packages/architect/src/](../../../packages/architect/src/) - reusable transaction-prep helpers.

## Recently Retired Or Quarantined

Do not reintroduce these unless there is an explicit new design decision:

- Auction classes. The old class-selector field and single launch-class fixture
  path have been removed from active policy, bid packages, fixtures, apps,
  tests, and docs. There is one contested-auction policy.
- Universal direct-auction launch docs. Retired launch docs live under
  [../research/archive/retired-launch/](./retired-launch/).
- Sponsor credits as the active scaling plan. Sponsor-credit docs are
  historical. The current scaling path is the accumulator rail with contest
  escalation to L1.
- Ark, RGB, Lightning/LSP, and custom L2 bonding as launch dependencies. They
  remain research topics only.
- Epoch-halving maturity as active behavior. Fixed maturity is active; legacy
  helpers remain only as deprecated compatibility code.

## Current Cleanup State

Mostly done:

- Current docs are consolidated around `ONT.md`, the design index, and launch
  brief.
- Retired launch docs have been moved out of the active launch folder.
- The old auction-class abstraction has been removed from active code and
  fixtures.
- User-facing CLI, wallet, web, resolver, and mobile surfaces now present the
  contested-auction path directly.
- The stale-symbol search for the retired auction-class terms is clean outside
  archived docs and generated dependencies.

Still worth doing:

1. Rename `experimental-auction` once it is formally promoted, or make the
   file/module label explicitly "contested auction".
2. Remove deprecated epoch-maturity helpers when all downstream compatibility
   imports are gone.
3. Tighten proof-bundle and recovery documentation around exactly what a fresh
   verifier needs.
4. Do one final active-doc index pass before public review.
5. Keep accumulator scaling docs honest about what is prototype-measured versus
   launch-frozen.

## Verification Baseline

The cleanup checkpoint passed:

- `npm run test -w @ont/protocol`
- `npm run test -w @ont/core`
- `npm run test -w @ont/cli`
- `npm run test -w @ont/wallet`
- `npm run test -w @ont/web`
- `npm run test -w @ont/resolver`
- `npm run typecheck` in `mobile/`
- `git diff --check`

`@ont/architect` has no test script, but it builds through dependent test
chains.

## Builder Guidance

When continuing work:

- Prefer the current one-path acquisition model over historical branching.
- Keep consensus and verification surfaces small enough for public audit.
- Do not add mechanism variants unless they remove more complexity than they
  introduce.
- Make docs say what the system does now, then place future work behind an
  explicit research label.
- Preserve the additive scaling posture: long-tail rail improvements must not
  weaken already-settled names or the L1 contested-auction path.
