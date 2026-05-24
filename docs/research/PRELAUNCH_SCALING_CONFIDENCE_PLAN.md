# ONT Pre-Launch Scaling Confidence Plan

This document defines what ONT should know before launch so reviewers can
support a simple L1 v1 without feeling that the project is ignoring scale or
painting itself into a corner.

## Position

ONT v1 should not depend on sponsor credits, Ark, RGB, or any custom L2.

But v1 should launch only if:

1. the L1 design stands on its own;
2. v1 data structures do not block future scaling paths;
3. at least one credible scaling path has a concrete lifecycle, proof bundle,
   and threat model;
4. the public launch message is honest about what is solved now versus what is
   being researched.

The goal is not to finish v2 before v1. The goal is to prove that v1 is a sound
base layer for later improvements.

## Core Concern

Some reviewers may hesitate to endorse a pure L1 launch because direct bonded
auctions do not scale to all humans, apps, agents, and devices.

That concern is valid.

The investigation behind the current scale hypothesis is recorded in
[SCALABILITY_INVESTIGATION_AND_HYPOTHESES.md](./SCALABILITY_INVESTIGATION_AND_HYPOTHESES.md).

The answer should not be "trust us, scaling later." It should be:

> v1 creates the scarce, strongly verifiable root primitive. The ownership model
> is acquisition-source agnostic, and the leading scale path is public-batch
> sponsored issuance with long notice windows, L1 challenge fallback, and
> portable proof bundles. Ark and RGB are being evaluated as substrates for the
> credit-state and proof layers, not as v1 dependencies.

## Things v1 Must Preserve

### 1. Name Identity Is Independent Of Acquisition Path

`alice` should be the same name whether it was acquired by:

- direct L1 bonded auction
- future sponsored claim
- future Ark-backed auction
- future hardened upgrade from sponsored to direct

Do not bake "L1 auction txid equals name identity" into every layer. Treat it
as one possible ownership reference.

### 2. Owner Keys Are The Stable Authority Layer

The owner key should control mutable records across every path.

Scaling paths should change how ownership is acquired or proven, not how users
sign records once they own a name.

### 3. Proof Bundles Must Be Source-Tagged

Clients and resolvers should verify proof bundles that declare an acquisition
source:

- `bitcoin_l1_direct_auction`
- `ark_auction_transcript`
- `sponsored_public_batch`
- `ark_sponsored_claim`
- `rgb_style_state_transition`

The verifier should not assume every valid name comes from the same transcript
source forever.

### 4. Assurance Tiers Must Be First-Class

Clients should be able to distinguish:

- direct L1 bonded
- mature direct released
- sponsored final
- sponsored challenged into auction
- Ark-settled
- L1 hardened
- degraded / unavailable proof data

This avoids future confusion if multiple acquisition paths coexist.

### 5. Auction Rules Should Be Separable From Transcript Source

The ONT auction state machine should be defined independently from where bids
come from.

v1 transcript source: Bitcoin L1 bid transactions.

Future transcript sources:

- Ark/VTXO-collateralized bids
- public batch/log bids
- other proof-bundle-backed sources

The goal is one auction model, not many incompatible auction systems.

### 6. Public Notice Is Required For Optimistic Issuance

For any future sponsored/non-UTXO path:

- sponsor signature creates an intent
- public batch/log inclusion starts the notice window
- full batch data must be retrievable
- valid challenge routes to auction
- no private or quiet claim window can finalize ownership

### 7. Resolver Data Must Be Replayable And Exportable

Early ONT can rely operationally on one or a few serious resolvers, but only if
all data is portable.

The bootstrap resolver should be a data-availability anchor, not a registrar.

Initial project operators should commit to multi-year resolver, relay, and
mirror support while making that support easy to replace:

- publish export and mirror-bootstrap instructions
- encourage independent operators to run resolvers and relays
- support user-configured resolver endpoints
- make proof bundles portable across services
- keep direct L1 issuance available when sponsor/relay infrastructure is
  unavailable

Required properties:

- full event export
- full batch export
- proof-bundle export
- deterministic replay
- public checkpoint history
- easy mirror bootstrap

## Leading Scaling Candidate

The current leading candidate is:

> public-batch sponsor credits, optionally accelerated by Ark, with L1 challenge
> fallback and RGB-style proof discipline.

### No-Ark Reference Path

1. Sponsor earns credits from mature L1 bonded BTC-time.
2. Sponsor signs `name -> owner_key`.
3. Recipient countersigns.
4. Claim is included in a public resolver/indexer batch.
5. Batch data is mirrored and checkpointed.
6. Long notice window begins from public batch anchor.
7. If challenged by valid L1-backed claim, route to auction.
8. If uncontested, finalize as sponsored.

This is simpler and Bitcoin-native, but credit-state replay and no-challenge
verification put heavy responsibility on indexers/resolvers.

### Ark-Backed Path

1. Sponsor has Ark/VTXO credit account or capital source.
2. Auction bids or sponsor credit spends happen in Ark-like state.
3. Claims are batched.
4. Batch/transcript data is public and mirrored.
5. Long notice window begins after settled/public batch inclusion.
6. L1 challenge fallback remains available.
7. Final proof bundle distinguishes preconfirmed, settled, sponsored, and
   hardened states.

Ark may improve credit non-reuse, bid collateral, batch execution, and
throughput. Ark should not be required for v1, and preconfirmed Ark state should
not be treated as final ONT ownership without clear assurance labeling.

## Pre-Launch Confidence Gates

### Gate A: v1 Extension Safety

Required before launch.

- v1 docs explicitly separate name, owner key, ownership reference, and proof
  source
- proof bundles are acquisition-source-tagged
- clients can display assurance tiers
- resolver/indexer events can be replayed without assuming all future ownership
  came from L1 auctions
- launch messaging does not claim L1-only issuance is the final scale answer

### Gate B: Sponsor-Credit Reference Design

Strongly recommended before launch.

- exact lifecycle for public-batch sponsored claims
- long notice window rule
- data-availability rule
- L1 challenge fallback rule
- sponsor credit earn/spend/expire rules
- proof bundle sketch for a fresh verifier
- adversarial model covering quiet claims, missing data, duplicate credits, and
  resolver omission

This can be design-level, not production code.

### Gate C: Ark Feasibility Spike

Useful before launch, but not a launch blocker.

- identify which Ark state is independently verifiable
- distinguish preconfirmed vs settled VTXO assurance
- test whether Ark can represent bid collateral or sponsor credit spends
- define what proof artifacts ONT would need from Ark
- confirm Ark does not force ONT to depend on one operator for final ownership

### Gate D: External Review Packet

Recommended before broad launch amplification.

Ask reviewers narrow questions:

1. Does v1 paint us into a corner for later sponsored/L2 issuance?
2. Does the sponsor-credit reference design avoid hidden registrar trust?
3. Is the public notice plus L1 challenge model credible?
4. Does Ark materially improve credit state or auction execution?
5. Are there simpler alternatives we are missing?

## What To Avoid Before Launch

- promising sponsor credits as solved
- making Ark a v1 dependency
- hard-coding UI language that says all ownership must be L1 bonded forever
- treating Merkle roots as sufficient without batch data availability
- allowing any future claim window to start from private sponsor signature time
- mixing direct bonded and sponsored names without assurance tiers

## Recommended Pre-Launch Work

1. Update v1 brief with an "extension safety" section.
2. Define a normative-ish proof-bundle vocabulary for acquisition sources and
   assurance tiers.
3. Write the public-batch sponsored-claim lifecycle as the reference scaling
   candidate.
4. Build a small resolver export/import replay test for proof-bundle data.
5. Do one Ark feasibility spike focused only on bid collateral or credit
   non-reuse.
6. Prepare a short reviewer packet that says exactly what is v1 and what is
   scaling research.

## Public Summary

ONT v1 is intentionally simple: direct L1 bonded flat names.

The scaling plan is not to abandon that model, but to make it the highest
assurance path while adding cheaper optimistic issuance for long-tail names.

The leading scale path is public-batch sponsor credits:

- many sponsored claims are batched together
- public notice starts only after batch availability
- challengers can force disputed names into the normal auction path
- L1 remains the fallback and hardening layer
- Ark may improve off-chain auction and credit execution
- RGB-style ideas may improve proof bundles and state validation

This gives reviewers a concrete answer:

> v1 does not solve global-scale issuance by itself, but it is designed not to
> block the most credible scaling paths.
