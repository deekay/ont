# ONT vs Pubky / PKARR

This note is a short adjacent-work comparison for internal positioning and documentation.

It is not meant as a hostile comparison, and it is not a claim that one system replaces the other. The point is to clarify what problem each system is trying to solve.

## Why This Matters

The old Slashtags project now points to Pubky Core, and the closest live comparison is really:

- ONT
- Pubky / PKARR

These systems share some instincts:

- self-sovereign control
- cryptographic naming or resolution
- room for payment-handle and owner-signed record use cases

But they diverge on a central question:

> Should the base layer try to solve globally shared human-readable naming?

Pubky / PKARR mostly says no.

ONT says yes.

## Pubky / PKARR In One Sentence

Pubky / PKARR uses public keys as the durable identity layer and signed DNS-like records over the Mainline DHT, while avoiding a scarce global human-readable namespace in the base layer.

## ONT In One Sentence

ONT uses Bitcoin to anchor ownership of scarce flat human-readable payment handles, then lets the current owner sign off-chain records for what those names point to.

## Main Similarities

- Both separate durable authority from mutable destination data.
- Both care about cryptographic verification rather than trusting a platform to tell you what a name means.
- Both can support payment and owner-signed record use cases.

## Main Differences

### 1. Human-readable shared names

Pubky / PKARR does not try to solve globally shared human-readable names in the base layer. Public keys are the stable identity.

ONT is specifically trying to solve that missing human layer:

- shared words
- shared expectations
- a public ownership history for scarce names

### 2. Allocation and scarcity

Pubky / PKARR avoids the scarcity problem by avoiding global shared names.

ONT leans into the scarcity problem directly:

- universal launch auctions
- bitcoin bond economics
- explicit transfer rules
- length-based floors for very scarce short names

### 3. Base trust anchor

Pubky / PKARR anchors to key ownership and DHT-published signed records.

ONT anchors ownership transitions to Bitcoin transactions, with Bitcoin acting as the notary for canonical name ownership.

### 4. Durability of ownership state

Pubky / PKARR is centered on current signed state and DHT distribution.

ONT is centered on chain-derived ownership history:

- who acquired the name
- who transferred it
- who owns it now

That history can be reconstructed from chain data even if resolvers disappear.

## What ONT Can Learn

- Be explicit about the narrow first use case.
- Treat browser and client bridge layers as first-class product work.
- Keep the base layer honest about what it does not solve.
- Make key-management and client UX feel as important as protocol elegance.

## What Seems Truly Additive About ONT

ONT looks genuinely additive if it is framed as:

- Bitcoin-anchored ownership for shared human-readable payment handles
- a way to help humans say who gets paid
- a sovereignty-preserving base for owner-signed payment records

ONT looks much less differentiated if it is framed only as:

- signed off-chain records
- self-sovereign identity
- or a generic key/value directory

Those are areas where adjacent systems already have credible answers.

## Friendly Framing

A fair way to describe the relationship is:

- Pubky / PKARR is strong at sovereign routing around public keys.
- ONT is trying to add sovereign routing around human words.

That is the layer ONT should continue to justify clearly.
