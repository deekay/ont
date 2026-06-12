# ONT — The Data-Availability Agreement Problem (R1)

> **Normativity: `candidate`** — per the clean-build (#46) ledger
> ([SOFTWARE_INVENTORY.md](../core/SOFTWARE_INVENTORY.md)). No section of
> this file is `normative` yet: rules here become law only by surviving the
> five-step normative hardening for the phase that implements them
> (hardens for B2/B3; the marker-vs-folded-anchor question is **decided — marker-fold (#47), fold**:
> the separate availability marker is retired and all deadline windows key off the anchor's mined
> height. §6b and the marker references throughout were rewritten 2026-06-11 accordingly; see
> [research/DA_MARKER_FOLD.md](../research/DA_MARKER_FOLD.md)). Statements of status elsewhere in this file are
> historical; the ledger wins.


The deepest existential risk (R1) isn't "can we store the data" — archival is the easy half,
solved 1-of-N. It's **convergence**: can every honest participant independently arrive at the
*same* ownership state, anchored only to Bitcoin, with no trusted party? This note states the
problem precisely, shows why it's genuinely hard, and proposes a decomposition that confines the
irreducible part to a small, affordable corner.

Status: design analysis, 2026-05-23. A candidate that meaningfully reduces R1 — not a closed proof.

## Review posture — surface this, don't hide it

**Data availability is probably the most important Bitcoin-dev review surface in this design**
(DK, 2026-06-12). The current design is: **B for the long tail** (fail-closed window keyed off
the anchor, §6), **A as the fallback/floor** (full data on Bitcoin for contested names, §7),
**C as an optional upgrade** (DA sampling, if light-client availability at scale demands it) —
with the evidence rules and the parameters explicitly open for review. Marker-fold (#47)
answered one narrow question (no second availability-marker transaction; the anchor's height is
the clock) — it did **not** close the DA problem. What we are asking reviewers to attack, in
order of leverage: the served-bytes evidence definition (can honest verifiers converge on
"servable by `h+W`"?); the `K`/`W`/`C` window values and their reorg/latency/censorship/finality
tradeoffs; whether 1-of-N publisher-HTTP + voluntary mirrors is enough transport for v1; the
contested-name L1 fallback's vbyte/standardness/flood reality; and where the line sits that
would justify DA sampling. The consolidated attack list lives at
[OPEN_QUESTIONS.md §1](../OPEN_QUESTIONS.md).

---

## Plain-language summary

- **The danger:** if two honest nodes ever disagree about whether a registration "counted," they
  compute different namespace roots — a **fork**. After a fork, the namespace isn't one registry
  anymore; `coffee` can have two owners. This can happen with *no attacker* — just network timing.
- **Why it's hard:** Bitcoin orders the *commitments* to data, but it doesn't carry the *data*.
  And you fundamentally **can't prove data was never published** (you can't prove a negative). So
  "was this batch available in time?" has no perfectly objective answer.
- **The move:** you can't make off-chain availability *perfectly* objective — but you can (1) key
  the *timing* decision off Bitcoin (the anchor's mined height starts a block-height deadline the
  whole network reads identically), (2) fail closed so a no-show is uniformly dropped, and (3) notice that the genuinely
  hard case only matters for **contested** names — which are few, and can fall back to putting
  full data on Bitcoin. The huge uncontested long tail self-heals.
- **What's left:** the residual shrinks to one clean assumption — *at least one honest archive
  serves the data behind an on-chain-attested batch* — plus pinning the window sizes and
  prototyping it against a withholding adversary.

---

## 1. The convergence requirement

Honest nodes derive the namespace root by replaying batches ("deltas") in Bitcoin order. For the
system to be a single coherent registry, we need a function

> `f(Bitcoin chain) → canonical ONT root at each height`

that **every honest node computes identically**. A delta counts toward the root only if:

- **(a)** its commitment is anchored in a Bitcoin block — *objective*, everyone sees Bitcoin; and
- **(b)** its data is *available* — the bytes needed to validate and apply the insertions.

Condition (a) is free. **Condition (b) is the whole problem.**

## 2. Why Bitcoin ordering ≠ availability

A publisher can anchor `commit(D) = H(D)` in a Bitcoin transaction and **never release `D`**.
Bitcoin orders the commitment fine; no one can validate or apply it. Bitcoin gives a total order
on *roots*, not the *data behind them*. This is exactly the one-pager's line: "the one thing
Bitcoin's order doesn't supply is the data behind a root."

## 3. The fork hazard — and the wall behind it

Suppose a delta `D`'s data reaches node A but not node B by the moment the root finalizes. A
includes `D`, B excludes it → **different roots** → fork. No attacker is required; ordinary
propagation variance on a borderline-timing delta is enough.

The reason you can't just "wait until everyone has it" is the **impossibility of proving
non-availability**: there is no proof "this data was never published." You can prove a batch *is*
available (show the bytes); you can never prove it *isn't*. So any rule of the form "include iff
available by time T" inherits a boundary where honest nodes can disagree.

## 4. What the self-harm reframe does — and doesn't — fix

Earlier we established that withholding a delta is **self-harm**: because the merge is a union of
independent insertions, a hidden delta only fails to register *its own* names; it can't freeze or
corrupt anyone else's. True — and it removes the *incentive* to withhold as an attack.

But it does **not** remove the *consensus* requirement. The question "is `D` in or out?" must be
answered *identically by all honest nodes*, or the root forks. Self-harm bounds the **damage** of
a deliberate attack; it does nothing about **honest disagreement** at the timing boundary. So the
reframe is necessary but not sufficient.

## 5. The key decomposition — include/exclude only touches the delta's own leaves

Two structural facts about this design do the heavy lifting:

1. A delta only **inserts** names; it never mutates an existing name (transfers are separate and
   owner-signed). Uniqueness is enforced at insertion. So including vs. excluding `D` changes
   **only whether `D`'s own leaves exist** — nothing else in the tree moves.
2. Disjoint insertions **commute** (proved in `delta-merge-sim.ts`): the root is a function of the
   *set* of leaves, not the order or arrival time.

Therefore the *consequence* of a timing disagreement depends entirely on whether the affected leaf
is **contested**:

- **Uncontested leaf** (no one else wants that name — by the R3 bet, ~all of the long tail): if A
  includes and B excludes `D`'s claim on `sallysmith2165`, the only disagreement is *whether one
  unclaimed name is claimed yet*. It self-heals — `D`'s data propagates, both converge, and because
  insertions commute, the leaf lands the same way regardless of when. Worst case the name's
  *effective registration height* slips; nobody else competes for it, so nothing is lost.
- **Contested leaf** (two+ claimants on the *same* name): here a timing disagreement decides *who
  wins*. This is the only place a fork is genuinely dangerous — and contested names are **few**.

**This is the unlock: the irreducible part of R1 is confined to contested leaves.**

## 6. Proposed rule

### 6a. Confirmation lag absorbs honest propagation (the common case)
Deltas already prove against the **confirmed root `R_{h−K}`** (K blocks back), not the tip. A
delta anchored at height `h` is only eligible for the canonical root once `h` is K-deep. Set the
availability window `W ≤ K`. Honest publishers release data at anchor time, so they have the full
K-block lag (≈ hours) of slack — propagation variance of seconds/minutes never reaches the
boundary. Convergence on *confirmed* roots holds for every honestly-published delta.

### 6b. Key the *timing* decision off the anchor (the boundary case)
*(Rewritten 2026-06-11 per marker-fold (#47); the original §6b proposed a separate on-chain
availability marker — retired, see [research/DA_MARKER_FOLD.md](../research/DA_MARKER_FOLD.md).)*

To make "available by the deadline" objective rather than receipt-time-relative, the **anchor
itself is the availability commitment**: a batch anchored at height `h` commits its leaves via the
anchored root (and `batchSize`), and its bytes must be demonstrably servable by height `h+W`. The
clock starts at the anchor's mined height — a fact Bitcoin witnesses, identical for everyone. The
bulk data stays off-chain (fetched from archives); only the timing fact is on-chain, and it rides
on the transaction the publisher was posting anyway. No second event exists, so the
anchor-now-publish-later flow — anchoring while withholding bytes for later reveal — is impossible
to *signal* and pointless to attempt: bytes that miss `h+W` forfeit per §6c/§6d.

### 6c. Fail closed, with an attributable challenge
If a delta is anchored but its **bytes can't be produced by anyone** within a second
challenge window, it is **uniformly excluded** — every honest node drops it. This flips the
unprovable question: we no longer ask "prove `D` was never published," we ask "by the deadline, has
*anyone* served bytes matching the anchored commitment?" That has an objective, eventually-consistent
answer. An anchored-but-unservable delta is a **detectable, attributable fault** (someone anchored a
commitment nobody can back), not a silent ambiguity.

### 6d. Contested leaves: hard window, escalate to L1
To hold priority on a *contested* name, a claim's data must be demonstrably available by the hard
deadline (6b). Miss it → **forfeit priority** (this kills the withhold-then-reveal theft vector:
you cannot hide a claim and later surface it to evict an earlier, available claimant). For
high-value marquee names, the fallback is **direct-L1 settlement with full data on Bitcoin** —
Approach A below — which has *no* DA problem at all and is affordable precisely because contested
names are few (~110 vB each, ~4.78M/yr ceiling at 1% blockspace).

## 7. The candidate mechanisms, ranked by trust cost

| Approach | What it is | Trust added | Where it fits |
| --- | --- | --- | --- |
| **A. Full data on Bitcoin** | Put the bytes on-chain | None (pure Bitcoin) | The **censorship-resistant floor** + contested-name fallback. Too expensive for the long tail |
| **B. Fail-closed window keyed off the anchor** | §6a–6c | 1-of-N honest archive | The **default long-tail path** |
| **C. DA sampling (erasure-coded, Celestia-style)** | Light clients sample chunks to gain availability confidence cheaply | Honest-minority DA network | Optional upgrade *if* trust-minimized light-client availability at scale is required |
| D. Bonded attestation + slashing | Publishers bond "it's available," slashed on fault | — | **Rejected**: non-availability isn't objectively provable, so slashing can't trigger cleanly. Adds friction, not convergence |

The spine is **B for the long tail, A as the floor/fallback, C as an optional light-client
upgrade.** D is a trap — it looks like it closes the gap but runs straight into the §3 wall.

## 8. The residual assumption, isolated

After this, R1's residual is a **single, clean, attributable** assumption:

> *At least one honest party serves the data behind any on-chain-attested batch (1-of-N).*

That's strictly weaker than "trust a sequencer" and matches the project's stated honest-minority
archive stance — but now it's *isolated* (it's the only residual), *attributable* (a fault points
at a specific anchored commitment), and *fail-closed* (a no-show drops the batch rather than
forking the chain). Your plan to run an archive, alongside aligned institutions, directly
satisfies it — as a **convenience that makes 1-of-N overwhelmingly true**, never as a dependency,
because correctness still checks against Bitcoin.

## 8b. The transport layer — how the bytes actually move (recommended; **core open question for feedback**)

§7–8 settle *witnessing* (is the data attested as available by a Bitcoin-timed deadline?) and isolate
the residual assumption (1-of-N honest parties *serve* the bytes). What they do **not** pin down is the
**transport**: by what concrete mechanism the bytes get from a publisher to the nodes that recompute the
root. This is the live decision, and we want Bitcoin-dev feedback on it.

**The clarifying point — transport is not consensus-critical.** The anchor commits the batch
(root + `batchSize`); every node verifies fetched bytes against that on-chain commitment before using
them. So a byte source can't lie (wrong bytes fail the commitment), and "did it surface in time?" is
decided against the *anchor's* Bitcoin height, not by who delivered the bytes. That means the transport choice doesn't
affect **correctness or convergence at all** — it only affects **availability robustness** (how hard it
is to censor/withhold) and **who you depend on for liveness**. That also makes it cheaply reversible:
because integrity is digest-anchored, the storage/delivery backend can change without touching consensus.

| Transport | What it is | Censorship/liveness | Complexity | v1 fit |
| --- | --- | --- | --- | --- |
| **T1. Publisher-served HTTP** | The publisher exposes the batch bytes by digest at an endpoint; indexers pull | Depends on that operator being up (but fail-closed: a no-show just drops the batch — never forks) | Lowest (operators already run HTTP) | Simplest delivery |
| **T2. Content-addressed + mirrorable** *(recommended)* | Same bytes, addressed by the anchored commitment, so the publisher is just the first mirror; anyone (aligned institutions, other publishers, a hobbyist) can re-serve the exact bytes | 1-of-N: any mirror holding the commitment-matching bytes satisfies availability — no single operator is load-bearing | Low (it's T1 + a "fetch by digest from any of N sources" convention) | **Recommended** |
| **T3. P2P gossip / DA-sampling overlay** | A dedicated overlay floods or samples chunks (ties to §7 option C) | Strongest | Highest (a new network to build + maintain) | Post-v1 upgrade |

**Recommended approach (working direction, open for challenge): T2.** Treat batch bytes as
content-addressed by the anchored commitment, served by the publisher over plain HTTP in v1 (so T1 is
just T2's first mirror), and let anyone mirror the exact bytes. This:

- **Subsumes the simple case** — publisher-HTTP works on day one, no new infrastructure — while keeping
  the path to decentralization open (mirrors need no permission; they re-serve digest-matching bytes).
- **Keeps the residual assumption honest** — §8's "1-of-N honest serves the data" becomes *literally*
  1-of-N independent mirrors, satisfied by your planned archive + aligned institutions, never a single
  sequencer.
- **Stays swappable** — because verification is digest-anchored, moving from publisher-HTTP to a mirror
  convention to (later) a gossip/sampling overlay (T3 / §7-C) is an availability upgrade, not a consensus
  change.

**What we want feedback on:** (a) is publisher-HTTP + voluntary digest-addressed mirrors enough
censorship-resistance for v1, or should a mirror/gossip convention land sooner? (b) when, if ever, is
DA sampling (§7-C) worth the complexity for trust-minimized light-client availability at scale? (c) is
there a transport that tightens the 1-of-N residual further without a new trusted network?

## 9. Attacks checked

- **Withhold-to-stall others** → self-harm: a hidden delta only loses its own names; the union
  merges everyone else's. No global halt.
- **Withhold-then-reveal to steal a contested name** → defeated by §6d: a late reveal forfeits
  priority, so it can't evict an earlier available claimant.
- **Anchor-but-don't-serve** → fail-closed (§6c): excluded after the challenge window, attributable.
- **Boundary divergence on an honest delta** → absorbed by the K-block lag (§6a); honest
  publishers are nowhere near the boundary.
- **Flood contested claims with withheld data** → each is self-harming and costs the gate/commit;
  bounded.

## 10. What this resolves vs. what's still open

**Resolved (in design):** the fork hazard for the **uncontested long tail** (self-heals via
commutativity + confirmation lag); the **withhold-then-reveal** theft vector; the framing that
turns unprovable non-availability into an attributable, fail-closed, on-chain-timed decision.

**Still open:**
1. **Pin the windows.** Choose `K` (confirmation depth), `W ≤ K` (availability deadline, measured
   from the anchor's mined height), and the challenge window — with explicit latency/safety tradeoffs.
2. **Specify the availability marker.** *Superseded by marker-fold (#47):* the separate marker is
   retired (wire event `0x0d` is retired-never-reuse); the deadline keys off the anchor's mined
   height, so there is no second tx form, cost, or cross-event height composition to specify. The
   successor work items are the B2 kernel predicate `eligible(anchor, servedEvidence, W, C)` and
   the B3 served-bytes witness format it consumes.
3. **Decide if/when DA sampling (C) is needed.** Pure 1-of-N archives may suffice at launch;
   sampling is the upgrade path if light clients must not trust archives at billions-scale.
4. **Pin the transport (§8b).** Working direction is **T2** (content-addressed, anchor-committed bytes;
   publisher-served + anyone-mirrorable; not consensus-critical since verified against the on-chain
   commitment). Raised as a **core area for external feedback** — the witnessing is settled; the transport's
   decentralization-vs-simplicity tradeoff is the open call.
## 11. Prototype (2026-05-23)

*(The prototype predates marker-fold (#47): where it says "marker height," that timestamp plays
exactly the role the anchor's mined height plays in the folded design — one Bitcoin-witnessed
clock start instead of two. The convergence argument is unchanged.)*

`packages/core/src/da-convergence-sim.ts` (+ `da-convergence-sim.test.ts`) makes the rule
falsifiable. It runs the same anchored batches through two inclusion rules — `naive` ("include if
*I* received the bytes by the deadline", keyed on per-node local time) and `proposed` (keyed only
on the Bitcoin-witnessed publication height — under marker-fold (#47), the anchor's mined height;
the sim code's identifier for it is historical — + the fail-closed challenge) — across multiple honest nodes
with deliberately *different* local views. The tests assert, in code:

- **The fork is real, and the rule fixes it.** Same batches, nodes whose local receipt straddles
  the deadline: `naive` produces **two** roots (fork); `proposed` produces **one** (converge).
- **Withholding is self-harm** — a batch whose bytes never surface is dropped by everyone; other
  publishers still register. **Anchor-but-don't-serve** is also excluded by all (an anchored
  commitment without retrievable bytes fails the challenge half; the sim models this as its
  marked-but-unserved case, which maps to anchored-but-unserved under marker-fold (#47)).
- **Withhold-then-reveal name theft is defeated** — an attacker who commits *earlier* on `coffee`
  but withholds is filtered out before it can use its priority, so the in-time honest claimant
  wins. Under `naive`, the same selective reveal both forks *and* lets the thief win on a node that
  happened to receive the bytes — exactly the failure the proposed rule removes.
- **Uncontested stragglers self-heal** — a batch that missed the window simply re-anchors later and
  registers at the valid height; nothing is permanently lost for the long tail.
- The `K ≥ W + C` window invariant is enforced.

## 12. Convergence update for R1

R1 moves from **"open existential / agreement rule unbuilt"** to **"approach identified *and*
convergence prototyped: confine objective-DA to contested leaves; isolate the residual to a
fail-closed 1-of-N archive assumption; escalate contested names to L1."** It is *not* closed —
items 1 and 3 above (pin windows, decide on DA sampling) remain alongside the post-fold successor
work (B2 predicate, B3 served-bytes witness), and the
prototype is an abstract model, not the real Bitcoin-tx-level mechanism. But the core convergence
claim now holds in code, and the hard residue is small and named.

See also: [`OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md) (R2 delta-merge, which this builds on), and
[`RISKS.md`](../RISKS.md) — the register plus the plain-language walkthrough.
