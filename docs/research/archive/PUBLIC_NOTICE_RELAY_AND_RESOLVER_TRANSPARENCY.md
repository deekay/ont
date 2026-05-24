# Public Notice Relays And Resolver Transparency

This document is research for sponsored issuance, resolver transparency, and
future scaling paths. It is not part of the ONT v1 launch spec.

v1 remains direct L1 bonded flat names plus owner-signed records.

## Purpose

Sponsored issuance only works if a private sponsor assignment cannot become a
name simply because no one saw it in time to challenge it.

The public-notice layer is meant to provide the missing visibility:

> A sponsor signature creates intent. Public log inclusion starts the notice
> clock. Deterministic replay decides the ownership result.

Relays and resolvers can help publish, mirror, checkpoint, and serve evidence.
They must not become registrars.

## Design Goal

A fresh verifier should be able to answer:

1. Was the claim or challenge submitted to a public append-only log?
2. When did public notice begin?
3. Was the full claim/challenge data available during the notice window?
4. Was the sponsor eligible and were credits spent exactly once?
5. Did a valid challenge arrive before the window closed?
6. Did the claim finalize, route to auction, or remain non-final?
7. Can the current owner carry a proof bundle to another resolver?

If the answer depends on trusting one resolver's private database, the design
has failed.

## Non-Goals

The public-notice layer should not:

- decide who owns a name
- replace Bitcoin as the source of direct L1 ownership events
- hide sponsored names behind a centralized registrar
- make one relay permanently mandatory
- treat Merkle roots or timestamps as substitutes for data availability
- make sponsored names indistinguishable from direct L1 names

## Roles

| Role | Responsibility | Not Allowed To Decide |
| --- | --- | --- |
| Sponsor | Signs a sponsored claim and spends credits. | Whether the claim finalized. |
| Recipient owner | Countersigns acceptance with the owner key. | Whether public notice was adequate. |
| Public notice relay | Validates basic format, appends entries, signs receipts, serves and gossips data. | Whether a name is owned. |
| Resolver | Serves name lookups, proof bundles, and mirrored log data. | Canonical ownership by discretion. |
| Indexer | Replays Bitcoin, ONT rules, logs, challenges, and proof bundles. | Exceptions to deterministic rules. |
| Challenger | Publishes a valid UTXO-backed competing claim. | Whether an invalid challenge blocks finality. |
| Batch/checkpoint publisher | Commits log roots to Bitcoin, OpenTimestamps, or another timestamp layer. | Availability of missing leaves. |
| Monitor | Watches logs for claims, challenges, forks, and missing data. | Protocol validity. |

One physical service may run several roles, but the protocol should keep the
responsibilities separate.

## Core Rule

A sponsored claim is not live when the sponsor signs it.

A sponsored claim becomes live only after qualified public notice.

Qualified public notice requires:

- a valid claim payload
- recipient owner-key acceptance
- inclusion in at least one recognized public append-only log
- a relay-signed append receipt
- full payload retrievability
- deterministic challenge-window start height or time
- a proof path from the log entry to any later batch/checkpoint

The relay receipt proves publication. It does not prove ownership.

## Append-Only Log Model

Each public notice relay maintains one or more append-only logs. A log has:

- `logId`
- relay public key
- genesis record
- monotonically increasing sequence numbers
- hash-linked entries
- signed append receipts
- optional periodic Merkle batch roots

A log entry should include:

- `logId`
- `sequence`
- `previousEntryHash`
- `entryType`
- `payloadHash`
- full payload or a content-addressed reference
- relay-observed time
- relay-observed Bitcoin height and block hash, if available
- relay signature

Recommended `entryType` values:

- `sponsored_claim`
- `sponsored_challenge`
- `credit_state_transition`
- `batch_checkpoint`
- `relay_metadata`
- `fork_evidence`

The entry hash should commit to all fields needed for replay. The relay should
return an append receipt containing at least:

- `logId`
- `sequence`
- `entryHash`
- `previousEntryHash`
- `payloadHash`
- `receivedAt`
- relay public key
- relay signature

Receipts are portable evidence that a specific relay accepted a specific entry
at a specific point in its log.

## Batches And Checkpoints

Relays may periodically batch log entries into a Merkle tree.

A batch should commit to:

- relay log id
- entry sequence range
- previous batch root
- Merkle root over entry hashes
- batch creation time
- observed Bitcoin height and block hash
- relay signature

The batch root may then be anchored through:

- direct Bitcoin transaction
- OpenTimestamps attestation
- another public timestamp or transparency service
- cross-signing by other resolvers

The checkpoint proves that a commitment existed by some time. It does not prove
that the underlying data was available. A verifier must be able to retrieve the
full leaves needed for replay.

## Challenge Window

For sponsored claims, the challenge window should start from a deterministic
public-notice point, not from a private signature.

Possible start rules:

- first valid append receipt from a recognized public relay
- first batch inclusion after append
- first Bitcoin/OpenTimestamps checkpoint after batch inclusion

The safest version is checkpoint-based. The fastest version is receipt-based.
The design should choose explicitly.

The proof bundle for a finalized sponsored name must identify:

- which log entry started the window
- which relay signed the receipt
- which checkpoint, if any, anchored the entry
- the exact window start and end rule
- any valid challenges observed during the window
- the replay result

## Credit Spend Ordering

Sponsor credits need a replayable state machine.

Relays do not decide whether a sponsor had enough credits. They publish credit
spend attempts. Indexers replay them.

A simple non-Ark ordering rule could be:

1. Group credit spends by checkpoint epoch.
2. Order epochs by Bitcoin-confirmed checkpoint order.
3. Within an epoch, sort spends by `(sponsorKey, payloadHash, receiptHash)`.
4. Recompute each sponsor's credit balance from Bitcoin-observable bond facts.
5. Accept spends until credit is exhausted.
6. Mark duplicate spends, overspends, and ineligible spends invalid.

This avoids a relay choosing winners by private ordering. It also means a relay
receipt is not enough; the credit spend must survive deterministic replay.

Open question: whether this epoch model is too coarse for user experience or
whether Ark/RGB-like state would provide cleaner non-reuse proofs.

## Resolver As Mirror, Not Source Of Truth

A resolver may:

- mirror relay logs
- serve append receipts
- serve batch inclusion proofs
- serve proof bundles
- compare other resolvers' logs
- warn about missing data, lag, or forks
- expose user-facing name lookup APIs

A resolver may not:

- finalize names by local policy
- ignore a valid challenge and still claim finality
- treat unavailable batch data as fully final
- rewrite relay logs without fork evidence
- make sponsored names appear equivalent to direct L1 names when assurance
  differs

The slogan:

> Resolvers carry evidence. Verifiers decide by replay.

## Mirror And Gossip Behavior

A healthy resolver/relay network should behave like a public broadcast layer.

Recommended behavior:

- accept any well-formed claim, challenge, or relay receipt
- gossip new entries to configured peers
- fetch missing batch data from peers
- store fork evidence instead of hiding it
- expose recent log heads and batch roots
- expose data-availability status for each batch
- support manual submission to multiple relays
- make it easy for challengers to monitor all new claims

This is similar in spirit to Bitcoin's bootstrap peer discovery: known endpoints
help nodes find the network, but validation remains local.

## Relay Recognition

Bootstrap clients may ship with a small list of known public notice relays.

That list should be treated as discovery and publication infrastructure, not
as a permanent governance set. A good relay list should support:

- user-configured relays
- manual relay URLs
- DNS or website-published relay lists
- peer gossip
- signed relay metadata
- multiple independent operators

Protocol designers should avoid rules like "80% of active resolvers" unless
"active resolver" can be defined without identity capture or Sybil problems.

Better framing:

- one recognized relay receipt is the minimum bootstrap publication rule
- multiple relay receipts improve assurance
- cross-signed or widely mirrored batches improve assurance
- direct L1 issuance remains the censorship-resistant fallback

## Bootstrap Operator Commitment

Initial ONT project operators should commit to running public resolver, relay,
and mirror infrastructure for multiple years to bootstrap data availability and
public notice.

That commitment is operational, not constitutional:

- project-operated mirrors help early users and reviewers trust that data will
  remain retrievable
- project-operated mirrors should publish export formats and mirror-bootstrap
  instructions
- the project should actively encourage independent operators to run resolvers,
  relays, monitors, and archives
- clients should support user-configured resolver and relay endpoints
- proof bundles should remain portable even if the original project-operated
  service disappears
- direct L1 issuance remains available if relay infrastructure is unavailable

The goal is to make the initial project mirrors useful scaffolding, not a hidden
registrar or permanent source of truth.

## Data Availability

A Merkle root is not data availability.

For a sponsored claim to be useful, the full data needed to replay it must be
available:

- claim payload
- sponsor eligibility proof
- recipient acceptance
- credit spend data
- relay receipt
- batch inclusion proof
- checkpoint proof
- challenge data, if any
- finality derivation

Clients and resolvers should distinguish:

- `available`: full replay data is present
- `mirrored`: multiple independent services have the data
- `checkpointed`: a root or timestamp exists
- `degraded`: checkpoint exists but full data is missing
- `non_final`: required public data is missing before finality

Checkpoint-only claims should not receive the same assurance as replayable
claims.

## Failure Modes

### Relay Censorship

A relay refuses to publish a valid claim or challenge.

Mitigations:

- submit to multiple relays
- allow new relays
- publish censorship evidence
- keep direct L1 auction path available

### Relay Equivocation

A relay signs two different entries for the same log sequence or incompatible
log heads.

Mitigations:

- clients store signed receipts
- resolvers gossip fork evidence
- relay reputation is downgraded
- proof bundles include the observed log path

### Quiet Claim

A sponsor tries to treat a private claim as final.

Mitigation:

- private signatures are intents only
- no challenge window starts without public log inclusion
- clients reject proof bundles without public-notice evidence

### Missing Batch Data

A checkpoint exists, but leaves are unavailable.

Mitigation:

- clients mark the claim degraded or non-final
- resolvers refuse opaque roots as proof of ownership
- batch publishers are judged on retrievability, not just root publication

### Hidden Challenge

A resolver omits a valid challenge from a user's view.

Mitigations:

- challengers submit to multiple relays
- challenges have their own receipts
- proof bundles must replay the challenge window
- monitors compare logs and expose omissions

## Assurance Tiers

Clients should show the difference between:

- direct L1 bonded
- direct L1 mature or released
- sponsored pending notice
- sponsored public notice active
- sponsored final with full proof data
- sponsored final but degraded data availability
- challenged and routed to L1 auction

This keeps sponsor claims from masquerading as L1-native sovereignty.

## Transfer After Finality

For sponsored names, the challenge window belongs to issuance.

After a sponsored claim finalizes, ordinary transfer should be an owner-key
transfer:

- the current owner signs transfer to the next owner key
- the buyer receives the original sponsored-issuance proof bundle
- the buyer receives the full transfer chain from original owner to seller
- no new auction or challenge window opens merely because the name was sold
- the assurance tier is preserved unless a separate hardening upgrade occurs

This keeps sponsored ownership from becoming conditional on "not selling." The
market can still price assurance differences between direct L1, batch-hardened,
and sponsored names.

## Proof Bundle Requirements

A sponsored-name proof bundle should include:

- normalized name
- owner key
- sponsor claim
- recipient acceptance
- sponsor eligibility proof
- credit spend proof
- append receipt
- log entry proof
- batch inclusion proof, if batched
- checkpoint proof, if checkpointed
- challenge-window rule
- challenge observations or challenge receipts
- final replay result
- value-record chain after ownership
- data-availability status

A fresh resolver should be able to verify the bundle without querying the
original relay, except to fetch optional extra mirrors.

## Relationship To v1

This is not required for v1 direct L1 names.

For v1:

- Bitcoin remains the canonical ownership log.
- Resolvers serve convenience lookups and owner-signed records.
- Proof bundles should avoid trusting the resolver that served them.

For sponsor credits or other scaled issuance:

- public notice becomes part of the acquisition proof
- relay receipts and log inclusion proofs become security-critical
- clients must preserve assurance-tier differences
- direct L1 fallback must remain available

## Open Questions

1. Should sponsored challenge windows start at append receipt, batch inclusion,
   or checkpoint confirmation?
2. What is the minimum recognized-relay rule for bootstrap: one known relay,
   one of N, or K independent receipts?
3. How long should sponsored notice windows be compared with direct L1 auctions?
4. Should credit spends be ordered by checkpoint epoch, or does that create too
   much latency and ambiguity?
5. What exact data must a relay store forever versus during the notice window?
6. Should OpenTimestamps be the preferred low-cost checkpoint path, or should
   ONT avoid recommending one timestamp substrate?
7. What data-availability status should clients require before showing a
   sponsored name as usable?

## Current Leaning

The most credible non-Ark/RGB sponsor-credit path is:

> ONT-native public notice relays, append-only logs, deterministic credit replay,
> optional Merkle/checkpoint batching, multi-resolver mirroring, explicit
> assurance tiers, and direct L1 fallback.

That path is plausible, but it should not be described as equivalent to direct
L1 ownership. It is an optimistic public issuance system with challenge rights.
