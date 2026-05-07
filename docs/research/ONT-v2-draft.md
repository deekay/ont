# Open Name Tags (ONT): Protocol Specification Draft (v2)

This document defines the ONT protocol behind Open Name Tags: a Bitcoin-anchored ownership and state log for human-readable names.

## 1. Name Syntax and Normalization

- **Charset:** `[a-z0-9]` (ASCII lowercase letters and digits).
- **Length:** 1 to 32 characters.
- **Normalization:** Case-insensitive input; canonical form is lowercase.
- **No Suffixes:** Names are standalone strings (e.g., `alice`).

## 2. Ownership Model

ONT uses **Pubkey-Controlled Ownership**. A name is owned by a specific public key. Valid state transitions are auction acquisitions and transfers.

- **Ownership Truth:** The latest valid signed state transition recognized by the ONT indexer from the Bitcoin blockchain.
- **Separation of Concerns:** Bitcoin records ownership events; application-specific "Values" (e.g., Lightning addresses) are off-chain and owner-signed.

## 3. The Name-Bond Model

To acquire or maintain an immature name, a participant must lock bitcoin as a bond in a dedicated UTXO.

### 3.1 Bond Curve
Bond amounts are length-based and follow a halving curve:
User-facing curve:

`bond_btc(length) = max(₿0.0005, ₿1 / 2^(length - 1))`

Low-level implementations may still store this amount as integer base units.

### 3.2 Maturity Schedule
Names are "immature" for a set period, after which bond continuity is no longer required.
- **Epoch 0:** 52,000 blocks (~1 year).
- **Epoch Length:** 52,000 blocks.
- **Halving:** Earlier direct-claim maturity curves are retired from the launch model; auction settlement and release durations are policy parameters.

### 3.3 Bond Continuity
An immature name remains valid only while its dedicated bond outpoint remains unspent (or is moved via a valid ONT Transfer). If bond continuity breaks before maturity, the name is immediately released.

A released name can be opened again through a new auction generation. The first
auction uses the launch opening lot; a reopened auction uses the release block as
its objective generation anchor so old and new auctions cannot share a lot
commitment.

## 4. On-Chain Events

ONT v1 standardizes auction and transfer events via `OP_RETURN`.

### 4.1 AUCTION_BID
Publishes a bonded bid against a specific name and auction-state commitment.
- **Payload:** `magic(3) | version(1) | type(1) | flags(1) | bond_vout(1) | maturity_blocks(4) | bid_amount_base_units(8) | owner_pubkey(32) | lot_commitment(16) | auction_commitment(32) | bidder_commitment(16)`
- **Rule:** Must be in the same transaction as the bid bond UTXO.

### 4.2 TRANSFER
Atomic ownership and bond transition.
- **Payload:** `magic(3) | version(1) | type(1) | body(...) | signature(64)`
- **Rule:** For unsettled names, the transfer transaction must spend the old bond and create a valid successor bond.

## 5. Off-Chain Values

Name "Values" (what the name points to) are off-chain by default.
- **Envelope:** `value_type(1) | payload_length(2) | payload(variable)`
- **Authentication:** Must be signed by the current ONT owner key.
- **Sequence:** Highest monotonic sequence number wins.

## 6. Resolver and Value Availability

### 6.1 Two-Layer Trust Model

ONT ownership state and off-chain destination records have different availability guarantees by design.

**Ownership state** is fully derivable from Bitcoin. Any operator with access to chain data from the launch height can reconstruct the complete ONT name registry without any resolver. No resolver availability assumption is required for ownership verification.

**Off-chain destination records** are signed by the current owner key and served by resolvers. Their authenticity is verifiable: records must match the current owner, current ownership interval, exact next sequence, and previous record hash. Availability still depends on at least one resolver retaining a copy.

### 6.2 Chain-Derived Completeness

Because the canonical name set is derivable from Bitcoin, resolver completeness is objectively auditable. A client that has indexed chain data knows exactly which names should exist and can score any resolver by sampling its answers against ground truth. Resolvers cannot fabricate completeness; the chain is the reference.

### 6.3 Resolver Discovery

The reference implementation supports a layered discovery model:

- **Hardcoded seeds:** Known resolver endpoints shipped in the client as a bootstrap mechanism, analogous to Bitcoin's hardcoded seed nodes.
- **DNS seeds:** Operator-run domains that return lists of active resolver endpoints.
- **Gossip:** Resolvers surface lists of other known resolvers to connecting clients.
- **On-chain announcements:** Resolvers may publish an OP_RETURN announcement (endpoint URL and signing pubkey) to make themselves permanently discoverable via chain indexing alone.

### 6.4 Destination Record Availability

Owners have several options for ensuring their destination records remain available:

- **Self-hosted with resolver cache:** Owner publishes the signed record at a self-controlled URL and registers a fetch hint with resolvers. The record survives any individual resolver failure.
- **History-aware destination chains:** Destination records include a signed predecessor hash and an ownership-interval reference, so clients can verify update order rather than trusting a resolver's latest-destination summary.
- **Multi-resolver replication:** Any resolver may store and serve destination records for any name. Clients compare the latest valid chain heads across queried resolvers.
- **External transport:** Since destination records are self-contained signed envelopes, they may be published over any authenticated transport. No specific transport is mandated by the protocol.

## 7. Fairness and Immutability

- **No Reserved Names:** Issuance is open to all from day one.
- **Immutable Constants:** Bond curves, maturity schedules, and validity rules are frozen at launch.
- **Objective Scarcity:** Throttled by capital lockup and time, not by subjective pricing categories.
