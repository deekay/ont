# ONT Scaling Idea Catalog

This note catalogs the ingredients we have been exploring and combines them
into candidate architectures.

The target is:

> as much scalability as possible while preserving as much sovereign ownership
> as possible.

That means we are not only optimizing for throughput. We are also asking:

- can the owner independently prove their rights?
- can a fresh resolver rebuild state?
- can the system work without one trusted operator?
- can the user exit or harden into direct Bitcoin ownership?
- does the design avoid editorial name classes?
- does it avoid burning bitcoin as the payment mechanism?

## Design Axes

### Publication

| Ingredient | What it buys | What it costs |
| --- | --- | --- |
| Direct L1 event per action | Maximum clarity and independent discovery | Does not scale for every bid/name/action |
| Merkle batch root on Bitcoin | Many actions share one anchor | Needs full batch data availability |
| OpenTimestamps-style calendar | Cheap proof that an intent existed before a block | Timestamping alone does not decide ownership |
| Resolver-signed log | Auditable service receipts and censorship evidence | Resolver receipts are weaker than Bitcoin inclusion |
| Nostr-like relay gossip | Competitive completeness and redundancy | Needs anti-spam and deterministic replay |

### Auction Mechanics

| Ingredient | What it buys | What it costs |
| --- | --- | --- |
| Open ascending auction | Natural price discovery | Fake visible bids can manipulate honest bidders |
| Public-name sealed first-price auction | Name is discoverable, bid amounts are hidden until reveal | More complex UX; fake bids can still delay |
| Commit-reveal | Reduces front-running and fake price signaling | Two phases; reveal failures need rules |
| Bitcoin-height epochs | Shared clock for every resolver | Slower than continuous bidding |
| Short settlement window | Bounds fake-winner delay | Needs notification/coordination services |
| Next-valid-bidder fallback | Preserves liveness after failed winner | Does not solve price manipulation unless bids are sealed/first-price |
| On-chain bid UTXOs | Bids are real and costly | Bid transactions still consume blockspace |
| Winner-only settlement | Losing bids do not create lasting chain state | Fake bids need another control |

### Bond Models

| Ingredient | What it buys | What it costs |
| --- | --- | --- |
| Temporary per-name hardening UTXO | Strongest self-custodied continuity during maturity | One live UTXO per hardening name while immature |
| Temporary bid UTXOs | Real auction commitments without permanent loser bloat | Still many bid transactions |
| Batched winner settlement outputs | Many winners can settle in one transaction | Still one temporary UTXO per hardening winner |
| Existing UTXO reference | May avoid new output creation | Bad as a hard requirement; users may not have UTXOs |
| Aggregated provider bond | Big scale gain and easier UX | Weaker sovereignty; provider risk and exit rules needed |
| Root-only bond | Scales subnames/agents under a root | Subnames depend on root policy |
| Progressive hardening | Users can start cheap and harden later | Unhardened state has weaker guarantees |

### Service Layer

| Ingredient | What it buys | What it costs |
| --- | --- | --- |
| Resolver as coordinator | Auction UX, receipts, batching, monitoring | Must not become registrar |
| Resolver service fees | Incentivizes useful work and reduces spam | Fees must not become name ownership payment |
| Batch/data availability providers | Replayable history and proofs | Needs redundancy and auditability |
| Commercial settlement coordinators | Helps winners settle quickly | Must preserve self-custody and fallback paths |
| Anyone-can-run resolver | Avoids required central operator | More protocol complexity for convergence |

## Ideas We Should Probably Not Rely On

### Burning Bitcoin

Burning creates a collectorless cost, but it is a poor fit for ONT's goals.
It destroys user funds, feels hostile to Bitcoin as money, and still consumes
L1 space.

### HODL Invoices As Auction Collateral

Lightning hold invoices can tie up liquidity and HTLC slots. At auction scale
they could create bad network hygiene or even liquidity-jamming pressure.

They may be acceptable for narrow service payments, but not as core auction
collateral.

### Bidder Reputation As A Core Defense

Bidder reputation is weak because keys are cheap. A bidder with a bad identity
can usually generate a new key.

Resolver reputation can matter because resolvers are persistent service
providers. Bidder reputation should not be a consensus-critical defense unless
it is backed by cost, collateral, or a persistent valuable identity.

### Pure Off-Chain Open Ascending Auctions

If visible bids are costless, a fake bidder can push an honest bidder higher:

> Alice bids 10k. Fake bidder bids 1M. Alice escalates to 1.1M.

Fallback does not fix that because the fake bid already changed Alice's
behavior.

## Candidate Architectures

### Candidate A: Current Direct Bonded Auction

Summary:

- every bid is an L1 ONT event
- every bid has a real bond output
- winning bid bond becomes the temporary hardening bond
- after maturity, owner-key authority survives and the bond can be spent

Strengths:

- clearest sovereignty
- fake bids are expensive
- indexers can replay directly from Bitcoin
- no resolver coordination needed
- UTXO footprint is a rolling immature set, not total names ever issued

Weaknesses:

- one transaction per bid
- one live UTXO per immature hardening name
- expensive for popular auctions
- not plausible for broad human/agent scale

Best use:

- correctness prototype
- high-assurance direct path
- maybe scarce names where L1 cost is acceptable

### Candidate B: On-Chain Bid UTXOs Plus Batched Winner Settlement

Summary:

- bids are still real on-chain commitments
- losing bid UTXOs are temporary and releasable
- winner does not necessarily keep the bid UTXO as the temporary hardening output
- many winners join one batched settlement transaction
- each winner receives a self-custodied temporary hardening output
- after maturity, the hardening output can be spent without losing authority

Strengths:

- fake bids remain costly
- open auctions can remain credible
- losing bid UTXOs do not become permanent state
- final settlement can amortize transaction overhead
- preserves strong self-custody for settled names
- live UTXO pressure depends on hardening rate and maturity window, not total
  historical names

Weaknesses:

- still one transaction per bid
- still one temporary UTXO per name during hardening
- settlement coordination is hard
- popular auctions still produce blockspace load
- batching introduces participant availability, stale-input, fee negotiation,
  and privacy concerns

Interesting variant:

- use this as the high-assurance default for top-level names at launch, then
  add subnames or provider-backed roots later.

Design rule:

- solo settlement remains the fallback; batching is a fee/blockspace
  optimization, not a required trust path.

### Candidate C: Public-Name Sealed First-Price Resolver Auction

Summary:

- auction name is public
- bids are committed/revealed through resolvers
- Bitcoin height defines commit/reveal/settlement epochs
- resolvers gossip and batch transcripts
- highest valid revealed bid wins
- winner pays/locks their own bid
- failed winner is removed; next highest revealed bidder can settle at their
  own bid
- winner settlement can use a temporary hardening bond

Strengths:

- avoids visible fake-bid price pumping
- losing bids do not touch L1
- resolvers can compete on completeness and reliability
- Bitcoin remains shared clock/anchor
- winner-only settlement reduces L1 load

Weaknesses:

- fake bids can still cause bounded delay
- more protocol and UX complexity
- needs data availability for transcripts
- weak bid credibility unless paired with fees, deposits, or settlement proofs

Best use:

- scalable auction candidate if we accept that fake-winner delay is bounded by
  short settlement windows.

### Candidate D: Resolver-Coordinated Auction With Pre-Signed Settlement

Summary:

- bidders submit sealed commitments/reveals
- serious bidders also provide a fully signed settlement transaction or package
- coordinator can broadcast the winner's settlement transaction

Strengths:

- stronger bid credibility than a bare signed message
- still non-custodial if outputs are fixed to the bidder
- can pair with resolver services and monitoring

Weaknesses:

- signed transaction is an option, not a lock
- bidder can double-spend inputs before settlement
- RBF/fee staleness/input spending risks remain
- requires bidders to have Bitcoin funds ready

Best use:

- optional "serious bid" mode
- higher-value auctions
- resolver filtering, not consensus certainty

### Candidate E: Batch-Anchored Root Names With Aggregated Provider Bond

Summary:

- a provider aggregates many root-level names
- each name has its own owner key
- one or a few provider bonds back the batch
- Bitcoin anchors state roots and provider collateral
- users may later exit/harden into individual self-custodied temporary outputs
- hardening bonds can be temporary if owner-key authority survives maturity

Strengths:

- large scale gain
- users may not need immediate Bitcoin wallet complexity
- provider can coordinate issuance and data availability
- owner keys still control names inside the state

Weaknesses:

- provider bond is not the same as per-name self-custody
- provider can become a risk point
- exit/hardening rules are essential
- without covenants, aggregate bond accounting is protocol/social, not fully
  Bitcoin-enforced

Best use:

- lower-footprint root-level issuance tier if we are comfortable with explicit
  assurance levels and exits.

### Candidate F: Direct-Hardened Roots Plus Root-Issued Subnames

Summary:

- top-level names can use direct Bitcoin hardening
- roots can issue many subnames through signed Merkle batches
- subname holders have owner keys and inclusion proofs
- subnames can be revocable, non-revocable, transferable, or expiring depending
  on root policy
- any subname can have a path to stronger sovereignty, including optional
  independent hardening

Strengths:

- huge scale for agents and app identities
- preserves strong Bitcoin-anchored ownership for roots
- avoids every subname needing a UTXO
- does not trap users permanently in the root-issued state
- natural market for useful namespaces

Weaknesses:

- subnames depend on root policy
- not fully root-equivalent unless independently hardened
- root owners become governance points inside their namespaces
- independent hardening reintroduces per-name Bitcoin cost for the users who
  choose it

Best use:

- agents, organizations, communities, app handles, and high-volume identities.

Sovereignty paths:

| Path | Bitcoin touch for subname? | Sovereignty shape |
| --- | --- | --- |
| Root-signed grant | No | Usable once resolvers see the certificate; depends on root policy and data availability |
| Root/resolver Merkle anchored grant | Shared batch tx | Stronger timestamp, discovery, and replay; no per-subname UTXO |
| Non-revocable anchored grant | Shared batch tx | Root trusted at issuance, but cannot later revoke under protocol rules |
| Independent subname hardening | Yes | Subname gets its own Bitcoin-backed state and maturity path |
| Acquire/migrate to root | Yes | User moves from namespace identity to direct root sovereignty |

### Candidate G: Progressive Hardening Lifecycle

Summary:

- every name can start as batch-anchored owner-key state
- owner can later harden into a direct Bitcoin-anchored state
- hardening is owner-triggered, not editorially assigned

Possible states:

1. signed intent observed
2. batch-anchored
3. resolver-replayable
4. provider-backed / aggregate bonded
5. individually Bitcoin-hardened

Strengths:

- avoids editorial assurance lanes
- users choose assurance level
- cheap issuance first, stronger sovereignty later
- fits commercial service providers

Weaknesses:

- names have different assurance states
- UI must explain those states clearly
- weaker states need honest caveats
- unresolved question: what rights exist before hardening?

Best use:

- migration strategy if direct per-name UTXOs become too expensive.

### Candidate H: Mature Bond-Weight Sponsored Flat Issuance

Summary:

- year one uses direct auction / bond issuance because no sponsors have matured
  yet
- after maturity, active still-bonded names can earn issuance credits
- credits accrue from BTC-time, with optional capped age multipliers for
  long-held bonds
- sponsors spend credits to issue flat names to user owner keys
- uncontested sponsored names finalize without a new per-name UTXO
- contested sponsored names escalate to the standard auction / bond path

Strengths:

- keeps flat-name UX instead of forcing visible `name@root` notation
- uses Bitcoin bonds for scarce/contested names, not every long-tail name
- creates a permissionless sponsor market backed by mature bonded BTC-time
- sponsor exit affects future issuance power, not already-finalized names

Weaknesses:

- more complex than direct bonded roots or explicit subnames
- requires careful credit, contest, and anti-concentration parameters
- contest rates directly affect Bitcoin settlement load
- sponsor proof history is hidden from the name string and must be surfaced in
  clients/resolvers

Best use:

- a possible flat-namespace scale path after the first maturity cohort exists.

## Mix-And-Match Matrix

| Candidate | Scale | Sovereign ownership | Auction integrity | Complexity | Main unsolved issue |
| --- | --- | --- | --- | --- | --- |
| A. Direct bonded auction | Low | Very high | Very high | Low-medium | Bid blockspace and immature UTXO footprint |
| B. On-chain bids + batched settlement | Medium-low | Very high | Very high | Medium | Bid tx count still scales |
| C. Resolver sealed auction | Medium-high | High after settlement | Medium | High | Fake-winner delay and bid credibility |
| D. Pre-signed settlement variant | Medium | High after settlement | Medium-high | High | RBF/double-spend risk |
| E. Provider aggregate bond | High | Medium until exit | Medium-high | High | Provider risk and exit design |
| F. Direct-hardened roots + subnames | Very high for subnames | High for roots, medium for subnames | Depends on root policy | Medium-high | Subname dependence on root |
| G. Progressive hardening | High | Variable, owner-chosen | Variable | High | Assurance-state clarity |
| H. Mature-bond sponsored flat issuance | Very high if contests are rare | High after sponsored finality | High when contested | High | Credit economics and contest load |

## Rough Capacity Model

This is an order-of-magnitude model, not a forecast.

Assumptions:

- Bitcoin has about `144,000,000 vB/day` of theoretical blockspace.
- A single ONT on-chain bid transaction is approximated as `300 vB`.
- Batched winner settlement / temporary hardening is approximated as
  `110 vB/name` when amortized across many winners.
- Temporary hardening bonds mature after `30 days` in the table below.
- After maturity, the bond can be spent and owner-key authority survives.
- Active hardening UTXOs are therefore a rolling set:
  `annual hardenings * maturity_days / 365`.
- The provider-backed row counts direct hardening blockspace only. It assumes
  provider issuance and batch anchoring are highly amortized.

### Annual Capacity By Blockspace Share

| Model | vB per hardened name | 0.1% blockspace names/year | 0.1% active 30d UTXOs | 1% blockspace names/year | 1% active 30d UTXOs |
| --- | ---: | ---: | ---: | ---: | ---: |
| On-chain bids + batched settlement, 1 avg bid | `410` | `128k` | `11k` | `1.28M` | `105k` |
| On-chain bids + batched settlement, 3 avg bids | `1,010` | `52k` | `4k` | `520k` | `43k` |
| On-chain bids + batched settlement, 5 avg bids | `1,610` | `33k` | `3k` | `326k` | `27k` |
| Winner-only hardening after off-chain/resolver auction | `110` | `478k` | `39k` | `4.78M` | `393k` |
| Provider-backed issuance, 10% harden | `110 per hardening` | `4.78M issued` | `39k` | `47.8M issued` | `393k` |

If the maturity window were `7 days` instead of `30 days`, the active UTXO
working set would be about `23%` of the 30-day numbers.

### Year-By-Year At 1% Blockspace

This table shows cumulative issued names if the system consistently used about
`1%` of Bitcoin blockspace for the relevant hardening path.

| Year | On-chain bids + batched settlement, 3 avg bids | Winner-only hardening after resolver auction | Provider-backed issuance, 10% harden |
| ---: | ---: | ---: | ---: |
| 1 | `520k` | `4.78M` | `47.8M` |
| 2 | `1.04M` | `9.56M` | `95.6M` |
| 3 | `1.56M` | `14.3M` | `143M` |
| 4 | `2.08M` | `19.1M` | `191M` |
| 5 | `2.60M` | `23.9M` | `239M` |
| 6 | `3.12M` | `28.7M` | `287M` |
| 7 | `3.64M` | `33.4M` | `334M` |
| 8 | `4.16M` | `38.2M` | `382M` |
| 9 | `4.68M` | `43.0M` | `430M` |
| 10 | `5.20M` | `47.8M` | `478M` |

Steady active hardening UTXOs at 30-day maturity:

- on-chain bids plus batched settlement, 3 average bids: `43k`
- winner-only hardening after resolver auction: `393k`
- provider-backed issuance with 10% hardening: `393k`

The important shift is that matured bonds prevent UTXO count from scaling with
total historical names. UTXO pressure scales with the current hardening rate and
maturity duration.

Transaction and fee pressure still scale with the number of bids and hardening
events. Temporary bonds improve the UTXO story; they do not make Bitcoin
blockspace free.

## Promising Combinations

### Combination 1: Conservative Root Launch, Scalable Subnames Later

Use:

- Candidate B for root names
- Candidate F for subnames

Shape:

- root names use costly real auctions and self-custodied temporary hardening
- losing bid UTXOs are temporary
- final temporary hardening outputs can be settled in batches
- later, every root can issue subnames with Merkle-batched records

Why it is promising:

- keeps launch sovereignty simple
- does not require editorial name classes
- lets early names become namespace infrastructure
- gives agents and app identities a plausible scale path

Main concern:

- direct root hardening still scales only to the number of active immature UTXOs
  and auction transactions Bitcoin can reasonably support.

### Combination 2: Resolver-Sealed Auctions With Winner-Only Direct Hardening

Use:

- Candidate C
- optional Candidate D for stronger bids
- batched final settlement outputs

Shape:

- public name auctions
- sealed first-price commit/reveal
- resolvers coordinate, gossip, receipt, and batch transcripts
- only winners create temporary self-custodied hardening UTXOs

Why it is promising:

- avoids one L1 transaction per losing bid
- avoids fake visible bid escalation
- preserves direct ownership after settlement
- lets resolver services compete without becoming registrars

Main concern:

- fake winners can still delay unless bid credibility or settlement windows are
  strong enough.

### Combination 3: Provider-Backed Root Names With Exit To Direct Bond

Use:

- Candidate E
- Candidate G

Shape:

- service providers aggregate many root-level names
- names have user owner keys
- provider bond backs the batch
- users can later exit/harden into their own temporary hardening UTXO

Why it is promising:

- much better scale
- avoids requiring every user to start with direct Bitcoin custody
- creates a commercial service-provider role
- preserves a path to sovereignty

Main concern:

- until exit, ownership depends on provider collateral and data availability.
  This must be honestly represented.

### Combination 4: Three-Layer Naming Without Editorial Classes

Use:

- direct-hardened roots
- aggregate/provider-backed roots
- root-issued subnames
- progressive hardening

Shape:

- the protocol supports multiple assurance levels
- any name owner can choose to harden
- any root can issue subnames
- no committee decides which names get stronger treatment

Why it is promising:

- avoids editorial allocation
- lets market and users choose assurance level
- supports human and agent scale
- keeps maximum sovereignty available

Main concern:

- product clarity. Users must understand the difference between direct-hardened,
  provider-backed, and subname ownership.

## Current Best Candidate To Model First

The most useful next prototype may be:

> on-chain bid commitments plus batched winner settlement, paired with a
> later subname/root-batch extension.

Why:

- it preserves strong auction integrity
- it keeps fake bids costly
- it avoids relying too much on resolver discretion
- it gives us concrete byte/UTXO estimates
- it tests whether temporary bid UTXOs plus batched settlement are viable before
  we move to weaker provider-backed models

In parallel, we should model:

> resolver-sealed first-price auctions with winner-only settlement.

Why:

- it is the better scale candidate if on-chain bids are too expensive
- it forces us to solve data availability, receipts, transcript replay, and
  fake-winner delay explicitly

## Questions To Resolve Next

1. How many temporary bid UTXOs can we tolerate during active auctions?
2. How many immature hardening UTXOs can Bitcoin socially tolerate at once?
3. Can batched settlement reliably coordinate hundreds of self-custodied winner
   outputs?
4. Is sealed first-price good enough to reduce fake-bid price griefing?
5. What exact rights does a provider-backed root name have before direct
   hardening?
6. Can an aggregate-bond provider fail without destroying user ownership?
7. What should a root-issued non-revocable subname guarantee?
8. Can every assurance level have a clean, independently verifiable proof
   bundle?
9. What is the simplest UX language for "direct-hardened", "provider-backed", and
   "root-issued"?
