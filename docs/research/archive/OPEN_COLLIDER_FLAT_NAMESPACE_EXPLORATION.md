# Open Collider Flat Namespace Exploration

Status: research pass, not a v1 protocol commitment.

This note applies an Open Collider-style method to ONT's hardest design
question:

> Can ONT achieve a flat human-readable namespace with strong self-sovereign
> ownership at global scale, without introducing a token, a trusted registrar,
> editorial allocation, or a non-Bitcoin scarce settlement asset?

The method is inspired by
[CL-ML/open-collider](https://github.com/CL-ML/open-collider): inject
structurally distant domains, extract the mechanism that matters, collide that
mechanism with ONT, then curate the few designs worth testing.

## Current Constraints

The existing docs imply these constraints:

- v1 candidate: direct L1 bonded auctions for flat names.
- Names are valid only under the narrow v1 grammar: `[a-z0-9]{1,32}`.
- Bitcoin is the scarce settlement and ownership anchor.
- Bitcoin should not carry routine mutable destination records.
- Owner keys are the stable authority layer for value records and transfers.
- Resolvers and relays may carry evidence, but should not decide ownership.
- Future acquisition paths must be source-tagged in proof bundles.
- Direct L1 issuance remains the censorship-resistant fallback.
- Sponsored or optimistic issuance must have public notice, data availability,
  deterministic challenge windows, and portable proof bundles.
- No new token, new cryptocurrency, identity quota, founder allocation,
  whitelist, semantic reserved list, or trusted registrar.

The design problem is not just throughput. The design must preserve:

- flat names
- public verifiability
- data availability
- owner-key portability
- credible conflict resolution
- understandable assurance tiers
- compatibility with a simple L1 v1 launch

## Bitcoin Scarcity As The Anti-Abuse Primitive

ONT is not trying to make names free. It is trying to make ordinary names
cheap enough to use while keeping squatting and griefing tied to scarce bitcoin
capital.

The core anti-abuse idea is:

> the protocol can make publication cheap, but it should make control,
> contesting, escalation, or mass capture require real bitcoin scarcity.

Direct L1 auctions do this most clearly:

- opening a name requires a bonded bitcoin bid
- outbidding requires a larger bonded bid
- late auction griefing requires increasingly higher bonded increments
- winning requires keeping bitcoin committed during the immature period
- long-name floors prevent dust-level mass claims

The scaling path should preserve that shape even when ordinary claims do not
each create a new L1 UTXO.

For optimistic or sponsored issuance, Bitcoin scarcity can enter through:

- requester fees paid in bitcoin for relay/batch service
- sponsor capacity earned from BTC-time or live bonded capital
- BTC-backed challenges that force disputed names into auction
- bond floors for challenges, so attackers cannot dust-challenge every claim
- optional direct hardening for users who want stronger assurance
- Ark/VTXO collateral if a future L2 path proves useful

This matters for both squatting and griefing:

- A squatter should not be able to silently acquire millions of names at near
  zero cost.
- A griefer should not be able to force every long-tail sponsored claim on-chain
  with dust.
- A challenger should have to reveal real economic interest by posting bitcoin
  capital.
- A sponsor should spend scarce, replayable capacity, not issue unlimited names
  by private discretion.

Public notice without Bitcoin scarcity becomes a cheap registration race.
Bitcoin scarcity without public notice does not scale. The promising design
family needs both:

> cheap public notice for the long tail, expensive Bitcoin-backed escalation for
> scarcity, disputes, and abuse.

## Baseline Scale Reality

Direct L1 can be the high-assurance layer, not the only global-scale layer.

Current rough capacity numbers:

| Model | Approx L1 footprint | At 1% Bitcoin blockspace | At 5% Bitcoin blockspace |
| --- | ---: | ---: | ---: |
| Direct auction, 3 bids average | `900 vB/name` | `584k/year` | `2.9M/year` |
| Direct auction, 5 bids average | `1500 vB/name` | `350k/year` | `1.75M/year` |
| Off-chain auction, L1 winner-only hardening | `110 vB/name` | `4.78M/year` | `23.9M/year` |

At `23.9M/year`, reaching `8B` names takes about `335 years`. At
`2.9M/year`, it takes about `2,750 years`.

This does not make v1 useless. It means v1 is the scarce, direct, strongest
assurance path. Global scale needs another path whose ordinary case is much
cheaper, while conflict falls back to Bitcoin.

## Distant-Domain Collisions

### 1. Certificate Transparency

Active principle:

> Public append-only logs make misissuance detectable even when the base
> authority is not directly involved in every certificate.

Collision with ONT:

- sponsored or optimistic claims must be in transparency logs before they can
  mature
- monitors watch all logs for names they care about
- equivocation creates signed fork evidence
- checkpoints are anchored to Bitcoin or timestamp services

Candidate mechanisms:

- `ONT Transparency Log`: each claim, challenge, credit spend, and transfer is
  a hash-linked log entry with signed receipts.
- `Witnessed Finality`: a name finalizes only after inclusion in logs mirrored
  by a minimum publication rule, such as one recognized relay plus optional
  cross-witnesses for higher assurance.
- `Split-View Penalty`: a relay that signs conflicting log heads loses client
  trust, and its entries become degraded unless independently mirrored.

Assessment:

This is one of the strongest collisions. It does not solve credit allocation by
itself, but it gives ONT the right public notice and audit structure.

### 2. UCC Filing And Property Notice

Active principle:

> A filing system gives public notice of a claim; priority and disputes are
> decided by deterministic rules, not private possession of a database.

Collision with ONT:

- a sponsored claim is a public notice filing, not ownership at signature time
- the filing starts a challenge clock
- unchallenged claims become final after the notice period
- challenged claims route to the bonded auction path

Candidate mechanisms:

- `Notice-Then-Title`: claim publication creates pending notice; final title
  exists only after a fixed public challenge window.
- `Priority By Bitcoin-Anchored Epoch`: claims in the same epoch are ordered by
  deterministic replay against a Bitcoin-confirmed checkpoint.
- `Objection Record`: a challenge is a public filing with capital attached,
  not a private message to a resolver.

Assessment:

This is basically the cleanest mental model for sponsored issuance. It clarifies
that public notice is the thing being scaled, while Bitcoin remains the dispute
and hardening layer.

### 3. BitTorrent And Content-Addressed Distribution

Active principle:

> Availability comes from many peers retaining identical content-addressed
> data, not from one canonical host.

Collision with ONT:

- Merkle roots are useless without leaves
- proof bundles, claim batches, challenge data, and transfer chains should be
  content-addressed and swarm-mirrorable
- resolvers should be seeders as much as APIs

Candidate mechanisms:

- `Claim Batch CAR/Torrent`: each public batch is a content-addressed archive
  containing all leaves and proofs.
- `Resolver Seeder Score`: clients display whether a batch is available from
  multiple mirrors.
- `User-Carried Proof Pack`: owners can carry a compact proof pack even if the
  original resolver disappears.

Assessment:

This does not decide ownership. It is probably the right data availability
substrate for any optimistic path.

Rough scale intuition:

- if an average claim record is `250-500 bytes`, `100M` claims/year is about
  `25-50GB/year` of raw claim data
- `1B` claims is about `250-500GB`
- `8B` claims is about `2-4TB`

That is not free, but it is plausible for commercial resolvers, archives,
wallet companies, and serious community operators.

### 4. Git Signed Tags And Package Registries

Active principle:

> Authority can move through signed history chains, while public registries make
> name conflicts visible.

Collision with ONT:

- the name owner key is like a maintainer key
- transfer is a signed handoff
- value records are a signed append-only history
- registry-like mirrors help users find current state but do not own the state

Candidate mechanisms:

- `Name Title Chain`: every name has a signed ownership interval chain:
  issuance, transfers, recovery events, and value-record heads.
- `Fork Visible, Not Hidden`: conflicting title chains are not silently
  resolved by a resolver; they are surfaced and replayed against protocol rules.
- `Marketplace Proof Pack`: sale of a name requires the title chain plus the
  current owner authorization, not trust in a marketplace.

Assessment:

This collision reinforces proof bundles. It is less about issuance scale and
more about making ownership portable once issued.

### 5. CRDTs And Deterministic Merge

Active principle:

> Distributed systems can accept concurrent operations if every replica can
> merge them deterministically.

Collision with ONT:

- resolvers can receive claims and challenges in different orders
- final state must not depend on resolver arrival order
- same inputs should converge to the same owner

Candidate mechanisms:

- `Claim Conflict Set`: all claims for the same name in a challenge window form
  a conflict set.
- `Conflict Escalates`: if more than one valid claimant exists, do not pick by
  relay order; route to auction.
- `Deterministic Epoch Replay`: credit spends, claims, and challenges are
  replayed by epoch, then sorted by canonical hashes.

Assessment:

Very useful. It suggests ONT should avoid pretending off-chain arrival order is
objective. Conflicts should either merge harmlessly or escalate.

### 6. Postal Certified Mail And Public Bulletin Boards

Active principle:

> A sender needs evidence that a notice was delivered or publicly posted by a
> certain time, even if the recipient later denies awareness.

Collision with ONT:

- claimants need portable receipts that a public relay accepted their claim
- challengers need receipts that their objection arrived in time
- finality windows should start from receipt or checkpoint, not private
  signature time

Candidate mechanisms:

- `Append Receipt`: every accepted claim/challenge gets a signed relay receipt.
- `Challenge Receipt`: a valid challenger can prove timely submission even if a
  resolver later omits it.
- `Notice Assurance Ladder`: receipt-only, checkpointed, cross-witnessed, and
  L1-hardened states are distinct assurance levels.

Assessment:

This is a strong implementation detail for transparency logs.

### 7. Commodity Warehouse Receipts

Active principle:

> A portable receipt represents a claim on underlying collateral, but the value
> depends on audits, redemption, and non-duplication.

Collision with ONT:

- sponsor credits are receipts against BTC-time, not magical free issuance
- credit non-reuse is the hard audit problem
- sponsor exit should stop future receipts without voiding already finalized
  names

Candidate mechanisms:

- `BTC-Time Warehouse`: a sponsor's live or mature bond creates an auditable
  credit inventory.
- `Credit Warehouse Statement`: each epoch publishes inventory, spends,
  expirations, and remaining capacity.
- `Redemption-To-L1`: disputed sponsored names redeem into a direct bonded
  auction or hardening path.

Assessment:

Good for sponsor-credit accounting. Also clarifies the weakness: without a
canonical warehouse ledger, credits are just resolver promises.

### 8. Insurance And Surety Bonds

Active principle:

> A surety does not decide who owns property; it underwrites a process and pays
> or loses reputation/capacity if it fails.

Collision with ONT:

- sponsors could be underwriters of public notice quality, not issuers in the
  registrar sense
- the requester owns the name if the public process completes
- a sponsor's future capacity can depend on clean, replayable performance

Candidate mechanisms:

- `Sponsor As Surety`: a sponsor signs that a requester claim is backed by
  spendable issuance capacity, then the public notice process decides finality.
- `Service Bond`: commercial relays post optional BTC bonds for uptime and
  data availability promises, outside ownership consensus.
- `Challenge Bounty`: contested claims include a small service-level bounty for
  valid challengers or monitors, funded by requester/sponsor fees, not a token.

Assessment:

Potentially important for incentives, but dangerous if it becomes subjective
reputation. The useful part is the role separation: underwrite, publish,
monitor, but do not decide.

### 9. ACH / Card Settlement

Active principle:

> Users can see provisional state quickly, while final settlement has stronger
> but slower rules.

Collision with ONT:

- sponsored names can be useful before strongest finality, but clients must show
  assurance
- finality can advance through stages: observed, checkpointed, uncontested,
  batch-hardened, direct L1 hardened

Candidate mechanisms:

- `Provisional Sponsored`: name is visible after public notice, but still
  challengeable.
- `Final Sponsored`: challenge window closed with no valid challenge.
- `Hardened Upgrade`: owner later pays or joins a batch to upgrade assurance.

Assessment:

Good for UX if honest. Bad if clients hide the distinction.

### 10. Court Docket And Default Judgment

Active principle:

> If a claim is publicly filed and no one objects within a fair window, a
> default result can be valid even though no judge evaluated the substance.

Collision with ONT:

- uncontested finality is legitimate only if notice and objection were fair
- a valid objection routes to an adversarial process
- invalid objections should not block finality forever

Candidate mechanisms:

- `Default Title`: unchallenged sponsored claims finalize after long public
  notice.
- `Capital-Backed Objection`: objections require real BTC commitment to avoid
  zero-cost griefing.
- `Invalid Objection Filter`: deterministic validity rules reject malformed or
  underbonded challenges.

Assessment:

This is a clean way to explain why "uncontested" can be meaningful without
making a resolver a judge.

### 11. DNSSEC NSEC/NSEC3 Non-Existence Proofs

Active principle:

> A verifier often needs a proof that something was not present in a signed
> zone at a time, not only a proof that something was present.

Collision with ONT:

- sponsored finality requires proving no valid challenge occurred
- a state root needs non-inclusion proofs, not just claim inclusion proofs
- epoch snapshots can prove "no valid challenge for this name in this window"
  if the full ordered set is available

Candidate mechanisms:

- `Sparse Name State Tree`: each epoch root commits to all pending/final names
  and conflict sets.
- `Challenge Non-Inclusion Proof`: proof bundle contains sparse proofs for the
  name across the notice window.
- `Range-Proof Challenge Index`: challenge batches are sorted by name hash, so a
  verifier can prove absence in a batch without downloading every challenge.

Assessment:

Very promising, with the usual warning: non-inclusion proofs are only as good
as the data and rules behind the root.

### 12. Mining Pool Shares And Weak Blocks

Active principle:

> Many low-value proofs can show work or participation without becoming final
> chain blocks.

Collision with ONT:

- off-chain claims can carry anti-spam cost before they deserve relay resources
- this should not become the scarce ownership basis, because the goal says
  Bitcoin is the scarce settlement value

Candidate mechanisms:

- `Relay Admission Hashcash`: optional spam filter for public relays.
- `Monitor Reward Signal`: not a protocol asset, but relays can prioritize
  claims with requester-paid fees or proof-of-work.

Assessment:

Useful only as service-layer anti-spam. Not a core issuance solution because it
uses non-Bitcoin scarcity.

## Candidate Architectures

Scores are `1-5`, where `5` is strongest. "Implementation" means ease and
near-term risk, so `5` is easiest/least risky.

| Candidate | Sovereignty | Flatness | Bitcoin-only | Scale | Verifiability | DA | UX | Implementation | v1 compatibility |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A. Direct L1 bonded auction | 5 | 5 | 5 | 1 | 5 | 5 | 3 | 4 | 5 |
| B. Transparency-log sponsored claims | 3 | 5 | 5 | 5 | 3 | 3 | 4 | 3 | 5 |
| C. Sparse state-root rollup with L1 challenges | 4 | 5 | 5 | 5 | 4 | 3 | 3 | 2 | 4 |
| D. Sponsor-as-surety BTC-time credits | 3 | 5 | 5 | 5 | 3 | 3 | 4 | 2 | 4 |
| E. Off-chain auction, winner-only L1 hardening | 5 after settlement | 5 | 5 | 3 | 4 | 3 | 3 | 3 | 5 |
| F. Root/subname hierarchy | 3 for subnames, 5 for roots | 2 | 5 | 5 | 4 | 3 | 4 | 3 | 4 |
| G. Ark-backed credit or auction substrate | 3-4 | 5 | 5 | 5 | 3-4 | 3 | 3 | 2 | 4 |
| H. RGB-style client-side state | 3 | 5 | 5 | 5 | 4 for holder | 2 | 2 | 2 | 3 |
| I. Hashcash/admission-work claims | 2 | 5 | 2 | 4 | 3 | 3 | 3 | 4 | 3 |

## The Most Promising Converged Shapes

### 1. Public Title-Notice System

This is the cleanest scale candidate.

Shape:

1. A requester and owner key sign a flat-name claim.
2. A sponsor may also sign, if credits are part of the design.
3. The claim enters a public append-only notice log.
4. The log emits a receipt and later a batch checkpoint.
5. A long challenge window starts from public notice.
6. If no valid BTC-backed competing claim appears, the name finalizes as
   sponsored or optimistic.
7. If a valid challenge appears, the name routes to the standard auction path.
8. The owner receives a portable proof bundle.

Why it might work:

- keeps flat names
- does not need per-name L1 UTXOs in the ordinary case
- uses Bitcoin when there is conflict
- makes quiet claims invalid
- lets resolvers mirror evidence without deciding outcomes

Hardest unresolved point:

> Can a fresh verifier prove "no valid challenge occurred" without trusting one
> resolver's private database?

Likely answer:

Use checkpointed challenge indexes, sparse non-inclusion proofs, full batch
data availability, and multiple mirrors. This is credible enough to prototype,
not solved enough to freeze.

### 2. Sparse State-Root Rollup For Names

This is a more formal version of public title-notice.

Shape:

1. Every epoch produces a sparse Merkle root over name states.
2. Leaves represent unowned, pending claim, challenged, final sponsored,
   direct L1, transferred, or degraded states.
3. The root commits to claim sets, challenge sets, credit spends, and transfers.
4. Roots are anchored periodically to Bitcoin.
5. Proof bundles include inclusion and non-inclusion proofs across relevant
   epochs.
6. Fraud or conflict evidence causes indexers to reject a root or degrade it.

Why it might work:

- makes "no challenge" a proof obligation rather than a resolver assertion
- gives fresh verifiers compact evidence
- creates a common proof format across sponsor credits, transfers, and batches

Hardest unresolved point:

Bitcoin does not enforce the rollup. The enforcement is ONT client/indexer
replay. That can still be valid, but it should be described as a protocol
verification layer anchored to Bitcoin, not as Bitcoin consensus validating the
name rollup.

### 3. Sponsor-As-Surety Credits

This is the better framing for sponsor credits.

Shape:

1. Direct L1 bonded names or other BTC-time commitments create sponsor capacity.
2. Sponsor capacity is an underwritten publication right, not a registrar
   authority.
3. A sponsor spends capacity into the public title-notice system.
4. Already-finalized names survive sponsor exit.
5. Future sponsor capacity stops when the bond/capital source exits.
6. Credits expire or are capped to reduce concentration.

Why it might work:

- uses Bitcoin capital-time as the scarce anti-spam source
- can create a market for helping newcomers issue names
- avoids forcing every long-tail user to touch L1
- keeps conflicts on the L1 auction path

Hardest unresolved point:

Credit double-spend and ordering need a canonical state machine. Ark may help,
but a no-Ark reference design must still be possible to review.

### 4. Off-Chain Auctions With Winner-Only L1 Hardening

This solves a different but important part of the problem: bid churn.

Shape:

1. Auction rules stay the same.
2. Bids are submitted to public logs, Ark-like VTXO state, or another transcript
   source.
3. The transcript is replayable and source-tagged.
4. The winner settles to the normal L1 bond or a batched winner settlement.
5. Losing bids do not consume L1 blockspace.

Why it might work:

- avoids many L1 bid transactions for popular names
- preserves direct L1 ownership for the winner
- can be added later if v1 proof bundles abstract transcript source

Hardest unresolved point:

Bid credibility. Without collateral, fake winners can delay. With collateral,
we need either L1, Ark, or another Bitcoin-native commitment path.

### 5. Batch-Hardened Sponsored Names

This is an assurance upgrade path, not full per-name direct bonding.

Shape:

1. Sponsored names finalize through public title-notice.
2. Periodically, many finalized sponsored names are included in a Bitcoin
   anchored state commitment.
3. Owners receive inclusion proofs.
4. Clients display "batch-hardened" separately from direct L1 bonded.
5. A high-value owner can still upgrade to direct L1 hardening if the protocol
   supports that path.

Why it might work:

- gives long-tail users stronger proofs without per-name UTXOs
- makes later verification easier
- creates a practical archival boundary for resolvers

Hardest unresolved point:

It is not the same as direct L1 ownership. It proves the state was committed,
not that Bitcoin consensus enforces individual name ownership.

## Designs To Keep, But Not Center

### Root/Subname Hierarchy

Still useful for agents, organizations, and app identities. But it weakens the
flat namespace goal because `agent7@alice` is visibly subordinate to `alice`.
It should remain a scale path, not the answer to flat global names.

### Ark

Ark is still worth exploring for bid collateral, credit accounts, and batch
execution. It is not required for the core title-notice idea. Its main value is
cleaner Bitcoin-native off-chain state and collateral, especially for auctions
and credit non-reuse.

### RGB-Style Validation

RGB remains valuable as proof-bundle discipline: schemas, state transitions,
single-use seals, and consignments. It does not by itself solve public
discovery or data availability for a global namespace.

### Hashcash Or Proof-Of-Work Admission

Potentially useful for relay spam filtering. It should not become the scarce
allocation or ownership basis because the goal is Bitcoin-only scarcity.

## The Core New Insight

The most promising family is not "sponsor credits" as originally phrased.

The more general shape is:

> public title-notice for ordinary claims, Bitcoin scarcity for challenges and
> abuse resistance, Bitcoin auction fallback for disputed claims, and portable
> proof bundles for finalized claims.

Sponsor credits are one possible admission-control and anti-spam mechanism
inside that broader title-notice system. They are not the whole design.

This matters because it opens more design space:

- sponsorless long-tail claims with requester fees plus long notice windows
- sponsor-underwritten claims using BTC-time
- Ark-backed credit accounts
- relay-fee markets for publication
- batch-hardened checkpoints
- direct L1 hardening for users who need maximum assurance

The essential invariant is not "a sponsor blessed this name." It is:

> this name was publicly noticed, available, challengeable, replayed, and not
> validly challenged before finality.

The economic invariant is:

> cheap ordinary issuance should not imply cheap mass capture or cheap
> disruption; actions that consume scarce namespace attention should consume
> scarce bitcoin capital, BTC-time, or bitcoin-denominated fees.

## Pre-Launch Implications For v1

v1 does not need to implement this scale path, but it should avoid blocking it.

v1 should preserve:

- acquisition-source-tagged proof bundles
- owner keys as stable authority
- name identity independent of acquisition path
- clear assurance tiers
- auction state machine independent of transcript source
- direct L1 fallback
- resolver export/import and deterministic replay

v1 should avoid saying:

- every valid name must forever originate from a direct L1 auction
- resolver answers are enough without portable proof bundles
- all names have identical assurance
- future scaling requires a specific L2

## Experiments To Run Next

### Experiment 1: Public Notice Log Replay

Build a fixture and verifier for:

- sponsored or optimistic claim
- append receipt
- batch checkpoint
- challenge window start/end
- valid challenge
- invalid challenge
- no-challenge finality
- relay fork evidence

Success condition:

> A fresh verifier can replay the same result from exported log data without
> trusting the resolver that exported it.

### Experiment 2: Sparse Challenge Non-Inclusion Proof

Prototype a sparse Merkle challenge index:

- sorted by name hash and epoch
- includes all valid challenges
- supports compact proof that no valid challenge for `alice` appeared in epoch
  range `N..M`
- fails closed when batch data is unavailable

Success condition:

> A proof bundle can explain why a sponsored claim was not challenged without
> downloading the entire network history.

### Experiment 3: Data Availability Pack

Define a content-addressed batch archive:

- claim leaves
- challenge leaves
- credit-state leaves
- transfer leaves
- Merkle proofs
- relay receipts
- checkpoint roots

Success condition:

> A new resolver can bootstrap from batch archives and reconstruct sponsored
> state without the original project resolver.

### Experiment 4: Sponsor Credit Ledger Without Ark

Define the simplest deterministic credit ledger:

- BTC-time eligibility source
- credit accrual
- credit spend
- duplicate spend handling
- overspend handling
- sponsor exit
- credit expiration

Success condition:

> Credits can be replayed from public data with no resolver discretion.

### Experiment 5: Ark Credit/Bid Feasibility

Run a parallel Ark-shaped proof experiment:

- one sponsor VTXO/account supports many claim spends
- one auction transcript supports many collateralized bids
- proof bundle distinguishes preconfirmed, settled, and L1-hardened state

Success condition:

> Ark materially improves credit non-reuse or bid collateral compared with the
> no-Ark public-log design, without making an operator a registrar.

### Experiment 6: Contest And Grief Cost Model

Extend simulations around:

- 0.1%, 1%, 10% contest rates
- attacker contests every long-tail sponsored claim
- sponsor concentration
- relay omission
- missing batch data
- challenge-fee and bond-floor sensitivity

Success condition:

> We can state what scale remains possible under adversarial contest rates and
> how much BTC/blockspace an attacker must commit to force fallback to L1.

### Experiment 7: Scarcity Gate Design

Compare anti-abuse gates for optimistic claims:

- requester-paid bitcoin relay fee
- sponsor BTC-time credit spend
- minimum BTC-backed challenge bond
- escalating challenge bond during high-load periods
- longer notice windows for low-cost claims
- direct L1 hardening as an upgrade path

Success condition:

> The ordinary user can get a long-tail name cheaply, but mass squatting and
> mass challenge griefing require enough bitcoin capital, BTC-time, or fees to
> become economically painful.

## Current Leaning After This Pass

The best v1 remains:

> direct L1 bonded flat names plus owner-signed records.

The best scaling candidate is now better phrased as:

> public title-notice with Bitcoin-scarcity gates and Bitcoin challenge
> fallback.

Sponsor credits, Ark, RGB-style validation, resolver mirrors, and batch
hardening are components that may strengthen that design. They should not be
treated as the design itself.

The next design target should be one concrete public title-notice lifecycle and
proof bundle. If that cannot survive adversarial review, the scaling story is
weaker than we want. If it does survive, ONT has a credible path from v1 L1
sovereignty to global flat-name scale without adding a token or trusted
registrar.
