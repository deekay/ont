# Owner-Key Recovery Through Bond Control

This note captures the current recovery design question:

> if a user loses the ONT owner key but still controls the bitcoin backing the
> live bond UTXO, should they be able to rotate to a new owner key?

Current recommendation: yes, for immature bond-backed names, but not as an
instant silent takeover rule.

## Problem

ONT currently separates:

- wallet key: controls bitcoin UTXOs
- owner key: controls destination updates and ONT transfers

That separation is clean, but it creates a painful user failure mode. A user may
still control the bitcoin locked in the live bond UTXO while losing the owner
key that controls future updates and transfers.

If v1 makes that mistake permanently fatal, the product becomes much easier to
misuse than it needs to be.

## Current Prototype Behavior

The current engine requires owner-key authorization for transfers.

Before maturity, a transfer must also spend the current bond outpoint and create
a valid successor bond output.

If the current bond outpoint is spent before maturity without a valid successor
bond path, the name is released / invalidated.

So today, bond control can already destroy continuity before maturity, but it
cannot rotate owner authority.

## Recommended V1 Direction

For immature names, current live bond control should be able to recover owner
authority by moving the bond into a valid successor bond output and naming a new
owner key.

The recovery rule should be explicit:

- recovery applies only to the current live bond outpoint
- the recovery transaction must spend that current bond outpoint
- the same transaction must create a valid successor bond output
- the successor bond must satisfy the name's required bond amount
- the recovery payload must bind to the current name state and new owner pubkey
- old owner-signed destination records become stale after recovery finalizes

This makes the failure mode humane: if the user still controls the bitcoin that
keeps the name alive, they can recover the name.

The broader design lean is:

> owner key for normal control, wallet-backed recovery descriptor by default.

This appears to be the best current tradeoff because it preserves the clean
separation between wallet custody and name authority while removing the
catastrophic "lost owner key means frozen forever" failure mode.

Compared with the alternatives:

- owner-key-only control is simple, but too unforgiving for normal users
- wallet-only control makes recovery intuitive, but turns the funding wallet
  into the daily name-management key
- mandatory permanent recovery bonds are easy to verify, but increase UTXO
  burden and weaken the mature-name release story
- resolver-only recovery is convenient, but not sovereign enough unless
  descriptors are owner-signed or hash-committed
- default wallet-backed recovery descriptors keep metadata off-chain, allow
  wallet-based recovery, and remain independently verifiable when designed
  correctly

## Implemented Foundation

The first implementation slices now exist as resolver-served recovery
descriptors plus a prototype `RECOVER_OWNER` chain event.

Implemented:

- protocol format `ont-recovery-descriptor` with owner-key Schnorr signature
- descriptor fields for name, owner pubkey, ownership reference, sequence,
  previous descriptor hash, recovery address, signing profile, challenge window,
  and issued timestamp
- BIP322-shaped recovery proof message text binding name, previous state txid,
  recovery descriptor hash, proposed owner pubkey, successor bond vout,
  challenge window, and optional chain tip
- ONT recovery wallet-proof envelope for a wallet-produced BIP322 signature,
  including descriptor binding, the exact signed message, proof hash, and a
  fixed-size proof commitment helper
- resolver persistence for descriptor history chains
- resolver publication endpoint `POST /recovery-descriptors`
- resolver read endpoints `/name/{name}/recovery` and
  `/name/{name}/recovery/history`
- CLI helpers to sign, publish, and fetch recovery descriptors
- CLI helpers to print the exact wallet-signing message, wrap a wallet-produced
  BIP322 signature, and verify that wallet proof against a descriptor
- protocol `RECOVER_OWNER` payload with predecessor state, proposed owner,
  successor bond vout, challenge window, descriptor hash, and signature field
- immature-name recovery request handling in the core state machine
- pending recovery finalization after the challenge window
- owner-key cancellation before finalization
- indexer coverage for recovery request, cancellation, late cancellation,
  malformed successor bond invalidation, and checkpoint restore

Still not implemented:

- consensus/indexer gating on the off-chain BIP322 wallet proof
- web recovery-event authoring flows
- CLI recovery transaction construction/broadcast flows
- multi-resolver recovery proof distribution

## Why Not Instant Recovery?

There is a real security tradeoff.

If bond spend authority can immediately rotate the owner key, then compromise
of the wallet that controls the bond can become full name takeover. In the
current model, that compromise can already break the bond and release the name,
but it cannot directly become the new owner key.

That difference matters. Owner-key separation is partly useful because the
funding wallet and name authority do not have to fail together.

## Challenge-Window Recovery

The safer shape is a two-step or delayed recovery:

1. A recovery transaction spends the current bond outpoint, creates a valid
   successor bond output, and proposes a new owner pubkey.
2. The name enters `recovery_pending` for a fixed challenge window.
3. During the window, the current owner key can cancel or supersede the recovery
   with an owner-signed event.
4. If no owner-key challenge appears before the window ends, the proposed owner
   pubkey becomes current.

This gives users a recovery path when the owner key is truly lost while giving
legitimate owners a chance to stop a wallet-key compromise.

Open parameter:

- challenge window length, measured in blocks

## Event Shape Options

### Option A: Dedicated `RECOVER_OWNER` event

Pros:

- clear semantics
- no fake owner-key signature field
- easier for indexers and reviewers to reason about
- clean place to define pending/finalized recovery state

Cons:

- adds a third v1 event type
- increases wire-format and review surface

### Option B: `TRANSFER` flag for bond-authorized recovery

Pros:

- keeps the event set smaller in name
- can reuse some transfer machinery

Cons:

- current transfer format assumes owner-key signature authorization
- easy to blur sale/transfer/recovery semantics
- harder to explain cleanly to reviewers

Current lean: use a distinct `RECOVER_OWNER` event if recovery is accepted into
v1. It is more honest than overloading `TRANSFER`.

## Maturity Boundary

The simplest v1 rule:

- before maturity: recovery can use the current live bond UTXO
- after maturity: if the bond is gone, recovery falls back to owner-key control

That means mature names can still become owner-key-only assets after their bond
is released. This matches the current "mature names no longer require bond
continuity" model.

Possible opt-in extension:

- allow owners to retain a post-maturity recovery anchor if they want a durable
  wallet-based recovery path

That extension should be optional. Forcing every mature name to retain a bond
would change the economics and UTXO posture.

## Post-Maturity Recovery Is Not Automatic

Post-maturity recovery is not guaranteed unless the protocol required or the
owner deliberately kept a recovery anchor.

If the name matured, the owner spent the bond, and no recovery credential was
recorded, then an indexer has no objective thing left to verify besides the
current owner key.

The protocol can make post-maturity recovery work, but only by defining a
specific anchor ahead of time, such as:

- a recovery address / script committed during acquisition or later owner-key
  update
- a small optional recovery UTXO
- a recovery delegate key
- a carefully specified original bond key, if wallet compatibility proves good
  enough

The gotchas:

- a wallet is not a protocol identity; ONT must verify a specific key, address,
  script, or UTXO
- if the user never sets or preserves that anchor, there is nothing to recover
  with after the bond is gone
- if the recovery anchor is compromised, an attacker can attempt recovery
- if the anchor is another key, the user can lose that key too
- if the anchor depends on wallet message signing, wallet and hardware-signer
  support must be tested for the exact address/script types ONT supports
- if ONT lets a mature name keep no recovery anchor, then mature names can
  intentionally become owner-key-only assets

The honest product copy should be:

> after maturity, recovery is available only if you kept or configured a
> recovery anchor.

## What Is A Recovery Anchor?

A recovery anchor is a protocol-visible thing that can prove:

> this party is allowed to start owner-key recovery if the normal owner key is
> lost.

For immature names, the live bond UTXO can act as the recovery anchor. The
recovery transaction proves control by spending that UTXO into a valid successor
bond output.

Post-maturity recovery is harder because the live bond may no longer exist. If
we still want wallet-based recovery after maturity, the protocol needs some
other anchor.

Possible anchor shapes:

### 1. Keep A Small Optional Recovery Bond UTXO

The owner can keep a dedicated recovery UTXO alive after maturity.

Recovery proof:

- spend the recovery UTXO
- create a successor recovery UTXO, if the owner wants ongoing recovery
- include a recovery event naming the new owner key

Pros:

- easiest for indexers to verify from normal Bitcoin transactions
- keeps recovery close to the existing bond-continuity model
- no special wallet message-signing standard needed

Cons:

- keeps a UTXO around
- creates some ongoing wallet hygiene burden
- if that wallet is compromised, recovery can be attempted

### 2. Commit To A Recovery Pubkey At Acquisition

The auction bid or a later owner-authorized update can commit to a recovery
pubkey. Later, that key can sign a protocol-defined recovery message.

Recovery proof:

- publish a recovery event signed by the recovery key
- the event names the current state and new owner key

Pros:

- no need to keep a UTXO alive after maturity
- explicit and compact

Cons:

- creates another key the user must back up
- is no longer "the wallet that held the bond" unless the wallet can expose and
  preserve exactly that recovery key
- standard Bitcoin wallet message signing is not uniform enough to assume every
  wallet can do this cleanly without a defined ONT signing profile

### 3. Commit To The Original Bond-Spend Key

The protocol could try to treat the key that controlled the original winning
bond as the long-lived recovery key.

Recovery proof:

- sign a recovery event with the original bond-spend key

Pros:

- matches the intuitive user story: "I still control the wallet that funded the
  name"

Cons:

- the original output may not reveal a simple reusable pubkey until spent
- many wallet output types expose hashes or scripts, not a clean recovery
  identity
- wallets may rotate keys and may not make old address/message signing easy
- it can blur wallet custody with name custody forever

This is conceptually appealing, but needs careful Bitcoin-wallet compatibility
review before we rely on it.

### Message-Signed Recovery

Bitcoin wallets commonly support some form of message signing. That can help,
but only if ONT defines exactly what is being signed and which address or script
has recovery authority.

The promising version is:

- the auction bid, transfer, or owner-authorized update commits to a recovery
  address / scriptPubKey
- later, the wallet signs a structured ONT recovery message for that recovery
  address
- the recovery message binds to the name, current state txid, current owner key,
  new owner key, and an expiration or challenge-window rule
- an ONT recovery event carries enough proof for independent indexers to verify
  the signature

This can be simpler for users than preserving an extra recovery UTXO forever.

It does not let ONT say "any wallet that originally funded the bond can recover"
unless the original funding or bond script was explicitly committed as the
recovery authority and wallets can reliably sign for it later.

Important caveats:

- legacy Bitcoin message signing is not enough for all modern address types
- BIP322 is the more relevant generic signed-message direction
- wallet and hardware-signer support is not uniform
- signed messages can be phished or pre-signed, so recovery messages must be
  structured, state-bound, and easy for users to recognize
- a challenge window is still useful because message-signing authority can be
  compromised just like spend authority

For ONT, message signing should be treated as a possible recovery proof format,
not as a vague "prove wallet ownership" shortcut.

### Resolver-Stored Recovery Descriptor

Resolvers can store a recovery descriptor that says which wallet address,
script, or key is allowed to prove recovery later.

A useful descriptor might contain:

- name
- acquisition or current state reference
- recovery address or scriptPubKey
- recovery-message signing profile, such as BIP322 if adopted
- challenge-window parameters
- descriptor hash
- authorization signature from the owner key, or an on-chain commitment to the
  descriptor hash

Later recovery would work like this:

1. client asks the resolver for the recovery descriptor
2. wallet signs the exact structured ONT recovery message using the descriptor's
   recovery address / script
3. recovery event includes the new owner key, recovery signature, and descriptor
   hash
4. indexers verify the descriptor was authorized and the wallet signature
   matches the descriptor

The key question is where authority lives:

- if the descriptor hash is committed on-chain, resolvers provide availability
  but not authority
- if the descriptor is only owner-signed off-chain, resolvers can serve it but
  clients must verify the owner signature and freshness
- if the descriptor is only resolver-written with no owner/on-chain
  authorization, it is not safe enough for recovery

This is a strong candidate because it keeps large or wallet-specific recovery
metadata off chain while still making the recovery rule independently
verifiable.

It still has gotchas:

- if every resolver loses the descriptor, recovery may become unavailable
- if the descriptor is not anchored or owner-signed, a resolver could invent or
  replace it
- if message signing is not supported for the descriptor's address/script, the
  user may not be able to produce the proof later
- descriptor rotation must be authorized by the current owner key or whatever
  recovery authority the protocol allows

### Recovery Descriptor As A Value Record?

The recovery descriptor could reuse the same broad machinery as owner-signed
value records:

- owner signs a record while the owner key is still available
- resolver stores it for availability
- clients verify the owner signature against the current ownership interval
- record history and predecessor links can show descriptor rotation over time

That is attractive because ONT already needs owner-signed off-chain records.

However, recovery metadata should probably not be mixed casually with
user-facing payment or destination records. It is control-plane metadata, not
ordinary resolution data.

Safer shape:

- define a dedicated `recovery_descriptor` record type or control-record family
- store it through resolver infrastructure similar to value records
- bind it to the name, ownership interval, current state reference, recovery
  address/script, signing profile, challenge window, and descriptor sequence
- clear or invalidate it on transfer unless the new owner explicitly sets a new
  descriptor
- optionally anchor its hash on chain for high-value or launch-critical use

Important gotchas:

- if the owner never published a recovery descriptor before losing the owner
  key, this path cannot help
- if all resolvers lose the descriptor and the user has no local copy, recovery
  may become unavailable
- public descriptors can leak wallet/address relationships unless they use a
  privacy-conscious commitment shape
- if the descriptor is only the latest resolver state, clients need to handle
  rollback, missing history, or conflicting resolver views

Current lean: treat recovery descriptors as a sibling of value records, not as
ordinary destination values. Reuse the signing, history, and resolver
distribution concepts, but keep the type and UX separate.

## Should Recovery Replace Owner-Key Storage?

Default recovery should probably be on by default, but it should not fully
replace owner-key storage in v1.

The owner key still has a distinct job:

- signing routine destination updates
- authorizing ordinary transfers
- preserving separation between name-control operations and bitcoin wallet
  operations
- avoiding frequent message-signing prompts from a funding wallet
- avoiding unnecessary public linkage between the user's payment wallet and all
  name-management activity

A recovery descriptor is better understood as a safety net:

- set it automatically during acquisition or first setup
- store it locally and with resolvers
- use it only when the owner key is lost or compromised
- use a challenge window before it rotates authority

If ONT tried to use the bitcoin wallet / recovery address as the only control
mechanism, then every destination update and transfer would need wallet message
signing or bitcoin-wallet authorization. That would be harder to support across
wallets, easier to phish, worse for privacy, and more dangerous because the
funding wallet would become the daily name-management key.

Recommended product posture:

> owner key for normal control, wallet-backed recovery descriptor by default.

That means the user should still save owner-key material, but losing it is no
longer catastrophic if the recovery descriptor and recovery wallet are still
available.

### 4. Owner-Key-Managed Recovery Delegate

The current owner key can appoint or rotate a recovery delegate while the owner
key is still available.

Recovery proof:

- delegate signs recovery event
- challenge window lets current owner cancel if compromised

Pros:

- flexible
- can support multisig or hardware-backed recovery later

Cons:

- does not help if the user never set it up before losing the owner key
- adds more state and UI complexity

## Current Anchor Lean

For v1, the safest minimal story is:

- immature names: current live bond UTXO is the recovery anchor
- mature names: no recovery anchor by default once the bond is released
- optional future profile: owner can keep or set a separate recovery anchor

The tempting "original wallet can always recover forever" story should not be
promised until we know exactly what key is being verified, how wallets expose
it, and how the recovery proof appears to every independent indexer.

## Conflict Rules To Define

Before implementation, the protocol must define:

- if an owner-key transfer and recovery request appear in the same block, which
  wins?
- can the owner key cancel recovery with a dedicated cancel event?
- can the owner key transfer the name during recovery pending?
- does destination publishing pause during recovery pending, or continue under
  the old owner until finalization?
- how are reorgs handled when a recovery request or cancellation disappears?
- what happens if the recovery successor bond is later spent during the pending
  window?

Recommended bias:

- owner-key authority should be able to cancel or supersede bond-authorized
  recovery during the challenge window
- normal resolution should continue to show the current owner until recovery
  finalizes, with a visible pending-recovery warning
- same-block ordering should use the protocol's canonical transaction order

## Remaining Implementation Work

Likely next implementation steps:

1. Connect the BIP322 wallet proof verifier to recovery-event acceptance so an
   indexer can require the matching off-chain proof before entering
   `recovery_pending`.
2. Treat recovery requests as proof-hash committed on chain, with resolver or
   client-side distribution for the variable-size wallet proof. The current
   helper uses the fixed 64-byte field as a 32-byte proof hash plus a reserved
   zero half, while cancellation still uses the current owner-key signature.
3. Add CLI and web flows for building, reviewing, and broadcasting recovery
   requests and cancellations.
4. Add resolver/proof distribution for recovery wallet signatures if those stay
   off-chain.
5. Revisit challenge-window length with external reviewers.

## Current Status

Descriptor foundation, prototype recovery state machine, and protocol-level
BIP322 proof-envelope verification are implemented. Indexer enforcement,
proof distribution, and product recovery flows remain important pre-launch
work.

The previous "no v1 recovery path" posture should no longer be treated as the
default answer.
