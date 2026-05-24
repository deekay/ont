# ONT — MEV & Ordering Analysis (R9)

The last unanalyzed adversary in the register: parties who profit from *ordering* — Bitcoin miners
(who order txs in a block), publishers/batchers (who order claims in a batch and see pending ones),
and the worst case, miner+publisher collusion. The register flagged this as "dedicated analysis
still owed." This is that analysis.

Status: design analysis, 2026-05-24.

---

## Plain-language summary

- **The fear:** whoever controls ordering sees a valuable name coming and grabs it first, or
  reorders an auction to help a friend.
- **The headline result:** in this design **you cannot steal a name by controlling ordering.** Three
  structural features already prevent it — names are hidden until it's too late to copy them
  (commit-reveal), different names don't compete (so ordering only matters for the rare contested
  name), and contested names are won by **bidding the most, not by being first**.
- **What's left is bounded, not theft:** the residual is "someone forces a name you wanted into an
  auction" and "a relay mishandles bids in the open auction." Both are contained by the auction
  economics and the always-available direct-to-Bitcoin fallback.
- **A useful by-product:** MEV resistance is another argument for the **sealed second-price**
  auction (Option B), because its outcome doesn't depend on bid arrival order at all.

---

## 1. Where ordering power lives, and what's worth extracting

| Who | Power | Sees |
| --- | --- | --- |
| **Miner** | Orders txs within a block; chooses inclusion | The Bitcoin mempool |
| **Publisher / batcher** | Orders claims within its batch; chooses what to include | Claims submitted to it |
| **Miner + publisher (collusion)** | Both of the above | Mempool + submitted claims |

Worth extracting: (1) **front-running** a valuable name, (2) **manipulating an auction**, (3)
**censoring** a competitor's claim/bid to win or extort.

## 2. The structural defenses already in the design

**D1 — Commit-reveal hides *which* name.** A claim is a commitment (hash of name+nonce+owner) first,
revealed later, with **priority fixed at commit time**. An observer sees a commitment but not the
name, so they cannot target `coffee` they can't see, and copying a commitment is useless (they lack
the preimage and can't match the owner key). **This defeats classic name front-running.**

**D2 — Disjoint names commute, so ordering is irrelevant for the long tail.** A million people
claiming a million *different* names don't compete; their insertions merge order-independently
(proven in `delta-merge-sim.ts`). Ordering only has value when two parties want the *same* name — so
the entire MEV surface collapses onto **contested names**, a small set (the R3 long-tail bet).

**D3 — Contested names are won by bidding, not by ordering.** When 2+ parties want a name, it goes to
**auction** (notice window → auction at/above the reserve). The winner is the highest bidder, *not*
the first committer. So a miner/publisher who can reorder or insert-first gains **nothing** — they'd
still have to outbid everyone, i.e. pay the most. Ordering power doesn't convert to name acquisition.

**D4 — Direct-L1 fallback bounds censorship.** Any user can bypass publishers and anchor a claim (or
settle a bid) directly on Bitcoin. A censoring publisher or miner can impose a *cost/delay* (push you
to L1), never a *denial*. Combined with competitive, permissionless publishers, selective inclusion
is an efficiency attack, not a sovereignty attack.

**Together, D1–D4 mean the thing that would be catastrophic — stealing a name via ordering — is not
possible.** The (height, tx-index) commit-priority tie-break in the merge is only a determinism
floor *after* allocation; it isn't the mechanism that awards a contested name, so gaming tx-index by
fee buys no name.

## 3. Residual MEV — real, but bounded (none of it theft)

| Residual | What it is | Why it's bounded |
| --- | --- | --- |
| **Reveal-contestation** | Once a name is revealed, a watcher can contest it within the notice window, forcing an auction on a name someone hoped to get cheaply | Not theft — the contester must *bid and win*, paying real value. Forces fair price discovery, the design's intent. This is really **R7 (cold start)** wearing an MEV hat; same mitigations (generous window, loud launch, watchers). |
| **Relay bid manipulation** | In the *open* auction, a relay/publisher selectively delays or drops bids to help a colluding bidder | Bounded by **direct-L1 fallback** (a censored bidder settles on L1) and **anti-snipe** (activity-extended close). Removed entirely by sealed second-price (§4). |
| **Tie-break gaming** | Pay a higher fee to win a same-block (height, tx-index) tie | Low value — contested names go to auction, so winning the tie doesn't win the name. |
| **Selective inclusion** | Publisher refuses to batch your claim | Bounded by L1 fallback + competitive publishers; costs you latency, not the name. Overlaps R8. |

## 4. By-product: MEV resistance argues for sealed second-price (Option B)

The open ascending auction has *some* ordering-sensitivity near the close (last-look, relay bid
timing), mitigated but not eliminated by anti-snipe + L1 fallback. A **sealed second-price**
settlement is **ordering-insensitive by construction**: the outcome is a pure function of the *set*
of sealed bids, independent of their arrival order or the settlement tx's position in a block. So
the MEV analysis adds a vote to the R4 decision: if ordering-resistance is weighted heavily, Option B
(open non-binding signaling → sealed second-price settlement) is the stronger choice; the fully open
on-chain ascending auction (Option C) is best reserved for rare marquee names where the visible drama
is the product.

## 5. Verdict & what's open

**Verdict:** R9 moves from "analysis owed" to **"analyzed — structurally MEV-resistant for what
matters."** No ordering actor (including miner+publisher collusion) can *steal* a name; residual MEV
is bounded extraction/griefing that the auction economics and the L1 fallback contain. R9 is **not a
dealbreaker.**

**Still open:**
1. **Open-auction relay-bid handling** — if the open ascending auction is kept, specify how relays
   gossip bids and how a censored bidder escalates to L1 within the anti-snipe window. (Sealed
   second-price sidesteps this — see §4 and the R4 decision.)
2. **Pin commit-reveal parameters** — the commit→reveal delay and notice window (R14), since D1's
   strength depends on the reveal not being forced early.
3. The reveal-contestation residual is tracked under **R7**, not separately.

See also: [`ONT_HARD_PROBLEMS.md`](./ONT_HARD_PROBLEMS.md) (R4 auction options),
[`ONT_RISK_REGISTER.md`](./ONT_RISK_REGISTER.md), `delta-merge-sim.ts` (the commutativity that gives
D2).
