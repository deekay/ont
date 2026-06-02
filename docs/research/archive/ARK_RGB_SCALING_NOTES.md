# Ark And RGB Scaling Notes For ONT

This note explores whether ONT should use Ark/Arkade, RGB, or an
ONT-specific layer to scale auctions, sponsored credits, and name ownership.

Status: research track, not v1.

## Short Read

Ark is currently the most interesting middle ground between:

- direct L1-only ONT
- and building a full custom ONT L2 from scratch

RGB is interesting for a different reason:

- it provides a client-side validation model for off-chain contract state,
  single-use seals, and Bitcoin commitments
- it may help shape ONT proof bundles and state-transition validation
- it is less obviously a ready-made public namespace coordination layer

The current best path to explore is:

> keep v1 direct L1 names clean, but design future ONT acquisition proofs so an
> Ark-backed auction transcript or Ark-backed sponsor-credit claim can become a
> valid proof source later.

## ONT Needs

Scaling ONT is not just about cheaper payments.

ONT needs a layer that can support:

- bid collateral
- sponsor credit accounting
- BTC-time or locked-capital measurement
- canonical publication of name claims
- deterministic challenge windows
- full data availability
- portable proof bundles
- fallback to L1 for contested or failed cases
- no trusted registrar

The strongest requirement is not "fast." It is:

> a fresh indexer or wallet must be able to verify why a name is owned.

## Ark Properties That Matter

Arkade's VTXO model is relevant because VTXOs are off-chain, UTXO-shaped claims
backed by presigned Bitcoin transactions. Many VTXOs can share one batch output,
and users have unilateral exit paths.

Important properties for ONT:

- VTXOs behave like UTXOs, which fits ONT's bond/collateral mental model.
- Many VTXO claims can share one on-chain batch output.
- Off-chain execution can preserve Bitcoin-style ownership semantics.
- Users can exit unilaterally if they hold the required presigned transactions.
- Batch settlement can reset finality and expiry.
- Ark scripts can express timelocks and spending conditions that may be useful
  for bid locks or sponsor credit commitments.

Important limitations:

- preconfirmed VTXOs are not the same assurance as settled L1 state
- Ark has liveness requirements; VTXOs expire and must be renewed or settled
- unilateral exit can be costly if the VTXO is deep in a virtual transaction
  tree
- mass exit is a real scenario
- operator/signer compromise is a major failure mode
- ONT would still need its own proof-bundle and data-availability rules

## Direction 1: Ark For Auction/Bid Management

This is the cleanest near-term Ark use.

Direct L1 auctions are conceptually simple, but every bid consumes Bitcoin
blockspace. Popular names can create many L1 transactions before one winner
settles.

Ark-assisted auction shape:

1. Name auction opens under ONT rules.
2. Bidders lock bid collateral in Ark VTXOs.
3. Bids are submitted into an Ark-backed auction transcript.
4. The transcript is committed and replayable.
5. Losers recover or reuse VTXOs off-chain.
6. Winner settles into the normal ONT L1 bond.
7. If the auction layer fails, a bidder can fall back to direct L1 or exit.

Why this is promising:

- reduces L1 bid churn
- keeps final direct ownership path real
- can use one ONT auction state machine with multiple transcript sources
- avoids introducing sponsored-name ownership before we understand proof
  bundles

Open design questions:

- are bids open, sealed, or commit/reveal?
- what makes a bid credible before L1 settlement?
- how are auction transcripts committed?
- how can a censored bidder prove attempted participation?
- what is the L1 fallback rule?
- what exact proof bundle verifies the winner?

Recommended stance:

> Explore Ark auctions before Ark name issuance. It solves a sharper v1 pain:
> many bids per name.

## Direction 2: Ark For Sponsor Credits

This is the most interesting path for scalable flat name issuance.

The idea:

1. A sponsor locks BTC into Ark VTXO state.
2. The sponsor earns credits from locked BTC-time.
3. Credits are non-transferable or tightly constrained.
4. Sponsor spends credits to publish name claims.
5. Claims enter deterministic challenge windows.
6. Unchallenged claims finalize as sponsored flat names.
7. Challenged claims route to direct auction/bonding.

This could avoid one L1 UTXO per sponsored name.

The core question is whether many claims can share one VTXO.

Answer:

> Yes, conceptually. The VTXO should represent the sponsor's bonded capital or
> credit account, not each individual name. Individual name claims should be
> off-chain claim records committed in batches, drawing down credits from that
> sponsor account.

That means:

- one sponsor VTXO can support many claims over time
- each claim does not need its own VTXO
- claim data still needs a public log, batch root, or checkpoint
- users still need portable proof that their claim was included and finalized
- resolvers still need full data availability

Proof bundle for a sponsored Ark claim:

- sponsor VTXO or Ark account proof
- proof of sponsor eligibility and BTC-time
- credit-balance transition proving the credit was spent
- signed sponsor claim
- recipient owner-key acceptance
- batch inclusion proof
- challenge-window start/end proof
- proof of no successful UTXO-backed challenge, or proof of escalation
- latest owner-signed value-record chain

Hard questions:

- can BTC-time be proven across VTXO renewals?
- does preconfirmed Ark state count, or only settled Ark state?
- how are credits prevented from double-spending?
- what happens if the Ark operator disappears during a challenge window?
- can the user independently carry the proof bundle to another resolver?

Recommended stance:

> Ark-sponsored credits are worth serious modeling, but they should be treated
> as an optimistic batch/challenge system with explicit proof and DA rules.

## Direction 3: Ark As The Name Ownership Layer

This is more aggressive.

Instead of using Ark only for bids or sponsor credits, ONT could make name
ownership itself an Ark/RGB-like client-side state.

Possible shape:

- each name is represented by a VTXO-like state object
- transferring the name means spending/updating that state
- many name states share Ark batch outputs
- final L1 hardening is optional or only for high-value names

This is highly scalable, but it changes the assurance model.

Concerns:

- VTXO expiry and renewal become name-liveness issues
- if a user loses presigned exit data, the name proof may degrade
- mass exits could be painful
- name state may become tied to Ark operator/signer trust assumptions
- it is harder to explain than direct L1 ownership

Recommended stance:

> Do not make Ark the v1 name ownership layer. Consider it later as a lower-cost
> assurance tier only if proof portability is excellent.

## Direction 4: RGB Or RGB-Like Client-Side Validation

RGB is relevant because it is explicitly built around:

- client-side validation
- off-chain contract state
- Bitcoin commitments
- single-use seals
- schemas for state transitions
- aggregating transitions in shared commitments

This maps well to ONT's proof-bundle needs.

Possible ONT uses:

- define an ONT schema for name acquisition, sponsored claims, and transfers
- use client-side validation to verify off-chain claim/credit state
- use Bitcoin or Ark outputs as seals
- use consignments/proof bundles to carry name history between wallets and
  resolvers
- aggregate many name-state transitions into one commitment

Where RGB is less obviously sufficient:

- ONT wants public global name discovery, not only private asset transfer
- data availability must be stronger and more public than many RGB asset flows
- auction/challenge windows need global visibility
- user and resolver tooling may be a large lift

Recommended stance:

> Study RGB as a validation/proof framework for ONT state transitions. Do not
> assume it solves public namespace data availability by itself.

## Rough On-Chain Footprint Intuition

These are order-of-magnitude comparisons, not forecasts.

Assumptions:

- direct ONT L1 name: about `2` Bitcoin transactions
- average transaction: about `250 vB`
- direct L1 footprint: about `500 vB/name` before extra bid churn
- Ark batch commitment: one L1 commitment can represent many VTXO/state updates
- sponsored claim data is off-chain, with batch roots/checkpoints on-chain or
  Ark-settled

| Model | L1 footprint per ordinary name | Main bottleneck |
| --- | ---: | --- |
| Direct L1 acquisition | about `500+ vB` | Bitcoin blockspace and bond UTXOs |
| Direct L1 auction with multiple bids | `500 vB + bid txs` | bid churn |
| Ark-assisted auction, L1 winner bond | low for losing bids; winner still L1 | transcript proof and bid collateral |
| Ark sponsor-credit claims | potentially far below `1 vB/name` if heavily batched | DA, proof bundles, contest rate |
| Ark as name layer | very low normal L1 use | Ark liveness, expiry, exit risk |
| RGB/RGB-like state | very low normal L1 use | public DA and tooling |

If a batch commitment supports `1,000` claims with about `1,000 vB` of L1
footprint, the amortized footprint is about `1 vB/claim`. If it supports
`10,000` claims, it is about `0.1 vB/claim`. The real cost moves off-chain into
data availability, proof distribution, operator liveness, and challenge design.

## Multiple Name Claims Sharing A VTXO

Yes, this is probably the design to prefer.

Bad shape:

> one name claim equals one VTXO

This may still compress better than L1, but it recreates a per-name state object
and inherits VTXO expiry/liveness for every name.

Better shape:

> one sponsor/bond VTXO earns credits, and many name claims spend those credits
> through batch-committed off-chain records

Best candidate shape:

- sponsor has one or more bonded Ark VTXOs
- ONT credit state tracks spendable issuance capacity
- each claim consumes a credit unit
- claims are included in public epoch batches
- challenge windows run against batch inclusion height/time
- uncontested finality is proven from the batch plus absence/escalation rules

This keeps the capital object separate from the name claim object.

## Where Ark And RGB Might Combine

Ark can provide:

- VTXO ownership
- off-chain execution
- batch settlement
- unilateral exit paths
- script/timelock conditions

RGB/RGB-like validation can provide:

- schema-defined state transitions
- client-side verification
- single-use seal discipline
- proof bundle semantics

Combined shape:

> Ark supplies the Bitcoin-native off-chain UTXO substrate; an ONT/RGB-like
> schema defines valid credit and name-claim transitions.

That may be powerful, but it is also complex. It should be explored only after
the v1 proof bundle is explicit.

## Current Recommendation

1. Keep v1 as direct L1 auction/bond ownership.
2. Define the ONT auction proof bundle abstractly enough to accept future
   transcript sources.
3. Explore Ark first for auction bids and winner transcripts.
4. Explore Ark sponsor credits next, with many claims sharing a sponsor VTXO.
5. Study RGB for proof-bundle and state-transition discipline.
6. Do not move name ownership itself fully onto Ark until expiry, liveness, and
   portability risks are deeply understood.

The key design question is:

> Can an Ark-backed or RGB-like proof bundle convince a fresh ONT indexer that a
> name was validly issued, without trusting the sponsor, resolver, or Ark
> operator as a registrar?

