# Open Name Tags / ONT Decision Log

This file records protocol decisions and current working assumptions that have
become explicit during design work on Open Name Tags / ONT. It is intended to
keep the evolving draft grounded in written choices rather than conversational
context.

Related notes:

- [../ONT.md](../ONT.md) — the single source of truth.
- [../design/ONT_ACQUISITION_STATE_MACHINE.md](../design/ONT_ACQUISITION_STATE_MACHINE.md) —
  the current acquisition reference: claim first, accumulator finality if
  uncontested, L1 bonded auction only if contested.
- [../launch/ONT_LAUNCH_V1_BRIEF.md](../launch/ONT_LAUNCH_V1_BRIEF.md)
- [../launch/CONTESTED_AUCTION_REFERENCE.md](../launch/CONTESTED_AUCTION_REFERENCE.md) —
  contested-auction reference.
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](../research/archive/BITCOIN_REVIEW_CLOSURE_MATRIX.md)

## How To Read This File

This file now uses three buckets:

- **Resolved decisions**
  - stable enough that the project should speak and build as though they are
    decided unless new evidence forces a revisit
- **Current working assumptions**
  - current lead direction for implementation, website framing, and external
    review, but not yet an immutable launch freeze
- **Open questions**
  - still intentionally unresolved and not ready to be described as closed
    decisions

## Resolved Decisions

1. Ownership model

ONT is pubkey-controlled. A name is owned by a specific public key, and valid acquisition, update, and transfer operations must be authorized by signatures from the corresponding private key.

Implications:
- No xpub is required.
- A CLI may derive the ONT owner key from a seed phrase using a standard derivation path, or import a standalone key.
- ONT ownership is registry-style ownership, not inscription-style bearer ownership.

2. Canonical state model

Bitcoin is the canonical ownership and state log for ONT. External resolution data is optional and protocol-agnostic.

Implications:
- ONT is not Nostr-dependent.
- Nostr is an optional integration and early use-case, not a required foundation.
- A name may point to Nostr, Bitcoin, HTTPS, DID, or nothing at all.

3. Name state

Each name has:
- an owner public key
- an optional value

The value may be null.

Implications:
- Initial acquisition does not need to set a value.
- Value-setting can be a separate action.
- Names can exist as scarce property before they point anywhere.

4. Transfer semantics

Transfers are signed on-chain transfer records.

Rules:
- Pre-maturity transfers must also move the bonded UTXO.
- Post-maturity transfers do not require bond continuity.
- Transfer does not reset the original maturity clock.

5. Bond continuity

Each immature name has exactly one live dedicated bond outpoint.

Rules:
- Every pre-maturity transfer must spend the current bond outpoint.
- The same transaction must create a successor bond output for that name.
- The successor bond output must contain at least the required bond amount.
- The original acquisition height remains the maturity anchor.
- If bond continuity breaks before maturity, the name immediately loses active ownership.
- A released name can be opened again through a new auction generation anchored to the release block.
- No two live names or pending acquisitions may reference the same bond outpoint at the same time.

Notes:
- The successor bond amount may be topped up with extra inputs.
- The protocol cares about successor bond continuity, not exact-unit continuity of the prior bond amount.
- The successor bond may be funded by the seller, the recipient, or any combination of transaction inputs, as long as the old bond outpoint is spent and the required new bond output is created in the same transaction.
- Fees should be funded separately so the bonded amount is not accidentally reduced below threshold.

6. Initial auction pairing rule

The winning bid transaction must establish both:
- the name owner key carried in the auction bid payload
- the dedicated bond UTXO that backs the name

7. One-path acquisition

Initial launch allocation uses one public claim path, not separate ordinary,
premium, reserved, or founder lanes.

Rules:
- A claim binds a valid name to an owner key.
- A claim is provisional during a public notice window.
- If no competing DA-valid claim for the same name lands in the window, the name
  finalizes through the accumulator.
- If a competing DA-valid claim lands in the window, the name is contested and
  escalates to the L1 bonded auction path.

Purpose:
- Keep ordinary long-tail names cheap and batched.
- Let markets price names that actually receive competing demand.
- Avoid maintaining a subjective reserved-name list.

8. No reserved list or launch wave

All valid names use the same objective claim/contest rules. There is no semantic
reserved-name list, short-name wave, pre-launch reservation system, founder
allocation, or identity-based quota.

Short/scarce names may still have objective parameter differences, such as a
higher claim reserve or auction bond floor, but those differences must be
mechanical and public rather than editorial.

9. Maturity anchor

Maturity applies to names that enter the bonded auction path. It starts once the
winning auction state has settled into ownership, since that is when the active
owner bond becomes protocol-relevant.

10. Economic parameter split

The claim gate and the auction bond are distinct:
- The claim gate is a sunk fixed bitcoin fee paid to miners for a claim attempt.
- The auction bond is returnable bitcoin capital used when a name is contested or
  otherwise requires bonded settlement.

Keeping these separate avoids letting the older all-auction bond table define
ordinary long-tail claims.

11. Auction bond curve status

Bond amounts should be objective and mechanical. The prototype code still
contains a length-halving bond curve with a floor, but launch should explicitly
decide where that curve applies before treating it as frozen.

Current lean:
- use the ₿1,000 claim gate as the ordinary long-tail floor
- use bonded auctions for contested names
- confine any length-based bond floor to structurally scarce names or the
  contested-auction opening requirements

12. Maturity duration binding

Every auction-acquired name receives a deterministic maturity duration from the launch rules in
effect when its commit confirms.

Rules:
- The maturity clock starts at the commit block height.
- The maturity duration for an acquired name must be computable from pre-announced
  objective protocol parameters.
- The duration cannot be adjusted discretionarily after the acquisition is committed.

Implications:
- A bidder should know the maturity burden before committing capital.
- An indexer should not need subjective context to decide when a name is mature.
- The exact launch duration is a launch-parameter choice, not a reason to keep
  the maturity rule itself vague.

13. Prototype maturity schedule status

The earlier epoch-halving schedule is a prototype capability and historical
design path, not the current lead launch recommendation.

Current status:
- The codebase still supports test overrides and maturity-schedule experiments.
- The current lead launch spec favors a simpler fixed bonded-name maturity,
  currently around one year, rather than a visible epoch-halving schedule.
- Any final maturity parameters must be frozen before launch.

This keeps the implementation flexible during prototype work without implying
that every prototype schedule is a launch commitment.

14. Immutability

Core economic and validity parameters are intended to be immutable once launched.

This includes:
- bond curve
- bond floor
- maturity schedule
- epoch length
- auction timing rules
- validity rules

Any incompatible change after launch should be treated as a new protocol version or competing namespace, not a normal upgrade.

Pre-launch note:
- During prototype and testing phases, the implementation may still change wire formats, payload layouts, and other unresolved constants.
- Those experiments should be treated as provisional and should not imply a final launch commitment.
- Mainnet launch should only happen after the protocol constants are intentionally frozen.

Testing recommendation:
- use regtest, signet, testnet, or a clearly labeled experimental mainnet namespace/version for iteration
- avoid creating ambiguity that experimental acquisitions are part of the final canonical namespace

15. Name syntax

Names are restricted to:

`[a-z0-9]{1,32}`

Rules:
- Input is case-insensitive.
- Canonical form is lowercase.
- Allowed alphabet size is 36.
- No punctuation, separators, whitespace, or Unicode in v1.

16. Ownership versus destination placement

Bitcoin carries ownership events only. Optional destination records are off-chain by default.

Implications:
- Bitcoin alone should be sufficient for independent, trust-minimized ownership verification.
- Destination updates should not consume blockspace in v1.
- Loss of off-chain destination data does not affect on-chain ownership validity.

17. Off-chain destination authentication

Off-chain destinations are authenticated by signatures from the current owner key.

Recommended record fields:
- name
- owner public key
- sequence number
- ownership interval reference
- previous destination-record hash
- destination type
- destination payload
- owner-issued timestamp
- signature

Rules:
- Destination records form a signed append-only chain scoped to the current
  ownership interval.
- The first record in an ownership interval should have sequence `1` and no
  previous record hash.
- Later records should increment sequence exactly by one and point to the
  canonical hash of the previous destination-record statement.
- Owner-issued timestamps are metadata, not the canonical ordering rule.
- On ownership transfer, destination authority moves to the new owner key.
- Old owner-signed destination records become stale once ownership changes on-chain.

Rationale:
- Sequence numbers plus predecessor hashes let clients prove update order, not
  just inspect the latest signed value.
- Binding the destination chain to an ownership interval prevents a stale record from
  an earlier ownership period from becoming current again if the same key later
  reacquires the same name.
- This mirrors the useful part of Keybase-style signature chains without
  requiring mutable destination updates to be posted to Bitcoin.

18. Destination behavior on transfer

On transfer, the current off-chain destination record is cleared by default.

Rules:
- Ownership transfer does not automatically preserve the prior owner's value record.
- A transfer format may support an explicit preserve signal, but preserve is not the default behavior.
- After transfer, the new owner may publish a fresh value record under their own key and sequence space.

19. Bitcoin footprint minimization

The protocol should minimize on-chain footprint while preserving independent, trust-minimized ownership verification.

Implications:
- Avoid storing routine mutable mappings on Bitcoin.
- Avoid designs that require inscriptions or large witness-carried artifacts for normal operation.
- Prefer small ownership events over full on-chain application state.
- Make blockspace and UTXO trade-offs explicit in the draft for Bitcoin-focused reviewers.

20. Resolver strategy

ONT core remains transport-agnostic for off-chain values, but the project should ship a reference implementation of a minimal read-only ONT resolver/indexer profile.

Implications:
- The reference resolver is a convenience interface, not the source of ownership truth.
- Ownership truth remains Bitcoin plus the ONT protocol rules.
- Clients may use a hosted resolver, self-host a resolver, or implement compatible alternatives.
- The project should prefer a reference implementation over remaining only a protocol hypothesis.
- Resolver endpoint discovery should begin off-chain through defaults, configuration, DNS seeds, manual URLs, or peer gossip rather than as a required Bitcoin event.
- Bitcoin-derived state should be used to score resolver correctness, completeness, and tip freshness.
- On-chain resolver announcements may be considered later for optional identity anchoring, but not as v1 trust or endpoint-discovery infrastructure.

21. Minimal resolver API surface

The first recommended ONT-native resolver profile should be minimal and read-only.

Recommended capabilities:
- resolve a normalized name to current ownership state
- return the latest valid off-chain destination record for a normalized name, if any
- return destination-record history for the current ownership interval
- return provenance for an ONT event or name state so clients can inspect the underlying chain-derived basis

Recommended endpoint shape for the reference profile:
- `GET /name/{normalized_name}`
- `GET /name/{normalized_name}/value`
- `GET /name/{normalized_name}/value/history`
- `GET /tx/{txid}`

Design constraints:
- Keep the profile small enough that alternative implementations are easy.
- Prefer explicit provenance fields over opaque answers.
- Avoid standardizing write APIs in the protocol profile.

22. Off-chain destination encoding envelope

Off-chain destinations use a compact typed binary envelope.

Envelope shape:
- `value_type`: 1 byte
- `payload_length`: 2 bytes
- `payload`: variable-length bytes

This keeps destination records compact while allowing a small standardized type set and future extension.

23. Initial standardized destination types

The initial standardized destination types for v1 are:
- `0x00`: null
- `0x01`: bitcoin payment target
- `0x02`: HTTPS target
- `0xff`: raw or app-defined

Notes:
- v1 does not standardize a Nostr-specific value type.
- This is intended to avoid unnecessary social or technical coupling between ONT and Nostr.
- Future standardized value types, if any, should be introduced conservatively and explicitly.

24. Claim gate and bond amount parameters

The current design has two economic mechanisms:

- `claim_gate_sats = 1,000` for ordinary claim attempts, paid to Bitcoin miners.
- returnable auction bonds for contested or objectively scarce names.

The prototype code still carries earlier bond-curve parameters:

- `base_btc = 1 BTC`
- `floor_btc = 0.0005 BTC`

Those values should be treated as auction/bond prototype parameters, not as the
ordinary long-tail claim floor. Before launch, the code should make this split
explicit so reviewers do not infer that every 5+ character uncontested claim
requires a ₿50,000 bond.

25. Same-block auction tie-break rule

If two competing auction bids for the same name are confirmed in the same block
and are otherwise tied under the auction rules, the bid appearing earlier in the
block's transaction order wins.

Rationale:
- deterministic
- easy to verify
- simpler and more legible than hash-based tie-break schemes
- avoids introducing a more complex tie-break rule that still would not eliminate miner influence

26. V1 on-chain event set

The v1 on-chain event set is intentionally minimal.

Standardized ownership events:
- `AUCTION_BID`
- `TRANSFER`

Scaling-rail messages:
- `ROOT_ANCHOR`
- `AVAILABILITY_MARKER`

Implications:
- v1 does not standardize on-chain `SET_VALUE`
- v1 does not standardize on-chain `CLEAR_VALUE`
- routine mutable value changes remain off-chain
- root anchors and availability markers support batched acquisition; they do not
  authorize transfers or mutable value updates

27. Pre-maturity transfer linkage

For immature names, a transfer must identify the successor bond output created by the transfer transaction so the indexer can verify bond continuity without ambiguity.

Recommended approach:
- the signed transfer payload includes the successor bond output index (`vout`)

Implications:
- the transfer transaction itself creates the new live bond output
- the indexer verifies that the referenced output exists and meets the required bond threshold
- mature transfers do not require successor bond output linkage

28. Wire-format direction for v1

The v1 wire format should optimize for compact auction and ownership events:
- `AUCTION_BID` should fit in a single conservative OP_RETURN payload
- `TRANSFER` may use a slightly richer payload because it must carry signature material

The protocol direction is to avoid larger on-chain payloads where smaller
auction and ownership events are sufficient.

29. Prototype interaction boundary

The project should support a prototype website, but the boundary between interface and signer should remain explicit.

Recommended boundary:
- website handles browsing, availability search, validation, provenance display, and transaction assembly
- browser-local website code or CLI tooling may assemble unsigned transaction artifacts
- wallet, CLI, or explicit signer component handles private-key signing and final broadcast

Implementation principle:
- website-assisted actions should have CLI-capable equivalents
- the website should not be the only way to perform protocol actions

30. Atomic transfer-for-payment model

ONT should distinguish between:
- ownership validity
- commercial settlement

The ONT indexer validates ownership transition rules and, for immature names, bond continuity. It should not need to interpret sale price terms or payment semantics to determine who owns a name.

When a transfer is a sale rather than a gift, the recommended protocol and wallet flow is atomic delivery-versus-payment in a single Bitcoin transaction.

Rules:
- Pre-maturity sale transfers should occur in one transaction that spends the current bond outpoint, pays the seller, creates the successor bond output for the buyer, and carries the ONT transfer event.
- Post-maturity sale transfers should not rely on a free-floating transfer authorization signature by itself.
- For post-maturity sales, seller authorization must be bound to the exact Bitcoin transaction that pays the seller and transfers the name.
- The v1 reference implementation should achieve that binding with a cooperative PSBT flow and at least one seller-controlled input in the mature-sale transaction.
- Mature gift transfers may remain simpler signed ownership transfers when no atomic payment is required.
- The sale price is not an ONT consensus field. It is verifiable from the Bitcoin transaction outputs when the parties use the cooperative sale PSBT flow.

Rationale:
- prevents replay or underpayment of mature-name sale authorizations
- preserves clear indexer responsibilities
- uses ordinary Bitcoin transaction atomicity rather than adding commerce parsing to ONT validity rules

31. Sale-intent listings are off-chain

Owners may want to advertise that a name is for sale and at what price. That should be documented as an optional off-chain layer, not part of canonical ONT ownership state.

Rules:
- sale-intent or ask listings should not be on-chain
- sale-intent or ask listings should not affect indexer ownership truth
- marketplaces, third-party sites, or future optional resolver extensions may ingest and display signed sale-intent records
- clients may verify those records against the current on-chain owner pubkey
- marketplaces may authenticate listing creators with an off-chain challenge signed by the current owner key
- that ownership proof does not by itself prove the final ability to complete an immature transfer, which also depends on participating in the bond-moving sale transaction

Rationale:
- asks are mutable market metadata, not ownership state
- they may change frequently
- they do not belong on Bitcoin
- they should not complicate canonical indexer behavior

## Current Working Assumptions

These are not yet immutable launch commitments, but they are concrete enough
that implementation, documentation, and reviewer-facing materials should treat
them as the current defaults unless they are later revised explicitly.

32. Retired two-lane and auction-only baselines

The old ordinary/reserved two-lane model is retired. The later auction-for-every-
name baseline is also retired as the ordinary entry path, and survives only as
the contested-name escalation path.

Current footprint work should be evaluated against:

- batched claim anchors
- availability markers
- contested auction bids
- transfers
- value-record publication and retrieval

34. Launch architecture lead direction

The current lead launch architecture is the **one-path claim model**.

Current shape:
- every valid name enters through public claim
- the claim is provisional during the notice window
- an uncontested claim finalizes through the accumulator
- a contested claim escalates to L1 bonded auction
- there is no semantic reserved-name list
- there is no pre-launch reservation system
- there is no short-name wave or founder allocation

This is strong enough to build supporting materials around, but it should still
be treated as a working launch assumption rather than an immutable protocol
freeze.

35. Contested auction family

The current auction family applies when a name is contested:

- open ascending
- on-chain bonded bids
- soft close
- meaningful minimum increments
- stronger minimum increments for bids that would extend the auction
- no hard extension cap in the current design; a cap would create a known final
  edge and reintroduce sniping pressure
- the winner's bond becomes the live name bond

Current default increment parameters:
- normal bids must clear `max(0.00001 BTC, 5%)`
- soft-close bids must clear `max(0.00001 BTC, 10%)`

Current rebid shape:
- a same-bidder rebid can replace that bidder's prior bid only if the new
  transaction spends the prior bid-bond output
- the new transaction creates one new bid bond for the full new bid amount
- a bidder may add a fresh wallet input for the difference plus fees
- the prior bond is not separately released during the rebid; it is consumed by
  the replacement transaction

Implications:
- the project can explain one coherent claim rule for all eligible names
- auctions price actual contention rather than precomputed salience
- old reserved-list generation work is no longer launch-critical
- close-griefing is handled by forcing late extensions to be real higher bonded
  bids with stronger increments, not by adding a hard final cap
- placeholder floors, windows, and lock durations should not be presented as
  frozen constants just because the auction family itself is now the working
  assumption

36. Prototype demo network posture

The only supported live demo chain is **private signet**. Public signet is
retired from the active demo and review path.

Implications:
- hosted demo guidance should assume private signet plus Sparrow support
- review-refresh and reseed tooling should treat private signet and regtest as
  the maintained environments
- public signet should only appear in historical notes or explicit cleanup
  context, not as an active user path

37. Bond opens the auction (escalation trigger = bond, not bare claim) — 2026-06-04

When a contested name's auction window expires with **zero qualifying bonds**, an
earlier draft resolved it by lowest `(anchor height, tx-index, claim txid)`
ordering. **That is rejected** — it let a block-winning miner self-claim and *take*
a low-value contested name for ~₿1,000 paid to itself, converting ordering power
into acquisition (R16).

**Decision: a bond — not a bare claim — opens the auction.** The escalation trigger
moves from "≥2 claims" to "a qualifying bond." Outcomes:

- One cheap claim, no bond by the deadline → finalizes (the long tail, unchanged).
- A qualifying bond — posted against an existing claim, or **bond-first** with no
  prior claim → opens the L1 auction; **largest bond wins**. Bond-first is the
  natural path for a known-premium name (`bitcoin`): no cheap-claim collision is
  needed to start the auction.
- Two+ cheap claims, no bond → the name is **nullified** (no owner) and reopens for
  claiming. A bare collision can deny, never award.

Invariant: a name is acquired only by (a) an uncontested cheap claim that
finalizes, or (b) the winning bond in an auction. A bare claim can finalize or be
nullified — never *take* a contested name.

Why: this resolves R16 at the root. Front-running a cheap claim buys nothing (worst
case it nullifies the name — denial, no payoff); acquiring a contested name requires
a returnable bond, identical cost for a miner and for anyone. It also unifies the
short-name design — the ≤4-char opening bonds are the *mandatory* bond-first case of
the same mechanism. Deadline-derived in the engine (a verifier checks, at
`currentHeight ≥ anchorHeight + W_notice`, whether a qualifying bond landed); no
ordering-based award path, so no randomness beacon needed.

Tradeoffs: it's a protocol change — the escalation trigger moves from claim to bond,
which touches the state machine's contest definition and adds a bond-first /
auction-open entry. The ₿50,000 escalation floor becomes load-bearing (the cost to
open/contest an auction) and graduates from placeholder to a launch decision. Denial
is still possible — a spite-griefer can collide a cheap claim to nullify a targeted
name (₿1,000) — but with no payoff and defendable by the target bonding;
unprofitable, accepted (R16 residual).

Documentation impact:
- `design/ONT_ACQUISITION_STATE_MACHINE.md` — Public Notice, Contested Auction, and
  the "Bond opens the auction; a bare collision can only nullify" section.
- `design/ONT_MEV_ORDERING_ANALYSIS.md` — D1, D3, §2 conclusion, §3 tie-break row
  revised; ordering buys nothing.
- `ONT_DESIGN_BRIEF.md` §3 acquisition model + §6 "Bond-first / the escalation trigger".
- `design/ONT_RISK_REGISTER.md` R16 → Resolved by design.

38. PTLCs are not a near-term dependency — v1 publisher payment is pay-first with reputable publishers — 2026-06-05

Earlier drafts framed the trust-minimized publisher swap (bind the off-chain
Lightning payment to on-chain inclusion) around **PTLCs / adaptor-conditional
payments** as the clean primitive, and carried an open question about designing
*for* vs. *around* them.

**Decision: drop PTLCs as a near-term design tradeoff.** Per feedback from Max
(Lightning), 2026-06-05: **don't add technical complexity for trust-minimization in
this case** — the amount at risk per claim is tiny (~₿1,000 / ~$1), so an
adaptor-bound construction (PTLCs and similar) isn't worth the complexity for the
small risk it removes. ONT v1 uses a **pay-first flow with reputable publishers**:
the operator includes a claim only after payment; a non-payer is simply left out,
so the publisher's exposure is bounded structurally. The residual trust (a
paid-but-excluded claimant relies on the operator's reputation + the L1 fallback)
is accepted for v1.

Atomically binding payment to inclusion remains a **longer-term research item** with
no v1 dependency on any specific primitive (PTLC, ECDSA-adaptor + hash-locked HTLC,
or otherwise). It is not designed around, not blocking, and reopens only if
revisited later.

Why: the trust is already bounded — a publisher never controls a *name* (ownership
is the owner key + Bitcoin), the worst it can do is refuse or fail a batch, and a
user can always claim directly on L1. With ~$1 at risk per claim, elaborate
trust-minimization isn't worth its complexity. Pay-first is deployable today with
vanilla Lightning; betting the issuance rail on a more involved construction would
add complexity (and external dependencies) for a small benefit.

Documentation impact:
- `research/OPEN_QUESTIONS_FOR_EXPERTS.md` — Lightning/PTLC section → Resolved;
  adaptor requirement removed from the LN-node substrate list.
- `ONT_DESIGN_BRIEF.md` §5 publisher payment + `ONT_ONE_PAGER.md` (md/html) — reframed
  to pay-first; PTLC mechanism dropped.
- `research/ONT_PUBLISHER_PROTOCOL_SPEC.md`, `design/ONT_ISSUANCE_FEE_MECHANICS.md`,
  `launch/ONT_IMPLEMENTATION_AND_VALIDATION.md` — PTLC references demoted to
  longer-term / non-v1.

39. DA transport: content-addressed, publisher-served v1 (T2) — raised as a core feedback area — 2026-06-08

The cheap rail's data-availability story splits into *witnessing* (is the data
attested available by a Bitcoin-timed deadline?) and *transport* (how the bytes
move from a publisher to verifying nodes). Witnessing was already settled in
design (the on-chain availability marker). The transport decision: **T2 —
content-addressed bytes** (keyed by the anchored digest), served by the publisher
over plain HTTP in v1 and mirrorable by anyone. Because every node re-verifies
the bytes against the on-chain commitment, transport is **not consensus-critical**
and the backend stays swappable (publisher HTTP → mirrors → gossip/DA-sampling
later). Implemented 2026-06-09: the resolver fetches `/da/{root}` from the
publisher and re-verifies every leaf before merging; bundles survive publisher
restarts (rebuilt on snapshot replay).

Deliberately raised as a **core area for external feedback** rather than decided
quietly (one-pager feedback item 1; `design/ONT_DATA_AVAILABILITY_AGREEMENT.md`
§8b). Open with it: whether the availability *marker* should be **folded into the
anchor itself** (the anchor already commits the digest), removing one on-chain
message type — and the fact that the fail-closed deadline (W/C/K) enforcement is
still design+simulation only, to be implemented before the adversarial DA story
is operational.

40. Recovery is opt-in; its veto should be delegable to a non-custodial watcher — 2026-06-08

Recovery stays **optional**: a name with no recovery descriptor is one key,
cold-storage style, with nothing to monitor. If armed, the challenge-window veto
must not depend on the owner being online (a name is set-and-forget) — the target
shape is a **watchtower holding a name-scoped, abort-only credential** (can cancel
a malicious recovery, can never move the name). The credential construction is an
open design problem (a literal pre-signed veto can't reference a recovery UTXO
whose outpoint doesn't exist until invoke time) and is raised for external
feedback (one-pager item 8; `design/ONT_LONG_TAIL_RECOVERY.md` §5.6).

41. One user secret: the 12-word phrase, on every surface — 2026-06-09

Before this, the surfaces had three key universes: the claim site (12-word
BIP-39 phrase), the mobile app (raw 32-byte hex seed, no phrase input), and the
web value tool (a random raw private key recoverable from nothing). Decision:
**the user's one secret is a 12-word phrase everywhere.** Convention: master seed
= first 32 bytes of the BIP-39 seed; owner key per name at `m/696969'/0'/i'`;
funding at `m/84'/1'/0'/0/0`. The phrase restores the same wallet on the claim
site, the web tools, and the app; raw keys/seeds remain accepted as legacy input.
Locked by shared conformance vectors
(`packages/protocol/testdata/conformance-vectors.json`) that the engine, web,
claim-site, and mobile implementations all test against.

## Fairness Principles To Carry Into The Launch Rewrite

The rewritten launch draft should explicitly state:
- No founder allocation
- No discounted insider allocations
- No whitelist
- No identity-based quotas
- Every valid name enters the same public claim path
- Every contested auction winner requires dedicated bonded BTC while immature
- Bond and maturity rules are fixed at launch
- Auction rules and release conditions must be objective enough that outcomes
  are auditable from chain data plus the pre-announced launch artifacts

The protocol should aim for objective fairness, not semantic fairness.

That means:
- Names with the same objective policy inputs are treated identically by the
  protocol.
- Scarcity and anti-hoarding pressure come from the miner-fee claim gate,
  public notice, auction-discovered bonded BTC, and time, not from subjective
  pricing rules.
- If opening floors differ by length, that difference comes from a public
  objective curve rather than discretionary per-user judgment.

## Open Questions

1. Value payload definitions

Need to define the exact payload format for:
- `0x01` bitcoin payment target
- `0x02` HTTPS target
- `0xff` raw or app-defined usage expectations, if any

For `0x01`, reviewer feedback should explicitly consider compatibility and trade-offs around existing Bitcoin payment-target standards and proposals such as:
- `BIP321` URI scheme guidance
- `BIP353` DNS payment instructions

2. Destination transport and discovery

Need to define:
- whether the core protocol mandates any transport for off-chain destination records
- whether there is a recommended default transport profile
- how clients discover and fetch current destination records

3. ONT-native resolver profile

Need to define:
- the exact bootstrap format for default/configured resolver endpoints
- whether a simple `GET /peers` style gossip endpoint is worth standardizing
- whether optional resolver identity keys need a signed metadata profile
- how clients should present resolver freshness and signed-record conflicts

4. Reviewer-facing modeling and risk disclosure

The rewritten draft should explicitly document:
- preliminary blockspace estimates
- preliminary UTXO-set estimates
- known trade-offs in the current architecture
- open questions where external reviewers should challenge the design

Reviewer-facing trade-offs that should be stated plainly include:
- the current prototype `TRANSFER` payload exceeds older conservative `OP_RETURN` relay limits; modern Bitcoin Core defaults are more permissive, but broader network relay compatibility still depends on node policy
- mature names currently remain valid without ongoing bond continuity
- v1 resolver usage may still concentrate destination-record availability around a small number of hosted resolvers
- stale or failed auction bids may expose demand for a specific name before a
  bidder wins it
- the owner key is distinct from the funding wallet key, and v1 does not include a protocol recovery path if that owner key is lost

5. Concrete wire format

Need to specify exact OP_RETURN payload formats for:
- AUCTION_BID
- TRANSFER

6. Canonical indexing and tie-breaking rules

Need to define:
- reorg handling
- duplicate bid handling
- invalidation behavior for malformed sequences

7. Wallet and CLI safety rules

Need to define UX and implementation safeguards to prevent users from accidentally breaking bond continuity before maturity.

Need to define clearer operator and wallet guidance around stale or failed bids:
- a failed bid package should have an obvious recovery path for funds
- the docs should explain when a bid exposes demand for a name before the bidder wins it
- pre-launch review should revisit auction windows, soft-close extensions, and stale-state behavior
