# Architecture

This document describes the current shape of the Open Name Tags prototype as it exists in this repository.

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

## Mental Model

The system has two layers:

- **Convenience layer:** the hosted website, resolver, and demo infrastructure
- **Sovereign layer:** the open-source code, auction/transfer artifacts, and the Bitcoin chain itself

The goal is to keep those layers aligned without locking users into the hosted convenience path.

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

- private signet for the hosted demo and current live proofs
- regtest for exhaustive automated tests

## Main Components

### `apps/web`

The product surface:

- explorer
- auction bid prep
- transfer prep
- setup and key tools

It uses the shared protocol and architect packages, and talks to the resolver for current state.

### `apps/resolver`

The read API and convenience backend:

- name resolution
- auction state
- activity feeds
- tx provenance
- off-chain destination records

It owns the current indexed snapshot and optional database-backed persistence.

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

## Known v1 Tradeoffs

These are the main issues we already understand and want reviewers to keep pushing on:

- **Transfer relay policy:** the current prototype transfer payload exceeds older conservative `OP_RETURN` relay limits. Modern Bitcoin Core defaults are more permissive, but transfer relay is still policy-dependent and broad compatibility is not yet guaranteed.
- **Post-maturity holding cost:** mature names no longer require bond continuity. That reduces permanent UTXO pressure, but it also means long names become cheap to hold indefinitely after the maturity period.
- **Resolver concentration:** ownership is chain-derived, but destination-record availability is still vulnerable to concentration if only one or a few resolvers matter in practice.
- **Auction visibility:** bids are visible once broadcast. That improves market discovery, but it also means later bidders can react to earlier bids.
- **Owner-key recovery:** the prototype intentionally separates the wallet/funding key from the owner key. That keeps authority clean, but it means v1 has no built-in recovery path if the owner key is lost.

### `apps/indexer`

The indexing entrypoint.

Today it can run as a one-shot indexer for inspection/debugging or as part of service orchestration. The resolver also embeds the same state machine for the hosted runtime.

### `apps/cli`

The operator and power-user surface:

- build artifacts
- inspect artifacts
- sign and publish destination records
- auction, transfer, and destination-record support flows
- smoke and demo support

### `packages/protocol`

Pure protocol definitions:

- constants
- event encoding / decoding
- signatures
- destination records
- transfer packages

### `packages/architect`

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

### `packages/core`

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

User jobs:

- inspect the current auction state for a name
- choose or generate owner key material
- prepare bid artifacts
- hand the result to Sparrow or another signer

### Transfer prep

User jobs:

- start from an existing name
- understand which transfer mode fits
- generate the right handoff for gift, immature sale, or mature sale

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
auction-first.

## What Still Needs Improvement

- clearer local-first auction and transfer preparation
- cleaner separation between hosted convenience and repo/operator docs
- eventual durable database-backed indexing as the normal default, not an optional mode
- long-term cleanup of infrastructure-specific defaults before broad open-source distribution
