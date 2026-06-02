# ONT simplification audit

Status: working audit, 2026-06-01. First cleanup pass applied the same day:
current launch docs now point at the one-path claim model, older auction-first
launch docs are marked historical, visible `₿1,000` wording replaces
confusing `BTC`-style shorthand, and the wallet no longer describes resolvers as
ownership authorities.

This document re-evaluates ONT from the current repo state, as if we were starting
fresh and wanted the smallest coherent protocol and documentation spine. It is not
a new protocol spec. It is a cleanup map: what appears to be the current design,
what is actually implemented, where historical exploration is still leaking into
the system, and what to simplify first.

## Executive summary

The current design is promising, but the repo is carrying too much design history.
The strongest spine is:

> ONT is one flat namespace. A user claims a name with a small fixed bitcoin fee
> paid to miners. The claim is public for a notice window. If no one else claims
> the same name in that window, it finalizes through a Bitcoin-anchored accumulator.
> If it is contested, it escalates to the L1 bonded auction path. Either way, the
> resulting name is controlled by an owner key, and mutable records are signed
> off-chain by that owner key.

At the start of this audit, the repo only partially matched that story:

- `docs/ONT.md` and `docs/design/README.md` describe the current claim -> notice
  -> uncontested accumulator or contested auction model.
- Several launch docs still describe the older "public bonded auctions for every
  valid name" model as if it were the launch design.
- The L1 bonded auction implementation is real enough to demo and test.
- The accumulator rail is implemented as a prototype in `packages/core/src/research`,
  especially `batch-rail.ts`, but it is not consumed by the live resolver/indexer.
- `apps/publisher` still behaves like a single-writer/private-accumulator publisher,
  which conflicts with the multi-publisher/leaderless design.
- `apps/wallet` has a cheap-claim command, but finality still depends on resolver
  state that the resolver does not currently derive from the batch rail.
- The proof-bundle verifier performs structural checks. It does not yet verify
  Bitcoin block inclusion or header proof-of-work, so docs should not imply full
  trustless verification is complete.

The biggest simplification opportunity is to stop presenting "L1 auctions" and
"cheap accumulator claims" as two design worlds. They should be one acquisition
state machine with two outcomes:

```text
claim intent -> Bitcoin anchor -> DA-valid public notice -> final owner
                                      |
                                      v
                                contested auction
```

The second-biggest simplification is to split economic parameters by role:

- `CLAIM_GATE_SATS`: the sunk anti-spam fee for a claim attempt.
- `AUCTION_BOND_*`: returnable bitcoin capital for contested or scarce names.
- `BOND_MATURITY_BLOCKS`: the fixed maturity duration for live bonds.

Today those roles are blurred by the older length-based bond table, epoch-halving
maturity helpers, and launch docs that still assume every name starts as a bonded
auction.

## Current protocol, reconstructed

### What a name is

A valid v1 name is a normalized lowercase string matching `[a-z0-9]{1,32}`. The
name is controlled by an owner key. The owner key signs:

- transfers to a new owner key
- off-chain value records, such as payment or HTTPS destinations
- recovery setup or recovery veto artifacts, when recovery is enabled

This part is coherent and should be protected. The owner-key layer is the cleanest
part of the project.

### Current intended acquisition flow

The intended current model, per `docs/ONT.md`, is:

1. A user submits a claim for a name and pays a fixed ₿1,000 gate to miners.
2. The claim becomes public and starts a notice window.
3. If no competing claim lands in the notice window, the name finalizes through
   a Bitcoin-anchored accumulator.
4. If a competing claim lands in the notice window, the name is contested and
   escalates to the L1 bonded auction path.
5. The owner key controls the name after finalization, regardless of acquisition
   source.

This is the design to make legible everywhere. The auction should be described as
an escalation, not as a parallel ordinary entry lane.

### Current implemented reality

The implementation is in three maturity levels:

1. **Bonded auction path: working prototype**
   - `@ont/protocol` defines names, event payloads, bid packages, transfers,
     value records, recovery records, and wire codecs.
   - `@ont/consensus` replays `AUCTION_BID`, `TRANSFER`, and `RECOVER_OWNER`
     events and enforces ownership/key/bond-continuity rules.
   - `@ont/core` derives experimental auction state and materializes auction
     winners into `NameRecord`s.
   - `apps/resolver`, `apps/web`, `apps/wallet`, and scripts exercise this path.

2. **Accumulator claim path: prototype, not canonical app state**
   - `packages/core/src/research/accumulator.ts` implements sparse Merkle proofs.
   - `packages/core/src/research/batch-rail.ts` implements the current policy:
     DA-filtered deltas, public notice, uncontested finalization, and contested
     escalation to L1 auction.
   - `apps/publisher` can quote, batch, anchor, and serve inclusion proofs, but
     it anchors its own private accumulator rather than the canonical
     multi-publisher rail.
   - `apps/resolver` does not consume `runBatchRail`, so accumulator names do
     not become canonical resolver/indexer state today.

3. **Trustless proof path: structural but incomplete**
   - `packages/consensus/src/proof-bundle.ts` checks internal JSON structure,
     owner pubkey consistency, value-record chains, auction transcript shape, and
     accumulator proof shape.
   - It does not verify that the cited Bitcoin transaction is actually in a
     proof-of-work-backed block at the claimed height.
   - Until that exists, docs should say "portable structural proof bundle" or
     "verifiable by a full verifier/indexer", not imply offline SPV trustlessness.

## Historical residue and concrete mismatches

### 1. Launch docs carried a retired launch path

Current source of truth:

- `docs/ONT.md:37-54` says the single entry path is cheap claim first, auction
  only if contested.
- `docs/design/README.md:7-16` repeats that model.

Cleanup status after the first pass:

- `docs/launch/ONT_LAUNCH_V1_BRIEF.md` now states the one-path claim model.
- `docs/launch/CONTESTED_AUCTION_REFERENCE.md` now describes only the contested
  auction escalation path.
- `docs/research/archive/retired-launch/LAUNCH_SPEC_V0.md` and
  `docs/research/archive/retired-launch/LAUNCH_DIRECTION_STATUS.md` are archived
  old-path snapshots.
- `docs/core/DECISIONS.md` has been updated to describe claim, notice,
  accumulator finality, and auction-if-contested directly.

Remaining recommendation: keep retired launch paths out of `docs/launch/`, and
keep active docs linked to `ONT.md`, the acquisition state machine, and the
contested auction reference.

- current acquisition spec
- contested-auction reference
- historical auction-only exploration

Do not leave "framing note says X, body says not-X" docs in the main reading path.

### 2. The bond table is still from the auction-first world

Relevant code:

- `packages/protocol/src/constants.ts:26-40` defines epoch maturity parameters
  and a ₿50,000 bond floor.
- `packages/protocol/src/bond.ts:11-40` computes a length-halving bond amount
  and epoch-halving maturity schedule.
- `packages/core/src/auction-policy.ts:60-79` sets a ₿50,000 auction class
  floor and one-year-ish settlement lock.
- `packages/core/src/auction-policy.ts:94-112` uses `getBondSats(name.length)`
  for auction opening requirements.

Current design pressure:

- The long-tail floor in `docs/ONT.md` is the ₿1,000 sunk claim gate, not a
  ₿50,000 returnable bond.
- The one-pager suggests returnable length-floor bonds should be confined to the
  scarce short-name set, while 5+ character names use the gate plus contention.
- The current launch direction seems to prefer a fixed maturity, not epoch
  halving.

Recommendation: separate constants by purpose before freeze:

```ts
CLAIM_GATE_SATS = 1_000n;
AUCTION_MIN_INCREMENT_SATS = 1_000n;
AUCTION_BOND_BASE_SATS = 100_000_000n;
AUCTION_BOND_FLOOR_SATS = ...; // only if still needed
BOND_MATURITY_BLOCKS = 52_560; // fixed launch value, with test override only
```

Then decide whether 5+ character contested auctions have:

- no length floor beyond the ₿1,000 opening gate and market bids, or
- a separate auction opening minimum.

Do not let the old all-auction bond floor silently define the new cheap-claim
path.

### 3. Retired: auction-class field existed although there is one auction rule

Former relevant code:

- `packages/core/src/auction-policy.ts` used to define a sole launch class.
- `packages/protocol/src/auction-bid-package.ts` used to include a
  class-selector field.
- `apps/web`, `apps/wallet`, `apps/resolver`, and fixtures used to thread it
  through UI and test data.

Status: removed from active v1 policy, bid packages, fixtures, app consumers,
and tests. The contested auction path now has one policy shape: opening floor,
settlement lock, minimum increment, and soft-close settings.
If there is no credible second class before launch, the class abstraction is
review tax.

### 4. The accumulator rail is in `research` but is becoming design-critical

Relevant code:

- `packages/core/src/research/batch-rail.ts:14-27` describes the production
  long-tail batch rail and contested escalation.
- `packages/core/src/index.ts:27-36` re-exports research modules from the main
  `@ont/core` barrel.
- `packages/core/src/research-quarantine.test.ts:28-52` ensures production
  modules do not import research code.

This is conceptually backwards now. If the cheap claim path is part of the
current design, the canonical rail should not live as quarantined research. If it
is still research, `docs/ONT.md` should not present it as the plan in source of
truth language.

Recommendation:

- Promote the canonical pieces into a non-research package path when ready:
  `packages/core/src/rail/*` or a new `@ont/rail`.
- Keep simulations under `research`.
- Stop exporting research from the root `@ont/core` barrel. Use an explicit
  `@ont/core/research` subpath or direct internal imports for simulations.

### 5. Publisher still uses the wrong root model for a permissionless rail

Relevant code:

- `apps/publisher/src/publisher.ts:121-128` keeps a private `Accumulator`.
- `apps/publisher/src/publisher.ts:202-208` checks availability against that
  private accumulator and local reservations.
- `apps/publisher/src/publisher.ts:483-516` seals batches by applying claims to
  its own accumulator and anchoring `prevRoot -> newRoot`.
- `docs/research/ONT_MULTI_PUBLISHER_CONVERGENCE.md:31-84` explains why this
  single-writer model is wrong for multiple publishers and why Model B
  leaderless merge should be canonical.

Recommendation:

- Treat current publisher as a single-publisher/dev publisher.
- For canonical design, publisher should emit DA-available deltas and pay the
  required aggregate miner fee.
- Resolver/indexer should derive canonical state by replaying all DA-valid
  deltas through `runBatchRail`.
- Publisher receipts should remain provisional until canonical finalization.

### 6. Real publisher fee mechanics are not enforcing the miner-fee gate

Relevant docs:

- `docs/design/ONT_ISSUANCE_FEE_MECHANICS.md:61-86` says an anchor is valid only
  if its Bitcoin transaction fee is at least the sum of per-name gates.

Relevant code:

- `apps/publisher/src/publisher.ts:145-156` defaults `gateBaseSats` to 1,000 and
  `serviceBaseSats` to 200.
- `apps/publisher/src/index.ts:73-83` configures real anchor broadcasting with
  `ONT_PUBLISHER_FEE_SATS` defaulting to 500.
- `apps/publisher/src/esplora-anchor.ts:81-88` spends a fixed `feeSats` and
  creates the OP_RETURN.

Recommendation:

- Change anchor broadcasting input to include `requiredGateFeeSats`.
- Build the anchor with `feeSats >= sum(gates) + marketRelayFee`.
- Add resolver/indexer validation that computes the anchor transaction fee from
  Bitcoin inputs/outputs and rejects fee-insufficient deltas.
- Until then, docs and UI should label this as a prototype payment flow, not as
  a live enforcement of the miner-fee gate.

### 7. Root-anchor wire framing appears inconsistent

Relevant code:

- `packages/protocol/src/wire.ts:193-231` defines both body-only and fully framed
  root-anchor encodings.
- `apps/publisher/src/esplora-anchor.ts:87-88` uses `encodeRootAnchorBody`.
- Docs for the scaling rail generally describe root anchors as ONT-framed
  OP_RETURN events with magic/version/type.

Recommendation:

- Pick one on-chain encoding.
- Prefer fully framed `encodeRootAnchorPayload` for scanability and consistency
  with the event model.
- If body-only is deliberate for size, document it as a separate tx output type
  and make scanners decode that exact form. Do not leave both as plausible.

### 8. Resolver/indexer does not yet derive cheap-rail canonical state

Relevant code:

- `packages/core/src/indexer.ts:176-206` ingests Bitcoin blocks through the L1
  event state machine and auction reconciliation.
- `packages/core/src/indexer.ts:539-590` derives observed L1 auction catalogs.
- There is no resolver/indexer call to `runBatchRail`.

Recommendation:

- Add a rail event ingestion path:
  - parse root anchors and availability markers
  - fetch or ingest batch bytes
  - enforce DA windows and miner-fee gate
  - derive provisional/final/contested state
  - expose that state through resolver APIs
- Only then should wallet sync finalize cheap claims from resolver/indexer state.

### 9. Wallet cheap-claim finality wording gives the resolver too much authority

Relevant code:

- `apps/wallet/src/index.ts:891-957` submits a cheap claim, verifies the publisher
  inclusion proof, and records it as provisional.
- `apps/wallet/src/index.ts:448-467` treats resolver state as the signal that the
  claim resolved.
- `apps/wallet/src/index.ts:458-460` says "The resolver is the canonical
  authority the wallet defers to", which conflicts with the resolver-as-mirror
  model.

Recommendation:

- Replace that wording immediately.
- The wallet may use resolver state as a convenience source, but finality should
  be based on a proof bundle or canonical replay result, not resolver authority.

### 10. Proof bundles are too broad and too weak for their central role

Relevant code:

- `packages/consensus/src/proof-bundle.ts:3-10` lists current and research proof
  sources together.
- `packages/consensus/src/proof-bundle.ts:42-151` returns structural verification.
- `packages/consensus/src/proof-bundle.ts:229-260` checks accumulator proof shape
  and anchor metadata but not Bitcoin inclusion.
- `docs/research/ONT_DECENTRALIZATION_AND_DISCOVERY.md:99-125` correctly names
  this as the precondition for making discovery a liveness problem.

Recommendation:

- Split `verifyProofBundle` into two named levels:
  - `verifyProofBundleStructure`
  - `verifyProofBundleAgainstBitcoin`
- Remove Ark/RGB proof sources from the frozen/core verifier until they are real,
  or move them into an experimental verifier module.
- Define the canonical proof bundle for:
  - accumulator claim finalization
  - contested auction settlement
  - transfer chain
  - value-record chain
  - maturity/release state

### 11. Recovery is described as first-class but implemented unevenly

Relevant code:

- `packages/consensus/src/engine.ts:440-574` implements recovery requests for
  immature bonded names and rejects recovery after maturity.
- `packages/core/src/research/recovery-sim.ts` models UTXO-less recovery.
- `docs/design/ONT_LONG_TAIL_RECOVERY.md` frames recovery for UTXO-less names as
  part of the design direction.

Recommendation:

- Split recovery docs into:
  - bonded-name recovery implemented in current consensus prototype
  - UTXO-less accumulator recovery design, deferred
- Do not imply the long-tail recovery model is launch-frozen until it is in the
  same canonical rail as long-tail acquisition.

### 12. Docs have no stable status taxonomy

Some docs say "source of truth"; some say "working"; some say "historical"; many
have framing notes. The current folder structure does not reliably tell a reader
what to trust.

Recommendation: every top-level design doc should have a status line from this
small taxonomy:

- `Current spec`
- `Current reference`
- `Implementation status`
- `Research note`
- `Historical`

Then move or rename accordingly.

## If building from scratch, the target architecture should be this

### One acquisition state machine

Use one state machine for every name:

```text
Unowned
  -> ProvisionalClaim
  -> FinalAccumulatorOwner
  -> OwnerKeyTransfer*

ProvisionalClaim
  -> Contested
  -> L1BondedAuction
  -> BondedOwner
  -> MatureOwner
  -> OwnerKeyTransfer*
```

Short/scarce names may require higher opening reserves, but they should still be
explained as parameters on the same claim/contest state machine, not a separate
product path.

### One name record model

`NameRecord` should represent ownership regardless of acquisition source.

Suggested shape:

```ts
type AcquisitionSource =
  | "accumulator_claim"
  | "l1_contested_auction";

type AssuranceTier =
  | "provisional"
  | "accumulator_final"
  | "l1_bonded_immature"
  | "l1_bonded_mature"
  | "released_mature";

interface NameRecord {
  name: string;
  ownerPubkey: string;
  ownershipRef: string;
  acquisitionSource: AcquisitionSource;
  assuranceTier: AssuranceTier;
  claimHeight: number;
  lastStateTxidOrAnchor: string;
}
```

Bond fields should be present only when the assurance tier requires a live bond.
Long-tail accumulator names should not be forced into fake bond fields.

### Publishers publish deltas, not authority

Publishers should be "batch broadcasters":

- quote service cost
- collect/lock user payment
- build a delta
- make the delta bytes available
- anchor it to Bitcoin with sufficient miner fee
- serve receipts and batch bytes

They should not define the canonical root alone.

### Resolvers/indexers mirror and replay

Resolvers should be "indexer/archive/query services":

- scan Bitcoin for ONT events and anchors
- fetch and archive batch data
- apply DA rules and rail rules
- expose state and proofs
- store value records for availability

They should not decide ownership. If docs need a user-facing word, use "resolver"
for the query API and "indexer/archive" for the verification role.

### Proof bundles are the portability layer

A user should be able to carry a proof bundle containing enough data for a fresh
verifier to answer:

- Was the claim/auction/transfer actually anchored in Bitcoin?
- Was the batch data available under the protocol's DA rule?
- Did the notice window close uncontested, or did it escalate?
- Does the current owner key derive from the valid ownership chain?
- Are the value records signed by the current owner key and chained correctly?

This is the right center of gravity for sovereignty. It should be simpler and
more prominent than most mechanism-design docs.

## Proposed cleanup phases

### Phase 1: Collapse documentation into the current spine

Goal: make a newcomer read one coherent story.

Actions:

1. Keep `docs/ONT.md` as the plain-language source of truth.
2. Create or promote one current spec/reference doc for the acquisition state
   machine.
3. Keep `docs/launch/CONTESTED_AUCTION_REFERENCE.md` scoped to contested names.
4. Keep retired launch snapshots in `docs/research/archive/retired-launch/`.
5. Rewrite `docs/core/DECISIONS.md` to remove decisions that are only historical,
   moving them to an appendix.
6. Add a status taxonomy to `docs/README.md` and `docs/design/README.md`.

Payoff: high. Effort: medium. This removes the largest reviewer confusion before
touching consensus code.

### Phase 2: Split claim gate, auction bond, and maturity constants

Goal: remove old economic assumptions from code names and docs.

Actions:

1. Add explicit claim-gate constants to `@ont/protocol`.
2. Rename bond constants to auction/bond-specific names.
3. Replace epoch-halving maturity with one fixed maturity constant plus test
   override.
4. Update tests to assert the intended current parameters.
5. Update docs to stop using the old bond table as if it applies to long-tail
   uncontested claims.

Payoff: high. Effort: medium. This is the most important code-level
simplification before protocol freeze.

### Phase 3: Make the accumulator rail either canonical or explicitly deferred

Goal: stop living between "source of truth" and "research".

Actions:

1. If canonical: promote `batch-rail.ts` and `accumulator.ts` out of research.
2. Wire resolver/indexer to consume root anchors, availability markers, and batch
   bytes.
3. Change publisher from private-root anchoring to delta anchoring.
4. Make wallet sync verify cheap-claim finality through canonical rail state.
5. If deferred: update `docs/ONT.md` to say the live system is bonded auctions
   while the cheap accumulator rail is under development.

Payoff: very high. Effort: high. This is the main architecture decision.

### Phase 4: Harden proof bundles

Goal: make the trust story true in software, not only in prose.

Actions:

1. ✅ Rename current verifier to structural verification (`verifyProofBundleStructure`,
   with a deprecated `verifyProofBundle` alias). The report now says a pass means
   "well-formed and self-consistent", not "settled on Bitcoin".
2. ✅ Add a Bitcoin inclusion/header verification path
   (`verifyProofBundleAgainstBitcoin`): verifies each cited anchor transaction is
   Merkle-committed by a block header carrying valid proof-of-work, with an optional
   `BitcoinHeaderSource` to pin the header to the canonical chain at its claimed
   height. Bundles carry a `bitcoinInclusion` section; tested against a real Bitcoin
   block header + Merkle branch.
3. ✅ Removed the Ark/RGB experimental proof sources from the core verifier entirely
   (they were never the launch path; the frozen sovereignty core stays auditable).
4. Still to do: define/emit canonical bundles for current direct auction, transfers,
   value records, and accumulator claims (the wallet/resolver should produce bundles
   that carry the `bitcoinInclusion` proofs the new verifier consumes).

Payoff: very high. Effort: medium-high. Steps 1–3 done; step 4 remains.

### Phase 5: Simplify auction surfaces

Goal: reduce review tax in the contested path.

Actions:

1. Rename `experimental-auction` once it is the real contested auction reference,
   or keep it clearly demo-only.
2. Align auction floors with the new split between claim gate and returnable bond.
3. Keep one auction rule: open ascending, visible bids, soft close, minimum
   increments, returnable winner bond.

Payoff: medium-high. Effort: medium.

### Phase 6: Clarify recovery scope

Goal: avoid overpromising recovery on the long-tail rail.

Actions:

1. Document bonded recovery separately from UTXO-less recovery.
2. Decide whether recovery is launch-frozen or deferred.
3. Only describe UTXO-less recovery as first-class once the accumulator rail has a
   canonical ownership state it can recover.

Payoff: medium. Effort: medium.

## Recommended immediate edits

If we want the next PR to be clean and high-leverage, do this first:

1. Rewrite `docs/launch/ONT_LAUNCH_V1_BRIEF.md` around the current one-path model.
2. Keep old launch snapshots archived under `docs/research/archive/retired-launch/`.
3. Update `docs/core/DECISIONS.md` so resolved decisions reflect the current
   claim -> notice -> auction-if-contested model directly, not via framing notes.
4. Keep `CLAIM_GATE_SATS`, `AUCTION_BOND_*`, and `BOND_MATURITY_BLOCKS` as the
   current named constants; active claim state uses fixed maturity, and
   epoch-maturity helpers remain only as deprecated prototype compatibility until
   a dedicated removal pass.
5. Replace wallet wording that treated resolver output as authoritative.

This gives us a stable written baseline before larger code movement.

## Current best answer to "what should ONT be?"

ONT should be presented as a small Bitcoin-settled ownership protocol with a
larger batching layer, not as an auction product plus a pile of scaling research.

The simple story:

- A name is an owner key.
- Bitcoin orders the acquisition and transfer history.
- Cheap uncontested claims batch into accumulator commitments.
- Contested claims use returnable L1 bitcoin bonds.
- Resolvers and publishers help with data and batching but do not decide.
- Proof bundles are what let users carry and verify their ownership.

The implementation should now converge on that story and delete or quarantine the
older paths that were useful for discovery but no longer match the design.
