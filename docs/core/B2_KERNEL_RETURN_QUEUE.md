# B2 kernel — DK-return implementation queue

> **Normativity: `analysis`** — the execution-order view for the audited B2 kernel:
> what is DONE, what is queued, and the decision gates each implementation slice
> waits on. It does NOT re-state rule text or decisions — the **decision queue** lives
> in [`B2_SPEC_PR_DECISION_MATRIX.md`](./B2_SPEC_PR_DECISION_MATRIX.md) (PR-5..36; the
> registry/packets back it), and the recovery signer in
> [`recovery-auth (#50)`](../research/RECOVERY_AUTH.md). This is the index that ties
> "kernel tests-first hardening complete" to the remaining path. Authored under DK's
> keep-going grant (event `4892d54d`, 2026-06-14); ChatLunatique reviews.

## 1. Done — ratified-surface tests-first hardening (all ChatLunatique-signed-off)

Every ratified ownership rule is now a tested pure predicate in `@ont/consensus`,
built tests-first, on `clean-build-b2-kernel` (not pushed):

| Increment | Decision | Commit |
| --- | --- | --- |
| scanner (consensus-support) | #54/#55 | `8f1aa0f` |
| params (DA-window triple) | #58 | `0886f43` |
| DA-verdict predicate | #59 | `a7d5b82` |
| value-record authority | #60 | `ecc2c97` + `1d32f75` |
| transfer authority (X*) | — (X2 §5 pin) | `c6ecb3a` + `73e008d` |
| recovery CANCEL (R15/R17/R19) | — (R15 §5 pin) | `771e99f` |

`@ont/consensus` 132 passed / 2 skipped (X8 `==` boundary + X11 advisory). Two §5
digest-equivalence pins (transfer, recover-owner) fail the build if the kernel's
signature digests ever drift from the B1 wire spec.

## 2. Decision gates (DK rules; pointers only)

These are **not** restated here — see the matrix. The B2-kernel-relevant cluster:

- **Recovery:** PR-17 (state-head + interval-opening), PR-18 (`ownershipRef`/rotation),
  PR-33 (descriptor chain), PR-34 (RecoverOwner tx-shape + CANCEL flag registry +
  evidence deadline `W_r` + X13 transfer-vs-recovery), PR-35 (finalization). PR-17/34/35
  are flagged individual-review; PR-34 and PR-35 must be ruled together. Signer =
  recovery-auth (#50, RATIFIED b1; b2h reopens only on the custody-feedback trigger).
- **Normative wire amendments — already LANDED** (2026-06-14): WIRE §8.2a descriptor v2
  (`recoveryPubkey`) + §8.3 proof → corroboration. NOT pending DK; what remains is
  package support. `@ont/wire` descriptor-v2 conformance is now landed; `@ont/protocol`
  parity (or explicit `@ont/wire`-only recovery-evidence consumption) remains.
- Already ruled: the 5 P0 forks + PR-23 → DECISIONS #51–#56.

## 3. Implementation queue (ordered; each gated as noted)

1. **Recovery-invoke b1 rewrite** — the lead item. The extracted engine still runs the
   pre-#50 legacy model (availability callback + commitment-in-signature-slot); replace
   it with the ratified `acceptRecoverOwner` predicate, witnessed descriptor-v2 evidence
   in, callback out (R19 purity restored). Full plan + engine delta + test battery:
   [`../research/RECOVERY_INVOKE_B1_PLAN.md`](../research/RECOVERY_INVOKE_B1_PLAN.md).
   **Gate:** §2 recovery cluster ruled + slice greenlit.
2. **All-auth-digests-ride-wire migration — LANDED @ `51e748b` (DECISIONS #61), pending
   confirm-pass.** `engine.ts` now verifies the B1 §5 owner-key auth digests via `@ont/wire`
   (`verifySchnorr` + `transferAuthDigest`/`recoverAuthDigest`) instead of the legacy
   `@ont/protocol` verifiers. Scoped as an **`engine.ts` per-file allowance** for `@ont/wire`
   (the #60 pattern), **not** tier-wide `CORE_DECIDERS` — `state.ts` and `proof-bundle.ts`
   stay narrow ({`@ont/protocol`, `@ont/bitcoin`}). Behavior-preserving (the §5 pins prove the
   digests match); no new consensus law, no DK.
3. **Executable vector suite / harness-vector-loader** — instantiate the locked
   `docs/core/vectors/*.json` as runnable fixtures against the existing predicates (the
   safe executable lane: no new consensus behavior). Harness is ChatLunatique's lane;
   coverage is bounded by which predicates exist (scanner/params/DA-verdict/value-record
   + transfer/cancel today; the rest trail their slices). **Gate:** none — DK-independent;
   can start in parallel.

## 4. Recommended order

- **Done (DK-independent):** queue item 2 (all-auth-digests) landed @ `51e748b` (#61).
- **DK-independent, startable now:** queue item 3 (executable vector suite, CL's lane) +
  the §3c descriptor-evidence observation rule draft. Neither needs a ruling to *draft*.
- **DK-gated:** queue item 1 waits on the §2 recovery cluster. It is the only B2-kernel
  item that needs DK; everything else is either done, test-instantiation, or draftable now.

So the entire remaining B2-kernel *decision* surface reduces to: rule the recovery
cluster (matrix PR-17/18/33/34/35) + the §3c descriptor-evidence observation rule, and
greenlight the invoke slice. (§8.2a/§8.3 are already landed — see §2.) The rest proceeds
without you.

## 5. Executable vector binding lane — WRAPPED (2026-06-15); residual inventory

The B2 conformance-vector suite (`packages/consensus/src/b2-vector-suite.test.ts` spine +
`b2-vector-bindings.test.ts` bindings) holds the 94 locked vectors. After this run the
**resident-predicate binding lane is wrapped**: **40 of 94 vectors are bound** to a resident
`@ont/consensus` predicate, each asserting the predicate output equals the vector's own
`expected.verdict`. Nine resident consensus surfaces / source files back them: scanner, params,
da-verdict, value-record-authority, engine, gate-fee (#62), transcript-completeness (#63),
bond-qualification (#64), settlement (#65) — i.e. the six `CONSENSUS_VERDICTS` modules plus the
scanner (`CONSENSUS_SUPPORT`), params (`CONSENSUS_PARAMS`), and engine (`CORE_DECIDERS`) surfaces.

The other **54 vectors are NOT bound, by design** — none has a resident predicate it can honestly
bind to. They are not silently skipped; the spine keeps them visible. The 24 **pending-predicate**
rows (required-tier, no resident predicate) split into the first three groups below; the fourth is
the 30 **pending-DK** candidate-tier rows. Grouped by what each needs:

- **New surface required (13-row group; ratified ingredients, but a separately-scoped new-predicate
  phase — NOT a same-lane binding):**
  - *Winner-selection / bid-acceptance* (the input S15 treats as opaque): Q9-pos-01, Q10-neg-01,
    T7-neg-01, T9-neg-01, G1-pos-01 (#37 largest-bond + #25 tie-order).
  - *Claim-counting / notice-window resolution* (finalize/nullify/escalate over the DA-valid set):
    T17-neg-01, F11-neg-01 (#49 S6 + #37).
  - *Reopen / re-auction* (release-recording, no-adapter): T22-neg-01, T22-neg-02, B19-neg-01 (#42).
  - *Fee × K-deep confirmation* (reorged-out anchor → no fee fact): F9-neg-01 (gate-fee + #53).
  - *Occupancy / insertion* (post-DA-verdict re-claim): A11-pos-01.
  - *Wire-decoder canonicality* (reject-don't-normalize at the `@ont/wire` decoder, not consensus):
    A6-neg-01.
- **DK / recovery parked (#50-b1 invoke path; gated on the recovery cluster + §3c + the invoke
  greenlight, see §2/§3):** R1-neg-01, R2-neg-01, R7-neg-01, R9-neg-01, R10-neg-01, R10-neg-02,
  R18-pos-01, T19-pos-01, G6-neg-01 (9 vectors).
- **Deferred locality-or-window surface (a small resident surface would unblock these):**
  B10-pos-01 (exclusion locality: every other name byte-identical / no final owner unseated),
  Z9-neg-01 (notice-window / bond-window: re-derived current-chain mined height vs first-seen).
- **Candidate-tier (DK ratification-gated; the 30 pending-DK vectors):** authored, locked, and
  visible, but never executed until DK/spec promotion (the spine enforces this).

Next moves are each a *new* effort, not a continuation of the wrapped binding lane: open
winner-selection as its own scoped new-predicate phase; build the reopen / notice-window /
locality surfaces; or wait on the recovery cluster + the candidate ratifications. None is a
same-lane binding.
