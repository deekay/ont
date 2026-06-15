# Decision paper: DA first-servable-height attribution (proposed name: `availability-height`)

> **Status: RATIFIED — O1 + O3 (DK, event `4e11b64b`, 2026-06-15). Named decision:
> availability-height ([DECISIONS](../core/DECISIONS.md) #84).** Writer
> ClaudeleLunatique; reviewer ChatLunatique concurred the classification
> (consensus-law, not B3 byte layout) and raised the amendment/guard folded below.
> Surfaced during B3 (D-SB) — see
> [`docs/core/B3_EVIDENCE_HARDENING.md`](../core/B3_EVIDENCE_HARDENING.md) §5.2. This
> is the first genuinely-new consensus question B3 raised; everything else in B3 is
> construction conforming to ratified rules. Marker-fold-style paper, in the form of
> [`DA_WINDOWS.md`](./DA_WINDOWS.md) (#49) and [`DA_MARKER_FOLD.md`](./DA_MARKER_FOLD.md)
> (#47). **Ratification unblocks D-SB-avail (the one GATED B3 evidence predicate).**

## The question

The ratified DA window algebra (da-windows (#49), §6e) gives the kernel two verdicts
over a served-bytes witness: `includable` (bytes demonstrably served by `h+W+C`) and
`holdsPriority` (by `h+W`). Both consume a `firstServableHeight`. **What confirmed-chain
fact establishes that height** — such that two honest verifiers with the same chain
derive the same verdict (#51 (iii): independently verifiable from the witness +
confirmed chain, never producer-attested)?

## Why this is consensus-law, not a B3 byte layout

The served-bytes witness **content format** (bytes → anchored commitment under
`batchSize`) is a ratified B3 deliverable (DA §6e S4: "format = B3 deliverable") and is
built (D-SB-bind, `@ont/evidence`). The **height attribution** is different:

- Availability is **not positively provable** in general. DA §6c / §88–89: "you can
  show bytes *are* available; you can never prove it *isn't*." The mechanism is a
  fail-closed challenge, not a cryptographic timestamp.
- §6d needs a **per-batch served height** — a batch first served in `(h+W, h+W+C]` is
  includable but **forfeits priority** — so a pure "available-at-anchor" default does
  not, by itself, reproduce the ratified algebra for the batched path.
- The concrete §6c challenge mechanism is **"working direction, open for challenge"**
  (DA §258, approach T2) — not ratified bytes.
- Per the canon boundary rule, a rule that sets which batches are eligible / hold
  priority is **kernel law**, not evidence construction.

So #51 fixed the *interface* (the witness must independently determine a single
first-servable height); it did **not** decide the height-attribution rule. That rule
is DK's.

## Options

**O1 — fail-closed over the presented content witness; challenge diagnostic-only.**
`firstServableHeight = h` for any batch whose **presented** verified content witness
(D-SB-bind) reconstructs the anchored commitment; absent that witness, fail closed. A
challenge event is **fault-attribution / diagnostic only, never a deciding event** — a
unilateral "nobody can back this" is the rejected bonded-attestation shape (§215) and
could censor a valid batch, and "absence of a confirmed exclusion" can't be relied on
without chain-range completeness + duplicate/ordering rules. *Trade:* `h` collapses the
§6e S3 late-served branch for the batched path (see amendment).

**O2 — positive on-chain availability timestamp.** A confirmed event records "bytes
served by height X" → `firstServableHeight = X`, reproducing the §6d late-served branch
for the batched path. *Cost:* needs a poster-authorization / sybil model; §215 cautions
against attestation shapes, so this must be a non-bonded, hard-to-grief construction —
genuinely new mechanism design.

**O3 — direct-L1 settlement for contested names (Approach A, §6d), over O1 for the long
tail.** Contested marquee names settle full-data-on-L1 (no DA height problem); the
batched long tail uses O1's present-content verdict.

## Recommendation (DK rules): O1 + O3, as a consensus amendment

Verdict fail-closed over the presented content witness (O1), priority-bearing
contention routed to bonded/direct-L1 (O3). Keeps `firstServableHeight` a function of
confirmed-chain facts (#51 (iii)) and honours §6c / §88–89 / §215.

- **Amendment.** O1 collapses `firstServableHeight` to `h` for non-faulted batched
  claims, **dropping the §6e S3 late-served branch (`(h+W, h+W+C]` includable-but-no-
  priority) for the accumulator path.** Acceptable *only because* O3 routes the
  priority race to L1. **The fork for DK:** if the long-tail batched path itself must
  preserve late-served priority, **O2 is forced** (with its new-mechanism cost).
- **Guard (#37 / #69).** A late/withheld cheap batched claim that is not DA-valid under
  the chosen rule must **not** open an auction (#37) or nullify (#69 notice-window);
  qualifying bonds / direct-L1 are the only priority-bearing path — so O1+O3 leaves no
  cheap hidden-collision grief.

## Ripples

- **Spec to ratify:** the `firstServableHeight` derivation rule (O1's present-content
  verdict) + whether the challenge stays diagnostic-only or becomes a rebuttable
  mechanism with exact response/range/reorg rules.
- **`@ont/evidence`:** D-SB-avail can mint `VerifiedAvailabilityHeight` only after this
  ruling; D-SB-bind (content binding) already stands and the kernel `includable` /
  `holdsPriority` already consume the height (ratified #49). The branded
  `VerifiedAvailabilityHeight` type already enforces "no bare/attested height."
- **No change to da-windows (#49):** the `(K, W, C)` algebra is untouched; this decides
  only what mints the height the algebra consumes.

## Reopen trigger

If external review or launch-parameter modeling shows the batched long tail needs real
late-served priority (not just L1 for contested), reopen toward O2.
