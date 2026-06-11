# Contest-window philosophy — design note

> **SUPERSEDED (2026-06-11):** completed analysis — its conclusions are decisions
> in [`docs/core/DECISIONS.md`](../../core/DECISIONS.md) (notice/contest-window entries).
> Kept for provenance per doc-canon (#45).

Status: design note, not frozen. Establishes *how to think about* the
notice/contest window and the bond-forfeiture edges around a contested
name. The concrete parameters (window length, schedule shape, any slashing)
are neutrality- and economics-sensitive and need a human decision before
launch. Nothing here changes a consensus path; the live default stays short
for testing.

Companion to the one-path model in `ONT.md` (claim → notice window →
escalate-to-auction-only-if-contested) and to
`ONT_MULTI_PUBLISHER_CONVERGENCE.md`, which builds the convergence layer the
notice window rides on.

## The window's job, and why the current number is a placeholder

The notice window is the interval after a cheap claim anchors during which
anyone can contest the same name and force it to a bonded second-price
auction. It is the *entire* social-fairness mechanism of the one-path
model: it is what turns "first to anchor" into "first to anchor *that nobody
objected to in time*."

`DEFAULT_NOTICE_WINDOW_BLOCKS = 6` in
`packages/core/src/research/batch-rail.ts` is a test-fast placeholder —
~1 hour on Bitcoin — chosen so the prototype iterates in seconds. Nobody
decided that one hour is the right amount of time for the world to notice
and contest a claim on a global brand. It is the outlier in the tree: the
launch auction policy already leans long (a ~1-week bidding window, a ~1-year
settlement lock). Picking the *real* window is the point of this note, and
the right time to pick it is now, before it freezes.

## The threat model: launch capture

A cheap claim costs a flat ₿1,000 (~$1) gate, paid to miners. So the top
100,000 global brands cost ≈ ₿100,000,000 (~$100k) to blanket-claim — pocket
change for a motivated actor. At launch this is the sharp risk: a
well-capitalized squatter quietly claims tens of thousands of names before
the ecosystem is watching, before brands know ONT exists, before would-be
contesters have pulled bitcoin out of cold storage and stood up monitoring.
If those claims finalize uncontested, the namespace is captured on day one.

The window is the defense, because **it is the only neutral defense
available.** The gate is flat by design, and you cannot price-discriminate
against "the same actor claiming 100k names" without identity — which means
a trusted authority, which kills neutrality. Escalating per-actor pricing,
trademark priority, Sybil-resistant rate limits — all require knowing who
someone is, all off the table. That leaves *time*: a long-enough window so
that capture attempts can be seen and contested. The window is load-bearing
in a way it would not be if there were other knobs.

## Principle 1 — adaptive beats predictive (the right instinct)

A window keyed purely on a calendar bakes in a guess: "the ecosystem wakes
up in ~N years." If adoption is faster or slower, the guess is wrong. The
appealing alternative is to peg the window to a *revealed* signal of
liveness — shrink it as the market demonstrably becomes able to defend
itself (e.g. as total value bonded in live contests rises), because that is
direct evidence that bitcoiners are awake, capitalized, and ready to
contest. This is a better instinct than a fixed schedule, and the note keeps
it. But the obvious implementation is unsafe, for the reasons below.

## Principle 2 — at launch, the whale *is* the market

The threat actor is, by assumption, a whale with ₿100M+ (~$100k+) to spend.
Any endogenous "is the market awake?" signal is therefore a signal that same
whale can manufacture:

- **Value-of-bonds signal (depth).** Shrink the window when bonded value is
  high, and the squatter bonds a large pile of *their own* bitcoin to push
  the metric over the shrink threshold, claims their 100k names into the
  now-short window, lets them finalize, and withdraws the bonds. Bonds are
  returnable and never escrowed away from their owner — they sit in a plain
  owner-controlled UTXO the whole time (see "The bond is ONT-enforced"
  below) — so the spoof costs only carry/opportunity cost on capital they
  already have. A height schedule the attacker *cannot move*; a bonded-value
  schedule they can *buy*.
- **Distinct-bidders signal (breadth).** Without identity, "distinct
  bidders" is "distinct keys/UTXOs," which one actor splits into N at will.
  Sybil-fakeable by the same adversary.

Two further problems even setting manipulation aside:

- **Global signal, local contestability.** Total-value-bonded is one number
  for the whole system, but contestability is per-name. A whale war over
  premium three-letter names would shrink the window for *every* name —
  including the long-tail brand with no defenders watching, which needs the
  time most. A global signal can strip protection from exactly the names
  that are most exposed.
- **Reflexivity.** Bonds release (losing bids, batch-rail releases), so a
  total-value-bonded metric is non-monotone. The contest window for a name
  claimed today would breathe in and out with unrelated bond churn
  elsewhere.

The general statement: **at launch a single actor can be the whole market,
so any market-derived "readiness" signal is an input the adversary
controls.** The only inputs a launch whale cannot move are exogenous —
block height (time), and PoW/difficulty (also time-ish). Time is the one
honest clock at launch.

## Principle 3 — make the manipulable direction the safe direction

This rescues the adaptive instinct without handing the adversary a lever.
Use a height-keyed, decaying schedule as the **floor** — the
manipulation-proof minimum window, which the attacker cannot shorten because
they cannot move block height. *If* an adaptive signal is used at all, allow
it only to **extend** the window above the floor, never to shrink below it:

```
window(claim) = max( heightFloor(anchorHeight), adaptiveExtension(...) )
```

Now a whale spoofing the signal can only ever make windows *longer* — i.e.
accidentally protect their victims more. The asymmetry does all the work:
the gameable direction is the safe one.

And once framed that way, the adaptive term may not be needed in consensus
at all. The per-name liveness signal that actually matters already exists —
**a contest being filed** — and it already does the right thing: it escalates
that name to the bonded auction. The window's only job is to be long enough,
early enough, that a contest *can* land. That is a time question, answered
by the floor. So the market signal (total value bonded, distinct active
bidders, etc.) is best built as a **monitoring dashboard for the humans** —
something you watch to judge whether the schedule guess was right — not a
quantity consensus reads and reacts to. Keep the judgment out-of-band, where
the whale cannot grind it.

This also matches the project's "is-2-or-3-competing-whales good enough?"
bar: that is a sane success criterion for a new project, but it is the right
way to *choose the launch length and floor before freezing* (humans watching
the chain), not a number the protocol measures and feeds back into itself.

## Principle 4 — keep the schedule frozen, monotonic, and height-keyed

A time-varying parameter is not a neutrality problem: Bitcoin's emission
schedule varies with height and is perfectly neutral, because it is
mechanical, monotonic, and keyed only on height — not identity, not
discretion. A decaying contest window is fine *iff* it is the same kind of
object: hardcoded at genesis, monotonic, keyed on the claim's anchor height,
with no governance knob. A *governable* window ("the foundation may adjust
it") is exactly the discretionary capture surface the whole project is built
to avoid. A newcomer auditing the system should see one formula, not a
committee.

## Illustrative shape (numbers to model, not gospel)

- **Floor schedule, height-keyed:** start long at genesis — on the order of
  ~30 days (≈ 4,320 blocks) — decaying over roughly one halving epoch (~4
  years, ≈ 210,000 blocks) to a steady-state floor.
- **Steady-state floor:** still meaningfully long — on the order of ~1–2
  weeks (≈ 1,008–2,016 blocks). It must not collapse toward an hour, because
  a patient attacker can simply *wait* for the short-window regime and claim
  into it; the floor, not just the launch value, is doing defensive work.
- **Adaptive term:** if present, extend-only, capped. Likely unnecessary in
  consensus v1 — prefer the out-of-band dashboard.
- **Test/regtest:** keep the short placeholder (6) for fast iteration.

The one decision that gates the schedule's existence: *do you believe launch
needs months of window while steady-state wants days-to-weeks?* If yes, the
decay earns its complexity (long launch protection without permanently
saddling the system with slow finality). If a single fixed ~2-week window
would do, skip the schedule entirely and just raise the constant — simpler
and more auditable.

## Do not couple the contest window to the DA confirm-depth

The notice window and `createDefaultDaWindows()`'s confirm-depth `K` both
happen to be 6 today, which conflates two unrelated things. `K` is
reorg/data-availability safety — a consensus-correctness number. The notice
window is social contestability — a give-people-time number. Lengthening the
second must not drag the first along; you do not want month-long DA windows.
Flag this loudly before anyone "simplifies" the two sixes into one constant.

## What happens when a contest winner walks (bond forfeiture + re-entry)

This is the other half of contestability: once a contested name is won, the
bond is what keeps the winner honest. The mechanism is already built in
`@ont/consensus`, and it answers the "what if they pull the bond?" question
more precisely than the question assumes.

**The bond is ONT-enforced, not Bitcoin-script-enforced.** This is the
foundational fact and everything below depends on it. The bond is *not* an
HTLC, a CLTV/CSV timelock, a covenant, or any Bitcoin-native locking
primitive. It is a plain payment output that ONT *designates* as a bond and
tracks. The only script types ONT's Bitcoin layer recognizes are
`op_return`, `payment`, and `unknown` (`packages/bitcoin/src/index.ts`), and
a bond is required to be a `payment` output (`engine.ts`,
`applyAuctionBid` / the successor-bond checks) — a normal key-path output the
owner's own key controls. There is no CLTV/CSV/nLockTime/nSequence/HTLC/
covenant anywhere in the bond path. The division of labor is:

- **Bitcoin** supplies the UTXO and the ordering. It has no idea the coin is
  a "bond"; it will happily confirm the owner spending it one block after the
  auction settles.
- **ONT** assigns *meaning* to that spend. Every validator/indexer watching
  the chain applies the rule: if a designated bond outpoint is spent before
  its maturity/release height without rolling a valid successor bond forward,
  the name becomes `invalid`. The "lock" is a *consequence ONT attaches to an
  on-chain spend*, not a constraint Bitcoin imposes on it.

This is on-model — `ONT.md`'s "Bitcoin supplies the ordering and the final
settlement; ONT adds no new blockchain and no new token." The bond is skin in
the game by protocol convention, observed at the indexer layer, not money a
key cannot move. Two consequences ripple through this whole note:

1. **The bonded coins are never escrowed away from the owner.** They sit in
   a plain UTXO the owner's key controls the entire time. This is precisely
   why a "total value bonded" liveness signal is spoofable (Principle 2): a
   whale's bonded capital is never out of the whale's hands, so posting it
   costs only opportunity cost, and the height floor must remain the
   manipulation-proof backbone.
2. **There is no on-chain slashing, and you cannot add it with an ONT rule
   alone** (see the deterrence tension below).

**Ownership is a live bond, for a while.** A `NameRecord`
(`packages/consensus/src/engine.ts`) carries a live bond outpoint
(`currentBondTxid/Vout`, `currentBondValueSats ≥ requiredBondSats`) plus a
`claimHeight` and `maturityHeight`. For an auctioned name the settlement is
`winner_bid_bond_becomes_name_bond` (`proof-bundle.ts`): the *winning bid
bond becomes the name bond*, locked until `acquisitionBondReleaseHeight`
(driven by `settlementLockBlocks`, default 52,560 ≈ ~1 year in
`auction-policy.ts`). This is exactly `ONT.md`'s "the winner's bond stays
locked for a while as a commitment, then is returned."

**Pulling the bond early forfeits the name.** `collectSpentImmatureBonds` +
`invalidateBrokenBondContinuity` (`engine.ts`): if the current bond is spent
*before* its release/maturity height without producing a valid successor
bond at the designated vout (a payment output ≥ `requiredBondSats`), the
name flips to `status: "invalid"`. So:

- **Spend the bond during the lock → the name is forfeited** (status
  `invalid`). The walker keeps their bitcoin but loses the name. This is the
  anti-walk-away penalty.
- **Spend it after the release height → legitimate.** The bond was a
  *time-boxed commitment, not a perpetual stake.* Reclaiming a released bond
  is the designed, normal end state; the holder keeps the name. (`transfer`
  and `recovery` move ownership by rolling the bond forward — spending the
  current bond and creating a successor — so the bond stays referenceable
  for as long as the holder wants ongoing transferability.)

So the question's premise — "remove the bond → lose the name" — is only true
*during the commitment window.* That window's length is itself a knob worth
setting deliberately (a year is long; it should be the same kind of
considered choice as the contest window).

**Where a forfeited name should go.** Recommendation, consistent with the
one-path model and neutrality:

1. **Back to unclaimed — re-acquirable by anyone via the same one path.** A
   forfeited name re-enters as an ordinary open name: next cheap claim,
   notice window, escalate-to-auction-only-if-contested. No special status.
2. **No automatic contest.** Forfeiture is not evidence that a rival is
   waiting. Auto-opening an auction on an empty field is wrong; let the
   normal window decide if anyone actually wants it.
3. **No runner-up preference — explicitly.** The second-highest bidder from
   the original auction should *not* get an option to take the name. Reasons:
   - **Stale valuation.** Their losing bid reflected willingness-to-pay at
     auction time, possibly a year ago. Forcing the name onto them at an old
     number is arbitrary and unfair.
   - **Retained state + privilege.** It requires consensus to remember the
     entire losing-bidder ladder for the lock duration and grant a
     time-limited option — exactly the kind of retained state and
     discretionary privilege the minimal-auditable-core posture avoids.
   - **Collusion/grief vector.** Winner bids high to scare off rivals, then
     walks during the lock to hand the name to a colluding "runner-up" at a
     low price. Preference manufactures these games. Re-opening to everyone
     at *current* valuations does not.
   - The prior auction already priced the runner-up's loss for that moment;
     a forfeit is a new event deserving a fresh, open contest, not a
     resurrected bid ladder.

**Two open tensions to decide before freeze:**

- **Returnable bond vs. deterrence.** `ONT.md` promises bonds are
  *returnable* ("not destroyed money"), and the code returns them after the
  lock. That means a strategic forfeit costs the name + fees + opportunity
  cost, but *not* the bond principal. Is that a strong enough deterrent
  against win-to-deny griefing (win an auction, sit on the name through the
  lock, walk, let it re-open, re-win)? If not, the lever is partial bond
  *slashing* on early withdrawal — but two things make that a real decision,
  not a silent one. First, it directly contradicts the "returnable" promise.
  Second, and more concretely: because the bond is a plain `payment` output
  the owner's key controls (see "The bond is ONT-enforced" above), slashing
  is **not** an ONT-rule change — the protocol cannot make Bitcoin claw back
  or burn a coin it does not constrain. Real slashing requires a *script-level
  construction* committed at bond creation: a covenant, or a pre-signed
  penalty transaction (e.g. the bond paid into a 2-of-2 or a script whose only
  early-spend path routes value to an unspendable/penalty output). That is a
  genuine protocol change with its own custody, liveness, and key-management
  costs — a different class of change than tuning a window or a lock length.
- **Denial loops.** Because the bond is returnable, an attacker can cycle
  win → hold → walk → re-win to keep a name in limbo. The deterrent is the
  per-cycle cost (fees, locked-capital opportunity cost, re-running the
  gauntlet) and the fact that any cycle re-opens the name to honest
  contesters. Worth modeling whether that is sufficient or whether the
  settlement-lock length needs to make each cycle expensive enough.

## Open questions for a human decision

1. Launch window length and steady-state floor (the two numbers above).
2. Schedule existence: decaying floor, or a single fixed long window?
3. Whether any adaptive (extend-only) term enters consensus, or stays a
   dashboard.
4. Settlement-lock length for auctioned names (currently ~1 year).
5. Returnable bond vs. partial slashing on early withdrawal (note: slashing
   is a script-level change — covenant or pre-signed penalty tx — not an ONT
   rule, because the bond is a plain owner-controlled `payment` output).
6. Confirm the contest window stays decoupled from the DA confirm-depth `K`.
