# da-windows: what the K/W/C windows must fix before B2 — and what stays open

> **Status: PROVISIONALLY ADOPTED — pending DK ratification.**
> Writer: ClaudeleLunatique. Reviewer: ChatLunatique — **CONCUR, round 1**
> (2026-06-13, adversarial pass: O2/O3 counter-cases argued and found weak; four
> conformance demands folded in, see "Review round 1" below). Adopted provisional
> per the autonomous-session protocol (DK grant, event `9c1e1ba7`); DK ratifies
> or flips on return. Decision entry: da-windows (#49), DECISIONS.md.
>
> Normativity: this is an `analysis`-tier paper. Whatever is ratified lands as
> spec text in [`../spec/ONT_DATA_AVAILABILITY_AGREEMENT.md`](../spec/ONT_DATA_AVAILABILITY_AGREEMENT.md)
> and enters the ledger as `candidate` per the normative-hardening amendment.

## 1. The question

[`ONT_DATA_AVAILABILITY_AGREEMENT.md`](../spec/ONT_DATA_AVAILABILITY_AGREEMENT.md) §10
item 1 ("pin the windows") and [`OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md) §1 item 2
("the K/W/C windows are not tuning trivia") leave three parameters open:

- `K` — confirmation depth: a delta proves against the confirmed root `R_{h−K}`, and an
  anchor mined at height `h` participates in the canonical root only once `h` is K-deep.
- `W` — availability deadline: the anchored bytes must be demonstrably servable by
  height `h+W`, where `h` is the anchor's mined height (marker-fold (#47): the anchor
  *is* the availability commitment; there is no second clock).
- `C` — challenge window: the fail-closed verdict on an anchored-but-unserved batch
  settles by `h+W+C`; after that, uniform exclusion (§6c).

B2 cannot start its DA-verdict hardening without this decision, because the kernel
predicate `eligible(anchor, servedEvidence, W, C)` (the marker-fold successor work item)
has no defined algebra to be a predicate *over*. At the same time, B1's routing table
already sends "economic parameter values (gate, bonds, **windows**)" to the
launch-parameter freeze, and OPEN_QUESTIONS §1 explicitly solicits external attack on
the parameter *ranges*.

So the actual question is a split: **which parts of K/W/C must be fixed now (pre-B2),
and which parts stay open for launch freeze + external review?**

## 2. The crux: the kernel needs the algebra, not the integers

Every rule B2 will write about DA is a statement over window *semantics*:

- what clock the deadlines run on (and what a reorg does to it),
- whether deadlines are inclusive or exclusive,
- which deadline guards *inclusion* and which guards *contested priority* (these are
  different — §3, S3),
- the invariant that keeps the availability verdict from outrunning eligibility
  (`K ≥ W + C`),
- where the values live and how the kernel receives them.

None of those statements needs to know whether `W` is 2 or 4. A kernel written against
the algebra with `(K, W, C)` as explicit parameters is *unchanged* by any later numeric
ruling — which is exactly what lets the numbers stay open for the external review DK
has asked for, without blocking B2. Conversely, a kernel that bakes in integers turns
every future parameter discussion into a consensus-code change. The prototype already
made this choice correctly: `da-convergence-sim.ts` takes the windows as a parameter
object and enforces the invariant; nothing in the convergence argument depends on the
default values.

## 3. The design, precisely (what this decision fixes pre-B2)

Seven semantic pins, S1–S7. These become the spec text B2's D-rules cite.

- **S1 — one clock.** All windows are measured in Bitcoin block heights from `h`, the
  mined height of the anchor's containing block in the evaluator's current best chain.
  On reorg, `h` is re-derived from the new containing block (or the anchor ceases to
  exist if unconfirmed); every deadline moves with it. There is no wall-clock or
  receipt-time input anywhere in the algebra — that is the entire point of the §6
  design, and it is what makes the predicate pure and chain-view-deterministic.
- **S2 — inclusive deadlines, explicit eligibility boundary.** "By `h+X`" means "at a
  height `≤ h+X`". A served-bytes witness whose height equals the deadline exactly is
  in-window. The K-depth boundary is pinned with the same explicitness:
  `eligibleAt(anchor, H, K) := H ≥ h+K` — an anchor first becomes eligible at the
  evaluation height with K further blocks on top of its containing block, matching
  the prototype's convention (`da-convergence-sim.ts:146`). (One convention, stated
  once; every off-by-one negative test keys off this line — including the
  `h+K−1` reject / `h+K` accept pair. Review round 1 demanded this pin so "K-deep"
  cannot hide a one-block convention mismatch.)
- **S3 — two deadlines, two duties.** `h+W` is the **priority deadline**: a *contested*
  claim whose bytes are not demonstrably available by `h+W` forfeits priority (§6d,
  the withhold-then-reveal kill). `h+W+C` is the **inclusion deadline**: a batch whose
  bytes nobody can produce by `h+W+C` is uniformly excluded, fail closed (§6c). These
  are distinct predicates and B2 must keep them distinct:
  - `includable(anchor, evidence, W, C)` — served height `≤ h+W+C`;
  - `holdsPriority(claim, evidence, W)` — served height `≤ h+W`.
- **S4 — evidence in, verdict out.** The kernel consumes a **served-bytes witness**
  (format = B3 deliverable) as an explicit input and returns a verdict; it never does
  I/O, never asks "did *I* receive the bytes," and never consults local time. B3 must
  define the witness tightly enough that honest verifiers converge (OPEN_QUESTIONS §1
  item 1 — unchanged by this paper); B2 specifies only the predicate's *shape* over an
  opaque-but-height-carrying witness.
- **S5 — parameter home.** `(K, W, C)` are per-network consensus parameters living in
  one parameters block in the DA agreement spec (with the other launch-freeze
  parameters), passed to the kernel as inputs. Kernel code is parametric; no constant
  named `6` appears in `@ont/consensus`.
- **S6 — validity constraints.** `K ≥ W + C`, `K ≥ 1`, `W ≥ 1`, `C ≥ 1`. The first is
  the load-bearing invariant (already enforced by the prototype,
  `da-convergence-sim.ts:85`): the availability verdict settles at `h+W+C`, at or
  before the anchor reaches eligibility depth at `h+K`, so an *eligible* anchor's DA
  status is already final — the canonical root never has to be revised for an
  availability reason. The other three are tightened from the prototype (which allowed
  `W ≥ 0`, `C ≥ 0`): `W = 0` makes honest same-block serving a race against the anchor
  itself, and `C = 0` vacates the §6c challenge — fail-closed with a zero-width
  challenge window is just "fail," with no attributable-fault step. **New constraints,
  flagged for attack.**
- **S7 — provisional values.** `K = 6, W = 2, C = 3` (the prototyped defaults,
  `da-convergence-sim.ts:71`; ≈ 60/20/30 minutes at 10-minute blocks). These are
  **explicitly provisional**: they exist so conformance vectors have concrete numbers
  and a signet/test deployment has behavior, and they freeze — possibly to different
  values — at the launch-parameter freeze, after the external review OPEN_QUESTIONS
  solicits. To keep the kernel honest about S5, the B2 conformance suite MUST include
  vectors at **two distinct parameterizations** (the provisional values and at least
  one other valid triple), so a baked-in constant cannot pass.

## 4. Options compared

| | O1 — pin algebra now, values provisional (recommended) | O2 — pin final values now | O3 — defer all of it to B3 |
| --- | --- | --- | --- |
| Unblocks B2 DA predicate | yes | yes | **no** — predicate has no algebra |
| Respects the standing external-review ask on ranges | yes — ranges stay open | **no** — preempts it | yes |
| Kernel parametric (S5) | yes | risk of constant-baking | n/a |
| Launch-freeze routing (B1 table) honored | yes — values freeze there | breaks it | yes |
| Cost | spec text + dual-param vectors | a ruling nobody can defend yet | B2 blocked on DA, its central duty |

O2 fails because the defensible-ranges question is precisely what DK has marked for
Bitcoin-dev review; ruling integers tonight would manufacture false certainty. O3
fails because the DA verdict is one of the five B2 kernel areas — deferring the
algebra defers the kernel. O1 is the split the repo's own routing already implies.

## 5. What this paper does NOT change

- **marker-fold (#47)** — untouched; the anchor stays the only clock. (A second
  consensus timestamp appearing here would be the #47 reopen trigger; none does.)
- **Transport (T2, Decision #39)** — how bytes move is orthogonal to when they're due.
- **The 1-of-N archive residual** (§8) — unchanged, still the named assumption.
- **The served-bytes witness format** — still B3's deliverable; S4 only fixes that the
  kernel consumes it as evidence.
- **The external-review asks** — all five §1 OPEN_QUESTIONS items survive; item 2
  narrows from "windows undefined" to "are these ranges defensible."

## 6. Recommendation

**O1: ratify S1–S7.** The semantics and invariants (S1–S6) become candidate spec text
in the DA agreement; the values (S7) are provisional parameters that freeze at launch.
B2's D-rules cite S1–S6; the conformance suite carries the dual-parameterization
requirement from day one.

### Ripples if ratified

- `ONT_DATA_AVAILABILITY_AGREEMENT.md`: §10 item 1 splits — algebra resolved (cite
  this paper), values re-routed to the launch freeze; new "Window parameters" block
  (S5/S7) added; §6 gains the S2 inclusivity sentence and the S3 two-predicate naming.
- `OPEN_QUESTIONS.md` §1 item 2: reworded to the narrowed ask (ranges, not semantics).
- `B2_KERNEL_HARDENING.md`: DA-verdict rules get their source; `eligible(...)`
  decomposes into `includable` + `holdsPriority` per S3.
- Conformance: boundary vectors at `h+W` and `h+W+C` exactly (S2), plus the second
  parameterization (S7); negative vectors for each S6 constraint violation.
- `STATUS.md`: DA known-incomplete entry points here instead of "windows undecided."
- Code: `createDefaultDaWindows()` (sim) is re-cited as the provisional S7 source; the
  sim's `W ≥ 0 / C ≥ 0` validation is one rule looser than S6 — the rewrite, not the
  legacy sim, is where S6 lands.

### Reopen triggers

- External review showing the two-deadline split (S3) is wrong or insufficient — e.g.
  a priority/inclusion gap attack the §9 checklist misses.
- Propagation/archival measurements (signet-scale, R11 benchmark) showing the S7
  ranges are infeasible — that reopens *values* at the freeze, not this paper.
- Any consensus role found for a second clock — that reopens **marker-fold (#47)** by
  its own trigger, and this paper inherits the outcome.

## Review round 1 (ChatLunatique, 2026-06-13) — CONCUR, demands folded

Adversarial pass result: the strongest cases for O2 and O3 were argued and found
weak (O2 violates the standing external-review ask on ranges; O3 blocks the B2 DA
predicate). CONCUR with four demands, all accepted by the writer:

1. **K-depth boundary pinned explicitly** — folded into S2 as
   `eligibleAt(anchor, H, K) := H ≥ h+K`, with the `h+K−1`/`h+K` test pair.
2. **Mixed-batch negatives** for the S3 split: a batch whose bytes are first served
   in `(h+W, h+W+C]` — uncontested leaves includable, a contested leaf in the same
   batch does NOT hold priority. This is the priority/inclusion gap attack surface;
   it is a mandatory B2 conformance vector family.
3. **Boundary vectors** exactly at `h+W` and `h+W+C`, plus one block after each.
4. **S6 invalid-window negatives**: kernel construction rejects for `K < W+C`,
   `W = 0`, `C = 0` — alongside the second valid parameterization S7 demands.

Independent corroboration from the B2 rule extraction (tranche-1 merge pass,
conflict C3): under the weak `W ≤ K` form with `W = K`, `C > 0`, the challenge
window resolves *after* finalization, permitting include-then-retract — exactly
what S6's strong form (`K ≥ W + C`) forecloses.
