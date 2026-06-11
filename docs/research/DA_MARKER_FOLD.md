# Marker-fold: should the availability marker be a separate on-chain event?

> **Status: RATIFIED — fold.** DK approved "no second transaction (fold)"
> in ONT - dev on 2026-06-11 (event `42eb0ddb`), ahead of the queued
> ChatLunatique adversarial pass; the ripple edits (§6) still go through
> the normal writer → review → merge path. This was the pre-B2 named spec
> decision clean-build (#46) required before the kernel's data-availability
> deadline verdict could be implemented
> ([OPEN_QUESTIONS.md §1.1](../OPEN_QUESTIONS.md)). Stable name:
> **marker-fold (#47)** — see [DECISIONS.md](../core/DECISIONS.md). The
> question stays flagged as a first-class external-review ask (DK,
> 2026-06-09) with an explicit reopen trigger — see §7.

## 1. The question

The batched claim path needs a **fail-closed availability rule**: a batch
anchored on Bitcoin counts only if the bytes behind it actually surface, so
a publisher cannot anchor a hidden claim and reveal it later to evict an
earlier, available claimant (the withhold-then-reveal theft vector,
[DA agreement §6d](../spec/ONT_DATA_AVAILABILITY_AGREEMENT.md)).

The agreement's §6b proposed enforcing the deadline with a **separate
on-chain availability marker** (wire event `0x0d`: dataDigest + batchSize,
41 bytes): by height `h+W` after an anchor at `h`, the publisher posts the
marker, and "published in time" means *the marker is mined by `h+W`* — a
fact Bitcoin witnesses identically for everyone.

The fold question: drop the separate marker and key the deadline rule
directly off **the anchor itself**. The decision matters now because the
kernel's deadline verdict (a pure predicate, B2) cannot be specified until
the timing facts it consumes are fixed.

## 2. What the marker actually attests — the crux

Walk through what consensus work each on-chain fact performs:

- **The anchor at height `h`** commits the batch's content: `newRoot` (and
  `batchSize`) bind exactly one set of leaves — any byte source is checked
  against the anchored root, so wrong bytes are detectable regardless of
  transport (§8b: transport is not consensus-critical for integrity).
  The anchor is itself a Bitcoin-witnessed timestamp.
- **The marker at height `h+m` (m ≤ W)** adds a second Bitcoin-witnessed
  timestamp attached to a *claim by the same publisher* that the data is
  now published. It does **not prove availability** — a publisher can mark
  and still withhold. The agreement itself handles that case in §6c: a
  marked-but-unservable batch is uniformly excluded after the challenge
  window `C`, as a detectable, attributable fault.

So in *both* designs, actual availability is settled the same way: the §6c
challenge — "has anyone served bytes matching the anchored commitment by
the deadline?" — an objective, eventually-consistent question. The marker
contributes exactly one thing the anchor doesn't: **an on-chain timestamp
for a self-attested claim of publication that is later than the anchor.**

That extra timestamp does consensus work only if the protocol *wants* to
support an anchor-now, publish-later flow — anchoring at `h` while
releasing bytes up to `W` blocks later, with the marker marking the
release. And that flow is not a feature; it is the attack surface. §6a's
own honest-path analysis says publishers release data **at anchor time**
and the `K`-deep confirmation lag (with `W ≤ K`) absorbs all honest
propagation variance. A gap between anchor and release benefits only a
publisher who wants priority before showing their data — which is
precisely the behavior the fail-closed rule exists to kill.

## 3. The folded design, precisely

Retire the separate marker. The anchor is the availability commitment:

1. A batch anchored at height `h` commits its leaves via the anchored root
   and `batchSize`. No additional digest field is needed — the root
   already binds the bytes (canonical bundle serialization is part of the
   batched-path spec; B3 material).
2. **Deadline rule (kernel predicate, B2):** for contested-priority
   purposes, the batch's bytes must be demonstrably servable by height
   `h+W`. The clock starts at the anchor's mined height — a fact Bitcoin
   witnesses.
3. **Fail-closed exclusion (§6c, unchanged):** if no party serves bytes
   verifying against the anchored root within the challenge window
   (`h+W+C`), every honest node uniformly excludes the batch, permanently.
   Late revival is impossible by rule, not by goodwill.
4. The kernel consumes, as witnessed inputs: the anchor (height, root,
   batchSize) and the evidence layer's served-bytes verdict (bytes that
   verify against the root, with the height by which they were first
   servable, per the verifier's evidence rules — B3 defines the witness
   format). The predicate is pure: same inputs, same verdict, everywhere.

## 4. Comparison

| Dimension | Separate marker (B as drafted) | Folded (proposed) |
| --- | --- | --- |
| On-chain cost per batch | 2 transactions (anchor ~150–194 vB + marker tx carrying 41-byte payload) | 1 transaction (anchor as today; zero added bytes — root already commits the data) |
| Kernel predicate inputs | anchor + marker presence/height + marker↔anchor matching + missing-marker case + served-bytes evidence | anchor + served-bytes evidence |
| Reorg behavior | anchor and marker reorg independently; predicate must handle marker-orphaned-but-anchor-confirmed and vice versa | one event, one reorg story (existing `K`-deep confirmation rule) |
| Marker↔anchor binding | by digest/root reference; two anchors sharing a root need disambiguation rules | not applicable |
| Light-client verification | two inclusion proofs per batch | one inclusion proof |
| Withhold-then-reveal defense | via §6c challenge (marker adds a claim, not proof) | identical, via §6c challenge |
| Objectivity of "in time" | marker height (objective) for the *claim*; challenge outcome for the *fact* | anchor height (objective) for the *commitment*; challenge outcome for the *fact* |
| Anchor-now-publish-later flow | supported (and exploitable as priority-squatting without data) | impossible by construction |
| Production reality today | markers were never emitted or checked on the live signet — the deployed system already behaved as if folded | matches what actually ran |
| Spec/wire surface | extra event type, extra codec, extra vectors, extra negative tests | event `0x0d` retired; smaller audited surface |

## 5. What folding does NOT change

- **The 1-of-N residual (§8)** — someone must serve the bytes — is
  untouched. Folding changes who carries a timestamp, not who carries data.
- **Archival economics (OPEN_QUESTIONS §1.2)** — unfunded long-term
  storage — is untouched.
- **The W/C/K window values** are still launch parameters to freeze; this
  decision fixes what the windows are *measured from* (the anchor's mined
  height), not their sizes.
- **Approach A (full data on Bitcoin) as the contested-name fallback**
  (§6d/§7) is untouched and orthogonal.

## 6. Recommendation

**Fold.** Retire the separate availability marker; the anchor is the
availability commitment and all deadline windows key off its mined height.

Grounds, in order of weight:
1. The marker is a self-attested claim, not a proof — every adversarial
   case lands in the §6c challenge anyway, in both designs. The marker
   buys objectivity about a *claim* nobody should trust.
2. The only flow the marker enables (anchor first, publish later) is the
   attack the rule exists to prevent.
3. The folded kernel predicate is materially simpler — one event, no
   cross-event matching, no independent-reorg cases — and B2's audited
   boundary should carry no avoidable case analysis.
4. Half the on-chain transactions per batch, one fewer event type, one
   fewer codec in the audited wire surface.
5. The live system never emitted markers; folding ratifies the only
   behavior that has ever actually run, instead of building the untested
   half of a two-event protocol.

### Ripples if ratified

- **Spec:** DA agreement §6b is rewritten to key the deadline off the
  anchor height (§6a/§6c/§6d survive nearly verbatim); the wire-format
  spec (B1, in review) marks event `0x0d` **retired — never reuse** in the
  type registry and drops its layout section; the AvailabilityMarker row
  in STATUS's legacy material stays as history.
- **Kernel (B2):** the DA deadline verdict is specified as
  `eligible(anchor, servedEvidence, W, C) → boolean` over witnessed
  inputs; negative tests: withhold-past-W, serve-after-C revival attempt,
  partial-batch service, wrong-bytes-matching-nothing.
- **Evidence layer (B3):** defines the served-bytes witness format and
  first-servable-height evidence rules the predicate consumes.
- **DECISIONS.md:** new entry, stable name **marker-fold**, citing this
  paper and the ruling.

## 7. Relation to the external-review ask

This stays a first-class question for Bitcoin-dev reviewers (DK,
2026-06-09). Ratifying marker-fold now sets the **working decision** so B2
spec work isn't blocked; the external ask becomes sharper — "we fold the
availability commitment into the anchor and enforce fail-closed exclusion
off anchor height; what does this miss?" — which is a better review
prompt than an open two-option question. Explicit revisit trigger: if
external review surfaces a consensus role for a second timestamp that §2
misses, marker-fold reopens by named spec PR before the B2 kernel
freezes its DA predicate.
