# Open Name Tags / ONT Decision Log

This file records protocol decisions and current working assumptions that have
become explicit during design work on Open Name Tags / ONT. It is intended to
keep the evolving draft grounded in written choices rather than conversational
context.

Related notes:

- [../ONT.md](../ONT.md) — the single source of truth.
- [../design/ONT_ACQUISITION_STATE_MACHINE.md](../spec/ONT_ACQUISITION_STATE_MACHINE.md) —
  the current acquisition reference: claim first, accumulator finality if
  uncontested, L1 bonded auction only if contested.
- [../launch/ONT_LAUNCH_V1_BRIEF.md](../research/archive/ONT_LAUNCH_V1_BRIEF.md)
- [../launch/CONTESTED_AUCTION_REFERENCE.md](../spec/CONTESTED_AUCTION_REFERENCE.md) —
  contested-auction reference.
- [BITCOIN_REVIEW_CLOSURE_MATRIX.md](../research/archive/BITCOIN_REVIEW_CLOSURE_MATRIX.md)

## How To Read This File

This file is **one chronological decision log** plus an Open Questions section.
(Restructured 2026-06-10: the old Resolved-vs-Working-Assumptions buckets had
silently broken — entries were appended at the end regardless of bucket, so the
section an entry sat in stopped meaning anything. Per-entry labels replace them.)

Conventions:

- Entries are numbered in the order they were decided. **Numbers are never
  reused or renumbered** — too many docs and messages reference them.
- An entry is a **resolved decision** unless a `Status:` line at its top says
  otherwise. `Status: working assumption` marks a current lead direction that
  is not yet a launch commitment; `Status: amended by #N` means a later
  decision changed part of it (the entry text is preserved as written — read
  the amending entry for what changed).
- Open Questions at the bottom carry an `[OPEN]`, `[PARTIALLY ANSWERED]`, or
  `[ANSWERED]` label; answered ones point at the decision or doc that answered
  them and are kept for the record, not deleted.

## Decision Log

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

*Status: amended by #37 — escalation now requires a qualifying **bond**; a bare
competing claim **nullifies** the name (no owner, reopens) rather than
escalating it to auction. The one-path principle itself is unchanged.*

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

*Status: resolved as leaned — the length-scaled curve is now clamped to the
structurally scarce ≤4-char set (mandatory bond-first); 5+ char names use the
gate + contention. Amounts remain pre-launch placeholders.*

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

*Status: amended by #47 — `AVAILABILITY_MARKER` (0x0d) is retired, never to
be reused; the anchor itself carries the availability deadline
(marker-fold). The rest of the entry stands as written.*

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

32. Retired two-lane and auction-only baselines

*Status: amended by #47 — the "availability markers" footprint line below is
historical; markers are retired (marker-fold), so footprint work evaluates
against batched claim anchors and contested auction bids only.*

The old ordinary/reserved two-lane model is retired. The later auction-for-every-
name baseline is also retired as the ordinary entry path, and survives only as
the contested-name escalation path.

Current footprint work should be evaluated against:

- batched claim anchors
- availability markers
- contested auction bids
- transfers
- value-record publication and retrieval

33. *(Unassigned — numbering slip. No decision was ever recorded under this
number; verified against the full git history, 2026-06-10. Kept so nobody
wonders what was deleted.)*

34. Launch architecture lead direction

*Status: working assumption — lead direction, not a launch freeze.*

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

*Status: working assumption — the auction form (open ascending vs sealed
second-price) is explicitly one of the design brief's open feedback questions.*

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

*Short name: **bond-opens** (named 2026-06-11 per the doc-canon naming rule).*

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

*Status: working assumption — explicitly flagged for external reviewer
feedback; the fail-closed deadline enforcement it pairs with is not yet live.
Amended by #47: the witnessing half referenced below is now the anchor itself
(marker-fold) — the separate on-chain availability marker is retired; the
transport call (T2) is unaffected.*

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

42. Auction settlement moves inside the frozen core (resolves A3) — 2026-06-09

*Short name: **settlement-into-core** (named 2026-06-11 per the doc-canon naming rule).*

Winner-becomes-owner currently lives in experimental indexer code;
`applyAuctionBid` in the frozen `@ont/consensus` files only validates and
records bids. Decision: **move auction settlement into the frozen boundary**,
so the audited trust surface determines all ownership transitions — making the
"three frozen files determine ownership" claim true without scoping language.

Conditions and implications:
- The move is gated on confidence: settlement logic lands inside the boundary
  only once its correctness is demonstrated (tests + proof-bundle enforcement
  at the level the rest of the core meets), not on a calendar.
- Until the move lands, STATUS keeps the honest scoped statement; user-facing
  copy must not claim the frozen files decide auctions yet.
- The known set-completeness caveat (a bundle cannot yet prove the listed bid
  set is the complete L1 set without the light-client path) is unchanged by
  this decision and stays disclosed.

43. Defense/deterrence asymmetry is accepted; no sponsorship or proxy-bonding
tooling, in v1 or as a protocol direction — 2026-06-09

The contested-auction bond floor cannot simultaneously be cheap enough for a
poor claimant to defend with and expensive enough to deter a wealthy attacker.
Decision: **accept the asymmetry and document it honestly.** No
sponsorship/proxy-bonding tooling is built — not as v1 scope, and not as a
roadmap item. The idea fails on its own terms:

- **No incentive.** The protocol pays sponsors nothing — no yield, no fee.
  The bond being returnable makes a sponsor's cost low (carry plus fees); it
  does not make anyone *paid*. A defense layer that depends on unpaid
  goodwill is not a defense layer.
- **No escalation promise.** Against a *griefer* (collide-without-bond,
  Decision #37's residual denial attack), **one qualifying bond ends the
  attack**: the auction opens and the griefer must bid real, year-locked BTC
  or lose — which a griefer by definition won't. Against a *genuine wealthy
  bidder* who keeps escalating, nobody can promise to out-bid them, and the
  design does not presume sponsors keep bidding: an escalated auction going
  to the highest committed bidder is the mechanism working as intended, at an
  auction-discovered price with capital locked to maturity.
- **It's a loan wearing protocol clothes.** If a sponsor's bond wins, bond
  continuity locks *their* capital for ~a year backing a name owned by
  *someone else's* key. That is a credit relationship — trust, default, and
  repricing questions included. Anyone who needs defense capital can arrange
  a loan **outside the protocol**; the coordination complexity does not
  belong inside it.

Implications:
- Bonds are bearer BTC, so third-party defense remains *permissionless* —
  the protocol neither enables nor needs to know about it.
- This is distinct from the archived **sponsor-credits issuance** concept
  (optimistic public-batch issuance with sponsor signatures); that remains
  post-v1 research and is not revived by this decision.
- The bond floor (`₿50,000`) and related parameters remain placeholders and
  may be re-picked before launch-parameter freeze; this decision fixes the
  *posture* (asymmetry disclosed, no tooling), not the numbers. Parameters
  are the one remaining lever on the asymmetry.
- Reviewer-facing docs should state the asymmetry plainly: deterrence comes
  from auction dynamics (real, escalating, year-locked capital per name);
  the protocol's grief defense is that one bond ends denial; defense
  affordability beyond that is a disclosed limitation, not a promise.

44. The trust-surface boundary is mutable during development; it freezes at
public/mainnet launch — 2026-06-10

*Short name: **boundary-manifest** (named 2026-06-11 per the doc-canon naming rule).*

The "frozen core" had been read as frozen *now*: the trust-surface CI test
fails the build if the consensus allowlist changes, which pushed
ownership-deciding code (auction settlement, cheap-rail finalization) to be
built and hardened *outside* the audited boundary. Decision (DK, ratified
2026-06-10): **the boundary is mutable during development.** The trust-surface
allowlist may change — files in or out — only together with:

- a numbered DECISIONS.md entry recording what moved and why, and
- conformance coverage for any rule that moves (behavior-preservation against
  pinned fixtures when extracting live behavior).

The no-silent-growth CI ratchet stays: the allowlist in
`packages/consensus/src/trust-surface.test.ts` is the boundary **manifest**,
and unexplained drift still fails the build. What changes is the meaning of an
allowlist edit — from "forbidden" to "deliberate, recorded, and reviewed."

**Freezing becomes a launch gate**: the boundary freezes permanently before any
public/mainnet launch, as a checklist item alongside the launch-parameter
freeze. Until then, docs should say "audited boundary, to be frozen at launch";
"frozen like Bitcoin" remains the user-facing end-state promise, not a
description of the dev-time process.

Implications:
- Unblocks executing Decision #42 now: settlement moves inside the boundary
  and is hardened there — where the audit attention is — rather than being
  perfected outside first.
- Clears the path for the cheap-rail finalization rules and anchor-acceptance
  rules (aggregate gate-fee validation, DA deadline enforcement) to move
  inside as lean rule extractions, not wholesale file relocations.
- The "minimal audited core" claim stays honest at every moment: the manifest
  is the canonical list of what a newcomer must audit, whatever it currently
  contains.

45. doc-canon: the documentation canon, the jargon law, and stable decision
names — 2026-06-11

*Short name: **doc-canon**. Decisions are referenced by short stable name, not
bare number (see the naming rule below).*

Ratified by DK interactively, item by item, in ONT - dev on 2026-06-11 (six
items). This ratifies the **structure** of the documentation only — where
every file lives and lands. It approves no document's content; content changes
keep flowing through the normal writer/reviewer/merge protocol branch by
branch.

**The canon (item 1).** The reader-first canon gives each major reader a clear
entry point; every active doc ends up in, merged into, or archived behind one
of nine homes:

| Home | Reader |
| --- | --- |
| `ONT.md` | curious newcomer (the front door) |
| `ONT_ONE_PAGER.md` | reviewer outreach (parity-bound to ONT.md) |
| `DESIGN.md` | Bitcoin reviewer (design brief + sovereignty/trust story) |
| `GLOSSARY.md` | everyone (every term, defined once, nowhere else) |
| `RISKS.md` | reviewer (today's five risk/adversarial docs → one; R-numbers kept as anchors) |
| `OPEN_QUESTIONS.md` | reviewer (today's three open-question docs → one) |
| `spec/` | implementer (the normative layer) |
| `operate/` | operator (how to run it) |
| `core/STATUS.md` + `core/DECISIONS.md` | team (source of truth + memory) |

**Merge-ins (item 2).** Absorbed then retired: design brief + sovereignty map +
design-requirements/conformance → `DESIGN.md`; the two architecture docs → one
`ARCHITECTURE.md`; five risk docs → `RISKS.md`; three open-question docs →
`OPEN_QUESTIONS.md`; auction placeholders/window schedule/parameter packet →
STATUS.md's parameter table + `spec/AUCTION.md`; the rest of `launch/` → one
`LAUNCH.md` + `spec/`. The `launch/` directory ceases to exist.

**Moves (item 3).** Normative docs (acquisition state machine, data-availability
agreement, issuance fee mechanics, contested auction reference, publisher
protocol spec, recovery invoke spec) → `docs/spec/`. Operational docs
(self-hosting, testing guides, operators/, demo/) → `docs/operate/`. "Spec"
becomes a protected word: a doc in `spec/` claims normative status.

**Archives (item 4).** Principle: *an analysis whose conclusion became a
decision is history, not documentation.* Completed analyses, the simplification
audit, superseded designs, and replaced directory READMEs move to
`research/archive/` via `git mv` with a SUPERSEDED banner naming the successor.
Six genuinely open inputs stay live in `research/` (multi-publisher
convergence, owner-key recovery, post-quantum/signature agility,
decentralization & discovery, ONT-vs-Pubky/PKARR, the accumulator note).

**The jargon law (item 5).** One concept, one name, defined once in
`GLOSSARY.md`; plain words in prose with the term in parens at first use.
Renames: the four batch-path synonyms ("cheap rail" / "accumulator rail" /
"batch rail" / "batched commitment") → **the batched claim path**; "bare claim"
→ "a claim with no bond"; "DA" → written out as "data availability" in prose,
W/C/K notation only inside `spec/`; "frozen core" → "audited core (frozen at
launch)"; "rail" as metaphor → prefer "path". Entrenched terms keep their names
but each gets a GLOSSARY entry (nullified, bond-first, notice window, value
record, proof bundle, first-anchor-wins, owner key, claim gate, maturity,
settlement lock, mature owner, ₿ = 1 sat).

**Process (item 6).** Execution is R1 (this entry + README-as-TOC) → R2 (the
merges/moves) → R3 (the jargon pass + GLOSSARY, one-pager parity binding).
Nothing is ever deleted: retirement is `git mv` + SUPERSEDED banner, so
`git log --follow` keeps history. One branch per phase, writer/reviewer split,
DK merges. Relative-link integrity is a standing review gate for every phase.

**The naming rule (DK, item 6 ratification).** Decisions are discussed by a
short stable name, never a bare number — outsiders and reviewers can't follow
"decision 45". Convention: coin the name when the decision is created and
record it in the entry itself; write "name (#N)" on first reference, the bare
name after. Names are never reused or changed, same as numbers.

Implications:
- `docs/README.md` becomes the reader map for the canon (this phase).
- The simplification audit is complete — this decision is its output — and is
  archived in R2.
- The one-pager parity obligation survives recuration: R3's jargon pass binds
  it to ONT.md.

46. clean-build: blank-page reimplementation of all ONT software from the
canon docs — 2026-06-11

*Short name: **clean-build**.*

Ratified by DK interactively, item by item, in ONT - dev on 2026-06-11
(seven items, two amendments raised and ratified during the walk, six open
calls ruled). The full standing plan is
[SOFTWARE_CANON.md](./SOFTWARE_CANON.md); this entry records the decision.

**The premise.** The docs are a recurated canon (doc-canon (#45)); the
software is not — it grew code-first and the docs were written to catch up
with it. clean-build inverts that for good: all ONT software is rewritten
from the spec as if no code existed, with the writer → adversarial review →
DK-merge discipline the recuration used. Existing code is assumed bad.

**The seven ratified items, in brief:**
1. **Docs are the spec; only ratified sections are law.** A spec normativity
   ledger classifies every section `normative`/`candidate`/`analysis`; code
   implements only `normative`; gaps stop work and route through named spec
   PRs. *Amendment — normative hardening:* nothing is grandfathered; no
   section enters the ledger as `normative`. Promotion is earned per section
   via a five-step hardening (rule extraction → source check → adversarial
   content pass → attacks become negative tests → DK sign-off), per-phase
   just-in-time.
2. **Existing code is evidence and test material, not source of truth.**
   Only golden/conformance vectors and documenting tests are mined.
3. **Inventory, normativity, and quarantine before anything else.**
   `SOFTWARE_INVENTORY.md` is the B1-blocking ledger; old code quarantines
   to the in-tree `legacy/` directory; nothing is deleted.
4. **Tests before implementation.** Traceability standard per
   ownership-affecting rule: doc citation → executable test/vector →
   implementation path. Negative tests are first-class.
5. **Inside-out phasing with hard gates:** B1 wire (`@ont/wire`) → B2
   ownership kernel (`@ont/consensus`, the complete audited boundary as pure
   predicates) → B3 evidence layer (`@ont/evidence`, non-deciding) → B4
   adapters (publisher, resolver) → B5 surfaces. Phase N+1 implementation
   waits for phase N's merge; interface tests/spikes may go earlier.
6. **Nothing is precious; the new system replaces, it does not coexist**
   *(DK inverted the drafted "one live system / parity cutover")*. Deployed
   signet components have no protected status; downtime is accepted; there
   is no parity-against-old-code bar; every new component needs a written
   purpose/scope/tests statement before build; announced decommission events
   replace cutover.
7. **Process and review.** One branch per phase; writer ClaudeleLunatique;
   adversarial reviewer ChatLunatique at two layers (spec content via
   hardening, code at gates, with a written hunting list per gate); DK
   merges; STATUS.md updates in the same PR that changes reality.

**The six ruled calls:** new code lives as parallel packages in this repo;
quarantine is the in-tree `legacy/` directory; package names `@ont/wire`,
`@ont/consensus`, `@ont/evidence` are ratified; mobile is a separate effort
after B5 (a named consumer of `@ont/*`); live signet components come down at
B1 start via one announced decommission event; the B2 gate is the
conformance/negative/property suites, with an external audit run
concurrently from kernel freeze and hard-gating anything mainnet-facing.

Implications:
- `SOFTWARE_INVENTORY.md` (code fates + spec normativity ledger) is the
  next deliverable and blocks B1.
- The word "core" without qualification is retired from architecture
  vocabulary; `packages/core`'s name dies with the rewrite.
- The marker-vs-folded-anchor data-availability mechanism
  (OPEN_QUESTIONS §1.1) is a required pre-B2 named spec decision — B0
  deliberately does not choose it. *(Decided 2026-06-11: marker-fold (#47).)*

47. marker-fold: the availability marker is folded into the anchor —
2026-06-11

*Short name: **marker-fold**.*

Ruled by DK in ONT - dev on 2026-06-11 ("no second transaction (fold)").
The decision paper is
[research/DA_MARKER_FOLD.md](../research/DA_MARKER_FOLD.md); this entry
records the ruling. This was the pre-B2 named spec decision clean-build
(#46) required (OPEN_QUESTIONS §1.1).

**The rule.** The separate on-chain availability marker (wire event
`0x0d`) is retired. The anchor itself is the availability commitment: a
batch anchored at height `h` must have its bytes demonstrably servable by
`h+W`, with the fail-closed challenge window (`h+W+C`) and the §6c
uniform-exclusion rule of the DA agreement unchanged. All deadline windows
key off the anchor's mined height — a fact Bitcoin witnesses.

**Grounds, in brief:** the marker was a self-attested claim, not a proof —
every adversarial case settles in the §6c challenge in both designs; the
only flow the marker enabled (anchor-now, publish-later) is precisely the
withhold-then-reveal attack the rule exists to kill; the folded B2 kernel
predicate is simpler (one event, one reorg story, no cross-event
matching); one transaction per batch instead of two; the live system never
emitted markers, so folding ratifies the only behavior that ever ran.

Implications:
- Wire event `0x0d` (AvailabilityMarker) is **retired — never reuse** in
  the WIRE_FORMAT.md type registry; its layout moves to legacy evidence.
- DA agreement §6b is rewritten to key the deadline off anchor height;
  §6a/§6c/§6d survive.
- The B2 DA verdict is the pure predicate
  `eligible(anchor, servedEvidence, W, C)`; B3 defines the served-bytes
  witness format it consumes.
- The question remains a first-class external-review ask with an explicit
  reopen trigger: if external review surfaces a consensus role for a
  second timestamp, marker-fold reopens by named spec PR before the B2
  kernel freezes its DA predicate.

48. wire-normative: WIRE_FORMAT.md promoted candidate → normative —
2026-06-12

*Short name: **wire-normative**. Named sub-rulings: **timestamp-form**,
**sequence-bound**, **shape-only-gate**.*

Ruled by DK in ONT - dev on 2026-06-12 ("1–3 approved", event 5b53497f),
ratifying the B1 step-5 promotion walk as posted (event c79d3042). First
exercise of the normative-hardening amendment's promotion path.

**The rule.** WIRE_FORMAT.md §1–§7 are promoted to `normative` in one
batch (stated non-flag: §7's one-concept-one-label rule is review-checked,
no dedicated uniqueness test). §8.1–8.3 are promoted with three named
rulings applied in the same change:

- **timestamp-form** — `issuedAt` is pinned to a literal RFC 3339 UTC
  profile: uppercase `T`/`Z`, UTC only, seconds required, fraction absent
  or exactly three digits, real calendar instant. The legacy rule (any
  string a JS `Date.parse` accepts) is retired as representation
  malleability inside a digested field.
- **sequence-bound** — `sequence`'s valid range is bounded at 2^53−1; the
  u64 digest encoding can carry more, but larger values are invalid. The
  u64-vs-JS-safe-integer divergence is closed in the spec rather than
  left as an implementation accident.
- **shape-only-gate** — the `signatureBase64` parse gate checks base64
  shape only, by design; structural BIP322 validity belongs to the
  verifier (malformed bytes ⇒ verification returns false, never throws).

§9 remains `analysis` tier (a routing table, not a rule set).

Implications:
- Changing any §1–§8 rule now requires a new named decision; code must
  match the spec — docs-are-the-spec has teeth at the wire layer.
- `@ont/wire` and the conformance vectors updated in the promoting
  change: RFC 3339 gate, exported `SEQUENCE_BOUND`, negative vectors for
  both new rules; the shape-only gate's two sides were already pinned.
- The SOFTWARE_INVENTORY.md ledger row flips — the first `normative`
  entries in the clean-build ledger.
- B2 may treat wire shapes as law (closed field sets, full-width
  commitments collision-resistant per the W16 ruling).

49. da-windows: the K/W/C window algebra is pinned pre-B2; the values stay
launch-freeze work — 2026-06-13

*Status: **RATIFIED — O1 (DK, event 8c3b4beb, 2026-06-14).** Adopted
provisional under the autonomous-session protocol (DK grant, event
9c1e1ba7): writer ClaudeleLunatique, reviewer ChatLunatique CONCUR round 1
(adversarial pass; O2/O3 counter-cases argued and found weak). DK ratified
O1 — the algebra (S1–S6) is fixed; the values (S7) stay launch-freeze.
**DK directive (event 8c3b4beb): the DA residual — the 1-of-N archive
assumption (DA agreement §8) + the unfunded long-term archival economics
(OPEN_QUESTIONS §1.2) — is surfaced as the #1 external-review priority, not
buried as paperwork; an archival-economics research note is owed.***

*Short name: **da-windows**. Pre-B2 named decision (OPEN_QUESTIONS §1
item 2; DA agreement §10 item 1). Paper:
[research/DA_WINDOWS.md](../research/DA_WINDOWS.md).*

**The rule.** The window *algebra* is fixed now; the *integers* are not.
Semantics S1–S6 become candidate spec text in
ONT_DATA_AVAILABILITY_AGREEMENT.md §6e:

- **S1** one clock — all deadlines in block heights from the anchor's
  mined height `h`; reorgs re-derive `h`; no wall-clock or receipt-time
  input exists in the algebra.
- **S2** inclusive deadlines ("by `h+X`" = height ≤ `h+X`) and an explicit
  eligibility boundary: `eligibleAt(anchor, H, K) := H ≥ h+K`.
- **S3** two deadlines, two duties — `includable(anchor, evidence, W, C)`
  keyed to `h+W+C` (fail-closed inclusion) vs
  `holdsPriority(claim, evidence, W)` keyed to `h+W` (contested priority).
- **S4** evidence in, verdict out — the kernel consumes a served-bytes
  witness (B3 format) and never does I/O.
- **S5** `(K, W, C)` are per-network consensus parameters; kernel code is
  parametric.
- **S6** constraints: `K ≥ W + C`, `K ≥ 1`, `W ≥ 1`, `C ≥ 1` (W/C lower
  bounds tightened from the prototype's `≥ 0`).

**S7** provisional values `(6, 2, 3)` exist for conformance vectors and
test deployments only; final values freeze at the launch-parameter freeze
after the external review OPEN_QUESTIONS §1 solicits. B2 conformance MUST
carry: boundary vectors exactly at `h+W` and `h+W+C` plus one block after
each; the `h+K−1`/`h+K` eligibility pair; mixed-batch priority/inclusion
negatives (bytes first served in `(h+W, h+W+C]`); S6-violation rejects;
and vectors at two distinct parameterizations so a baked-in constant
cannot pass.

Corroboration: the B2 extraction merge independently surfaced the same
issue ([B2_KERNEL_HARDENING.md](./B2_KERNEL_HARDENING.md) §2, conflict
C3): the weaker `W ≤ K` form permits include-then-retract at `W = K`,
`C > 0` — the strong form forecloses it.

50. recovery-auth: the on-chain RecoverOwner invoke is authorized by a fresh
BIP340 recovery-key signature under a v2 descriptor — 2026-06-13

*Status: **RATIFIED — b1 (DK, event 3edddac1, 2026-06-14).** Adopted
provisional under the autonomous-session protocol (DK grant, event
9c1e1ba7): writer ClaudeleLunatique, reviewer ChatLunatique — round 1
COUNTER (wallet-proof role misstated; the BIP322-evidence path engaged as
the strongest counter-design), round 2 CONCUR on
audited-kernel/minimal-surface grounds. **DK ruled b1** (smallest audited
kernel): "the recovery key doesn't need to be usable via a generic non-ONT
wallet." Clarification recorded at ratification: 12-word/seed
recoverability holds under both b1 and b2h, so it did not decide the call;
b1's marginal kernel surface is zero, and the ONT-aware signing it needs is
no more than a normal transfer already requires. **b2h remains the standing
counter-design** (paper §4) — reopens only on the custody-feedback trigger
below. **Product copy must not imply generic-wallet recovery; an ONT-aware
recovery-signer / custody story is owed (B5).***

*Short name: **recovery-auth**. Pre-B2 named decision (B1 routed item;
WIRE_FORMAT §9 routing row; invoke-spec "What's missing" item 2). Paper:
[research/RECOVERY_AUTH.md](../research/RECOVERY_AUTH.md).*

**The rule.** Option (b1), on-chain self-authorization:

- **Descriptor v2** commits a required 32-byte x-only `recoveryPubkey`
  (`descriptorVersion` 2; digest extended under the established
  lenPrefix/-v2 conventions). v1 descriptors stay parse-valid but are
  not invokable (re-arm to v2; with signet decommissioned and
  nothing-is-precious ratified, v1 descriptors are conformance fossils).
- The `RecoverOwner` event's 64-byte `signature` field carries a
  **fresh BIP340 signature by that key over the unchanged W13
  `ont-recover-owner` digest**. The 0x09 wire layout is byte-for-byte
  unchanged — the decision defines the meaning of an existing normative
  field, the work WIRE_FORMAT §5 routed to B2.
- **Kernel acceptance** is a pure predicate over (event, descriptor
  evidence, name state): invoke signature verifies against the
  descriptor's `recoveryPubkey`; descriptor hash equals the event's
  `recoveryDescriptorHash`; the arming signature verifies against the
  owner key; the descriptor is the current armed head of the name's
  descriptor chain; `prevStateTxid` equals the state head.
- **Replay:** the digest binds `prevStateTxid` (a captured signature
  dies when the state head moves) and W13 domain separation kills
  cross-domain reuse. The owner-key veto path (cancel digest) is
  unchanged.

**Framing (round-2 reviewer precision):** neither option is
off-chain-free — b1 also consumes descriptor evidence. The decided
distinction is **descriptor-only evidence + one fixed BIP340 digest**
(b1) versus **descriptor + wallet-proof evidence + BIP322/script/text
verification inside the audited kernel** (b2h).

**Ripples (now landing — DK ratified b1):** the WIRE_FORMAT §8.2
descriptor-v2 amendment and the §8.3 wallet-proof narrowing
(invoke-authorization object → evidence-layer corroboration) are named
amendments to normative §8 and land in this ratification pass; the
invoke-spec item-2 note and the §9 routing row resolve to b1. b1 rules the
**signer/evidence shape only** — so the #50-keyed *signer/evidence-shape*
provisional vectors (R7, R9, R10×2, T19, and the #50 half of G6) flip
provisional→ratified (b2h flipMarkers retire). The **interval-opening**
(V2/V5: does the recovery interval open at invocation vs at challenge-window
close) and **transfer-vs-recovery-precedence** (X13) facets are explicitly
**NOT** ruled by b1 — those vectors' own scopeNotes name them as distinct
axes — so they are reclassified `spec-blocked` (PR-17 / PR-34) pending their
own DK decisions, not ratified here.

**Negative tests B2 must carry:** replayed-arming-sig-as-invoke,
descriptor-hash mismatch, non-head descriptor, stale `prevStateTxid`,
cancel-digest-as-invoke, v1-descriptor invoke, wrong-pubkey signature.

**Reopen triggers:** expert custody feedback (the standing "raise with
Max" item) showing BIP340 recovery custody is impractical for the
wallets that matter — reopens toward b2h, whose full skeleton is paper
§4; the abort-only watcher credential (OPEN_QUESTIONS §4.1) landing with
invoke-side field needs — touches the predicate by named amendment.

51. served-evidence-interface: the B2 DA-eligibility predicate consumes
`servedEvidence` as an opaque verifier-checkable interface; concrete bytes are B3 — 2026-06-14

*Status: **RATIFIED (DK, event 38369933, 2026-06-14).** Writer ClaudeleLunatique,
reviewer ChatLunatique. Spec-PR PR-1.*

**The rule.** `eligible(anchor, servedEvidence, W, C)` consumes `servedEvidence` as
an opaque interface satisfying: (i) cryptographically bound to its anchor;
(ii) determines a single first-servable height comparable to `h+W`;
(iii) independently verifiable from the `servedEvidence` object plus
confirmed-chain facts (no external I/O, no submitter trust), so two verifiers with
the same chain AND the same evidence derive the same verdict. The concrete byte
layout is the B3 deliverable (P2). Detail + amendment text:
[B2_SPEC_PR_PACKETS.md](./B2_SPEC_PR_PACKETS.md) PR-1.

52. commitment-match: committed leaf = `H(ownerPubkey)`; a malformed leaf is
dropped (not batch-poison), with claimant-verifiable own-leaf inclusion — 2026-06-14

*Status: **RATIFIED (DK, events 38369933 + 9b0c380a, 2026-06-14).** Writer
ClaudeleLunatique, reviewer ChatLunatique. Spec-PR PR-2 (conflicts C5, C6).*

**The rule.** (1) The committed leaf value is `H(ownerPubkey)` (docs-win over the
legacy raw-pubkey code). (2) A leaf-level well-formedness failure **drops only that
leaf**; the rest of the batch stands (not batch-poison) — **conditioned on** the
leaf-drop being non-silent: a claimant can verify its own committed leaf from the
available batch (which the ratified DA rules supply), so a drop is observable and
remediable before cheap finality (the leaf-drop *timing* invariant — ChatLunatique
guardrail). Fee/DA-deadline failures stay whole-batch. `Σ gᵢ` is summed over the
full committed leaf set regardless of drops. The contested-name case escalates to
the bonded auction (bond-opens (#37)), so a silent drop cannot steal a contested
name. Detail: [B2_SPEC_PR_PACKETS.md](./B2_SPEC_PR_PACKETS.md) PR-2.

53. root-chain-linkage: an accepted anchor's `prevRoot` equals the K-deep confirmed
root `R_{h−K}` (delta-merge), not the live chain tip — 2026-06-14

*Status: **RATIFIED (DK, event 38369933, 2026-06-14).** Writer ClaudeleLunatique,
reviewer ChatLunatique. Spec-PR PR-3 (conflict C2).*

**The rule.** `prevRoot` must equal the confirmed root `R_{h−K}` (K-deep below the
anchor); anchors are **not** tip-linked (strict tip-linkage is the A7-01 grief
surface — a tiny first anchor invalidates every concurrent honest publisher). A
structurally-valid but ineligible (fee/DA-failing) anchor consumes no
`prevRoot→newRoot` position; a re-anchor of an existing `newRoot` or a
`prevRoot==newRoot` no-op is rejected; the earliest valid instance in the
same-block order (#55) owns the deadline clock + proof-bundle txid. `K` is the
da-windows (#49) parameter. Detail: [B2_SPEC_PR_PACKETS.md](./B2_SPEC_PR_PACKETS.md) PR-3.

54. one-anchor-per-tx: a Bitcoin tx carries at most one valid RootAnchor; >1 valid
anchor rejects the whole tx — 2026-06-14

*Status: **RATIFIED (DK, events 38369933 + 9b0c380a, 2026-06-14).** Writer
ClaudeleLunatique, reviewer ChatLunatique. Spec-PR PR-4 (conflict C7).*

**The rule.** At most one valid decodable RootAnchor per transaction; a tx carrying
more than one valid RootAnchor is **rejected in whole** (fail-closed, no partial
fee attribution). Malformed / non-ONT OP_RETURN outputs are ignored — they neither
count toward the one-anchor limit nor poison it (the skip-bad disposition, coupled
to same-block-order (#55)). The tx's intrinsic fee `F` attributes to the single
anchor, so no fee can satisfy more than one anchor's gate. Detail + byte-level
classification: [B2_SPEC_PR_PACKETS.md](./B2_SPEC_PR_PACKETS.md) PR-4 +
[B2_SKIP_BAD_CLASSIFICATION.md](./B2_SKIP_BAD_CLASSIFICATION.md).

55. same-block-order: ONT events apply in ascending (block height, intra-block
tx-index, output index); a junk output is skipped (skip-bad), never poisons siblings — 2026-06-14

*Status: **RATIFIED (DK, events 38369933 + 9b0c380a, 2026-06-14).** Writer
ClaudeleLunatique, reviewer ChatLunatique. Spec-PR PR-16 (conflict C20; gaps G2/G3).*

**The rule.** Within a confirmed block, ONT events apply in ascending
`(height, tx-index, vout)` — the commit-priority tuple, consistent with ratified
Decision #25 (the publisher-spec txid tiebreak is superseded). Multiple ONT events
per tx apply in vout order; **skip-bad** — undecodable / non-ONT / inactive-version
outputs are ignored with **zero partial side effects** and never poison sibling
events. Earliest-in-order consumes a contested outpoint; later contenders reject.
Accepted bids reset the min-increment basis for later same-block bids. A
height-`h`-triggered transition evaluates after all height-`h` events apply.
Ordering governs determinism/grief only — **a contested name is awarded solely by
the qualifying bond (bond-opens (#37))**, never by ordering. The "real ONT event vs
ignorable output" boundary is a hard byte-level definition with a future-version
**activation-height gate** (a future-version payload is invalid + zero-side-effects
before its named activation, so v1-skips-but-v2-processes cannot silently hardfork):
[B2_SKIP_BAD_CLASSIFICATION.md](./B2_SKIP_BAD_CLASSIFICATION.md). Detail:
[B2_SPEC_PR_PACKETS.md](./B2_SPEC_PR_PACKETS.md) PR-16.

56. settlement-bond-continuity: a winning bond spent before settlement materializes
no owner (the name reopens); the runner-up is not promoted — 2026-06-14

*Status: **RATIFIED (DK, event 9b0c380a, 2026-06-14).** Writer ClaudeleLunatique,
reviewer ChatLunatique. Spec-PR PR-23.*

**The rule.** A winning bid materializes ownership only if its winning bond is
unspent from confirmation through the settlement evaluation point. If the bond is
spent before settlement, the auction materializes **no owner** and the name reopens
under a release-height rule keyed to the breaking spend; **no runner-up is
promoted** (a runner-up has no obligation to keep a bond alive after losing —
runner-up-wins is fragile and collusion-prone). A losing bid whose bond is spent
pre-settlement is removed from future auction-state effects after the spend is
observed. **Accepted residual (named, not hidden):** a bidder can pay fees + lock
capital to win, break continuity, and force a reopen — a *denial loop*, observable
and bounded by the auction's bid/finality economics. No cooldown / higher reopen
floor / failed-winner exclusion is a default B2 rule unless launch-parameter
modeling or external review shows the loop is too cheap (then a later named
decision adds one). Model: [PR23_DENIAL_LOOP.md](../research/PR23_DENIAL_LOOP.md).

57. b2-scanner-boundary: the B2 transaction scanner enters @ont/consensus as
audited consensus-support (not a state-decider), and the package consumes the B1
normative @ont/wire grammar — 2026-06-14

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on
branch clean-build-b2-kernel, DK merges). A boundary-manifest change under #44 —
the new tier + dependency are covered by conformance: `trust-surface.test.ts`
(manifest split + per-tier import allowlist) and `scanner.test.ts`. Authored under
DK's keep-building / ask-later grant (event 83243101, 2026-06-14).*

**The rule.** @ont/consensus now has two audited tiers. **CORE_DECIDERS**
(`engine.ts`, `state.ts`, `proof-bundle.ts`) hold owner-key authority and
replay/state decisions — a name moves only if these say so; they ride
@ont/protocol + @ont/bitcoin. **CONSENSUS_SUPPORT** (`scanner.ts`) is non-mutating
but consensus-bearing input normalization: it classifies a Bitcoin transaction's
OP_RETURN outputs into ordered valid ONT events plus zero-side-effect diagnostics,
enforcing skip-bad, future-version activation gating, same-block-order (#55), and
the one-anchor-per-tx (#54) `>1`-RootAnchor whole-tx reject. It rides the B1
normative @ont/wire grammar (B1 → B2: the kernel consumes @ont/wire for what the
active codec understands) + @ont/bitcoin, and has **zero authority to mutate name
state**. The scanner is audited — two implementations that scan differently fork
before the deciders ever see a byte — but it is deliberately *not* a decider, so it
is listed separately from CORE_DECIDERS rather than expanding that set. Spec:
[B2_SKIP_BAD_CLASSIFICATION.md](./B2_SKIP_BAD_CLASSIFICATION.md). This satisfies
#44's "boundary may change only with a DECISIONS entry + conformance coverage"; the
boundary freezes permanently at launch.

58. b2-consensus-params-boundary: the consensus-parameter surface enters
@ont/consensus as a third audited tier (CONSENSUS_PARAMS) — pure, state-deciding
nothing, the parametric input the audited rules are evaluated against — 2026-06-14

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on
branch clean-build-b2-kernel, DK merges). A boundary-manifest change under #44 —
the new tier is covered by conformance: `trust-surface.test.ts` (third-tier split
+ per-tier import allowlist) and `params.test.ts`. Authored under DK's
keep-building / ask-later grant (event 83243101, 2026-06-14).*

**The rule.** @ont/consensus now has three audited tiers. **CORE_DECIDERS**
(`engine.ts`, `state.ts`, `proof-bundle.ts`) and **CONSENSUS_SUPPORT**
(`scanner.ts`) are unchanged (#57). The new **CONSENSUS_PARAMS** tier
(`params.ts`) is the pure consensus-parameter surface canon Item 5 names
("ChatLunatique signs the CONSENSUS_PARAMS surface"): it validates and carries
the parameterization the deciders + support are evaluated against. It mutates no
name state and decides nothing on its own, so it is not a decider; but it is
consensus-bearing — two implementations that validated parameters differently
would diverge — so it is audited. It depends on **no external package** (values
enter as caller inputs; no `@ont/*`, no host I/O), which is why it gets its own
empty-allowlist tier rather than joining the deciders' or the scanner's. This
first increment populates only the required-tier DA-window slice — the `(K, W, C)`
triple that rules D9 / D12 / G9 govern: integer block counts, `K ≥ 1`, `W ≥ 1`,
`C ≥ 1`, and the D9 window-fit invariant `K ≥ W + C`, with the parametric
DA-deadline derivations (`confirmedRootEligible`, availability/challenge deadline
heights). The values themselves are never baked — `createDaWindowParams` has no
default — so no S7 placeholder value can fossilize: da-windows (#49) S6 ratifies
the structural validity constraints the constructor enforces (`K ≥ W + C`, the
K/W/C lower bounds), while the concrete `(K, W, C)` values remain caller-supplied
launch-freeze parameters (S7). The broader closed
CONSENSUS_PARAMS set (G10: notice/auction/soft-close windows, gate schedule,
opening floors, qualifying-bond minimum, maturity, accepted-payload cap,
challenge-window bounds) is candidate-stays / launch-parameter-freeze work and is
deliberately not modeled yet; it joins this surface as those rulings land. Spec:
[B2_KERNEL_HARDENING.md](./B2_KERNEL_HARDENING.md) D9/D12/G9. This satisfies #44's
"boundary may change only with a DECISIONS entry + conformance coverage"; the
boundary freezes permanently at launch.

59. b2-consensus-verdicts-boundary: the DA-verdict predicate enters @ont/consensus
as a fourth audited tier (CONSENSUS_VERDICTS) — pure, consensus-deciding but
state-mutating nothing — 2026-06-14

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on
branch clean-build-b2-kernel, DK merges). A boundary-manifest change under #44 —
the new tier is covered by conformance: `trust-surface.test.ts` (fourth-tier split
+ per-tier import allowlist) and `da-verdict.test.ts`. Authored under DK's
keep-building / ask-later grant (event 83243101, 2026-06-14).*

**The rule.** @ont/consensus now has four audited tiers, and "consensus-deciding"
is no longer synonymous with "state-mutating." **CORE_DECIDERS** (`engine.ts`,
`state.ts`, `proof-bundle.ts`) are the **state/replay deciders** — they mutate
name state, and a name's owner moves only if these say so; they ride
@ont/protocol + @ont/bitcoin. **CONSENSUS_SUPPORT** (`scanner.ts`, #57) and
**CONSENSUS_PARAMS** (`params.ts`, #58) are unchanged. The new
**CONSENSUS_VERDICTS** tier (`da-verdict.ts`) holds **pure verdict deciders** —
consensus-deciding predicates that compute a verdict the state deciders consume
but mutate no state themselves. The DA-verdict predicate decides a batch's
data-availability verdict (`includable` at the challenge deadline h+W+C,
`holdsPriority` at the availability deadline h+W) from the anchor's witnessed
facts plus an opaque, already-B3-verified served-bytes witness and nothing else
(da-windows (#49) S2/S3/S4; B2_KERNEL_HARDENING.md D1–D8). A claim counts only if
this verdict says so (D10), so it is consensus-deciding and must be audited — but
it performs no state mutation, so it is listed separately from CORE_DECIDERS
rather than expanding that set. The tier is pure: empty external allowlist,
depending only on node builtins and the audited parameter surface (`./params.js`).
Byte→root witness construction is the B3 deliverable (D8), not part of this
predicate. Spec: [B2_KERNEL_HARDENING.md](./B2_KERNEL_HARDENING.md) D1–D8;
da-windows (#49) S2/S3/S4. This satisfies #44's "boundary may change only with a
DECISIONS entry + conformance coverage"; the boundary freezes permanently at
launch.

60. b2-consensus-verdicts-wire-primitives: the CONSENSUS_VERDICTS tier may import
the audited B1 @ont/wire digest/verification primitives (not the legacy
@ont/protocol records) — admitting the value-record authority predicate — 2026-06-14

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on
branch clean-build-b2-kernel, DK merges). A boundary-manifest amendment of #59
under #44 — covered by conformance: `trust-surface.test.ts` (the verdict allowlist
pinned **per file** — `da-verdict.ts` mechanically empty-external, `@ont/wire`
admitted only for `value-record-authority.ts`) and `value-record-authority.test.ts`.
Authored under DK's keep-building / ask-later grant (event 83243101, 2026-06-14).*

**The rule.** #59 created the **CONSENSUS_VERDICTS** tier with an empty external
allowlist (`da-verdict.ts` rides only witnessed facts + the parameter surface).
The value-record authority predicate (`value-record-authority.ts`) is the same
class of object — a pure, consensus-deciding, state-mutating-nothing verdict — but
it must verify a §8.1 Schnorr signature and recompute a §8.1 record digest, which
are B1 primitives. This amendment broadens the tier's allowlist from empty to
**`@ont/wire`** (plus the audited relative modules), and **not** to `@ont/protocol`.
The distinction is load-bearing: `@ont/wire` is the B1-normative active codec with
`VALUE_RECORD_VERSION = 1` (the §8.1 authority record), whereas `@ont/protocol`
carries the legacy `VALUE_RECORD_VERSION = 2` record, which WIRE §8.1 declares
evidence-only / never valid. A value-record authority predicate that imported the
legacy v2 primitives would sign and verify the wrong digest, so the kernel must
ride the wire v1 primitives. The tier property is unchanged: pure verdicts that
mutate no state and perform no host I/O — `da-verdict.ts` continues to import
nothing external, while `value-record-authority.ts` imports only the wire v1
digest/verification functions. Spec: [B2_KERNEL_HARDENING.md](./B2_KERNEL_HARDENING.md)
V1–V13; DECISIONS #17/#18; WIRE_FORMAT §8.1. This satisfies #44's "boundary may
change only with a DECISIONS entry + conformance coverage"; the boundary freezes
permanently at launch.

61. b2-core-deciders-wire-auth-digests: engine.ts (a CORE_DECIDER) verifies the B1 §5
owner-key auth digests via @ont/wire, not the legacy @ont/protocol verifiers — 2026-06-14

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest amendment of #57/#59/#60 under #44,
framed as a refactor over already-pinned equivalent digests — no new consensus law, no DK
ruling required. Covered by conformance: `trust-surface.test.ts` (the per-file
CORE_DECIDERS allowlist + the engine-no-legacy-verifier import-surface test), the §5
equivalence pins (`engine.test.ts` X2, `engine.recovery.test.ts` R15), and the full
transfer/cancel suites. Authored under DK's keep-going grant (event 4892d54d, 2026-06-14).*

**The rule.** #57/#59 set CORE_DECIDERS riding {@ont/protocol, @ont/bitcoin}; #60 admitted
@ont/wire to the separate CONSENSUS_VERDICTS tier. This amendment lets the state-mutating
decider `engine.ts` verify the B1 §5 owner-key signatures (Transfer, and the RecoverOwner
cancel veto) directly off the @ont/wire normative digests — `transferAuthDigest`,
`recoverAuthDigest`, `verifySchnorr` — instead of the legacy @ont/protocol
`verifyTransferAuthorization` / `verifyRecoverOwnerCancelAuthorization`. The §5 equivalence
pins prove the @ont/protocol and @ont/wire digests are byte-identical, so the migration is
behavior-preserving; the win is that the kernel's owner-key authorization now rides the
single B1-normative digest source and any future drift is build-failing. The allowlist is
pinned **per file** (the #60 pattern): only `engine.ts` gains @ont/wire, and only for the
auth digests; `state.ts` and `proof-bundle.ts` stay {@ont/protocol, @ont/bitcoin}.
@ont/protocol remains for event codec/types/constants (a separate codec migration, not this
slice). Engine signature checks are fail-closed: a malformed field that makes the wire
digest/verify throw yields a rejecting verdict, never an exception (the X3/R15 no-throw
guarantee is preserved). Spec: WIRE_FORMAT §5; DECISIONS #57/#59/#60; the
all-auth-digests-ride-wire follow-up flagged at #60. This satisfies #44's "boundary may
change only with a DECISIONS entry + conformance coverage"; the boundary freezes at launch.

62. b2-gate-fee-boundary: the gate-fee validation predicate enters @ont/consensus as a
pure CONSENSUS_VERDICTS decider riding nothing external — 2026-06-14

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a
tier-widening: its external allowlist is empty (the strictest, like `da-verdict.ts`). No
new consensus law (the g(name) fee schedule is explicitly deferred to B3), no DK ruling
required. Covered by conformance: `trust-surface.test.ts` (`gate-fee.ts` in
CONSENSUS_VERDICTS with an empty `VERDICTS_ALLOWED_BY_FILE` entry), `b2-boundary.test.ts`
(zero-I/O purity), and the F8-pos-01 binding in `b2-vector-bindings.test.ts`. Authored
under DK's keep-going grant (event 62b47b5e, 2026-06-14).*

**The rule.** `gateFeeValidation(anchorFacts, committedBatchContents, fee)` is a pure
deterministic gate-fee verdict over witnessed inputs only — it carries NO publisher
identity, endpoint, or source parameter, so an N=1 self-posted anchor and a
publisher-batched anchor validate by the identical rule (the I5 censorship-resistance
floor, fee mechanics §5; F8). It rides nothing external (empty allowlist) and mutates no
state. SCOPE: this B2 slice pins the boundary SHAPE plus the structurally-derivable
fail-closed checks — a non-negative fee amount, and the committed batch must bind to the
anchor's (`anchoredRoot`, `batchSize`) commitment. It DELIBERATELY EXCLUDES the g(name)
fee schedule, the fee-amount adequacy economics (fee >= Σ g), and batchSize-vs-leaf-count
reconciliation — all B3, which fill in along this same identity-free signature. Spec:
`ONT_ISSUANCE_FEE_MECHANICS.md` §5; `SOFTWARE_CANON.md` L2 boundary rule (pure predicate
over witnessed inputs, zero-I/O); DECISIONS #59. This satisfies #44's "boundary may
change only with a DECISIONS entry + conformance coverage"; the boundary freezes at launch.

63. b2-transcript-completeness-boundary: the transcript-completeness predicate enters
@ont/consensus as a pure CONSENSUS_VERDICTS decider riding nothing external — 2026-06-14

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a
tier-widening: its external allowlist is empty (the strictest, like `da-verdict.ts` and
`gate-fee.ts`/#62). No new consensus law (canon Item 4 + the SOFTWARE_CANON boundary rule
are ratified core), no DK ruling required. Covered by conformance: `trust-surface.test.ts`
(`transcript-completeness.ts` in CONSENSUS_VERDICTS with an empty `VERDICTS_ALLOWED_BY_FILE`
entry), `b2-boundary.test.ts` (zero-I/O purity), and the T1/T2/T21 bindings in
`b2-vector-bindings.test.ts`. Authored under DK's keep-going grant (event 62b47b5e,
2026-06-14).*

**The rule.** `transcriptCompleteness(transcript, completenessWitness)` is a pure
deterministic verdict over witnessed inputs only — it carries NO actor / source / endpoint
/ producer / evidence-layer parameter, so no out-of-kernel layer can override it (T1; the
SOFTWARE_CANON L2 boundary rule). The no-source-identity guarantee is enforced at runtime by
closed-shape field checks — each B2 object admits only its closed key set (`transcript`:
`bids`; counted bid: `txid`; placeholder witness: `kind`), so a producer/source/endpoint/actor
field on any object is rejected, not silently ignored — not only in the TypeScript type. It fails closed when completeness is not witnessed by a
verifier-checkable B3 witness — absent, producer-asserted, or otherwise not
verifier-checkable ⇒ incomplete, never certified (T2; canon Item 4) — and rejects a counted
bid set that is not distinct and well-formed (32-byte lowercase-hex L1 txids; duplicate or
malformed txids rejected, never silently deduplicated — T21; canon Item 4). It rides nothing
external (empty allowlist) and mutates no state. SCOPE: this B2 slice pins purity + the
fail-closed completeness posture + txid integrity. It DELIBERATELY EXCLUDES the auction
winner / amount / bidder identity / bid qualification (auction resolution — T7/T9), the
concrete completeness-witness format and the lot's block range / soft-close range semantics
(B3; the range issue is T2-neg-02, candidate — the witness is consumed opaquely), and the
T17 / T18 / T22 / T19 surfaces (DA claim-counting, transcript-entry-vs-holdsPriority,
reopen/bond-continuity, and #50-b1 recovery invoke admission respectively). Spec:
`SOFTWARE_CANON.md` Item 4 + the L2 boundary rule; `B2_KERNEL_HARDENING.md` T1/T2/T21;
DECISIONS #59. This satisfies #44's "boundary may change only with a DECISIONS entry +
conformance coverage"; the boundary freezes at launch.

64. b2-bond-qualification-boundary: the bond-qualification predicate enters @ont/consensus as
a pure CONSENSUS_VERDICTS decider riding nothing external — 2026-06-15

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening:
its external allowlist is empty (the strictest, like `da-verdict.ts` / `gate-fee.ts` (#62) /
`transcript-completeness.ts` (#63)). No new consensus law (DECISIONS #37 bond-opens is ratified),
no DK ruling required. Covered by conformance: `trust-surface.test.ts`
(`bond-qualification.ts` in CONSENSUS_VERDICTS with an empty `VERDICTS_ALLOWED_BY_FILE` entry),
`b2-boundary.test.ts` (zero-I/O purity), and the B6-neg-01 binding in
`b2-vector-bindings.test.ts`. Authored under DK's keep-going grant (event 62b47b5e, 2026-06-14).*

**The rule.** `bondQualifiesForEscalation(bondAmountSats, bondFloorSats)` is a pure deterministic
verdict: a bond qualifies to escalate iff its amount is at or above the supplied floor (#37
bond-opens — "a bond, not a bare claim, opens the auction"). It is named around qualification,
not state transition. SCOPE: this asserts ONLY the #37 qualification test. It DELIBERATELY
EXCLUDES the candidate "contested" state and the auction state machine, auction RESOLUTION (who
wins), the claim-count trigger (there is no claim-count parameter, so a bare claim can never
escalate), and the bond-floor schedule (the floor is a launch-freeze PARAMETER supplied to the
predicate; B2 does not fix its value). It rides nothing external (empty allowlist) and mutates no
state. Total / fail-closed (the #63 discipline): a non-bigint or negative amount/floor does not
qualify and never throws. Spec: `DECISIONS.md` #37 bond-opens; `B2_KERNEL_HARDENING.md` B6;
DECISIONS #59. This satisfies #44's "boundary may change only with a DECISIONS entry +
conformance coverage"; the boundary freezes at launch.

65. b2-settlement-boundary: the settlement predicates enter @ont/consensus as pure
CONSENSUS_VERDICTS deciders riding nothing external — 2026-06-15

*Status: **Ratified** (DK event 43d30e67, 2026-06-15; writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening:
its external allowlist is empty (the strictest, like `da-verdict.ts` / `gate-fee.ts` (#62) /
`transcript-completeness.ts` (#63) / `bond-qualification.ts` (#64)). No new consensus law
(DECISIONS #12 maturity-binding, #37 bond-opens, and WIRE_FORMAT §4.3 are ratified/normative),
no DK ruling required. Covered by conformance: `trust-surface.test.ts` (`settlement.ts` in
CONSENSUS_VERDICTS with an empty `VERDICTS_ALLOWED_BY_FILE` entry), `b2-boundary.test.ts`
(zero-I/O purity), and the S5-neg-01 / S15-neg-01 bindings in `b2-vector-bindings.test.ts`.
Authored under DK's keep-going grant (event 62b47b5e, 2026-06-14).*

**The rule.** Two narrow pure predicates, deliberately not one combined verdict so neither
implies maturity-height computation nor full materialization:
- `settlementLockMatchesMaturity(lockCommitment, maturityBlocks)` (S5; #12 + WIRE §4.3): a
  winning bid's `settlementLockBlocks` commitment must equal the protocol maturity parameter; a
  differing value does not settle. It validates ONLY this equality — no maturity-height
  computation, no maturity-anchor choice, no bid validation, no record settle. `maturityBlocks`
  is a launch-freeze parameter.
- `settlementMaterializes(acceptedWinningBid | null)` (S15; #37): the materialization GATE —
  ownership materializes only from an actual accepted winning bid; `null` (no winner / zero bids
  / a settled phase with no valid accepted winner) yields no owner. The accepted winner is an
  INPUT from winner selection (Q); B2 does not resolve it, and this gate does not construct the
  NameRecord.

Both ride nothing external (empty allowlist) and mutate no state. They DELIBERATELY EXCLUDE:
auction RESOLUTION / winner selection (→ Q, candidate); the full NameRecord construction
(`ownerPubkey`, bond outpoint, amount, maturity height); maturity-anchor reconciliation (S3);
settlement-bond-continuity (#56, engine-side); and recovery (#50). Total / fail-closed +
closed-shape (the #63/#64 discipline): a malformed (non-object, extra-field, non-integer/negative)
input does not settle/materialize and never throws, so no source/catalog/phase field is admitted
as authority. Spec: `DECISIONS.md` #12 + #37; `WIRE_FORMAT.md` §4.3; `B2_KERNEL_HARDENING.md`
S5/S15; DECISIONS #59. This satisfies #44's "boundary may change only with a DECISIONS entry +
conformance coverage"; the boundary freezes at launch.

66. b2-spec-pr-batch: DK ratified the B2 spec-PR matrix (PR-5..36) as recommended, plus the
boundary-manifest amendments (#57–#65) and the §3c recovery-evidence-timing rule — 2026-06-15

*Status: **RATIFIED (DK, event 43d30e67, 2026-06-15).** Writer ClaudeleLunatique, reviewer
ChatLunatique; ELI5 ratification list posted (event 6e85b371), DK approved the 6 individual rows
+ the batch as recommended. The per-PR detail is the authoritative ratified record in
[`B2_SPEC_PR_DECISION_MATRIX.md`](./B2_SPEC_PR_DECISION_MATRIX.md) (header flipped to RATIFIED);
this entry is the ledger event + the named sub-decisions. The boundary entries #57–#65 are ratified
by this decision (status lines flipped). No code is pushed; origin stays the return gate.*

**The ratified set.** All ~30 open spec-PRs (PR-5..15, PR-17..36; PR-1/2/3/4/16/23 were already
#51–#56) are ratified as written. The 6 individual-review rows were ruled **as recommended**:
- **PR-9** — kernel state re-derives from the current best chain on reorg; no first-seen / old-chain
  priority survives.
- **PR-10** — settlement/ownership finality has its own depth parameter, separate from DA `K`.
- **PR-13** — one inclusive boundary convention for all non-DA windows ("by height h+X" includes h+X).
- **PR-17 (recovery-interval-opening)** — a RecoverOwner invoke does NOT rotate the ownership interval;
  the new interval opens only at recovery **finalization**. During an open `pendingRecovery` the
  pre-recovery owner stays "current owner". (Carries the atomic-name-sale note — see below.)
- **PR-34 (transfer-vs-recovery, X13)** — while a `pendingRecovery` is open an owner-key Transfer is
  **BLOCKED** (mutates nothing); the owner's only in-window veto is the explicit CANCEL bit (0x01).
  Anti-theft: prevents a stolen owner key from exfiltrating the name beyond the recovery descriptor.
- **PR-35 (recovery-finalize-timing)** — finalization is evaluated after the finalize-height block;
  only an in-window CANCEL prevents it (ruled together with PR-34).

**§3c recovery-evidence-timing (evidence-gated).** A non-cancel RecoverOwner invoke is accepted only
if its witnessed descriptor evidence is demonstrably witnessed by `h_r + W_r`; an unwitnessed invoke
opens no `pendingRecovery` and mutates no state (fail-closed, no state created until the evidence
verifies). Per [`RECOVERY_EVIDENCE_TIMING.md`](../research/RECOVERY_EVIDENCE_TIMING.md).

**atomic-name-sale (DK fold-in on PR-17).** Name transfers are often name-for-bitcoin sales. A
completed transfer rotates the ownership interval (PR-18), so the seller's armed recovery descriptor
dies and the buyer is safe from claw-back post-sale. Consensus cannot condition a Bitcoin payment on
ONT-validity, and a seller can race a head-change / pending recovery to void the transfer while
keeping the payment (a mature name carries no forced outpoint spend). **Decision: atomic
name-for-bitcoin is a B5 / market-layer protocol**, built on the B2 enablers
(transfer-kills-seller-recovery + a deterministic, fully pre-checkable transfer predicate), NOT a B2
consensus primitive. A native consensus "sale" event (a Transfer variant binding a committed payment
output + a state-outpoint spend) stays a **live future option** — an additive named spec-PR (the wire
registry reserves unassigned event types) if the market proves it worth the kernel complexity.

**Consequences.** The 30 candidate-tier conformance vectors (pending-DK) may be promoted to
ratified-tier and bound; the recovery-invoke engine rewrite (#50-b1) is greenlit on the now-ratified
PR-17/34/35 + §3c; the winner-selection, claim-counting, reopen, occupancy, and fee×K-deep surfaces
may be built. Each follows tests-first + writer/reviewer (ChatLunatique) + the boundary-manifest
discipline. The #57–65 boundary entries are ratified; the branch merge to main remains DK's op.

67. b2-recovery-invoke-authority-boundary: the recovery-invoke authorization/evidence-gate predicate
enters @ont/consensus as a pure CONSENSUS_VERDICTS decider riding @ont/wire B1 primitives — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening. Unlike
the empty-allowlist verdicts, it rides @ont/wire B1 primitives (`recoverAuthDigest`,
`recoveryDescriptorDigest`, `verifySchnorr`, `RECOVERY_DESCRIPTOR_INVOKABLE_VERSION`) like
`value-record-authority.ts` — its `VERDICTS_ALLOWED_BY_FILE` entry is exactly `@ont/wire`. NO new
consensus law: it lands the already-ratified #50-b1 acceptance predicate (RECOVERY_AUTH §3), the
ratified §3c evidence-timing rule, the PR-18 current-interval binding, and the PR-34 path-split (all
#66) — no DK ruling required beyond #66. This is **slice (A)** of the recovery-invoke rewrite; the
engine integration (slice B) is a separate follow-on. Covered by conformance: `trust-surface.test.ts`
(`recovery-invoke-authority.ts` in CONSENSUS_VERDICTS with the `@ont/wire` allowlist),
`recovery-invoke-authority.test.ts` (the conjunct-by-conjunct + totality/closed-shape battery).
Authored under DK's keep-going grant.*

**The rule.** One narrow pure predicate — the AUTHORIZATION/EVIDENCE-GATE half of a non-cancel
`RecoverOwner` invoke, NOT full transaction acceptance:
- `acceptRecoverOwner(invokeFacts, descriptorEvidence, nameState, recoveryParams)` → `{accepted, reason}`.
  Accepts only when every conjunct holds: **R7** descriptor profile is the invokable version (v2;
  v1 parses but cannot invoke); **R10** a fresh BIP340 invoke signature in the 64-byte slot over the
  W13 `ont-recover-owner` digest (`recoverAuthDigest`), verified against the descriptor's
  `recoveryPubkey` (NOT a commitment parsed from the slot); **R6** `recoveryDescriptorDigest(descriptor)`
  equals the invoke's `recoveryDescriptorHash`; **R3** that same digest equals the name-state's current
  descriptor head-hash fact (hash-based; sequence is a companion check, never a substitute); **R2** the
  arming signature verifies against the name's CURRENT `ownerPubkey` (not the descriptor's self-claimed
  owner); **R4** `descriptor.ownershipRef` equals the current-interval ref (stops old-interval replay —
  Decision #40's seller-reclaims-after-sale target); **R5** `prevStateTxid` equals the state head; and
  **§3c** the descriptor evidence is demonstrably witnessed (a verifier-checked witness object) by
  `h_r + W_r`, `1 <= W_r <= challengeWindowBlocks`. Fail-closed: late/absent/unverified evidence → not
  authorized → the engine opens no recovery state.

It DELIBERATELY EXCLUDES (engine integration / slice B): the bond-spend + qualifying-successor +
outpoint-conflict mechanics (R11), the immature gate (R12), single-pending (R13), `pendingRecovery`
construction, the X13 transfer block, bond rotation, finalization (R18), and the CANCEL path — a
CANCEL-flagged or any nonzero-flag event presented as an invoke fails closed here, pinning the split.
The §8.3 BIP322 wallet proof is non-authorizing corroboration: no field, no witnessing deadline,
cannot block or substitute for the descriptor evidence. `W_r` is a launch-freeze parameter (B2 does
not fix its value); the "demonstrably witnessed" format is a B3 evidence-layer deliverable — B2
consumes an opaque, already-verifier-checked witness (`{ kind: "b3-verified-recovery-descriptor-witness",
witnessedByHeight }`), exactly as the DA verdict consumes a served-bytes witness (S4). Total /
fail-closed + closed-shape (the #63/#64/#65 discipline): every malformed input rejects and never
throws (all @ont/wire digest/verify calls are guarded), and no extra field on any owned input object
or on the witness is admitted as authority. Spec: RECOVERY_AUTH §3 + §3c; `WIRE_FORMAT.md` §5/§8.2a;
`B2_KERNEL_HARDENING.md` R-rows; DECISIONS #50/#59/#66. This satisfies #44's "boundary may change only
with a DECISIONS entry + conformance coverage"; the boundary freezes at launch.

68. b2-auction-resolution-boundary: the auction opening-floor, bid-acceptance, and
winner-selection predicates enter @ont/consensus as pure CONSENSUS_VERDICTS deciders riding
nothing external — 2026-06-15

*Status: **Proposed** (writer ChatLunatique, reviewer ClaudeleLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening.
Its external allowlist is empty: no `@ont/core` auction simulator/policy, no indexer/resolver,
no research/simulation code, no host I/O. NO new consensus law: it lands the already-ratified
auction rules from #37/#25 and #66 (PR-14, PR-19, PR-20, PR-21). Covered by conformance:
`trust-surface.test.ts` (`auction-resolution.ts` in CONSENSUS_VERDICTS with an empty allowlist),
`auction-resolution.test.ts` (predicate battery), and the Q/T/G auction bindings in
`b2-vector-bindings.test.ts`. Authored under DK's keep-going grant.*

**The rule.** Three narrow pure predicates:
- `openingFloor(nameFacts, floorParams)` (Q2; PR-14/#11): given the canonical name byte length
  and caller-supplied launch floor parameters, names of length `<=4` use the short-name halving
  curve clamped by the long-name floor, while names of length `>=5` use the flat long-name floor.
  Concrete prices remain launch-freeze inputs.
- `acceptAuctionBid(bidFacts, bondFacts, priorAuctionState, auctionParams)` (Q1/Q3/Q4/Q7/Q10;
  PR-19/PR-21/#37): acceptance is a conjunction over the opening/increment minimum, timing,
  B3-verified lot binding, and bond facts. The bond output must be a B3-verified bidder-controlled
  payment output whose value is **at least** `bidAmountSats` (PR-21: over-bonding is allowed);
  missing, under-bonded, OP_RETURN, provably-unspendable, or unknown outputs reject. Non-accepted
  bids have `stateEffect: "none"` and cannot open an auction, create a contested state, count as a
  claim/collision, or extend soft-close.
- `selectAuctionWinner(transcript, transcriptCompletenessVerdict, declaredWinner?)` (Q9/T7/T9/G1;
  #37/#25): winner selection is defined only over a complete transcript. Zero accepted bids yields
  no winner / no owner; rejected bids never win; the largest accepted bid wins; same-block
  equal-amount ties resolve to the lower transaction index; a lower or phantom declared winner
  rejects.

The module deliberately excludes: production indexer integration; the concrete completeness-witness
format; positive bond-script-class enumeration; bidder-control proof construction; one-bond-one-bid
and same-bidder replacement-chain validation (Q8/F13/F14/T12). Those are later B3/auction slices.
Total / fail-closed + closed-shape (the #63–#67 discipline): malformed inputs or extra fields reject
and never throw, so no catalog/source/producer field is admitted as authority. This satisfies #44's
"boundary may change only with a DECISIONS entry + conformance coverage"; the boundary freezes at
launch.

69. b2-notice-window-resolution-boundary: the cheap-claim notice-window resolution predicate
enters @ont/consensus as a pure CONSENSUS_VERDICTS decider that rules a name
finalize/nullify/escalate/provisional at the notice deadline, riding nothing external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening. Its
external allowlist is empty: it consumes resolved per-claim DA verdicts + a launch W_notice
parameter and delegates bond qualification to the resident #37 predicate (`bond-qualification.ts`,
an intra-package import), with no `@ont/core` indexer/resolver, no research/simulation code, and no
host I/O. NO new consensus law: it lands the already-ratified rules #37 (bond-opens), #47
(marker-fold deadline clock), #49 (da-windows K>=W+C), and PR-6 (distinct-owner counting). Covered
by conformance: `trust-surface.test.ts` (`notice-window.ts` in CONSENSUS_VERDICTS with an empty
allowlist), `notice-window.test.ts` (predicate battery), and the T17/F11 bindings in
`b2-vector-bindings.test.ts`. Authored under DK's keep-going grant.*

**The rule.** One narrow pure predicate, `resolveNoticeWindow(input)`:
- A13: the notice window opens at the name's earliest-valid anchor mined height; the verdict is
  derived only at `currentHeight >= anchorHeight + W_notice` (a `>=` gate; before it the name is
  `provisional`). W_notice is a launch-freeze parameter, not a value this rule fixes.
- T17/F11/#37: exactly one distinct-owner DA-valid claim and no qualifying bond -> `finalized`; two
  or more distinct-owner DA-valid claims and no qualifying bond -> `nullified` (no owner, the name
  reopens); any qualifying bond (against a claim, or bond-first) -> `escalated` to auction. A bare
  collision can deny, never award.
- PR-6 / first-anchor-wins (B5): a "competing claim" counts DISTINCT `(name, owner)` only; a
  same-owner duplicate or re-anchor is idempotent (A12), deduped by owner key before counting.
- D10: a claim whose DA verdict resolved NOT priority-bearing does not count for any lifecycle
  purpose; a withheld competing claim (resolved excluded) does not nullify an available claim.

**#49-independent.** The predicate consumes each claim's ALREADY-RESOLVED DA verdict — the
`{decided, holdsPriority}` output of `da-verdict.ts`, composed by the engine over a served-bytes
witness — and never recomputes `includable`/`holdsPriority` and never sees W/C/K. The #49-governed
window algebra lives in the supplied DA verdict; this rule only counts the resolved priority-bearing
claims, so da-windows values may move without touching this module (the tests vary the supplied DA
facts to show the holdsPriority `h+W` boundary, F11). As a D10 nullification-by-withholding guard,
any UNDECIDED claim verdict fails the resolution closed (`undecidable`) — never a premature
finalize/nullify; under #49 `K>=W+C` an honest deadline evaluation never carries one.

The module deliberately excludes: the auction itself (escalate emits the outcome; winner selection
is `auction-resolution.ts` #68); the exact notice-deadline INCLUSIVITY of a claim landing AT the
close height (that non-DA edge is PR-13, cf. A13); the in-window membership filter and the choice of
governing anchor among competing claims (engine first-anchor-wins composition); whole-batch-vs-per-
leaf DA granularity (D4); and indexer/resolver integration. Total / fail-closed + closed-shape (the
#63–#68 discipline): malformed or extra-field inputs return a non-award verdict and never throw, so
no producer-asserted "qualifies"/"daValid" field is admitted as authority. This satisfies #44's
"boundary may change only with a DECISIONS entry + conformance coverage"; the boundary freezes at
launch.

70. b2-reopen-resolution-boundary: the reopen / re-auction generation predicate enters
@ont/consensus as a pure CONSENSUS_VERDICTS decider that recognizes a reopen lot keyed off the
latest KERNEL-DERIVED bond-break release height, riding nothing external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening. Its
external allowlist is empty: it consumes witnessed bond-break facts + the parsed reopen-lot anchor,
with no `@ont/core` indexer/resolver, no research/simulation code, and no host I/O. NO new consensus
law: it lands the already-ratified rules T22, B19, S7, S9, #5 (bond-continuity break → release), #18
(pre-maturity bond continuity), #56 (settlement-bond-continuity), and #42 (no-adapter-authority).
Covered by conformance: `trust-surface.test.ts` (`reopen-resolution.ts` in CONSENSUS_VERDICTS with an
empty allowlist), `reopen-resolution.test.ts` (predicate battery), and the T22/B19 bindings in
`b2-vector-bindings.test.ts`. Authored under DK's keep-going grant.*

**The rule.** One narrow pure predicate, `resolveReopen(input)`:
- B19 / #56 / #42: the latest bond-break release height is a KERNEL-DERIVED chain fact, derived from
  the witnessed bond-break facts (`bondContinuity.breaks`) — never an adapter-asserted number. A
  reopen lot is recognized iff it is anchored exactly to the unique latest release; a reopen with no
  witnessed break, or anchored to a stale/fabricated/future height, is refused (no auction, no
  transcript).
- S7 / S9 / B19 generations: the first auction is `opening`-{name} with anchor 0 (recognized only
  with a complete witness and no prior break); a reopen is `reopen`-{name}-after-{r} with a positive
  anchor equal to the latest release. Anchor 0 is reserved for `opening` only — a `reopen`-after-0
  cannot collapse into first-generation semantics.
- T22-01: the verdict is a PURE function of (reopen lot, witnessed breaks) — there is no actor /
  indexer "recognizer" channel.
- T22-02: an INCOMPLETE bond-continuity witness fails closed (reject) BEFORE any matching.

**Parked (S8 / `release height` def).** The deterministic latest-rule needs a TX-LEVEL TIEBREAK for
multiple same-height breaking observations, and that tiebreak is a genuinely-unstated/candidate
clause — NOT ruled. So the predicate derives the latest only when it is UNIQUE; two or more breaks
sharing the max height fail closed (`reopen-same-height-break-tiebreak-unspecified`) rather than
inventing the tiebreak. `breaks` carries `{releaseHeight}` only; a `txOrder` field lands when the
tiebreak is ruled by a spec PR.

The module deliberately excludes: the auctionId string grammar (opening-{name} /
reopen-{name}-after-{r}) and its §6 lot-commitment preimage (a B3-verified lot binding, consumed
elsewhere as a parsed fact); bond-break DETECTION itself (S7/B18 lives in the engine/settlement; this
predicate consumes the resolved break facts); nullification-reopen (B24) and its cooldown / re-claim
mechanics (separate, candidate); and reorg of release facts (Z*). The engine composes a recognized
reopen into auction-resolution (#68). Total / fail-closed + closed-shape (the #63–#69 discipline):
malformed or extra-field inputs return a non-recognition verdict and never throw, so no
adapter/source/producer field is admitted as authority. This satisfies #44's "boundary may change
only with a DECISIONS entry + conformance coverage"; the boundary freezes at launch.

71. b2-occupancy-boundary: the name-occupancy predicate enters @ont/consensus as a pure
CONSENSUS_VERDICTS decider — the insertion-only / no-takeover-of-final gate over a name's resolved
post-DA-verdict occupancy — riding nothing external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening. Its
external allowlist is empty: it consumes the name's resolved governing occupancy, with no `@ont/core`
indexer/resolver, no research/simulation code, and no host I/O. NO new consensus law: it lands the
already-ratified A11 (anchors are insertion-only; a batched claim must not take an already-final
name), #26 (root anchors/markers do not authorize transfers or value updates), and D10 (a DA-failed
claim counts for no lifecycle purpose). Covered by conformance: `trust-surface.test.ts`
(`occupancy.ts` in CONSENSUS_VERDICTS with an empty allowlist), `occupancy.test.ts` (predicate
battery), and the A11-pos-01 binding in `b2-vector-bindings.test.ts`. Authored under DK's keep-going
grant.*

**The rule.** One narrow pure predicate, `resolveNameOccupancy({ priorOccupancy })` — `priorOccupancy`
is the name's RESOLVED governing occupancy (`null` or one of three kinds), never re-derived here:
- `null` (unoccupied / fully reopened) → admit a fresh insertion.
- `{ kind: "forfeited" }` (a DA-decided non-priority prior insertion) → admit. This is the A11-pos-01
  crux: occupancy is enforced over POST-DA-VERDICT state, so a name "inserted" only by a
  later-forfeited (DA-failed) batch does not occupy it and must not block honest re-claiming (D10).
- `{ kind: "contestable-provisional" }` (the caller has established the candidate is inside the live
  competition window) → admit a competing insertion; the collision / finalize / nullify outcome is
  notice-window (#69), not this gate.
- `{ kind: "final" }` (a DA-valid finalized owner holds the name) → refuse; insertion-only, the
  existing owner is unchanged (no takeover).

**#49-independent.** The predicate consumes the resolved governing occupancy as a fact — the caller
(engine) has already composed the DA verdict (`da-verdict.ts`) and the lifecycle verdict
(notice-window / auction) and reduced any multiple prior insertions (first-anchor-wins, A12) into one
governing occupancy. It never recomputes W/C/K and never reduces insertions itself. Auction-pending
and nullified-reopen states are NOT mapped to an admitting kind; a reducer must deliberately
introduce a future occupancy kind for them — they are not silently insertable.

The verdict carries ONLY an admit/refuse decision plus a classification — there is no owner/value/
transfer field, so the predicate is structurally insertion-only (no mutation path; #26). Deliberately
excluded: the multiple-insertion reduction (engine, A12); how the DA / finality verdicts were
computed (upstream); the competing-claim outcome (notice-window #69); and non-canonical-name-byte
rejection (A6 — a separate A-area name-canonicalization concern). Total / fail-closed + closed-shape
(the #63–#70 discipline): malformed, unknown-kind, or extra-field input fails closed to a
non-admitting `undecidable` verdict and never throws, so no producer-asserted occupancy outside the
three resolved kinds is admitted as authority. This satisfies #44's "boundary may change only with a
DECISIONS entry + conformance coverage"; the boundary freezes at launch.

72. b2-batch-exclusion-locality-boundary: the batch-exclusion locality predicate enters
@ont/consensus as a pure CONSENSUS_VERDICTS decider — the insert-only batched-insertion derivation
that makes the DA-exclusion locality / state-equivalence property checkable — riding nothing
external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening. Its
external allowlist is empty: the DA verdict enters as a consumed `excludedBatchIds` input, with no
`@ont/core`, no research/simulation code, and no host I/O. NO new consensus law: it lands the
already-ratified B10 (a DA-excluded batch's claims vanish uniformly; exclusion removes only that
batch's leaves and unseats no final owner) and D7 (the resulting state equals the as-if-the-excluded-
batch-never-existed world), over the DA §5 insert-only/commutative merge. Covered by conformance:
`trust-surface.test.ts` (`batch-exclusion.ts` in CONSENSUS_VERDICTS with an empty allowlist),
`batch-exclusion.test.ts` (predicate battery), and the B10-pos-01 / D7-pos-01 bindings in
`b2-vector-bindings.test.ts`. Authored under DK's keep-going grant.*

**The rule.** `deriveBatchedInsertions({ batches, excludedBatchIds, priorFinalNames })` derives the
per-name insertion provenance of the non-excluded batches as a deterministic sorted projection. The
bindings PROVE the property: excluding batch X removes only X's own leaves (every name not in X is
byte-identical), the result equals the as-if-X-never-anchored derivation, and no `priorFinalNames`
entry is unseated. The DA verdict is a CONSUMED witnessed input (`excludedBatchIds`), never recomputed
from local fetch success (B10 attack flag) — so the module is #49-independent (no W/C/K appear).

**Insert-only invariant + cross-area coupling (D7 §5).** The merge models ONLY name insertions — a
batch never mutates an existing name. This is the DA §5 commutative-merge fact the locality guarantee
rests on; it is a cross-area coupling the batched-path (B) area MUST hold (if batches ever admit
non-insert ops, exclusion stops being self-contained). `priorFinalNames` is a PRESERVATION fact, not a
new occupancy reducer: a leaf targeting an already-final name is an insert-only no-op (never a fresh
insertion, never an unseat; #26/B7), and this predicate does not re-decide takeover (that is occupancy
#71 / B7). Deliberately excluded: finalization / collision / nullify (notice-window #69), the
first-anchor-wins reduction (A12, engine), and the A6 name grammar (names are caller-parsed canonical
facts). Total / fail-closed + closed-shape (the #63–#71 discipline): malformed, extra-field, duplicate
batchId, or duplicate/unknown excluded id fails closed (`derived:false`) and never throws, so the
derivation can never become order-dependent or admit a producer-asserted exclusion. This satisfies
#44's "boundary may change only with a DECISIONS entry + conformance coverage"; the boundary freezes
at launch.

73. b2-bond-window-clock-boundary: the qualifying-bond notice-window test (`bondInNoticeWindow`, in
`notice-window.ts`) reads the bond's re-derived current-chain mined height (#49 S1 one-clock), and
fails closed on the unruled notice-close edge — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest clarification under #44, an addition to the
already-resident `notice-window.ts` verdict surface (#69) — kept as its own entry because #69
explicitly excluded in-window membership filtering. Empty external allowlist (height inputs only).
NO new consensus law: it lands Z9 (the notice-window outcome derives purely from the current
canonical chain; reorgs re-derive) read through the #49 S1 one-clock rule. Covered by conformance:
`notice-window.test.ts` (`bondInNoticeWindow` battery) and the Z9-neg-01 binding in
`b2-vector-bindings.test.ts`.*

**The rule.** `bondInNoticeWindow(bondMinedHeight, anchorHeight, noticeWindowBlocks)` returns a
tri-state verdict (`in-window` / `out-of-window` / `boundary-unspecified`, plus `undecidable` on
malformed input). `bondMinedHeight` MUST be the bond's RE-DERIVED height on the current best chain
(#49 S1: every deadline keys off the current canonical chain; reorgs re-derive; no first-seen /
receipt time) — a test reading a first-seen or superseded-chain height is non-conformant (Z9-neg-01).

**Parked: the notice-close edge.** The exact close boundary (`h === anchorHeight + W_notice`) is the
unruled PR-13 / G4 / F12 edge — whether a bond mined exactly at the close is inside is stated nowhere.
This predicate deliberately does NOT freeze it: it returns `boundary-unspecified`
(`bond-window-close-boundary-unspecified`) at that exact height so no implementation silently freezes
the edge ahead of a spec ruling. The Z9-neg-01 binding uses interior heights so the only variable is
first-seen vs re-derived height. Total / fail-closed: malformed input fails closed to `undecidable`
and never throws. This satisfies #44's "boundary may change only with a DECISIONS entry + conformance
coverage"; the boundary freezes at launch.

74. b2-window-schedule-boundary: the window-schedule predicate enters @ont/consensus as a pure
CONSENSUS_VERDICTS decider — a lifecycle window's length is a function of anchor height + a frozen
height-keyed schedule plus an extend-only adjustment, with no market-signal input channel — riding
nothing external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier established by #59 — a new pure verdict module, NOT a tier-widening. Empty
external allowlist: anchor height + a frozen value-free schedule enter as caller inputs; no
`@ont/core`, no research/simulation code, no host I/O. NO new consensus law: it lands the
already-ratified B22 (the window function's only inputs are anchor height + frozen schedule constants;
a market/state-derived signal that would shorten a window is rejected by construction) and Z11
(extend-only; a computed window below the height-keyed floor is rejected; windows reduce only by
passage of block height). Covered by conformance: `trust-surface.test.ts` (`window-schedule.ts` in
CONSENSUS_VERDICTS with an empty allowlist), `window-schedule.test.ts` (predicate battery), and the
B22-neg-01 / Z11-neg-01 bindings in `b2-vector-bindings.test.ts`. Authored under DK's keep-going grant.*

**The rule.** `windowSchedule({ anchorHeight, floorConstants, adaptiveExtensionBlocks? })` returns
`{ computed, blocks, floorBlocks, reason }`:
- The floor is a deterministic function of anchor height over `floorConstants.segments` — a non-empty
  list of `{ fromHeight, floorBlocks }` STRICTLY ascending by `fromHeight`; the floor is the
  `floorBlocks` of the last segment whose `fromHeight <= anchorHeight`. The floor may decay by height
  (windows reduce only by passage of block height), never by a market signal.
- `blocks = floorBlocks + extension`, where `extension` is 0 if absent and otherwise a safe
  nonnegative integer — **extend-only**: a negative (shrink) adjustment fails closed
  (`window-schedule-shrink-rejected`) rather than being normalized to 0, so `blocks >= floorBlocks`
  always holds.
- **No market-signal input channel by construction**: the input is closed-shape at the top level AND
  inside `floorConstants` and each segment, so a market field (`claimVolume`, `bondTotals`,
  `distinctKeys`, `marketMaturity`, …) is rejected, never read.

The concrete launch schedule VALUES remain launch-freeze (the schedule enters as frozen caller
constants; the conformance tests use two distinct constant sets so no value is baked). Total /
fail-closed + closed-shape (the #63–#73 discipline): malformed, extra-field, unordered-segment,
negative/non-integer extension, or overflow input fails closed (`computed:false`, `blocks`/`floorBlocks`
null) and never throws. This satisfies #44's "boundary may change only with a DECISIONS entry +
conformance coverage"; the boundary freezes at launch.

75. b2-name-canonicalization-boundary: the name-canonicalization predicate enters @ont/consensus as a
pure CONSENSUS_VERDICTS decider — a batched-claim leaf's name bytes are accepted only if already
canonical; non-canonical bytes are REJECTED, never normalized — riding the audited B1 @ont/wire
canonical-name primitive — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier (#59). Its external allowlist is `@ont/wire` only: it rides the B1 normative
`isCanonicalName` primitive (NAME_RE `/^[a-z0-9]{1,32}$/`) — the same authority the wire decoder uses
— so the kernel and wire agree on canonicality by construction, not by a re-stated regex. NO new
consensus law: it lands the already-normative A6 / WIRE_FORMAT §2 reject-don't-normalize rule. Covered
by conformance: `trust-surface.test.ts` (`name-canonicalization.ts` in CONSENSUS_VERDICTS, `@ont/wire`
allowlist), `name-canonicalization.test.ts`, and the A6-neg-01 binding.*

**The rule.** `acceptCanonicalLeafName(nameBytesHex)` → `{ canonical, reason }`: the lowercase-hex leaf
name bytes are decoded and checked against `isCanonicalName`; non-canonical bytes (uppercase,
out-of-charset, empty, or over 32 bytes) REJECT and are NEVER normalized (no lowercasing, trimming, or
substitution — the verdict is canonical-or-not, never a rewritten value). This kills the legacy
normalize-on-ingest behavior. SCOPE: only the A6 reject-don't-normalize half (a6-02); the full leaf
well-formedness (accumulator key == sha256(canonical name), owner-binding == H(ownerPubkey)) is the B3
leaf-format / commitment-match concern (owner-binding construction is candidate-stays, riding C6).
Total / fail-closed: malformed hex or non-canonical content rejects and never throws. This satisfies
#44's "boundary may change only with a DECISIONS entry + conformance coverage"; the boundary freezes
at launch.

76. b2-claim-path-eligibility-boundary: the claim-path-eligibility predicate enters @ont/consensus as
a pure CONSENSUS_VERDICTS decider — a name whose canonical byte length is at or below the launch
short-name threshold T cannot finalize via the cheap-claim path (bond-first only) — riding nothing
external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier (#59). Empty external allowlist: it consumes a canonical byte LENGTH (a
number) + the launch threshold — never the name itself, so it carries no normalization concern
(canonicality is #75). NO new consensus law: it lands the already-ratified F15 / PR-15 short-name
no-cheap-path rule. Covered by conformance: `trust-surface.test.ts` (`claim-path-eligibility.ts` in
CONSENSUS_VERDICTS, empty allowlist), `claim-path-eligibility.test.ts`, and the F15-pos-01 binding.*

**The rule.** `claimPathEligibility(canonicalNameByteLength, thresholdT)` → `{ cheapClaimAllowed,
reason }`: `length <= T` is bond-first only (`cheapClaimAllowed:false`); `length > T` allows a cheap
claim. `T` is a launch-freeze parameter, not a baked-in constant (the conformance tests run at two
thresholds so no value is baked). It is a separate predicate from #75 by design — it takes the
validated canonical byte length, not a name. Total / fail-closed: a non-positive-integer length or
threshold fails closed (no cheap path) and never throws. This satisfies #44's "boundary may change
only with a DECISIONS entry + conformance coverage"; the boundary freezes at launch.

77. b2-post-final-attempt-boundary: the post-final-attempt predicate enters @ont/consensus as a pure
CONSENSUS_VERDICTS decider — a claim OR bond landing at or after a name's finality is refused as an
already-owned attempt with no state effect, the incumbent record byte-unchanged — riding nothing
external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier (#59). Empty external allowlist: it consumes a resolved `final` incumbent +
the attempt kind, with no host I/O. NO new consensus law: it lands the already-ratified B7 (post-final
already-owned), grounded in the state machine (post-final claims are already-owned), #37's in-window
phrasing (a qualifying bond opens an auction only inside the notice window, so a post-final bond opens
none), and first-anchor-wins / PR-5 (ordering/bonds never touch a final name). Covered by conformance:
`trust-surface.test.ts` (`post-final-attempt.ts` in CONSENSUS_VERDICTS, empty allowlist),
`post-final-attempt.test.ts`, and the B7-neg-01 binding.*

**The rule.** `acceptPostFinalAttempt({ incumbent: { status: "final", ownerKey }, attempt: { kind:
"claim" | "bond" } })` → `{ refused, stateEffect, incumbentUnchanged, reason }`: for a valid final
incumbent, ANY attempt (claim or bond) is `refused` with `stateEffect: "none"` (no insertion, no
auction opened, no window reopen/extend, no nullify) and `incumbentUnchanged: true`. This is a
state-shape gate distinct from occupancy #71 — occupancy admits/refuses a fresh INSERTION over a
name's occupancy; this gate is the broader post-final no-effect invariant covering both a claim AND a
bond (the bond half has no other resident home). It does not decide finality itself (the caller
composes notice-window #69 / auction #68 / settlement #65 to reach `final`) and does not model the
auction. Total / fail-closed + closed-shape (the #63–#76 discipline): a non-final incumbent (the gate's
precondition is a final name), a malformed attempt, or any extra field fails closed (`refused:false`,
`stateEffect:"undecidable"`) and never throws — so the gate never silently admits a change and never
overclaims for a non-final name. This satisfies #44's "boundary may change only with a DECISIONS entry
+ conformance coverage"; the boundary freezes at launch.

78. b2-lot-commitment-match-boundary: the lot-commitment-match predicate enters @ont/consensus as a
pure CONSENSUS_VERDICTS decider — a bid's claimed lot commitment is accepted only if it equals the
WIRE §6 recomputation over its (auctionId, name, unlockBlock); a mismatch is refused — riding the
audited B1 @ont/wire computeLotCommitment primitive — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier (#59). External allowlist is `@ont/wire` only: it rides the B1
`computeLotCommitment` primitive (`sha256(lenPrefix("ont-auction-lot") ‖ lenPrefix(text(auctionId)) ‖
lenPrefix(name) ‖ lenPrefix(decimal(unlockBlock)))`) — the same authority the wire encoder uses — and
imports no legacy `@ont/protocol` normalization. NO new consensus law: it lands the already-ratified
B12 (a bid whose recomputed lot commitment mismatches its claimed lot is refused; no parallel lot for
a single name). Covered by conformance: `trust-surface.test.ts` (`lot-commitment-match.ts` in
CONSENSUS_VERDICTS, `@ont/wire` allowlist), `lot-commitment-match.test.ts`, and the B12-neg-01 binding.*

**The rule.** `lotCommitmentMatch({ claimedLotCommitment, auctionId, name, unlockBlock })` →
`{ matches, reason }`: recompute the WIRE §6 lot commitment over `(auctionId, name, unlockBlock)` and
compare to `claimedLotCommitment`; a mismatch refuses (no parallel lot minted). SCOPE: only the
recompute-and-compare check — the auctionId GRAMMAR (`opening-{name}` / `reopen-{name}-after-{r}`,
PR-28) is NOT validated here (`computeLotCommitment` treats auctionId as opaque preimage text per WIRE
§6); broader lot-witness / indexer integration and release-anchor matching (reopen #70 / S9) stay
their own slices. The name preimage must be canonical (the primitive rides the same `isCanonicalName`
as #75). Total / fail-closed + closed-shape (the #63–#77 discipline): a malformed bid (non-hex32
claimed commitment, non-string auctionId/name, non-integer unlockBlock, extra field) rejects, and the
wire primitive — which throws on a non-canonical name / out-of-range unlockBlock — is wrapped so any
throw becomes a fail-closed reject, never an exception. This satisfies #44's "boundary may change
only with a DECISIONS entry + conformance coverage"; the boundary freezes at launch.

79. b2-bond-continuity-break-boundary: the bond-continuity-break predicate enters @ont/consensus as a
pure CONSENSUS_VERDICTS decider — a pre-maturity bond-outpoint spend with no same-tx valid successor
releases the name, regardless of which key signed the spend — riding nothing external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier (#59). Empty external allowlist: it consumes resolved chain facts, with no
host I/O. NO new consensus law: it lands the already-ratified S6 / S7 / B18 / #5 (a broken bond before
maturity releases the name). Covered by conformance: `trust-surface.test.ts`
(`bond-continuity-break.ts` in CONSENSUS_VERDICTS, empty allowlist), `bond-continuity-break.test.ts`,
and the S6-neg-01 binding.*

**The rule.** `bondContinuityBreak({ preMaturity, currentBondOutpointSpent, sameTxValidSuccessorBond })`
→ `{ decided, released, reason }`. Four valid fact combinations are all `decided`: mature spend →
no-release (X8: a mature name imposes no continuity requirement); pre-maturity unspent → no-release;
pre-maturity spent with a same-tx valid successor → no-release (rotated); pre-maturity spent with NO
same-tx valid successor → `released` (continuity broke; the name reopens). `sameTxValidSuccessorBond`
is a consumed resolved engine/B3 fact (full successor output/script validation is outside this slice).

**NO signer / key / authorized input channel (the S6 crux).** Continuity is an ONT rule, not a Bitcoin
timelock: the release is a consequence of an OBSERVED spend, never a key-authorized event. The bond
outpoint is spendable by whoever holds the funding-wallet key, distinct from the owner key (#41), so
there is no owner-signature exemption. The closed shape admits ONLY the three booleans; ANY signer /
funding-key / owner-key / authorized field is rejected (`undecided`), so no key can be consulted to
avert the release. Total / fail-closed + closed-shape (the #63–#78 discipline): a malformed or
extra-field input is `undecided` (fail closed — NOT silently a valid no-break) and never throws. This
satisfies #44's "boundary may change only with a DECISIONS entry + conformance coverage"; the boundary
freezes at launch.

80. b2-transfer-authority-by-state-boundary: the transfer-authority-by-state predicate enters
@ont/consensus as a pure CONSENSUS_VERDICTS decider — a Transfer has authority only over a name in the
`owned` lifecycle state; every non-owned state is non-transferable — riding nothing external —
2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier (#59). Empty external allowlist: it consumes the resolved name lifecycle state,
with no host I/O. NO new consensus law: it lands the already-ratified X11 (a Transfer against any
non-owned state makes no state change; transfer authority requires an owned state). A dedicated pure
predicate rather than an engine binding because the engine's NameRecord.status enum
(pending/immature/mature/invalid/unclaimed) collapses the X11 non-owned battery — live-auction,
nullified, and broken-bond are not distinct record statuses (ChatLunatique-concurred). Covered by
conformance: `trust-surface.test.ts` (`transfer-authority-state.ts` in CONSENSUS_VERDICTS, empty
allowlist), `transfer-authority-state.test.ts`, and the X11-neg-01 binding.*

**The rule.** `transferAuthorityByState({ nameLifecycleState })` → `{ transferable, reason }`:
`transferable` is true ONLY for `"owned"`; every non-owned state — `provisional`, `live-auction`,
`nullified`, `broken-bond`, `nonexistent` — is non-transferable (no state change). It consumes the
RESOLVED `nameLifecycleState` (the caller composes notice-window #69 / auction #68 /
bond-continuity-break #79 / occupancy #71); it does not derive the state, verify the transfer
signature, or model bond continuity. Recovery-pending is deliberately NOT a state here — the X13
transfer-block (engine, #67/PR-34) already owns that case. Object input `{ nameLifecycleState }`
(not a raw string) so the boundary keeps closed-shape discipline. Total / fail-closed + closed-shape
(the #63–#79 discipline): an unknown lifecycle state, a non-object input, or any extra field
(actor/signature/owner-key) is rejected (not transferable) and never throws — so no signer/authority
field can ride the boundary to grant a transfer over a non-owned state. This satisfies #44's "boundary
may change only with a DECISIONS entry + conformance coverage"; the boundary freezes at launch.

81. b2-fee-fact-eligibility-boundary: the fee-fact-eligibility predicate enters @ont/consensus as a
pure CONSENSUS_VERDICTS decider — an anchor contributes a fee fact only once K-deep on the current
canonical chain, valued at its own intrinsic fee; a reorged-before-K anchor contributes nothing —
riding nothing external — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
clean-build-b2-kernel, DK merges). A boundary-manifest addition under #44, riding the
CONSENSUS_VERDICTS tier (#59). Empty external allowlist: it consumes a resolved K-depth fact + the
anchor's own intrinsic fee, with no host I/O. NO new consensus law: it lands the already-ratified F9
(an anchor reorged out before K-depth contributes no fee fact and no name; a re-mined replacement is
gated on its own intrinsic fee, never the orphaned tx's). Covered by conformance:
`trust-surface.test.ts` (`fee-fact-eligibility.ts` in CONSENSUS_VERDICTS, empty allowlist),
`fee-fact-eligibility.test.ts`, and the F9-neg-01 binding.*

**The rule.** `feeFactEligibility({ reachedKDepthOnCanonicalChain, intrinsicFeeSats })` →
`{ contributesFeeFact, feeFactSats, reason }`: `reachedKDepthOnCanonicalChain === false` → no fee
fact (`feeFactSats:null`) — the reorged-out / pre-K anchor contributes nothing; `=== true` → the fee
fact is THIS anchor's OWN `intrinsicFeeSats` (source selection — a re-mined replacement contributes
its own fee, never the orphan's). **#49-independent**: K-depth enters as a RESOLVED boolean — the
predicate never sees K or the raw confirmation depth (the caller composes the #49 K-depth check).
**No orphan / previous / first-seen fee or confirmationDepth / K input channel**: the closed shape
admits ONLY the two fields, so an orphaned tx's fee cannot ride the boundary. `gate-fee.ts`
(`gateFeeValidation`) stays separate and reorg/confirmation-unaware — the g(name) economic gate is
B3, and may reject a lower own fee downstream, but that is not F9's call (existence + which fee only).
Total / fail-closed + closed-shape (the #63–#80 discipline): a malformed, extra-field, non-boolean
K-depth, or non-nonnegative-bigint fee input contributes no fee fact and never throws. This satisfies
#44's "boundary may change only with a DECISIONS entry + conformance coverage"; the boundary freezes
at launch.

82. da-trust-model: the DA trust model, named — ONT separates safety (validity) from liveness
(availability) and never lets the second decide the first. **Acquisition ownership and
contest/availability verdicts** are a pure function of Bitcoin + presented commitment-matching bytes
with no consensus authority slot (value-record *validity* is pure given inputs; *freshness* is
resolver liveness); availability is a bootstrapped, 1-of-N, fail-closed liveness property. **Enforced**
light-client Bitcoin verification is a launch gate for the firewall claim — 2026-06-15

*Status: **Proposed** (writer ClaudeleLunatique, reviewer ChatLunatique; lands on branch
spec-da-trust-model, off main, DK merges). Consolidates and names what the Data-Availability
Agreement §8/§8b already build; **NO new consensus mechanism** — it pins invariants that already
follow from the layer model (adapters never decide), §215 (bonded attestation rejected), and
da-windows #49 / `DA_WINDOWS` S6 (finalize-once). The one forward commitment is the SPV-before-launch
gate (DK ruling, event b90b66bf). Normative invariants: DA agreement §8c (candidate tier). Rationale
+ threat-model posture + bootstrap commitment + reviewer checklist:
`../research/ONT_DECENTRALIZATION_AND_DISCOVERY.md` "The trust model: safety vs liveness".
ChatLunatique adversarial pass (event 7932d882) confirmed NO new consensus mechanism after three
precision-narrowings, applied here: value-records scoped out of DA consensus (validity pure given
inputs, freshness = resolver liveness); "resolvers never decide" scoped to consensus/kernel verifiers
(product/UX paths consume resolvers for liveness only — `apps/claim` owner→names wording is now
requalified as convenience, not authority); zero-theft scoped post-gate (a structure-only client is exposed until
`verifyProofBundleAgainstBitcoin` is enforced).*

**The four invariants.** (1) **No consensus verifier consumes resolver output** — no `@ont/consensus`
predicate or availability verdict takes resolver/indexer output as a deciding input; a lying source is
caught by verification, a missing one is fail-closed. (Product/UX paths do consume resolvers for
liveness/display — value-history fanout, the owner→names convenience endpoint — never as authority.)
(2) **Checkpoints never enter consensus** — an availability/completeness checkpoint (gossip or L1) is
a falsifiable reputation signal only; treating it as proof of availability is the rejected
bonded-attestation shape (§215). (3) **Finalize-once** — once a *Bitcoin-verified, complete,
verifier-accepted* availability verdict settles (`h + W + C`, #49) it is never revised; a name proven
available in-window stays owned even if content later goes dark, and a *continuing* availability
requirement is rejected because it would let later censorship strip a settled name (liveness failure →
theft). The qualifier prevents finalize-once locking a verdict reached on an incomplete/fabricated
witness. (4) **Enforced verification + launch gate** — the verifier primitive exists
(`verifyProofBundleAgainstBitcoin`, PoW/Merkle via `bitcoinInclusion`) but is not enforced on launch
clients (CLI/wallet call `verifyProofBundle`, the deprecated structural alias); a structure-only
client does not catch a fabricated anchor, and PoW/Merkle alone proves inclusion in *a* valid-work
header, not the canonical best chain. Pre-gate claim: resolvers/publishers cannot forge a valid
*consensus witness* — not that a structure-only client has zero theft exposure. DK ruling: clients
MUST require `bitcoinInclusion` and run `verifyProofBundleAgainstBitcoin` against an independent
canonical header source on every relevant proof path — the launch gate for the firewall claim.

**Posture (the reviewer-facing line).** During bootstrap the operator holds temporary
censorship/liveness power (deny by withholding) but zero theft power (cannot forge ownership — bad
bytes fail the seal; cannot strip a settled name — finalize-once); that censorship power erodes as
independent archives appear. (Zero-theft is *post-gate*: it holds for a client running the enforced
`verifyProofBundleAgainstBitcoin` path; a structure-only client is exposed to a fabricated anchor
until that gate is wired — which is why invariant 4 is a launch gate.) Safety is unconditional and never centralized; only liveness is
centralized, temporarily, and provably decays — precisely early Bitcoin's posture. Design-space: ONT
is at all-data-on-L1 for contested names and honest-mirror-market for the long tail, with DA sampling
+ erasure coding (§7 option C) named as the known ceiling. The honest claim is that long-tail
availability is a bootstrapped liveness property that decentralizes over time, not a cryptographic
guarantee.

83. batch-completeness: promote `RootAnchor.batchSize` from committed-but-informational to
**kernel-enforced completeness** — a batch counts only when the complete N-leaf bundle is presentable
and reconstructs the anchored root by `h+W+C`; any missing leaf fails the whole batch closed — 2026-06-15

*Status: **PROPOSED — NEW consensus law, NOT agent-decided; DK ratifies O2 vs O3.** Writer
ClaudeleLunatique; awaits ChatLunatique adversarial pass; lands on branch spec-batch-completeness
(stacked on spec-da-trust-model, off main). Decision paper:
`../research/DA_BATCH_COMPLETENESS.md`. Unlike #82 (consolidation), this DOES add a kernel gating
requirement, so it is a genuine ratification gate. No wire change (`batchSize` already committed,
WIRE §4.4); the change is a conjunct of `includable`. NO implementation until ratified (tests-first).*

**The question.** `batchSize` is committed on-chain but the kernel `includable` predicate does not
require the served-bytes witness to demonstrate all N leaves. Promote it to a gating requirement?

**Recommendation: O2 (kernel-enforced whole-batch completeness).** `includable(anchor, evidence, W,
C)` requires the witness to reconstruct the anchored root over all N committed leaves (or prove
non-membership for absent slots) by `h+W+C`; a missing leaf fails the whole batch closed. Rationale:
matches §6c (batch-level exclusion already); makes the committed count meaningful (auditable
completeness via the da-trust-model mirror market; bond-free long-tail contention discovery);
withholding is self-harm + detectable; no cheap hidden-collision grief (#37/#69 guard). Cost: an
honest producer must keep all N retrievable through `h+W+C` or lose the batch — mitigated by
content-addressed mirroring. Alternative O3 (per-leaf) is gentler but loses the completeness
guarantee. **Convergence:** O2 needs the D-CV projection to carry per-leaf owner identity — exactly
ChatLunatique's open D-CV blocker — so batch-completeness + the D-CV fix land together.

**Ratification gate (6-test matrix, each → a conformance vector):** (1) full-N required (N−1 → not
includable); (2) hidden-claim no-effect (#37/#69); (3) mirror-lies-fail (bytes must reconstruct the
root); (4) projection-carries-owner (distinct-owner collision ≠ same-owner duplicate); (5)
copied-anchor grief-not-steal *(inherited #82)*; (6) finalize-once *(inherited #82)*.

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

*(Staleness pass 2026-06-10: labels added; answered questions are kept for the
record and point at what answered them.)*

1. Value payload definitions — **[PARTIALLY ANSWERED]** *initial standardized
destination types are Decision #23 and value records are live on every surface;
the BIP-321/BIP-353 compatibility framing now lives in the design brief's
comparison table. Still open: the exact frozen payload byte-formats per type.*

Need to define the exact payload format for:
- `0x01` bitcoin payment target
- `0x02` HTTPS target
- `0xff` raw or app-defined usage expectations, if any

For `0x01`, reviewer feedback should explicitly consider compatibility and trade-offs around existing Bitcoin payment-target standards and proposals such as:
- `BIP321` URI scheme guidance
- `BIP353` DNS payment instructions

2. Destination transport and discovery — **[PARTIALLY ANSWERED]** *the
resolver API surface is Decision #21 and resolvers serve value records live;
batch-data transport direction is Decision #39. Still open: resolver/publisher
discovery (config-seeded today; registry-free scan designed, not built — see
STATUS.md).*

Need to define:
- whether the core protocol mandates any transport for off-chain destination records
- whether there is a recommended default transport profile
- how clients discover and fetch current destination records

3. ONT-native resolver profile — **[OPEN]**

Need to define:
- the exact bootstrap format for default/configured resolver endpoints
- whether a simple `GET /peers` style gossip endpoint is worth standardizing
- whether optional resolver identity keys need a signed metadata profile
- how clients should present resolver freshness and signed-record conflicts

4. Reviewer-facing modeling and risk disclosure — **[ANSWERED]** *this is now
`docs/DESIGN.md` (ex-ONT_DESIGN_BRIEF — footprint numbers, trade-off tables, feedback
questions). One bullet below aged into being false and is corrected inline.*

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
- the owner key is distinct from the funding wallet key. *(Correction
  2026-06-10: the original bullet here claimed v1 has no protocol recovery
  path for a lost owner key — that is no longer true. Owner-armed recovery is
  designed and prototyped on signet, and recovery posture is Decision #40; see
  `research/OWNER_KEY_RECOVERY.md`.)*

5. Concrete wire format — **[ANSWERED]** *the v1 event set is Decision #26,
wire-format direction is Decision #28, the formats live in
`@ont/protocol/src/wire.ts`, run on signet, and the size envelope is pinned by
`wire-size.test.ts` (≤171 bytes, recover-owner).*

Need to specify exact OP_RETURN payload formats for:
- AUCTION_BID
- TRANSFER

6. Canonical indexing and tie-breaking rules — **[PARTIALLY ANSWERED]**
*same-block auction tie-break is Decision #25; cheap-rail merge is
first-anchor-wins with deterministic priority, live since 2026-06-09;
duplicate-bid well-formedness is enforced by the proof bundle. Still open:
reorg handling, which is the W/C/K window design (see #39 and STATUS.md's DA
Known-incomplete entry).*

Need to define:
- reorg handling
- duplicate bid handling
- invalidation behavior for malformed sequences

7. Wallet and CLI safety rules — **[OPEN]**

Need to define UX and implementation safeguards to prevent users from accidentally breaking bond continuity before maturity.

Need to define clearer operator and wallet guidance around stale or failed bids:
- a failed bid package should have an obvious recovery path for funds
- the docs should explain when a bid exposes demand for a name before the bidder wins it
- pre-launch review should revisit auction windows, soft-close extensions, and stale-state behavior
