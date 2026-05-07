# Post-Quantum And Signature Agility

This note captures a practical position on post-quantum risk for ONT, especially in light of long-lived names and premium-name designs that may contemplate `5-10` year lock periods.

It is not a claim that ONT has already solved post-quantum migration. It is a statement of what we should and should not claim, and what properties the protocol should preserve before mainnet launch.

## Why This Matters

The current prototype uses ordinary Bitcoin/secp256k1 assumptions:

- owner control is tied to a secp256k1 key
- acquisition and transfer authorization are tied to that key
- off-chain value records are signed by that key

That is fine for today's Bitcoin environment.

But if ONT wants to support:

- names that may remain valuable for decades
- premium-name lock periods of `5-10` years
- a mainnet launch story that people can evaluate seriously

then it should have an explicit position on signature-agility and post-quantum migration.

## The Current Reality

ONT is not independently post-quantum secure today.

That is not because ONT made a special mistake. It is because the current design inherits the same basic signature assumptions as Bitcoin's current key ecosystem.

Two practical facts follow:

1. If a cryptographically relevant quantum break arrives while ONT names are still controlled by exposed secp256k1 keys, name control could be at risk.
2. ONT cannot unilaterally promise a post-quantum on-chain future if Bitcoin itself does not yet provide a credible path for such keys or scripts.

## What ONT Can And Cannot Do

### What ONT cannot do by itself

ONT cannot magically become post-quantum secure at the ownership layer if Bitcoin does not support the necessary base-layer primitives.

If the chain only understands today's key and script assumptions, ONT cannot fully outrun that.

### What ONT can do

ONT can preserve **algorithm agility** and **migration optionality** so that a future upgrade path is possible rather than structurally blocked.

That means designing the protocol so it does not unnecessarily hard-code:

- one permanent signature algorithm forever
- one permanent owner-key format forever
- one permanent upgrade-impossible wire shape forever

## Recommended Position

The most credible position for ONT today is:

1. **Do not claim post-quantum security today.**
2. **Do treat signature agility as a real pre-launch design concern.**
3. **Do require a credible migration story before launching extremely long-lived mainnet commitments.**
4. **Do expect that the final migration path may depend on Bitcoin's own future upgrade path.**

That is a much stronger and more honest position than either:

- pretending this is already solved
- or ignoring it because it feels too distant

## Why Long Premium Locks Raise The Stakes

For ordinary short-lived prototype activity, quantum risk is easy to postpone conceptually.

For a premium-name design that says:

- a high-value-looking name may require a longer lock
- or a winner's bond may remain timelocked for many years even after an early sale

the time horizon becomes long enough that "we'll think about it later" is no longer a satisfying stance.

Long-duration capital commitments make post-quantum migration more important, not less.

## Design Principles To Preserve

If ONT wants a credible long-horizon story, the protocol should preserve these properties:

### 1. Owner-key migration should be a first-class concept

It should be possible, in principle, for a current owner to move control from one credential type to another.

That migration should be thought of as a normal sovereignty-preserving operation, not a hack.

### 2. Ownership should not be conceptually tied forever to one algorithm family

The protocol can use one algorithm at launch, but the design should not assume that this algorithm is the last one the namespace will ever need.

### 3. A future protocol version may be the right migration surface

It may be cleaner to treat a post-quantum transition as:

- a new protocol version
- a new wire format
- or a signature-agile successor namespace

rather than forcing all future algorithm changes into the exact current payload shapes.

### 4. Premium-name economics should not outrun the security story

If the protocol is contemplating decade-long locks, it should have at least a plausible story for how those names could migrate before a credible quantum threat becomes operational.

## Most Plausible Upgrade Shapes

These are not commitments yet. They are the most likely kinds of transition worth planning around.

### A. Algorithm-tagged owner credentials

Instead of conceptually defining an owner forever as "a 32-byte Schnorr pubkey," define ownership more abstractly as:

- a credential type
- plus a credential payload
- plus a verification rule

That leaves room for future signature families.

### B. Explicit owner-key rotation / upgrade event

The protocol could support an ownership-preserving upgrade flow where the current owner authorizes migration to a new credential format once Bitcoin and the protocol support it.

This is probably the cleanest conceptual model.

### C. Protocol-version migration

If the current v1 wire format is too tied to current assumptions, the clean answer may be:

- freeze v1 honestly
- publish a v2 migration path when Bitcoin's own path is clearer

This is less elegant than built-in agility, but more honest than pretending an incompatible upgrade is seamless.

### D. Hybrid or staged migration

If Bitcoin eventually supports hybrid or transitional script/key constructions, ONT could use a staged migration:

- first rotate from legacy owner control into a hybrid control format
- later rotate again into a post-quantum-native format

Whether this is practical depends entirely on Bitcoin's future capabilities.

## Important Constraint: Bitcoin Comes First

ONT should not imply that it can decide the full post-quantum path on its own.

The realistic dependency chain is:

1. Bitcoin ecosystem develops a credible view on quantum migration
2. Bitcoin wallets, scripts, and key tooling gain support
3. ONT adopts a compatible owner-migration path

So the right goal for ONT now is not:

- solve post-quantum signatures in isolation

It is:

- avoid painting the protocol into a corner before Bitcoin's path is known

## Timelocked Bonds And Quantum Risk

Long timelocked premium bonds raise a related issue:

- if a bond UTXO remains controlled by a legacy key for many years
- and quantum capability arrives before the owner can migrate or recover it
- that bond could be at risk once the relevant spend conditions become available

So long-duration premium bonds should be evaluated not only as economics, but also as long-lived key-exposure commitments.

This is another reason to avoid making decade-long lockups feel trivial from a protocol-design standpoint.

## Practical Working Stance For Now

For current design work, the most reasonable working stance is:

- ONT v1 should be treated as **not post-quantum secure**
- any mainnet design with very long-lived ownership commitments should have a documented **signature-agility and migration story**
- if no credible Bitcoin-level migration path exists by launch time, that should weigh against making premium-name commitments excessively long or claiming durable long-horizon security

That is not defeatist. It is just intellectually honest.

## Suggested Reviewer-Facing Position

A concise way to say this later might be:

> ONT does not claim post-quantum security today, and it should not pretend to outrun Bitcoin's own signature assumptions. But because ONT is meant to anchor long-lived names, signature-agility and owner-key migration should be treated as real pre-launch design requirements rather than ignored as distant theory.

## Open Questions

1. Should signature-agility be treated as a v1 design constraint or a likely v2 migration issue?
2. How tightly is the current owner-key representation coupled to secp256k1-specific assumptions?
3. If premium names use long timelocks, what migration path could protect both:
   - name ownership
   - and bonded capital
4. Is there any launch horizon at which decade-long premium locks become unreasonable without a clearer Bitcoin-level post-quantum path?
