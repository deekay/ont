# ONT Open Analysis Areas — 2026-06-09

Context: a reassessment of the May 26 – Jun 9 dev-channel feedback (especially
Moneyball's eleven questions) against the post-PR#12–15 repo state and
Decisions #37–41. The decisions answered the hardest objections; these are the
areas the questions exposed that still lack a written analysis or design.
Ranked by value.

## 1. Nullification-attrition game (post-#37 grief model) — MODELED (2026-06-09)

Decision #37 closed the dust-cost blockspace attack but left a dust-cost
**denial** attack: `₿1,000`/round to collide a cheap claim so it nullifies and
the victim's notice window restarts. Money-symmetric per round,
outcome-asymmetric (the attacker needs only continued nullification; the
victim needs one full uncollided window).

**Now modeled in `ONT_NULLIFICATION_ATTRITION_MODEL.md`.** Headline results:
the bond exit is cheaper than the attack at every window phase (denier sunk
`₿4k`/name-yr at launch, `₿52k` at steady state, vs `₿2,500`/yr carry on the
returnable bond), so the rational game is one collision → bond → over;
the residual exposure is capital *access*, exactly the asymmetry #43 accepts.
Re-claim cooldown rejected (subsidizes the attacker); per-name escalating
gate with decay deferred to external review; recommended v1 posture is no
new mechanism + the `collided` UX + pricing the bond floor as a defense
price when parameters freeze.

## 2. Defense affordability (the ₿50,000 floor's two jobs) — RESOLVED (Decision #43, 2026-06-09)

The bond floor cannot simultaneously be low enough for a poor claimant to
defend with and high enough to deter a wealthy attacker — `₿50,000` is ~$50,
returnable, so a whale's marginal cost to contest is carry plus fees, while
the same lock can be prohibitive for the claimant it's aimed at. Deterrence
must come from auction dynamics; defense affordability has to come from
somewhere else, and that somewhere is currently unbuilt.

**Decided (Decision #43): the asymmetry is accepted and documented honestly —
sponsorship/proxy-bonding tooling is rejected outright, not deferred.** The
concept fails on its own terms: sponsors have no protocol incentive, nobody
can promise to out-escalate a genuine bidder (and shouldn't — an escalated
auction is the mechanism working), and a winning sponsor bond is a year-locked
loan backing someone else's name, i.e. a credit relationship that belongs
outside the protocol. Third-party bonding stays permissionless (bonds are
bearer BTC); the floor and related parameters remain placeholders that may be
re-picked before launch freeze. Remaining analysis work folds into area 1:
the attrition model should report what parameter choices do to the asymmetry,
since parameters are the one lever left.

## 3. Recovery follow-through (Decision #40's two open pieces)

#40 makes recovery opt-in with a delegable, non-custodial, **abort-only**
veto watcher — which answers the liveness objection cleanly. Undesigned:

- the abort-only credential construction itself (a watcher that can cancel a
  recovery but can never initiate or redirect one);
- **veto-grief economics**: a compromised recovery set can force the owner to
  pay for repeated on-chain vetoes. Model cost-per-attempt vs cost-per-veto,
  and spell out the escape path (rotate owner key / disarm recovery) so a
  compromised recovery set has a bounded total cost.

## 4. Resolver spec promotion: policy codes + freshness semantics

Two conventions exist only as workspace guides and channel answers, not repo
spec:

- a resolver policy/`/info` convention with explicit rejection codes that
  distinguish **protocol-invalid** (bad signature, stale sequence, wrong
  ownershipRef) from **policy-declined** (valid record this resolver won't
  store) — wallets must present these differently;
- the **freshness problem**: a resolver can serve a stale but validly signed
  value record. Multi-resolver comparison is the v1 mitigation, but nothing
  specifies what client behavior is when resolvers disagree, or what a
  "current head" assertion even means across resolvers.

## 5. Archival DA economics (the one unfunded standing obligation)

The design's standing-obligation answers are now good — ownership has no
keepalive, recovery liveness is opt-in, value-record hosting is resolver
policy, claim gates are sunk not rented. The exception: **someone must retain
and serve historical batch data indefinitely** for late-joining full
verifiers, and nobody is paid to. Fail-closed rules protect anchor-time, not
year-ten replay; content-addressed bundles (#39) make mirroring *possible*
but not *incentivized*. At `1B` names this is TB-scale. Needed: a research
note on who stores history, what subsidizes it (archival resolvers, anchored
snapshots/checkpoints, owner-retained proofs as the floor), and what a late
verifier does if a historical batch is unretrievable everywhere.

## 6. External-review ask: marker-into-anchor — CONFIRMED as a first-class ask (DK, 2026-06-09)

Already flagged in the Jun 9 implementation pass; seconded here. The
AvailabilityMarker / W-C-K fail-closed enforcement is the largest spec↔code
gap, and folding the marker into the anchor would remove an entire on-chain
message type before freeze. Put it to the Bitcoin-dev reviewers as a
first-class question alongside the existing DA ask.

## Already corrected as part of this pass

- `ONT_CONTEST_GRIEF_COST_MODEL.md` rewritten post-#37 (blockspace tables
  reinterpreted as bonded-contest rates; mass-nullification added).
- `ONT_ADVERSARIAL_RISK_RANKING.md` §2 updated (mitigation adopted as #37;
  attack reshaped to denial).
- `ONT_WINDOW_SCHEDULE.md` state table: `contested` now means bonded;
  `collided` (no bond → nullifies) added.

The 20-year blockspace forecast discussed in the dev channel (2026-06-01)
predates #37 and should be re-derived with the bonded-contest substitution if
it's ever published beyond the channel.
