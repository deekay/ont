# ONT Narrative Framework

This note is a working draft for how to talk about ONT.

It is not a protocol specification and it is not a launch announcement. The goal is to sharpen the story, the flagship scenes, and the moral intuition behind the system.

## Working Thesis

ONT is a Bitcoin-anchored payment-handle system: a way to own the readable name people and wallets use before money moves.

The first use case is simple:

- who do I mean before money moves?
- how do I say that in words instead of raw addresses or opaque accounts?
- how does my software verify the current owner-signed payment record?

Machines can use keys, hashes, and opaque identifiers without much trouble. Humans cannot. ONT exists to make payment instructions legible and cryptographically grounded.

The broader ambition can stay open-ended, but it should not be the first thing the story asks people to believe. The near-term claim can stay narrow:

- who should get paid?
- who do I mean?
- did the signed payment record change?

The short version is:

- Bitcoin gave us sovereign money.
- ONT explores sovereign payment handles on a Bitcoin-anchored base, with room for broader owner-signed records later.

## The Problem To Paint

The strongest near-term problem is simple:

- Bitcoin addresses are not a human interface.
- Payment handles are useful because people need words before money moves.
- Most readable handles rely on a service, account, domain, or operator.

That is already enough to justify a system like ONT inside the Bitcoin ecosystem.

This makes the project easier to believe:

- Bitcoin has room for human-readable payment handles
- human-readable payment selection is already a real need
- censorship resistance and third-party independence are already legible values in this ecosystem

The broader future can remain visible in the background:

- software will act more often on behalf of humans
- humans will still need to approve recipients and payment risk
- names will matter more as the action surface gets delegated

But that future should feel like expansion and option value, not a prerequisite for the first story to work.

## Core Claim

ONT should be framed first as a payment handle the owner actually controls.

That is broad enough to include:

- payment destinations
- owner-signed records
- richer key/value data later

But the first useful story should not require people to care about every possible record type.

The most important sentence may be:

> ONT gives humans a way to tell software who gets paid.

That can later expand into a broader "who do I mean?" layer, but the payment-handle story should carry the first explanation.

## First Use Case And Long Arc

The first use case should be narrower than the full design space.

The best initial framing is:

- pay the right person
- check that a payment target is still the one you expect
- say it in words you control

The long arc can remain much broader because the protocol already allows richer name/value uses. Over time, if better clients and supporting infrastructure emerge, the same naming layer could support:

- additional payment rails
- richer wallet and merchant records
- stronger client-side warnings when records change
- more agent-mediated software flows

The key is not to demand belief in that larger future before the Bitcoin-native wedge has had a chance to prove itself.

## Probabilistic Models, Deterministic Payment Targets

Large language models increase the amount of interpretation in the interface.

This is useful as a second-order framing, but it probably should not be the first thing people have to understand.

That is useful for understanding what a human wants. It is much less acceptable when the same uncertainty leaks into who gets trusted, called, or paid.

So one important way to frame ONT is:

- LLMs widen the interpretation surface
- ONT narrows the action surface

Or more concretely:

- let the model infer what I want done
- do not let the model guess who I mean

This keeps the division of labor clear.

The model can remain probabilistic about understanding intent. ONT helps make execution more constrained at the payment-target layer, so a human can say, in effect:

> If you are going to serve me, here is how to do it according to the names and preferences I actually use.

That means some words in a prompt stop being soft hints and start becoming trusted constraints.

## What The Story Should Emphasize

### 1. Human legibility at the trust boundary

ONT matters where a person chooses, approves, delegates, audits, or revokes.

Human-readable names are not primarily for agent-to-agent coordination. Agents can use long keys and machine-native identifiers directly. The value of ONT is at the human boundary, where intent has to be expressed in terms a person can understand.

### 2. A believable Bitcoin-native wedge

The story should begin where the need is already easy to see:

- choosing who to pay
- verifying that a payment target has not silently changed

That is a much easier first ask than a broad naming or navigation story.

### 3. Payment confidence, not just discoverability

The problem is not only finding a destination.

The deeper problem is knowing that the destination is the one you meant. A name should help a human say:

- pay `david` back for dinner
- pay `river` only if the signed record is unchanged
- warn me when a payment target is new
- require extra approval above a threshold

The point is not just resolution. It is authoritative resolution.

### 4. Key/value records after the payment handle lands

A payment handle is the first proof point because the cost of misdirection is obvious.

The protocol can support broader owner-signed key/value records, but those should appear as a natural extension:

- a human uses a stable name
- the owner signs the current records
- clients decide which record types they understand

## Flagship Scene

The strongest flagship scene is probably not two agents talking to each other.

It is a human setting instructions for software:

1. A person tells their client: pay `david`, use `river` for recurring buys, and warn me when a signed payment target changes.
2. The client resolves those names, verifies the owner-signed records and policy constraints, and shows the human what it is about to do in terms the human can understand.
3. The software handles the underlying protocols, keys, capabilities, and payment rails.

The human does not need to inspect raw identifiers. The machine still can.

That is the bridge ONT is trying to provide.

## Use-Case Ladder

The use cases should probably stack in this order.

### 1. Pay the right person

This is the easiest first scene to understand.

- the cost of a mistake is immediate
- the value of a clear human name is obvious
- the Bitcoin audience already understands the pain of opaque addresses

This is the best starting point. It is also a proof point, not the whole story.

### 2. Use the right service

This is the next expansion after the payment story lands.

The human problem is not only "where do I send money?" It is also:

- which wallet, exchange, routing, or payment service do I authorize?
- which endpoint should my client call?
- which support or recovery flow is the one I actually mean?
- which service name should my software trust before it acts?

This is where the phrase "choose which service to trust" becomes useful, but it should come after the payment wedge is already legible.

### 3. Delegate safely to software

This is the long arc.

A person will increasingly want to set standing instructions such as:

- never pay unapproved names above a threshold
- prefer names I have pinned before
- only use endpoints signed by the current owner key
- warn me when the resolved target changes

At that point ONT starts to look like a trust layer for delegation rather than a lookup convenience.

## Near-Term Sci-Fi, Not Far-Term Fantasy

The story should feel speculative in its implications, but conservative in its assumptions.

The document should avoid pretending we know the exact shape of a future agent-run internet. It is enough to say:

- software will browse and transact more often
- humans will remain responsible for policy and approval
- names are where people express intent
- opaque identifiers are not an acceptable final interface

But this should stay behind the Bitcoin-native wedge rather than in front of it. The larger future matters as a reason the design has upside, not as the primary thing skeptics must accept on day one.

The tone should be:

- inevitable in the problem
- humble about the exact mechanics
- concrete about why names matter

## Public Claim Moral Intuition

The public-claim story strengthens the philosophy rather than weakening it.

The old two-lane story tried to protect the long tail with a simple direct-allocation lane and send salient names to auction. The stronger updated story is simpler: if ONT is allocating scarce human-readable names, every valid name should face the same public notice rule, and only names with demonstrated conflict should consume the full auction path.

The moral center should be:

- legitimacy through open markets

With two supporting consequences:

- anti-squatting
- bootstrapping the ecosystem

That order matters.

If bootstrapping comes first, the mechanism can sound extractive. If legitimacy comes first, the market structure sounds principled:

- names differ wildly in demand, salience, and griefing value
- giving scarce names away cheaply is not neutral
- insider allocation is not acceptable
- protocol operators should not hand-price the whole world
- public notice plus open competition when challenged is the more credible answer

So the launch story says:

- valid names enter one public claim path
- uncontested names finalize through the accumulator rail
- contested names are auctioned under one rule
- there is no reserved-word list
- there is no private ordinary direct-allocation lane
- there is no short-name wave

This is not a retreat from fairness. It is a cleaner market-based account of fairness.

## Relationship To Human Bitcoin Addressing

This should get a respectful but small place in the story.

The main points are:

- human-readable payment handles solve a real human problem
- existing approaches can be part of a transitional landscape
- ONT is aimed at the same human need, but with a more sovereign foundation
- over time ONT can also extend beyond payment records through app-defined key/value records

That keeps the tone friendly and acknowledges useful adjacent work without turning the narrative into an attack.

## Suggested Messaging Lines

These are working lines, not final copy.

- Machines can use keys. Humans need names.
- ONT is how humans tell software who gets paid.
- ONT starts by helping Bitcoin users pay the right person in words they control.
- Pay the right person. Say it in words you control.
- Let models infer your intent. Do not let them guess who you mean.
- LLMs widen the interpretation surface. ONT narrows the action surface.
- Probabilistic understanding, more deterministic payment targets.
- Bitcoin removed banks from money. ONT explores more sovereign payment handles anchored to Bitcoin.
- In an automated internet, the critical interface is trustworthy payment intent.
- A name is the shortest safe instruction a human can give a machine.
- A payment handle you can actually own.

## Narrative Hazards To Avoid

- Leading with a broad naming ambition asks people to believe too much too early.
- Leading with identity alone makes ONT sound like a generic handle system.
- Leading with anti-censorship alone can sound generic and underspecified.
- Leading with generic key/value publishing can make the protocol feel abstract before the payment problem lands.
- Leading with premium-name monetization can make the project feel extractive before the fairness argument lands.
- Over-describing a sci-fi future can make the thesis feel less credible instead of more credible.
- Treating key/value extensibility as the first explanation can distract from the payment-handle use case.

## A Good Narrative Shape

One simple structure for a public-facing essay or presentation:

1. Bitcoin users need a better human interface for choosing who gets paid.
2. Raw addresses and service-controlled aliases each leave something important on the table.
3. ONT explores Bitcoin-anchored ownership for payment handles.
4. The same key/value design can grow into broader owner-signed records over time.
5. Ordinary names can stay simple; salient names need more legitimate market structure.

## Open Questions

These questions should keep guiding the storytelling work:

- How explicitly should the public story talk about censorship resistance versus convenience?
- Which payment-handle scene makes the thesis click fastest: paying a person, paying a merchant, or approving a recovery/support flow?
- What minimum data should a name resolve to in the first payment-handle story: payment target, owner authority, or a bundle?
- How soon should broader key/value examples appear after the payment-handle framing lands?
