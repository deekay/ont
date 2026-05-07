# Value Record History And Keybase Notes

This note answers a narrower question than the Bitcoin ownership protocol:

> if an ONT value changes from `foo` to `bar`, can a later resolver or client
> prove the order of those changes?

Today the answer is only partially yes.

ONT value records are now signed by the current owner key, scoped to the
current ownership interval, and linked to their predecessor. That proves that a
record was authorized by the current owner key, lets a resolver reject stale or
skipped sequences, and gives clients an inspectable update chain for the
records a resolver has retained.

The remaining missing pieces are:

- stronger cross-resolver completeness and rollback detection beyond simple
  client-side comparison
- optional transparency or receipt machinery for detecting resolver rollback,
  withholding, or equivocation

## What Keybase Contributes

Keybase is not the same system, but it is useful prior art.

The Keybase server-security documentation describes the important shape:

- each user has a monotonically growing signature chain
- each link has a `seqno`
- each link has a `prev` hash pointing to the previous link, or `null` for the
  first link
- links also carry a `ctime`, but time is not doing the main ordering work
- Keybase maintained a global Merkle tree over signature chains
- Keybase later anchored Merkle roots into Stellar so users could detect
  server forks across different views

Sources:

- [Keybase server security overview](https://book.keybase.io/docs/server)
- [Keybase Merkle root in Stellar blockchain](https://book.keybase.io/docs/server/stellar)

The lesson for ONT is simple:

- use sequence numbers and predecessor hashes for local chain ordering
- use timestamps only as metadata or receipts
- use Merkle or transparency roots only when the threat model includes
  resolver rollback, withholding, or forked views

## Why Timestamp Alone Does Not Solve It

A timestamp is useful context, but it is not enough to define canonical history.

If the owner signs the timestamp:

- the timestamp says when the owner says they acquired control
- the owner can backdate or forward-date it
- two valid records can still disagree about ordering unless the signed data
  includes a sequence and predecessor pointer

If the resolver adds the timestamp:

- the timestamp says when that resolver claims it observed the record
- the resolver can lie unless it signs an append receipt
- the receipt only proves that resolver's view, not global consensus

If a timestamp or root is anchored externally:

- it can prove a record or root existed before the anchor time
- it still does not replace the need for a signed predecessor chain
- anchoring every value update would violate the goal of keeping routine
  mutable data off Bitcoin

So the recommended rule is:

> timestamps are descriptive; sequence plus predecessor hash is structural.

## Recommended ONT Model

The current value-record format makes each name's value history a signed
append-only chain scoped to a specific ownership interval.

Recommended signed fields:

- `name`
- `ownerPubkey`
- `ownershipRef`
- `sequence`
- `previousRecordHash`
- `valueType`
- `payloadHex`
- `issuedAt`

`ownershipRef` should identify the current ownership interval, not just the
owner key. Good candidates are the canonical acquisition, auction-settlement, or
transfer event id that created the current owner state.

That matters because `name + ownerPubkey` is not enough. If a name transfers
away and later returns to the same key, an old value record from the previous
ownership interval should not become current again.

`previousRecordHash` should be `null` for the first value record in an
ownership interval. For every later record, it should point to the canonical
hash of the previous value-record statement.

`issuedAt` should be owner-signed metadata. It is useful for UI, debugging, and
human explanations, but it should not be the canonical ordering rule.

The resolver should derive the canonical ordering from:

1. current on-chain ownership
2. matching `ownershipRef`
3. valid owner signature
4. exact predecessor hash
5. exact next sequence

## Resolver Behavior

The current resolver stores an append-only chain for each:

`(normalizedName, ownershipRef)`

On `POST /values`, the resolver:

- verifies the record signature
- verifies that the name is currently owned by `ownerPubkey`
- verifies that `ownershipRef` matches the current owner interval
- requires `sequence = 1` and `previousRecordHash = null` for the first record
- requires `sequence = currentHead.sequence + 1` for later records
- requires `previousRecordHash = currentHead.recordHash` for later records
- rejects stale records
- rejects gaps
- rejects records that claim the wrong predecessor

The resolver may still expose a simple current-value endpoint:

- `GET /name/{name}/value`

It also exposes a history endpoint:

- `GET /name/{name}/value/history`

The history response should make completeness explicit. If a resolver has only
the current head and not the predecessor chain, it should say so rather than
silently presenting the head as complete history.

Suggested response metadata:

- `currentRecordHash`
- `ownershipRef`
- `completeFromSequence`
- `completeToSequence`
- `hasGaps`
- `hasForks`

## Fanout Implications

Client-side multi-resolver publish still works cleanly.

The current prototype now has a first practical slice of that idea in the CLI:

- one signed value record can be published to several resolvers
- value-history responses can be compared across several resolvers to spot
  missing or lagging history
- the website can do the same only against a deployment-configured resolver
  allowlist; it still defaults to a single hosted resolver otherwise

The owner signs one successor record and publishes the same record to several
resolvers. Each resolver can independently verify the signature, ownership
interval, predecessor hash, and sequence.

If a resolver is missing the predecessor, it has two reasonable options:

- reject the record as `missing_predecessor`
- store it as an incomplete chain head and request the missing predecessor

For a launch product, rejecting missing predecessors is simpler. For a more
resilient network, accepting incomplete chains with explicit status may be
useful.

Resolver-to-resolver fanout should send signed records, not just "current
value" summaries. The predecessor chain is what lets another resolver verify
that `foo` came before `bar`.

## Forks And Owner Equivocation

A predecessor hash prevents accidental ambiguity, but it does not prevent an
owner from signing two different successors to the same predecessor.

Example:

- sequence 7 points to hash `abc`
- record 8a changes the value to `foo`
- record 8b changes the value to `bar`
- both are valid owner signatures with the same predecessor

This is owner equivocation, not resolver forgery.

Resolvers should not silently collapse this. They should either:

- accept the first successor they saw and reject later competing successors
- or store fork evidence and mark the chain as forked

The second option is more transparent, but more complex. The first option is
simpler for v1, especially if clients normally publish the same signed record
to multiple resolvers.

## Transparency Layer Later

A signed per-name value chain proves local ordering, but it does not fully
solve resolver behavior.

A resolver can still:

- withhold older records
- roll back to an older head
- show different clients different heads
- omit a record it previously accepted

Keybase's global Merkle tree is the relevant prior art here. For ONT, a future
resolver transparency layer could have each resolver periodically sign a Merkle
root over the value-record heads and append receipts it has accepted.

Possible transparency objects:

- resolver-signed append receipt for each accepted value record
- periodic Merkle root over `(name, ownershipRef, sequence, recordHash)`
- optional gossip of resolver roots between clients and resolvers
- optional external anchoring of resolver roots

External anchoring should be treated carefully. A low-frequency root commitment
can improve fork detection, but it should not become mandatory for routine
value updates. The default design goal remains:

> ownership events belong on Bitcoin; routine mutable value updates do not.

## Recommended Implementation Sequence

1. Keep exercising the history-aware value format in regtest and private
   signet smoke flows, plus the current CLI multi-resolver fanout/compare path.
2. Add deeper tests for transfer resets, same-key re-ownership, and forked
   successors.
3. Add resolver append receipts only if multi-resolver publish/read needs them.
4. Defer resolver transparency roots until the simple signed chain is working
   in hosted review flows.

## Open Questions For Review

- What should the canonical `ownershipRef` be for each ownership-changing
  event type?
- Should a resolver reject competing successors from the same predecessor, or
  store fork evidence?
- Should missing predecessors be a hard reject or an accepted incomplete head?
- Should resolver append receipts be part of the first history implementation?
- Is a low-frequency resolver transparency root worth considering later, or is
  multi-resolver publish/read enough for the near-term threat model?
- If transparency roots are used, should they ever be Bitcoin-anchored, or
  should ONT avoid adding recurring non-ownership commitments to Bitcoin?
