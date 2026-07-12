# Epoch-Aligned Notice Window — decision-candidate (epoch-notice, proposed #102)

> **Status: DECISION-CANDIDATE / design-of-record. NOT ratified, changes no code
> and no law today.** Provoked by DK's 2026-07-12 riff ("a weekly checkpoint …
> had to be in before that checkpoint or it falls to the next week"). For DK's
> consideration; if pursued, needs DK ratification → then a build spec for CL.
> This is a **consensus-law** proposal — it modifies the acquisition state
> machine's notice/contest window — so it earns full scrutiny before adoption.
> Author: ClaudeleLunatique. It proposes editing a `candidate`-normativity doc
> (`docs/spec/ONT_ACQUISITION_STATE_MACHINE.md`), so nothing becomes law until it
> survives that doc's normative hardening.

## §1 The proposal in one line

Replace the **rolling per-name** notice/contest window (each claim's clock runs
`anchorHeight + W_notice`, independent of every other claim) with an
**epoch-aligned** one: contention resolves in discrete waves at fixed block-height
boundaries — a **batch auction** for contests instead of a continuous one — while
**preserving a per-claim minimum-notice floor** so there is no fairness cliff.

## §2 Current mechanism (grounded)

From `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` (§Public Notice, §Contested Auction)
and `docs/spec/AUCTION.md` (§"Distinguish Two Windows"):

- An anchored claim is **provisional**. It finalizes only after a **notice/contest
  window**, evaluated per-name at `currentHeight ≥ anchorHeight + W_notice`:
  - exactly one cheap claim, no qualifying bond → **finalizes** through the accumulator;
  - two or more cheap claims, no bond → **nullified** (resolves to no owner, reopens);
  - a **qualifying bond** (against a claim, or *bond-first*) → **escalates** to the L1 bonded auction.
- Outcomes are **deadline-derived, not order-derived** (`front-running-nullify` #37):
  front-running a cheap claim buys nothing; taking a contested name requires the
  largest returnable bond, identical cost for a miner or anyone.
- There are **two distinct windows** (AUCTION.md is explicit): the **notice/contest
  window** above, and a separate **auction bidding window** (placeholder `1,008`
  blocks ≈ 7 days) that already has its own **soft-close** anti-sniping (bid in the
  final `144` blocks extends close to bid-block + `144`; extend-only).
- Window values are **launch-frozen placeholders**: notice window "target weeks"
  (test 6 blocks); the launch-era recommendation is a **long** notice window
  (start ~90 days) because "the launch threat is *nobody noticed the claim*."

**The gap this targets:** with a rolling window, a name claimed at 3am ends its
notice window at some arbitrary later height. A contender must watch **continuously**
to catch it. Attention is fragmented across a continuous stream of independent
deadlines — the opposite of what "nobody noticed the claim" needs.

## §3 The change

**Epoch-align the notice/contest window resolution.** Define an **epoch** as a fixed
run of blocks by **height** (not wall-clock), e.g. aligned to Bitcoin's own
**2016-block (~2-week) difficulty epoch**, or a chosen `E` (a ~1008-block "week").
Epoch boundaries are heights `launchHeight + k·E`.

**Resolution rule (the load-bearing part):** a claim's contest resolves at the
**first epoch boundary at or after `anchorHeight + W_min`**, where `W_min` is a
per-claim **minimum-notice floor**. At that boundary, all claims whose contest
matures there resolve **together** (finalize / nullify / escalate), as one batch.

- If escalated, the **auction bidding window runs from that boundary** using its
  existing soft-close mechanism — **unchanged**. (The auction already solves sniping
  with soft-close; epoch-aligning *it too* is a separable, probably-unnecessary
  sub-decision — see §6.)
- `W_min` decouples "how long you're guaranteed to be contestable" from "which
  boundary settles you." Total notice length then floats between `W_min` and
  `W_min + E` — which is fine, because a notice window is a **floor** guarantee, not
  an exact duration.

## §4 Why (benefits)

- **Synchronizes contention → thicker contest markets.** Everyone knows the moment
  (the next boundary). All contests for the wave land together → more contenders
  present at once → better price discovery, much harder to snipe a name in a quiet
  window. This directly attacks the launch open question AUCTION.md/one-pager flag:
  *"is a long window enough against a day-one sweep, or do we need a decaying gate?"*
- **Reinforces deadline-not-order (#37).** Within an epoch, ordering matters even
  less than today — the boundary is a single uniform deadline for the whole wave.
- **One cadence with the state/DA checkpoint.** If the resolver network emits a
  periodic verified state snapshot (the gossip/checkpoint direction under discussion
  2026-07-12), making finalization a property of *that same boundary* is elegant:
  one clock for "state of the world as of epoch N" and "names final as of epoch N."
- **Predictable for humans, watchtowers, and recruiting.** AUCTION.md wants the
  notice window to be "an active recruiting period"; a known weekly cadence is far
  easier to publicize and watch than a continuous stream of per-name deadlines.

## §5 The fairness cliff — and the fix (do not skip)

The **naive** version — DK's literal phrasing, "in before the checkpoint or it falls
to next week" — is **broken**, and this is the crux:

- A claim landing **one block before** a boundary would get almost **zero** notice
  before it resolves; a claim **one block after** waits a whole epoch. → (a) unfair to
  contenders (a name could be claimed and finalized with near-zero public notice),
  and (b) it **relocates the timing game to the boundary** — everyone races to land
  right before/after the cutoff, a mempool spike at the edge, reintroducing exactly
  the ordering game batching was meant to kill.

**The fix is the `W_min` floor in §3:** resolve at the first boundary **≥
`anchorHeight + W_min`**. Now every claim is guaranteed at least `W_min` blocks of
contestability *and* settlement still batches to boundaries. A claim right before a
boundary simply rolls to the **next** one (it doesn't get a near-zero window). This
is a standard **batch auction with a minimum reveal period**, and it is the only
variant worth adopting.

## §6 Scope and interactions (consensus-law surface)

- **Notice/contest window only.** The **auction bidding window keeps its soft-close**
  design. Forcing the auction onto epoch boundaries could fight soft-close; it is a
  separable sub-decision and likely unnecessary (soft-close already defeats sniping
  there). Flagged, not proposed.
- **All three branches** (finalize / nullify / escalate) resolve at the boundary —
  the batch is the set of claims maturing at that height.
- **New launch-frozen parameters:** epoch length `E` and floor `W_min`. Both are
  Bitcoin-height arithmetic — **no new trusted input** (the kernel already reads
  block height; a boundary is just `height % E`), so the audited-core cost is small.
- **MEV / RISKS.md R16 re-analysis needed.** Boundary-batching should *strengthen*
  the order-independence story, but the **edge-of-boundary mempool spike** is a new
  consideration to model (fee competition to land in-epoch). Must be checked against
  the §D3 MEV analysis before ratifying.
- **DA windows (#47 `W`/`C`/`K`) are separate** and unchanged (anchor-keyed
  fail-closed deadline). They *could* conceptually share the epoch cadence, but that
  is out of scope here.

## §7 Honest scope / non-goals

- **Improves:** contest price-discovery, sniping-resistance, launch-fairness against
  a day-one sweep, and checkpoint/operational elegance. Real wins on a lever that is
  explicitly **not frozen**.
- **Does NOT fix long-tail squatting** — that is the sunk-gate + bond economics, a
  different lever, untouched here.
- **Does NOT change** bond continuity, maturity, owner-key control, or DA.

## §8 Open questions for the decision

1. **Epoch length `E`** — align to Bitcoin's 2016-block difficulty epoch (Bitcoin-native,
   and the boundary Braidpool settles shares on), or a ~1008-block "week," or a
   longer launch-era value?
2. **`W_min`** — how many blocks of guaranteed minimum notice? (Interacts with the
   launch-era "long notice window ~90 days" recommendation — does epoch-batching let
   the *floor* be shorter because attention is synchronized?)
3. **Auction epoch-alignment** — keep pure soft-close (recommended), or also snap
   auction settlement to boundaries?
4. **Boundary mempool spike** — is fee competition to land in-epoch a real problem at
   ONT volumes, and does it need a mitigation (e.g. `W_min` large enough that the
   exact landing block rarely decides the epoch)?
5. **Does this change the recommended notice-window length** in AUCTION.md's window
   schedule?

## §9 Recommendation + sequencing

- **Worth pursuing** if launch-fairness modeling shows rolling windows fragment
  contender attention or are sweepable in quiet periods — which is precisely the open
  worry. The synchronization win is real and well-precedented (frequent batch
  auctions).
- **Adopt the `W_min`-floor variant only** (§5). The naive cliff version is unsafe.
- **Align `E` to a Bitcoin-native boundary** (2016-block difficulty epoch is the
  clean default).
- **Sequencing:** this is a **decision for DK first** (consensus-law, launch-fairness
  lever). On ratification I record `epoch-notice (#102)` in DECISIONS.md and write a
  build spec for CL against the acquisition state machine. Until then this stays a
  candidate; no law changes.

## Sources

- `docs/spec/ONT_ACQUISITION_STATE_MACHINE.md` (§Public Notice, §Contested Auction, §"Bond opens the auction")
- `docs/spec/AUCTION.md` (§"Distinguish Two Windows", §Window Schedule, soft-close params 1008/144)
- `docs/ONT_ONE_PAGER.md` (launch-sweep open question; notice window as launch-fairness lever)
- Decisions: `front-running-nullify` (#37, deadline-not-order), DA windows (#47), MEV/R16 (RISKS.md §D3)
- Prior art: frequent batch auctions (Budish et al.); Bitcoin 2016-block difficulty epoch; Braidpool 2016-block share settlement
