# ONT Scaling Problem And Design Space

This note documents a critical open problem for ONT:

> can a Bitcoin-anchored naming system scale without requiring one Bitcoin
> transaction, one auction, and one active bond UTXO for every useful name?

It is not a decision record. It is a map of the problem and the design spaces
that should be explored before treating the current auction prototype as a
launch architecture.

The near-term protocol center should remain root issuance: permissionless root
auctions, bond/hardening rules, owner-key authority, maturity, and resolver
replay of root state. Subnames, resolver checkpoints, Merkle batches, and
provider-assisted issuance are scalability paths to keep open and analyze, not
launch commitments unless their tradeoffs are made explicit.

A newer scale candidate keeps the flat namespace but uses mature bonded names as
issuance sponsors. This cannot operate in year one because no bonds have matured
yet. The first cohort still uses direct auction / bond issuance; only after
maturity can active still-bonded names earn sponsor credits for lower-footprint
flat issuance.

## Why This Matters

The current prototype proves useful pieces:

- names can be anchored to Bitcoin-derived state
- owner keys can authorize name actions
- auction bids can be observed and replayed
- winning bids can materialize into owned names
- destination records can remain off-chain and owner-signed

But the prototype still has a scaling shape that may not survive success:

- a name opening or bid is currently an on-chain ONT event
- auction activity can require many transactions before one winner settles
- the winning name is backed by a Bitcoin bond UTXO during its immature period
- if every human, organization, app, or agent needs a top-level name, demand
  quickly exceeds realistic Bitcoin L1 throughput

The issue is not only OP_RETURN bytes. The issue is the full L1 footprint:

- transaction count
- blockspace fees
- UTXO creation
- UTXO-set growth
- bid churn during auctions
- capital locked per name
- wallet complexity for ordinary users

If ONT requires a separate L1 transaction for every basic name or bid, then
either the name use case prices itself out, or it competes directly with
Bitcoin's money use case. That is not a safe assumption for a broadly useful
naming layer.

If bonds mature and owner-key authority survives maturity, the UTXO issue is
less severe than a permanent one-UTXO-per-name model. The active UTXO footprint
then depends on the rate of immature hardening and the maturity window, not the
total number of names ever issued. That still leaves transaction count,
temporary UTXO pressure, and user capital lockup as serious scaling constraints.

## The Strong Problem Statement

The naive model is:

> every globally unique name has its own on-chain auction path, and every
> newly settled name has its own Bitcoin bond UTXO during maturity.

That model is clean and auditable, but it has serious scaling risk:

1. Bitcoin L1 cannot onboard every person, organization, application, and
   autonomous agent into a flat global namespace through individual
   transactions.
2. Auctions multiply the transaction load because one name may receive many
   bids before settlement.
3. Per-name hardening UTXOs multiply the active immature footprint even if
   OP_RETURN data is batched.
4. High-fee periods could make basic names economically unreasonable.
5. If ONT became popular, ONT itself could meaningfully compete for blockspace.

This does not necessarily kill ONT. It does likely kill the assumption that the
current one-event-per-name auction path can be the only path.

## Current Architecture Under Pressure

### OP_RETURN Event Per Action

Current ONT protocol events use OP_RETURN. The auction-bid payload carries the
name context plus commitments, amount, owner pubkey, and bond output location.

This is useful because it is easy for independent indexers to discover and
replay. It is risky because it scales linearly with name-event count.

### Auction Bid Per Transaction

The current auction path treats each bid as a chain-observed event. This gives a
clear ordering source, but it makes popular auctions expensive in transaction
count.

Even if only the winner matters after settlement, the losing bids were still
Bitcoin transactions.

### Temporary Hardening Bond UTXO Per Name

The current ownership model uses a live bond outpoint as part of name
continuity. This is elegant because Bitcoin can prove whether the bond is
unspent.

It is also expensive if every newly settled or hardened name requires a
dedicated output during maturity. The key mitigation is that the output does not
need to remain forever if mature owner-key authority survives bond release.

### Flat Top-Level Names For Everyone

If every person and every agent needs a top-level Bitcoin-anchored name, ONT
inherits the worst version of the scaling problem.

A more scalable model may need top-level names to behave like scarce roots, with
high-volume names, agents, devices, and app identities living under those roots.

## New Design Space From Owner Keys

The off-chain owner key is the most important unlock.

It means Bitcoin does not need to be the user's only authoritative action. The
owner key can sign name intents off-chain, while Bitcoin anchors checkpoints or
dispute-relevant state.

This separates:

| Concept | Possible role |
| --- | --- |
| owner key | authorizes name actions |
| Bitcoin transaction | orders, anchors, or finalizes a set of actions |
| bond | provides economic weight or continuity |
| resolver/indexer | reconstructs state from public data |
| batcher/relay | publishes signed intents without deciding ownership |

The design question becomes:

> when does an owner-key-signed intent become canonical ONT state?

Possible answers include:

- only after direct Bitcoin inclusion
- after inclusion in a Bitcoin-anchored batch
- after inclusion in a publicly replayable log whose root is periodically
  anchored
- after an epoch closes, with direct L1 fallback for censorship or disputes

## Batching Design Space

### Anyone-Can-Batch Signed Intents

Users sign intents such as:

- open this name
- bid this amount
- transfer this name
- create this subname
- update this recovery rule

Anyone can collect many signed intents into a batch, build a Merkle tree, and
anchor the root on Bitcoin.

Benefits:

- reduces on-chain event count
- avoids a trusted registrar if rules are deterministic
- lets many users share one Bitcoin anchor

Risks:

- batchers can censor by omission
- batchers can reorder unless ordering is constrained
- batch data can be withheld
- users need inclusion proofs
- resolvers need a way to discover and replay full batch data

### Full Data Availability Requirement

A Merkle root alone is not enough.

ONT should probably treat a batch root as valid only if the full batch data is
publicly available and replayable. Otherwise, a batcher could anchor an
unverifiable root that nobody can use to reconstruct state.

Open questions:

- where is batch data stored?
- who mirrors it?
- do users keep their own inclusion proofs?
- how does a fresh resolver discover historical batches?
- when is a withheld batch ignored?

### Permissionless Batchers Plus Direct Fallback

The central trust moment is inclusion:

> who gets to decide which user intents reach Bitcoin?

A possible mitigation set:

- anyone can run a batcher
- users can submit to many batchers
- batch ordering rules are deterministic
- full batch data must be public
- direct L1 publication remains available for censorship escape
- high-value or disputed names can bypass batching

This does not remove all censorship risk, but it can make batchers publishers
rather than registrars.

## Resolver / Indexer Service Provider Design Space

Resolvers and indexers may be more than passive readers.

They could become service providers that help users publish, relay, batch, and
monitor owner-key-signed intents. This is worth exploring because it may let ONT
scale without pretending every user already has a convenient Bitcoin UTXO or
forcing every bid onto L1.

The important constraint is:

> a resolver can help publish state, but it should not be able to decide who
> owns a name by private discretion.

### Shared Intent Pool

Resolvers could accept signed intents from users:

- open name
- bid
- reveal bid
- transfer
- create subname
- harden or bond a name

They could then gossip those intents to other resolvers, similar in spirit to a
protocol-specific mempool.

Benefits:

- users do not need to broadcast directly to Bitcoin for every action
- users can submit to multiple resolvers
- resolvers can mirror each other's pending state
- batchers can build from a public pool instead of private order flow

Problems:

- "I saw this intent before the deadline" is not objective unless the intent is
  included in a signed/public log or anchored batch
- resolvers can still censor by not relaying
- users need receipts or monitoring to know whether their intent propagated

### Bitcoin As Shared Clock And Checkpoint

Resolvers can all observe the same Bitcoin block height and block hash. That
can provide:

- epoch boundaries
- auction open and close times
- batch root ordering
- replay checkpoints
- a public reference for challenge windows

Example:

- auction epoch starts at Bitcoin height `H`
- commit phase ends at `H + 144`
- reveal phase ends at `H + 288`
- batch roots anchored before those heights define the eligible sets

This helps every resolver independently reach the same result without trusting a
central server's wall clock.

Bitcoin block hashes could also be used as deterministic tie-breakers or
randomness inputs, but this should be treated carefully because miners have
some influence over block production. Height is safer as a clock than block hash
is as a fairness oracle.

### Resolver-Signed Logs

Each resolver could maintain an append-only signed log of intents it has
accepted.

Users receive receipts such as:

> resolver X accepted intent hash Y at resolver sequence Z before Bitcoin
> height H.

Benefits:

- gives users evidence of attempted inclusion
- makes resolver censorship auditable
- lets multiple resolvers mirror each other's logs
- can help build batch data availability

Problems:

- a resolver receipt is not as objective as a Bitcoin transaction
- logs need mirroring and audit rules
- conflicting logs from different resolvers need deterministic replay rules

This may be useful as a soft availability layer, but likely should not be the
only source of canonical ordering.

### Multi-Resolver Auctions

An auction could be run from public signed intents seen by many resolvers, with
Bitcoin defining epochs and batch roots defining final replay inputs.

Possible flow:

1. User signs a bid intent with an owner/bidder key.
2. User submits it to several resolvers.
3. Resolvers gossip the intent and include it in public logs.
4. Any batcher can anchor an epoch root containing available intents.
5. Resolvers replay the anchored batch data with deterministic auction rules.
6. The winner is the result of the replay, not the private choice of any
   resolver.

This can help if:

- batch data is public
- many parties can batch
- users can submit to more than one service
- auction rules are deterministic
- direct L1 fallback exists for censorship or disputes

This does not fully solve inclusion. It turns inclusion into a market of
service providers rather than a single trusted registrar.

### Service Provider Incentives

Resolvers/indexers could be paid or incentivized for useful services:

- hosting batch data
- relaying signed intents
- publishing batch roots
- serving inclusion proofs
- monitoring Bitcoin and ONT state
- providing wallet-friendly UX

This is not the same as "collecting the name payment." The scarce-allocation
mechanism can remain protocol-defined, while service providers compete to make
publication and discovery reliable.

Open questions:

- do users pay resolvers directly for relay/batch service?
- can fees be paid off-chain?
- can a batch include service fees without making the resolver a registrar?
- should resolvers stake reputation through signed logs and public uptime?

### What This Might Solve

Resolver/indexer service providers may help with:

- users who do not already control convenient Bitcoin UTXOs
- batching many signed actions before touching Bitcoin
- auction participation without one L1 transaction per bid
- data availability through many mirrors
- censorship evidence and alternate submission paths

They do not automatically solve:

- final canonical inclusion
- bond economics
- fake bids without some cost or penalty
- data withholding by batchers
- deterministic ordering across conflicting batches

The useful framing is:

> resolvers can provide publication infrastructure, but Bitcoin plus signed
> deterministic replay must remain the source of final settlement.

## Bond Design Space

Batching OP_RETURN events does not solve scale if every name still needs a new
bond UTXO during hardening. At the same time, burning bitcoin is not an
attractive path, and requiring every future user to already control a convenient
UTXO is too strong an assumption.

The bond model needs its own design pass.

### Model A: Temporary Per-Name Hardening UTXO

Each newly settled or hardened name has one dedicated Bitcoin output during
maturity. After maturity, the bond can be spent and owner-key authority
survives.

Benefits:

- simple continuity rule
- easy for indexers to verify unspent status
- strong link between name and capital commitment

Problems:

- one active UTXO per immature hardening name
- temporary UTXO-set growth
- many Bitcoin transactions for many names
- hard to scale to cheap names or agents

This is the current clearest prototype model, but it may only be appropriate
for high-value top-level names unless maturity windows are short and hardening
is batched.

### Model B: Batched Transaction Creates Many Bond Outputs

A batch transaction could include many bond outputs for many names.

Benefits:

- one transaction can settle many names
- simpler than pooled bonds

Problems:

- still creates one temporary UTXO per name during maturity
- transaction size still grows with output count
- does not solve peak immature UTXO-set scaling

This helps with transaction overhead, but not the deeper bond-footprint problem.

### Model C: Existing UTXO As Bond Reference

A name could reference an existing Bitcoin UTXO as its bond, with signatures
proving control of both the owner key and the UTXO key.

Benefits:

- may avoid creating a new output per name
- lets users reuse existing capital without immediate transaction creation
- could make batched name openings cheaper

Problems:

- must prevent the same UTXO from backing too many incompatible claims
- indexers must track exclusivity and spend status
- wallet UX is harder
- privacy may be worse if ordinary wallet UTXOs become name anchors
- the referenced UTXO may be spent unexpectedly

This is promising but subtle.

### Model D: Aggregated Or Pooled Bond

Many names could be backed by one larger bond controlled by an owner, batcher,
or delegated namespace.

Benefits:

- far fewer UTXOs
- better capital efficiency
- could support many subnames or agents under one root

Problems:

- weaker one-name-one-bond semantics
- hard questions about allocation, priority, and failure
- one bond break could affect many names
- pooled custody or covenant-like rules may be hard without new Bitcoin
  features

This may be useful for subnames, organizations, or agent namespaces, but it is a
different security model.

### Model E: Direct Hardening Only For Scarce Roots

Top-level names use strong Bitcoin hardening semantics. Subnames and agents
under a root use owner-key authorization and batch anchoring, not dedicated
per-subname bonds.

Benefits:

- keeps Bitcoin anchoring for scarce root authority
- scales high-volume identity under roots
- maps naturally to organizations, apps, and agents

Problems:

- top-level names remain scarce and potentially expensive
- subname holders depend on root-name governance
- users may want globally flat names rather than delegated names

This may be the most realistic direction for agents.

## Auction Design Space

Auctions are harder to batch than ordinary owner-authorized updates because
ordering determines winners.

The current direct-L1 auction model gives clear ordering, but it can require
many transactions per name.

Designs to explore:

### Direct L1 Auctions For High-Assurance Roots

Only high-value root names use direct Bitcoin-observed auctions.

Benefits:

- clear and conservative
- preserves current prototype path
- acceptable when users voluntarily choose direct L1 assurance

Problems:

- does not scale to basic names
- auction activity can still be expensive

### Batched Auction Openings

Many users open auctions through signed intents in one anchored batch.

Benefits:

- reduces opening transaction count
- supports broad launch participation

Problems:

- inclusion and ordering become batcher-sensitive
- name collisions need deterministic rules

### Batched Bids

Bids are signed off-chain and included in anchored batches.

Benefits:

- reduces bid transaction count
- can support many bidders without many L1 transactions

Problems:

- ordering and front-running become central
- batcher censorship can affect auction outcomes
- direct L1 fallback can disrupt batched timing unless carefully specified

### Epoch Auctions

Auctions operate in batch epochs rather than per-block bid updates.

Example:

- all bids included before epoch N closes are eligible
- deterministic ordering or price rules determine the leader
- soft close may extend by epochs rather than blocks

Benefits:

- natural fit for batching
- lower on-chain footprint

Problems:

- more complex user mental model
- slower feedback loop
- careful anti-front-running design needed

### Commit-Reveal Bidding

Bidders first commit, then reveal later.

Benefits:

- reduces front-running
- hides bid amounts temporarily

Problems:

- doubles phases
- worsens UX
- can increase data and coordination overhead
- reveal failures need rules

## Hierarchical Names And Agents

Agents make the flat-name problem much worse.

If every autonomous agent needs a globally auctioned top-level name, ONT cannot
scale. A likely alternative is:

- top-level names are scarce Bitcoin-anchored roots
- owners issue subnames under roots
- subnames can represent people, agents, devices, departments, apps, or keys
- subname state is owner-key-signed and batch-anchored

Example:

- `alice` is a top-level Bitcoin-hardened root
- `calendar@alice`, `pay@alice`, and `agent7@alice` are owner-authorized
  subnames

This gives many identities one Bitcoin-backed root without requiring every
identity to win a global auction.

Initial notation should probably reserve `@` as the root/subname separator:

- no `@` means a root name: `alice`
- exactly one `@` means a subname under a root: `agent7@alice`
- more than one `@` is invalid in the initial grammar
- `.` is not the canonical namespace separator because it is easily confused
  with DNS

### Subname Sovereignty Paths

Subnames should not be treated as all-or-nothing. There are several possible
assurance levels:

1. Root-signed grant only

   The root owner signs a grant for `mat@alice` to Mat's owner key. No Bitcoin
   transaction is required for the subname. Resolvers can accept it if they see
   the certificate and the root is valid, but discovery and conflict ordering are
   mostly a resolver/data-availability question.

2. Root-batch or resolver-batch anchored grant

   The same grant is included in a Merkle batch periodically committed to
   Bitcoin by the root operator, a resolver, or both. The subname still does not
   create its own UTXO, but the holder now has a stronger proof that the grant
   existed by a Bitcoin height and was part of a replayable dataset.

3. Non-revocable subname grant

   The protocol can define a root-signed grant as non-revocable once validly
   issued and anchored. In that case, future root owners or compromised root keys
   cannot overwrite `mat@alice` by ordinary action. This is stronger than trusting
   the root forever, but it still depends on the root's original authority and
   the availability of the proof bundle.

4. Independent subname hardening

   A subname owner can optionally harden `mat@alice` with its own Bitcoin-backed
   state. That requires a transaction, a temporary hardening UTXO, and whatever
   maturity rule the protocol defines. This is the clearest path to making a
   subname fully self-sovereign, but it uses the same scarce resource as root
   hardening.

5. Root migration or root acquisition

   A subname holder can also acquire a root name and migrate usage to it. That is
   not the same name, but it is a practical path from root-issued identity to
   direct root sovereignty.

Open questions:

- should subnames be transferable independently?
- can subname holders get censorship escape from the root owner?
- what exact proof is needed for a subname to become independently hardened?
- if `mat@alice` hardens independently, what rights remain with `alice`?
- how do resolvers display trust differences between roots and subnames?

## Trust Moments To Make Explicit

Any scaling design should explicitly answer these.

### Inclusion

Who can get an intent into canonical state?

Bad answer: one trusted operator decides.

Better answer: many batchers can include, full data is public, and direct L1
fallback exists.

### Ordering

If two intents conflict, which one wins?

Bad answer: the batcher chooses privately.

Better answer: deterministic ordering from batch root position, prior Bitcoin
height, intent timestamp constraints, commit-reveal phases, or explicit auction
epoch rules.

### Data Availability

Can a fresh resolver rebuild from public data?

Bad answer: only the original batcher has the leaves.

Better answer: roots only count when full batch data is retrievable and
content-addressed.

### Bond Exclusivity

Can the same economic stake back multiple conflicting names?

Bad answer: nobody checks.

Better answer: replay rules define exclusivity, release, overcommitment, and
failure consequences.

### Censorship Escape

What happens if all visible batchers ignore a user?

Bad answer: the user is stuck.

Better answer: the user can publish directly to Bitcoin, or use a dispute path
that forces recognition.

## Evaluation Criteria

Each candidate architecture should be scored on:

- Bitcoin bytes per useful name
- Bitcoin UTXOs per useful name
- transactions per auction
- cost at low, medium, and high fee rates
- ability for a fresh resolver to rebuild state
- censorship resistance
- front-running resistance
- wallet UX
- implementation complexity
- compatibility with existing Bitcoin policy
- suitability for humans, organizations, and agents

## Near-Term Exploration Plan

### 1. Build A Cost Model

Compare:

- current one-event-per-bid model
- batched openings only
- batched openings plus batched bids
- temporary per-name hardening bonds
- existing-UTXO bond references
- roots plus subnames

Outputs should include:

- approximate bytes per name
- UTXOs per name
- transactions per 1,000 names
- fee sensitivity
- expected user cost

### 2. Define Canonical Signed Intents

Specify a minimal off-chain intent format for:

- open name
- bid
- transfer
- create subname
- update value/recovery metadata

The same canonical intent should work whether it is published directly or
included in a batch.

### 3. Prototype Batch Replay Without Economics

Build a small deterministic batch replay simulator:

- signed intents in
- Merkle root out
- inclusion proofs
- replayable state
- conflict resolution

Do this before solving every bond detail.

### 4. Prototype Bond Models Separately

Do not hide bond assumptions inside the batching prototype.

Compare temporary per-name hardening bonds, referenced UTXOs, aggregate bonds,
and root-only bonds as separate modules.

### 5. Revisit Auction Mechanics In A Batched World

The current auction model may remain the direct-L1 path for users who choose
maximum assurance, but batched names may need epoch auctions or another
mechanism.

### 6. Review With Bitcoin Experts

Bring back concrete candidate designs with:

- transaction examples
- byte estimates
- UTXO-set impact
- policy-standardness assumptions
- trust and censorship analysis

## Current Working Hypothesis

The current L1-per-event auction path is useful as a prototype and may remain
appropriate when a user wants maximum direct Bitcoin assurance.

It should not be assumed to scale to all humans, agents, or app identities.

The most promising direction to explore is:

- owner-key-signed intents for authority
- Bitcoin-anchored batch roots for scale
- full data availability for replay
- direct L1 fallback for censorship or high-value cases
- a separate rethink of bonds so every useful name does not necessarily require
  its own fresh UTXO that remains live forever; if bonds mature, the key metric
  is active immature UTXOs
- hierarchical names/subnames so agents and high-volume identities do not all
  need top-level auctions

The hardest unsolved pieces are auction ordering, batch inclusion, data
availability, and bond semantics.
