# Transfer Relay Options

> **SUPERSEDED (2026-06-11):** completed analysis — its conclusions are decisions
> in [`docs/core/DECISIONS.md`](../../core/DECISIONS.md) (transfer relay entries) and the
> known-tradeoffs list in [`docs/core/STATUS.md`](../../core/STATUS.md). Kept for provenance.

This note explains why the current `TRANSFER` event is still awkward for broad relay compatibility, and which directions are actually available if we want to change it.

## Current shape

The current transfer payload is:

- `ONT` magic + version + event type: `5` bytes
- `prevStateTxid`: `32` bytes
- `newOwnerPubkey`: `32` bytes
- `flags`: `1` byte
- `successorBondVout`: `1` byte
- Schnorr `signature`: `64` bytes

Total payload:

- `135` bytes

When compiled into an `OP_RETURN` script, the current prototype transfer output is:

- `138` script bytes

That is why it exceeds older conservative relay limits even though modern Bitcoin Core defaults are now more permissive.

## Why a small trim is not enough

The tempting idea is to squeeze a few bytes out of the payload:

- drop `successorBondVout`
- repurpose `flags`
- shave header bytes

That does not solve the real problem.

Even if both `flags` and `successorBondVout` disappeared entirely, the payload would still need:

- `prevStateTxid`: `32`
- `newOwnerPubkey`: `32`
- `signature`: `64`
- protocol header: `5`

That is still:

- `133` bytes

So the size pressure is not coming from small bookkeeping fields. It comes from the fact that the current model insists on carrying:

- an explicit reference to the prior state
- an explicit new owner key
- an explicit owner-key authorization signature

Those three properties are what make the transfer independently derivable from chain data without trusting a resolver or inferring authority from a wallet heuristic.

## What the current design is buying us

The current transfer format preserves a clean v1 rule:

> the ONT owner key is the authority for the name, even when that key is distinct from the funding wallet key.

That gives us:

- chain-derived ownership history
- transfer authorization that does not depend on a hosted resolver
- explicit owner-key authority instead of "whoever controls the payment wallet wins"

The cost is payload size.

## Real options

### 1. Keep the current model and accept policy-dependent relay

This is effectively where v1 sits now.

Pros:

- preserves the clean owner-key model
- preserves fully on-chain transfer authorization
- preserves simple indexer semantics

Cons:

- transfer relay depends on node policy
- older or stricter nodes may reject it
- direct-node broadcast or self-hosted relay remains the safest path

This is the least disruptive path, especially now that the CLI can inspect node policy before broadcast.

### 2. Make transfer authority implicit in a spending witness

This is the main "compact transfer" path.

If the transfer authority came from a wallet input that is already being signed in the Bitcoin transaction, the `OP_RETURN` would no longer need to carry the 64-byte owner signature. That would drop the mature-transfer payload down into a much smaller range.

For a mature transfer, a compact form could look roughly like:

- `prevStateTxid`
- `newOwnerPubkey`
- maybe `flags`

That would fit much more comfortably.

Pros:

- much smaller on-chain transfer record
- easier relay under conservative policy

Cons:

- weakens or removes the clean separation between owner key and funding wallet key
- turns wallet participation into the real transfer authority
- makes transfers harder to reason about when the name owner and funding wallet are intentionally different

This is not a free compression win. It changes the ownership model.

### 3. Put the authorization in witness data and teach the indexer to read it

This would keep an explicit owner-key authorization on-chain, but move some or all of it out of the `OP_RETURN`.

Pros:

- preserves an explicit on-chain authorization artifact
- could make the visible `OP_RETURN` much smaller

Cons:

- current chain-source model does not ingest witness data
- RPC and Esplora parsing would need to become witness-aware
- indexing and provenance logic get more complex
- still not as simple as the current "small nulldata record" approach

This is plausible, but it is a meaningfully larger implementation change than it sounds like at first glance.

### 4. Split transfer data across multiple `OP_RETURN` outputs

Modern Bitcoin Core 30.0 policy now permits multiple data-carrier outputs and raises the default `-datacarriersize` to `100000`.

Pros:

- keeps authorization fully on-chain
- avoids moving semantics into witness or off-chain sidecars

Cons:

- leans even harder on newer policy
- does not help much with older or stricter relay environments
- makes transaction parsing and wire-format handling more awkward

This is viable only if we are comfortable treating modern Core policy as the real deployment baseline.

### 5. Put only a commitment hash on-chain and keep full transfer authorization off-chain

This mirrors the value-record approach: the chain event would carry a small commitment, and the full signed transfer authorization would be published elsewhere.

Pros:

- smallest on-chain footprint
- easiest relay compatibility

Cons:

- weakens independent chain-only ownership derivation
- introduces new availability/discovery requirements for transfer validity
- makes the resolver or some other data source more important than we want

This cuts too directly against the current v1 philosophy.

## Recommendation

For v1, the best path is:

1. keep the current owner-key model
2. keep transfer authorization fully on-chain
3. keep the new RPC-side compatibility checks and warnings
4. document clearly that transfer relay is policy-dependent

That gives us the cleanest semantics with the smallest change surface.

If we want materially smaller transfers later, the real strategic decision is not "how do we remove 2 bytes?" It is:

> are we willing to weaken owner-key separation, or are we willing to make the indexer witness-aware?

Those are the two serious compression paths. Everything else is mostly cosmetic.

## Website And PSBT Wizard Status

The current website transfer page is intentionally a handoff surface, not the
final trust-minimized buyer/seller wallet flow.

Today it can:

- identify the current name state
- collect the recipient pubkey
- recommend the gift, immature-sale, or mature-sale CLI path
- export role-specific buyer and seller packages from the same transfer plan

It does not yet:

- coordinate a full two-party PSBT round trip in the browser
- guarantee that both parties are signing the final same transaction from the
  website alone
- replace the CLI and external signer review path

The recommended next implementation step, when we choose to invest in transfer
UX rather than protocol consolidation, is a dedicated buyer/seller PSBT wizard:

- buyer creates or imports the recipient owner key
- seller imports current owner authority and payout address
- both parties review one canonical transaction summary
- each side signs only after the shared PSBT binds payment, ownership transfer,
  and any successor bond output together

Until that exists, the public website should keep calling transfer support a
prototype handoff and direct serious sale flows to the CLI plus signer review.
