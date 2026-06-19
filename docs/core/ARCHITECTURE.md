# Architecture

*This document absorbed CURRENT_ARCHITECTURE_BRIEF.md on 2026-06-11 per doc-canon (#45).*

This document describes the current shape of the Open Name Tags prototype as it
exists in this repository. It is the builder map for a fresh human reviewer or
builder LLM: the active design path, the current code entrypoints, and the
retired paths to ignore. For what is live versus prototype versus designed,
[STATUS.md](./STATUS.md) is the single source of truth — if this document and
STATUS disagree, STATUS wins.

## One-Sentence Design

ONT is a flat, Bitcoin-anchored namespace where a name is controlled by an
owner key, ordinary long-tail claims pay a small Bitcoin miner fee and settle
through a batched accumulator, contested names escalate to a returnable-bond
L1 auction, and resolvers mirror/verifiably serve data without deciding
ownership.

## Read This First

Canonical reading order:

1. [../ONT.md](../ONT.md) - plain-language source of truth.
2. [../DESIGN.md](../DESIGN.md) - the full design, including the minimal trust surface (sovereignty map).
3. [../spec/ONT_ACQUISITION_STATE_MACHINE.md](../spec/ONT_ACQUISITION_STATE_MACHINE.md) - claim, notice, uncontested finality, and auction escalation.
4. [../README.md](../README.md) - the reader map (the old design index is archived).
5. [../LAUNCH.md](../LAUNCH.md) - launch/review framing.
6. [../research/archive/SIMPLIFICATION_AUDIT.md](../research/archive/SIMPLIFICATION_AUDIT.md) - cleanup map and remaining simplification work (archived; complete).

Treat [../research/archive/](../research/archive/) as provenance only. Do not
infer active design from archived docs.

## Current Mental Model

There is one acquisition path:

1. A user claims a valid flat name and pays the fixed claim gate, currently
   `₿1,000`, as a Bitcoin miner fee.
2. A public notice window gives others a chance to claim the same name.
3. If no one else claims it, the name becomes final through the batched claim
   path. The owner key controls transfer, recovery setup, and value records.
4. A **qualifying bond — not a claim alone — opens the auction** (Decision #37):
   if a bond is posted in the window, the name escalates to a visible ascending
   auction with returnable Bitcoin bonds. Two or more claims with no bond
   **nullify** the name instead — no owner, and it reopens for claiming.
   Collisions can deny; only bonds can award.
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

At the product level, the system has two layers:

- **Convenience layer:** the hosted website, resolver, and demo infrastructure
- **Sovereign layer:** the open-source code, auction/transfer artifacts, and the Bitcoin chain itself

The goal is to keep those layers aligned without locking users into the hosted convenience path.

## Layer Model

Current prototype work is easiest to reason about as five layers:

1. **Private signet / future Bitcoin deployment:** the chain that carries ONT
   ownership events and auction bid transactions.
2. **Indexer / resolver:** server-side indexing and read APIs. This layer
   watches the chain, reconstructs ownership and auctions, and stores signed
   off-chain destination records for availability.
3. **Client-side helper website:** browser-side transaction prep. This layer
   should assemble unsigned PSBTs and recovery artifacts locally where possible,
   while using the resolver only to read current state and UTXO facts.
4. **User-facing website:** the public product narrative and guided flows. This
   can reuse layer-3 helpers, but should stay simpler than the protocol helper
   surface.
5. **Wallets and clients:** Sparrow today, and eventually native wallet/client
   integrations that can make ONT feel less like a separate web tool.

The current web app mixes layers 3 and 4 in one deployment, but the design
direction is to keep the boundary clear: resolver/indexer work is server-side;
PSBT assembly and user custody checks should move toward browser-side helper
code; signing remains in the wallet.

## Trust Boundaries

### Website

The website is an explorer and transaction-prep tool.

It is responsible for:

- browsing names and state
- preparing auction and transfer handoffs
- generating PSBTs for supported demo flows
- helping users move between search, auction, and transfer flows

It is **not** the signing authority.

The helper parts of the website should stay as static/browser-side as practical.
They may call the resolver for current chain state, auction state, and UTXO
lookup, but they should not require a bespoke server endpoint to construct
ordinary unsigned PSBTs when the shared protocol packages can run in the browser.

### Wallet

Sparrow or another external signer is the authorization boundary.

The wallet is responsible for:

- holding funding keys
- signing PSBTs
- broadcasting Bitcoin transactions

### Chain

The authoritative state is the Bitcoin-compatible chain the resolver is indexing:

- private signet for the hosted demo and live proofs (decommissioned 2026-06-11 — see [STATUS.md](./STATUS.md))
- regtest for exhaustive automated tests

## Main Components

### `apps/web`

The product surface:

- explorer
- auction bid prep
- transfer prep
- setup and key tools

It uses the shared protocol and architect packages, and talks to the resolver for current state.

### `apps/resolver` (quarantined)

The read API and convenience backend:

- name resolution
- auction state
- activity feeds
- tx provenance
- off-chain destination records

It owns the current indexed snapshot and optional database-backed persistence.

### `apps/indexer` (quarantined)

The indexing entrypoint.

Today it can run as a one-shot indexer for inspection/debugging or as part of service orchestration. The resolver also embeds the same state machine for the hosted runtime.

### `apps/cli`

The operator and power-user surface:

- build artifacts
- inspect artifacts
- sign and publish destination records
- auction, transfer, and destination-record support flows
- smoke and demo support

### `apps/wallet`

A local wallet/client prototype.

### `packages/protocol`

Pure protocol definitions:

- constants
- signatures
- destination records
- transfer packages
It no longer exports a chain-event wire codec; active OP_RETURN event
encoding/decoding lives in `@ont/wire`.

### `packages/consensus`

The consensus surface:

- claim status and fixed maturity behavior
- the event replay engine
- the portable ownership proof bundle shape

### `packages/architect` (quarantined)

Pure transaction-prep logic:

- auction bid-package construction
- PSBT building
- wallet metadata helpers

This is the package we want to keep portable so it can run in the browser, in the CLI, or offline.

### `packages/bitcoin`

Bitcoin chain-source helpers:

- RPC transaction parsing
- block loading
- source metadata

### `packages/core` (quarantined)

The state machine:

- name lifecycle
- bond continuity
- transfer handling
- activity tracking
- snapshots

### `packages/db`

Persistence adapters for:

- resolver snapshots
- destination-record storage

## Active Implementation Map

Protocol constants and formats:

- [../../packages/protocol/src/constants.ts](../../packages/protocol/src/constants.ts) - protocol name, name grammar, claim gate, auction minimums, bond maturity.
- [../../packages/protocol/src/names.ts](../../packages/protocol/src/names.ts) - name normalization and validity.
- [../../packages/wire/src/index.ts](../../packages/wire/src/index.ts) - chain event encoding/decoding, W16 full-width auction commitments, owner-key derivation vectors.
- [../../packages/protocol/src/events.ts](../../packages/protocol/src/events.ts) - protocol payload helper types and authorization helpers; not an event codec.
- [../../packages/protocol/src/auction-bid-package.ts](../../packages/protocol/src/auction-bid-package.ts) - signable bid package and auction commitments.
- [../../packages/protocol/src/transfer-package.ts](../../packages/protocol/src/transfer-package.ts) - transfer package format.
- [../../packages/protocol/src/value-record.ts](../../packages/protocol/src/value-record.ts) - owner-signed mutable records.
- [../../packages/protocol/src/recovery-descriptor.ts](../../packages/protocol/src/recovery-descriptor.ts) and [../../packages/protocol/src/recovery-wallet-proof.ts](../../packages/protocol/src/recovery-wallet-proof.ts) - recovery descriptors and wallet-proof envelopes.

Consensus and state:

- [../../packages/consensus/src/state.ts](../../packages/consensus/src/state.ts) - claim status and fixed maturity behavior.
- [../../packages/consensus/src/engine.ts](../../packages/consensus/src/engine.ts) - event replay engine.
- [../../packages/consensus/src/proof-bundle.ts](../../packages/consensus/src/proof-bundle.ts) - portable ownership proof bundle shape.

Auction and indexing:

- [../../legacy/packages/core/src/auction-policy.ts](../../legacy/packages/core/src/auction-policy.ts) - legacy contested-auction policy shape, mining reference only.
- [../../legacy/packages/core/src/auction-sim.ts](../../legacy/packages/core/src/auction-sim.ts) and [../../legacy/packages/core/src/auction-state.ts](../../legacy/packages/core/src/auction-state.ts) - legacy auction simulation/state surfaces, mining reference only.
- [../../legacy/packages/core/src/experimental-auction.ts](../../legacy/packages/core/src/experimental-auction.ts) - legacy live-auction derivation code, mining reference only.
- [../../legacy/packages/core/src/indexer.ts](../../legacy/packages/core/src/indexer.ts) - legacy chain replay, name state, auction observations, and resolver snapshots, mining reference only.

Batched claim path and scaling research (see [STATUS.md](./STATUS.md) for which
pieces were proven on signet (decommissioned 2026-06-11) versus simulation-only):

- [../../legacy/packages/core/src/accumulator.ts](../../legacy/packages/core/src/accumulator.ts) - legacy sparse Merkle accumulator, mining reference only.
- [../../legacy/packages/core/src/research/delta-merge-sim.ts](../../legacy/packages/core/src/research/delta-merge-sim.ts) - legacy leaderless per-block merge simulation, mining reference only.
- [../../legacy/packages/core/src/research/da-convergence-sim.ts](../../legacy/packages/core/src/research/da-convergence-sim.ts) - legacy data-availability convergence simulation, mining reference only.
- [../../legacy/packages/core/src/root-anchor.ts](../../legacy/packages/core/src/root-anchor.ts) - legacy Bitcoin anchor transaction measurement, mining reference only.
- [../../legacy/packages/core/src/research/batch-rail.ts](../../legacy/packages/core/src/research/batch-rail.ts) - legacy batch rail behavior, mining reference only.
- [../../legacy/packages/core/src/research/recovery-sim.ts](../../legacy/packages/core/src/research/recovery-sim.ts) - legacy recovery state machine simulation, mining reference only.

Apps and tools:

- [../../legacy/apps/resolver/src/index.ts](../../legacy/apps/resolver/src/index.ts) - legacy resolver/indexer API and runtime, mining reference only.
- [../../legacy/apps/web/src/](../../legacy/apps/web/src/) - product UI, explorer, auction prep, recovery/value flows (quarantined; clean-build rewrite in B5 — see docs/core/B5_WEB_CLASSIFICATION.md).
- [../../legacy/apps/cli/src/index.ts](../../legacy/apps/cli/src/index.ts) - operator and power-user workflows (quarantined; clean-build rewrite in B5 — see docs/core/B5_CLI_CLASSIFICATION.md).
- [../../legacy/apps/wallet/src/](../../legacy/apps/wallet/src/) - local wallet/client prototype (quarantined; clean-build rewrite in B5 — see docs/core/B5_WALLET_CLASSIFICATION.md).
- [../../legacy/packages/architect/src/](../../legacy/packages/architect/src/) - legacy transaction-prep helpers, mining reference only.

## Recently Retired Or Quarantined

Do not reintroduce these unless there is an explicit new design decision:

- Auction classes. The old class-selector field and single launch-class fixture
  path have been removed from active policy, bid packages, fixtures, apps,
  tests, and docs. There is one contested-auction policy.
- Universal direct-auction launch docs. Retired launch docs live under
  [../research/archive/retired-launch/](../research/archive/retired-launch/).
- Sponsor credits as the active scaling plan. Sponsor-credit docs are
  historical. The current scaling path is the batched claim path with contest
  escalation to L1.
- Ark, RGB, Lightning/LSP, and custom L2 bonding as launch dependencies. They
  remain research topics only.
- Epoch-halving maturity as active behavior. Fixed maturity is active; legacy
  helpers remain only as deprecated compatibility code.

## Runtime Modes

### Fixture mode

Best for:

- local UI work
- quick HTTP smoke tests
- deterministic demos without a node

### Regtest

Best for:

- exhaustive automated integration tests
- deterministic funding
- protocol edge cases

### Private signet

Best for:

- guided demos
- Sparrow testing
- realistic but controlled lifecycle walkthroughs

## Product Flows

### Explorer

User jobs:

- search for a name
- understand its state
- inspect history and provenance
- decide what to do next

### Auction Bid Prep

For contested names only — the auction is the escalation path, not the entry
path. User jobs:

- inspect the current auction state for a name
- choose or generate owner key material
- prepare bid artifacts
- hand the result to Sparrow or another signer

### Transfer prep

User jobs:

- start from an existing name
- understand which transfer mode fits
- generate the right handoff for gift, immature sale, or mature sale

## Off-Chain Destination Distribution In v1

There is an important distinction between:

- **name ownership**, which is derived from the chain
- **destination-record availability**, which depends on who is hosting signed destination records

Today, the trust story is:

- any indexer can independently derive ownership from Bitcoin-compatible chain data
- any resolver can independently verify a signed destination record against the current on-chain owner
- the hosted resolver is still the primary distribution point for off-chain destination records in the v1 product

That means v1 is **not** centralized for ownership, but it is still somewhat centralized for the availability of the latest signed destination record if only one resolver is hosting it.

This is an intentional v1 boundary, not the intended end state.

There is also a history boundary in the current prototype:

- current destination records are signed, sequence-numbered, and predecessor-linked
- the resolver stores destination history by current ownership interval
- each record points to the previous destination-record hash, or `null` for the first
  record in that ownership interval
- timestamps are signed metadata, not the canonical ordering rule

That lets a resolver show not only "the current destination is `bar`," but also
"this owner-signed chain changed from `foo` to `bar` in this order."

### Why this is acceptable for v1

- the signed destination record is portable
- the resolver does not get to invent ownership
- the user is not cryptographically locked to one hosted service
- we are only running one public resolver at launch, so a resolver-fanout protocol would add complexity before it adds much practical resilience

### Planned future direction

The first decentralization step now has an initial prototype:
**client-side multi-resolver publish/read in the CLI**, plus
**website-side fanout/compare against a configured resolver allowlist**.
Resolver-to-resolver gossip is still not the first move.

Today that means:

- the user signs one destination record locally
- the CLI can publish the same signed record to multiple resolvers
- the CLI can compare current destination history visibility across multiple resolvers
- the website can do the same only when the deployment explicitly configures a
  resolver allowlist
- each resolver still verifies ownership, ownership interval, predecessor hash, and
  sequence independently
- the hosted website still defaults to one resolver unless that allowlist is
  configured

This keeps the security boundary clean:

- chain determines ownership
- signatures authorize destination updates
- resolvers provide convenience and availability, not ultimate authority

Resolver federation or relay-based distribution may still make sense later, but they are explicitly outside the v1 scope.

### Resolver discovery posture

Resolver discovery should start off-chain. Resolver endpoints are operational
metadata: they can move, disappear, rotate keys, or need revocation. Putting
endpoint announcements directly on Bitcoin would make mutable service discovery
permanent and may accidentally imply protocol endorsement.

The preferred direction is:

- ship a small default resolver set for bootstrap
- support deployment-configured resolver allowlists
- allow DNS seeds, manual resolver URLs, or resolver-to-resolver peer gossip later
- score discovered resolvers against Bitcoin-derived ownership ground truth
- compare signed destination-record chain heads across multiple resolvers when freshness matters

On-chain resolver announcements may still be useful later for anchoring a
long-lived resolver identity key, but they should be optional and should not be
treated as trust. The endpoint metadata signed by that identity can remain
off-chain and mutable.

The important boundary is: Bitcoin is the source of ownership truth, not the
source of resolver availability truth. Discovery finds candidates; verification
and scoring decide whether a resolver is useful.

## Higher-Trust Preparation

Hosted prep is the convenience layer.

For high-value use, the stronger path should stay local-first:

- inspect the open-source builder code
- provide wallet metadata and UTXOs locally
- generate artifacts locally
- sign in Sparrow

That keeps high-value preparation closer to the Ian Coleman model: transparent
and runnable without trusting a live hosted JavaScript bundle. The old
direct-allocation browser path is retired; any higher-trust path should now be
claim-first, with local auction preparation when a claim is contested.

## Known v1 Tradeoffs

These are the main issues we already understand and want reviewers to keep pushing on:

- **Transfer relay policy:** the current prototype transfer payload exceeds older conservative `OP_RETURN` relay limits. Modern Bitcoin Core defaults are more permissive, but transfer relay is still policy-dependent and broad compatibility is not yet guaranteed.
- **Post-maturity holding cost:** mature names no longer require bond continuity. That reduces permanent UTXO pressure, but it also means long names become cheap to hold indefinitely after the maturity period.
- **Resolver concentration:** ownership is chain-derived, but destination-record availability is still vulnerable to concentration if only one or a few resolvers matter in practice.
- **Auction visibility:** bids are visible once broadcast. That improves market discovery, but it also means later bidders can react to earlier bids.
- **Owner-key recovery:** the prototype intentionally separates the wallet/funding key from the owner key. That keeps routine authority clean. Recovery now has signed resolver-stored descriptors, a prototype `RECOVER_OWNER` challenge-window state machine, protocol-level BIP322 proof-envelope verification, resolver proof storage, and indexer proof-availability enforcement. Proof fanout/durability and product recovery flows are still open.

## Current Cleanup State

Mostly done:

- Current docs are consolidated around `ONT.md`, the reader map
  ([../README.md](../README.md)), and the launch brief.
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
4. Keep accumulator scaling docs honest about what is prototype-measured versus
   launch-frozen.
5. Clearer local-first auction and transfer preparation.
6. Cleaner separation between hosted convenience and repo/operator docs.
7. Eventual durable database-backed indexing as the normal default, not an
   optional mode.
8. Long-term cleanup of infrastructure-specific defaults before broad
   open-source distribution.

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
- Preserve the additive scaling posture: long-tail path improvements must not
  weaken already-settled names or the L1 contested-auction path.
