# ONT Sponsor Credits Threat Model

This document is research for a possible post-v1 scale path. It is not part of
the ONT v1 launch spec.

v1 remains direct L1 bonded flat names plus owner-signed records.

The public-notice and resolver-transparency mechanism is explored in
[PUBLIC_NOTICE_RELAY_AND_RESOLVER_TRANSPARENCY.md](./PUBLIC_NOTICE_RELAY_AND_RESOLVER_TRANSPARENCY.md).

## Design Goal

Sponsor credits are an optimistic issuance mechanism for flat ONT names.

The desired property is:

> A long-tail flat name can finalize without one new per-name L1 UTXO, while any
> disputed name deterministically falls back to the normal bonded auction path.

The hard question is whether that can be done without making sponsors,
resolvers, Ark operators, or batch publishers into trusted registrars.

## Security Bar

A sponsor-credit design is viable only if a fresh verifier can answer:

1. Was the name syntactically valid?
2. Was the sponsor eligible to issue at this time?
3. Did the sponsor have enough unspent issuance credits?
4. Was this credit spend unique and non-reusable?
5. Did the recipient owner key accept the claim?
6. Was the claim canonically published?
7. Did the challenge window start and end deterministically?
8. Was there a valid challenge, and if so did it route to auction?
9. If uncontested, did the sponsored claim finalize exactly once?
10. Can the current owner prove the full chain without trusting one resolver?

If any answer depends on "ask this one service and trust it," the design has
probably become a registrar system in practice.

## Actors

| Actor | Role | Can Be Malicious? |
| --- | --- | --- |
| Requester | Wants a sponsored name. | Yes |
| Sponsor | Spends credits to issue a claim. | Yes |
| Recipient owner | Holds the owner key for the name. | Yes |
| Challenger | Posts a UTXO-backed competing claim. | Yes |
| Resolver/indexer | Stores, replays, serves, and may gossip proof data. | Yes |
| Batch publisher | Commits claim/checkpoint data to Bitcoin or another substrate. | Yes |
| Ark operator | Coordinates Ark/VTXO execution if used. | Yes |
| Miner | Orders/censors Bitcoin transactions. | Yes, within normal Bitcoin assumptions |
| Fresh verifier | Wallet, resolver, or user checking a proof bundle. | Honest but may have partial data |

## Core Invariants

These must hold across every variant:

1. A name cannot finalize to two different owners.
2. A finalized name has a portable proof bundle.
3. A sponsor credit cannot be spent twice.
4. A valid challenge routes the name to the standard auction path.
5. An invalid challenge does not block finality forever.
6. Sponsor exit stops future issuance power, but does not void already-finalized
   names.
7. A fresh resolver can reconstruct finality from public or portable data.
8. Reorg handling is deterministic.
9. Sponsored ownership and direct bonded ownership are distinguishable in
   client assurance tiers.

## Threats

### T1: Unfair Discovery / Quiet Claims

A sponsor or requester publishes a valid-looking claim too quietly for
challengers to notice before the challenge window closes.

Why this matters:

- an uncontested result only has meaning after fair public notice
- sponsor signatures should create intents, not private finality clocks
- hidden or weakly propagated batches turn sponsors into registrars

Required defenses:

- a claim window starts only after public batch/log inclusion
- batch data must be publicly retrievable during the notice window
- challengers need monitorable claim feeds
- proof bundles identify the batch/checkpoint that started the clock
- clients treat unavailable batches as non-final or degraded
- sponsored names can have longer notice windows than UTXO-backed auctions

Open question:

> What is the minimum public notice and data-availability rule that makes
> "uncontested" a legitimate market result?

Market speculation after fair public notice is not itself a protocol failure.
If a name has enough value to justify a challenge, the market should be able to
notice and challenge it. The protocol failure is allowing a name to finalize
without a fair chance to observe the claim.

### T2: Credit Double-Spend

A sponsor tries to use the same credit balance for multiple claims.

Required defense:

- canonical credit state transition
- deterministic ordering within each epoch
- non-reuse proof for each spend
- conflicting spends are invalid, not merely contested

Open question:

> Can this be proven with L1 commitments alone, or does it require Ark/RGB-like
> state machinery?

### T3: Ineligible Sponsor

A sponsor claims credits from a bond that is immature, spent, insufficient,
already counted incorrectly, or not linked to the sponsor key.

Required defense:

- sponsor eligibility proof
- bond maturity proof
- live-bond or permitted-exit proof
- deterministic credit accrual formula
- proof that future credit accrual stopped after bond exit

Important distinction:

Already-finalized names should survive sponsor exit. Future credits should not.

### T4: Resolver Omission

A resolver hides a valid challenge, serves an incomplete claim log, or presents
an outdated finality view.

Required defense:

- claims and challenges must be independently discoverable or gossipable
- multiple resolvers can compare logs
- checkpoint/Merkle roots make omission auditable
- proof bundles carry enough data to replay the result

Open question:

> How does a verifier prove "no valid challenge occurred" without trusting one
> resolver's database?

### T5: Data Availability Failure

Claim, credit, batch, or challenge data disappears after a checkpoint was
published.

Required defense:

- full batch data must be mirrored
- proof bundle must include or reference required data
- resolvers should reject opaque commitments whose leaves are unavailable
- clients should distinguish available proof from mere timestamp/checkpoint

Open question:

> Is data availability social/infrastructural, or can the protocol enforce it
> strongly enough?

### T6: Junk Challenge Load

Attackers submit malformed or invalid challenges to create resolver work,
confuse users, or delay finality.

Required defense:

- invalid challenges are rejected deterministically
- challenge verification cost is bounded
- invalid challenges do not consume normal sponsored claim finality forever
- services may rate-limit invalid submissions at the service layer

Important distinction:

A valid challenge is market demand. An invalid challenge is not.

### T7: Sponsor Concentration

A small number of large bonded sponsors issue most sponsored names.

Risks:

- fee extraction
- policy pressure
- soft registrar dynamics
- correlated data-availability failures

Possible mitigations:

- sublinear BTC-time scoring
- capped age multipliers
- global attempt caps
- credit expiration
- public sponsor statistics
- easy multi-sponsor submission tools

Hard limit:

Identity-based per-sponsor caps are weak because sponsor keys are Sybilable.

### T8: Transfer Inventory And Assurance Clarity

Sponsored names may become transferable after issuance finality, so sponsors or
requesters can create inventories and sell names later.

Preferred rule:

- challenge happens before ownership finalizes, not every time ownership moves
- after sponsored finality, the owner key can transfer the name
- transfer preserves the existing assurance tier
- transfer does not upgrade a sponsored name into a direct L1 name
- buyers must receive a proof bundle covering the original issuance and the
  transfer chain
- clients show "sponsored" or "batch-hardened" status clearly

Rejected or less-preferred mitigations:

- making sponsored names non-transferable until direct hardening
- reopening a challenge window on ordinary transfer
- requiring a live bond merely to sell an already-finalized sponsored name

Those restrictions reduce early inventory games, but they weaken the property
right the protocol claims to create. If a name is validly issued after public
notice and challenge opportunity, later sale should be an owner-key transfer,
not a new auction.

### T9: Timing And Reorg Races

Two claims for the same name arrive near the same time, or a challenge appears
near the end of the window, or Bitcoin reorgs around the anchor/checkpoint.

Required defense:

- windows are measured by block height and block hash where possible
- challenge inclusion rules specify reorg behavior
- claim ordering within a batch is deterministic
- ties route to auction or a deterministic invalidation rule

### T10: Ark Operator Equivocation

If Ark is used, an operator preconfirms conflicting credit or claim transitions.

Required defense:

- operator preconfirmation is not enough for final protocol status
- batch settlement or independently verifiable transcript is required
- proof bundle exposes whether a claim is preconfirmed, settled, or hardened
- L1 fallback exists for disputed or failed cases

## What Counts As Invalid Sponsor Behavior?

Invalid sponsor behavior should be narrow and mechanically checkable:

- malformed name
- bad sponsor signature
- missing recipient acceptance
- insufficient credits
- duplicate credit spend
- ineligible sponsor bond/capital source
- invalid checkpoint or inclusion proof
- conflicting claim under deterministic ordering

Normal contests should not punish sponsors by default. A sponsor cannot know
with certainty that a name will be contested. Contest is a market signal, not
proof of abuse.

## Go / No-Go Criteria

Sponsor credits become plausible if:

- credit state is independently replayable
- claim/challenge data remains available
- no-challenge finality can be audited across resolvers
- valid challenges deterministically route to auction
- claims cannot finalize quietly without public notice
- sponsor exit does not harm already-finalized names
- clients can honestly display assurance tier

Sponsor credits should be rejected or deferred if:

- no-challenge proof depends on one resolver
- credits require identity or reputation
- sponsors can start private or weakly publicized finality clocks
- data availability is mostly wishful
- Ark/RGB assumptions become required before they are mature
- users cannot understand the assurance difference between direct and sponsored
  names

## Next Work

1. Compare concrete variants against this threat model.
2. Extend the simulator with adversarial risk metrics.
3. Define a sponsor-credit proof bundle with exact proof obligations.
4. Ask external reviewers to attack one candidate variant, not the whole design
   space at once.
