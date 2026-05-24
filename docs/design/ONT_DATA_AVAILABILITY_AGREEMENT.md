# ONT — The Data-Availability Agreement Problem (R1)

The deepest existential risk (R1) isn't "can we store the data" — archival is the easy half,
solved 1-of-N. It's **convergence**: can every honest participant independently arrive at the
*same* ownership state, anchored only to Bitcoin, with no trusted party? This note states the
problem precisely, shows why it's genuinely hard, and proposes a decomposition that confines the
irreducible part to a small, affordable corner.

Status: design analysis, 2026-05-23. A candidate that meaningfully reduces R1 — not a closed proof.

---

## Plain-language summary

- **The danger:** if two honest nodes ever disagree about whether a registration "counted," they
  compute different namespace roots — a **fork**. After a fork, the namespace isn't one registry
  anymore; `coffee` can have two owners. This can happen with *no attacker* — just network timing.
- **Why it's hard:** Bitcoin orders the *commitments* to data, but it doesn't carry the *data*.
  And you fundamentally **can't prove data was never published** (you can't prove a negative). So
  "was this batch available in time?" has no perfectly objective answer.
- **The move:** you can't make off-chain availability *perfectly* objective — but you can (1) push
  the *timing* decision onto Bitcoin (a small on-chain "it's available" marker with a block-height
  deadline), (2) fail closed so a no-show is uniformly dropped, and (3) notice that the genuinely
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

### 6b. Move the *timing* decision onto Bitcoin (the boundary case)
To make "available by the deadline" objective rather than receipt-time-relative, require an
**on-chain availability marker**: by height `h+W`, the publisher posts a small Bitcoin transaction
referencing `D`'s data digest. "In time" then means *that marker is mined by `h+W`* — a fact
Bitcoin witnesses, identical for everyone. The bulk data stays off-chain (fetched from archives);
only the timing fact is on-chain.

### 6c. Fail closed, with an attributable challenge
If a delta is anchored and marked but its **bytes can't be produced by anyone** within a second
challenge window, it is **uniformly excluded** — every honest node drops it. This flips the
unprovable question: we no longer ask "prove `D` was never published," we ask "by the deadline, has
*anyone* served bytes matching the attested digest?" That has an objective, eventually-consistent
answer. A marked-but-unservable delta is a **detectable, attributable fault** (someone anchored a
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
| **B. Fail-closed window + on-chain availability marker** | §6a–6c | 1-of-N honest archive | The **default long-tail rail** |
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

## 9. Attacks checked

- **Withhold-to-stall others** → self-harm: a hidden delta only loses its own names; the union
  merges everyone else's. No global halt.
- **Withhold-then-reveal to steal a contested name** → defeated by §6d: a late reveal forfeits
  priority, so it can't evict an earlier available claimant.
- **Mark-but-don't-serve** → fail-closed (§6c): excluded after the challenge window, attributable.
- **Boundary divergence on an honest delta** → absorbed by the K-block lag (§6a); honest
  publishers are nowhere near the boundary.
- **Flood contested claims with withheld data** → each is self-harming and costs the gate/commit;
  bounded.

## 10. What this resolves vs. what's still open

**Resolved (in design):** the fork hazard for the **uncontested long tail** (self-heals via
commutativity + confirmation lag); the **withhold-then-reveal** theft vector; the framing that
turns unprovable non-availability into an attributable, fail-closed, on-chain-timed decision.

**Still open:**
1. **Pin the windows.** Choose `K` (confirmation depth), `W ≤ K` (availability marker deadline),
   and the challenge window — with explicit latency/safety tradeoffs.
2. **Specify the availability marker.** *Payload format now defined* in `@ont/protocol`
   (`AvailabilityMarker` event: `dataDigest` + `batchSize`, same magic+version+type framing as the
   anchor). Still open: the full Bitcoin tx form (funding/output structure), cost, and how the
   validator composes the marker's block height with the anchor's to enforce the `h+W` deadline.
3. **Decide if/when DA sampling (C) is needed.** Pure 1-of-N archives may suffice at launch;
   sampling is the upgrade path if light clients must not trust archives at billions-scale.
## 11. Prototype (2026-05-23)

`packages/core/src/da-convergence-sim.ts` (+ `da-convergence-sim.test.ts`) makes the rule
falsifiable. It runs the same anchored batches through two inclusion rules — `naive` ("include if
*I* received the bytes by the deadline", keyed on per-node local time) and `proposed` (keyed only
on the Bitcoin-witnessed marker height + the fail-closed challenge) — across multiple honest nodes
with deliberately *different* local views. The tests assert, in code:

- **The fork is real, and the rule fixes it.** Same batches, nodes whose local receipt straddles
  the deadline: `naive` produces **two** roots (fork); `proposed` produces **one** (converge).
- **Withholding is self-harm** — a batch with no marker is dropped by everyone; other publishers
  still register. **Mark-but-don't-serve** is also excluded by all (a marker without retrievable
  bytes fails the challenge half).
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
items 1–3 above (pin windows, specify the marker tx, decide on DA sampling) remain, and the
prototype is an abstract model, not the real Bitcoin-tx-level mechanism. But the core convergence
claim now holds in code, and the hard residue is small and named.

See also: [`ONT_HARD_PROBLEMS.md`](./ONT_HARD_PROBLEMS.md) (R2 delta-merge, which this builds on),
[`ONT_RISK_REGISTER.md`](./ONT_RISK_REGISTER.md), and the plain-language
[`ONT_RISKS_PLAIN_LANGUAGE.md`](./ONT_RISKS_PLAIN_LANGUAGE.md).
