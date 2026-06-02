# Open Name Tags Implementation Plan

## Purpose

This document turns the current ONT protocol direction into a concrete
implementation plan for a public prototype on signet.

The goal is not to freeze the final mainnet protocol immediately. The goal is
to:

- build a working reference implementation
- test the one-path claim protocol shape on signet
- gather feedback from Bitcoin-focused reviewers
- tighten the spec before any canonical mainnet launch

For the current launch model, see
[ONT_ACQUISITION_STATE_MACHINE.md](../design/ONT_ACQUISITION_STATE_MACHINE.md)
and [ONT_LAUNCH_V1_BRIEF.md](../launch/ONT_LAUNCH_V1_BRIEF.md).

## Build Goal

Ship a signet prototype with:

- a long-running ONT indexer
- a read-only resolver API
- a CLI or signer-capable client
- a website for browsing, search, provenance, auction bid preparation, transfer
  preparation, and value-record publishing

The signet prototype should demonstrate:

- public claim, notice, and uncontested finalization
- auction escalation for contested names
- bond continuity tracking
- ownership transfer
- off-chain value publishing and lookup
- independent reproducibility from Bitcoin data

## Working Assumptions

These assumptions are strong enough to build against:

- names are `[a-z0-9]{1,32}` and canonicalized to lowercase
- every valid name enters the same public claim path
- uncontested claims finalize through the accumulator rail after their notice
  window
- contested claims escalate to public bonded auction
- there is no reserved-word list, no pre-launch reservation system, and no
  ordinary-vs-reserved split
- values are off-chain by default
- pre-release transfer must preserve bond continuity
- same-block competing bids are tie-broken by deterministic transaction order

Still provisional:

- final auction windows
- final soft-close response window and late-bid increment
- final opening-bond floors
- final winner bond duration, especially in light of long-lock and quantum
  concerns

## Recommended Architecture

### Core Components

1. `bitcoin-node`

Use a signet-capable Bitcoin Core node as the source of block and transaction
truth.

Responsibilities:

- sync signet chain
- expose RPC and ZMQ or polling access
- support transaction broadcast for prototype flows

2. `ont-indexer`

A long-running service that:

- scans signet blocks
- parses ONT events
- tracks auction state, ownership state, bond continuity, and maturity/release
  rules
- stores normalized indexed state in a database
- handles reorg rollback and replay

3. `ont-resolver`

A read-only API layered on indexed state.

Responsibilities:

- resolve names to current state
- return latest valid off-chain value record
- return provenance for events and names
- return auction eligibility and bid state

4. `ont-cli`

A local signer-oriented tool that:

- derives or imports owner keys
- prepares auction bid packages and transfer packages
- signs off-chain value records
- validates bond continuity before signing
- broadcasts transactions when configured to do so

5. `ont-web`

A website that:

- queries the resolver
- shows auction state, ownership, and provenance
- prepares unsigned or partially prepared auction/transfer flows
- helps users publish off-chain value records

The website should not be the only execution path. Every meaningful action
should also be possible with the CLI.

## CLI Scope v1

The CLI should support:

- lookup and resolver inspection
- auction policy and bid-state inspection
- auction bid package creation
- auction bid artifact creation
- transfer package creation
- value-record signing and publishing
- wallet/account scanning helpers

Minimum capabilities:

- derive/import owner key
- produce prototype auction and transfer transactions
- detect and protect live bond UTXOs
- validate successor bond continuity before signing
- support cooperative PSBT-style sale flows so mature-name sales are bound to
  the exact transaction

## Phase Plan

### Phase 0: Skeleton And Constants

Goal:

- establish the workspace and shared package layout

Deliverables:

- monorepo layout
- shared protocol constants
- normalization helpers
- bond and maturity calculators
- provisional wire-format types

Exit criteria:

- packages compile
- constants match the current decision log

### Phase 1: Auction Protocol Engine

Goal:

- make ONT auction state transitions executable without any UI

Deliverables:

- event parsers
- auction state machine
- bond continuity validator
- deterministic tie-break logic
- settlement into owned name records

Exit criteria:

- unit tests cover bid acceptance, low-bid rejection, soft close, settlement,
  transfer, value publishing, and invalidation cases

### Phase 2: Regtest Prototype

Goal:

- prove end-to-end transaction logic locally

Deliverables:

- regtest Bitcoin Core integration
- auction bid transaction creation
- transfer transaction creation
- atomic sale transaction creation for gift and sale transfer modes
- off-chain value signing
- local indexer processing from regtest blocks

Exit criteria:

- can bid for, settle, transfer, and resolve a name on regtest
- can deliberately break bond continuity and observe release behavior
- can reopen a released name through a release-anchored auction generation

### Phase 3: Signet Public Beta And Community Review

Goal:

- run an open prototype on Bitcoin Signet to gather technical feedback,
  identify edge cases, and stress-test protocol incentives

Focus areas:

- protocol hardening around reorg handling, bond continuity, settlement, and
  tie-breaking
- UX refinement around auction bidding, self-custody keys, and transfer flows
- ecosystem tooling for reference resolution APIs and wallet handoffs
- parameter review before constants are frozen

### Phase 4: Path To Mainnet

Goal:

- a fair, neutral launch of the canonical namespace once the protocol is proven
  stable

Launch posture:

- mainnet will be scheduled only after signet stability and public review
- a future Bitcoin block height will be announced in advance
- the protocol remains committed to no reserved names, no founder allocation,
  no pre-launch reservations, and no identity-based quotas

### Phase 5: Ecosystem And Wallet Support

Goal:

- scale namespace utility through integration and tooling

Deliverables:

- reference implementations for serving signed off-chain resolution records
- wallet integration notes for ONT resolution
- local-first signer flows for auction and transfer packages

## Testing Strategy

### Regtest

Use for:

- fast transaction iteration
- deterministic chain construction
- negative-path validation

### Private Signet

Use for:

- hosted demos
- Sparrow testing
- realistic but controlled lifecycle walkthroughs

### Public Signet

Use for:

- external reviewer testing
- broader network behavior
- public operational rehearsal before any mainnet launch
