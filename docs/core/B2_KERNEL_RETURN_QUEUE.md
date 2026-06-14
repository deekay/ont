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
- **Normative wire amendments** (deferred to DK): WIRE §8.2 descriptor v2
  (`recoveryPubkey`), §8.3 proof → corroboration (RECOVERY_AUTH §6 ripples).
- Already ruled: the 5 P0 forks + PR-23 → DECISIONS #51–#56.

## 3. Implementation queue (ordered; each gated as noted)

1. **Recovery-invoke b1 rewrite** — the lead item. The extracted engine still runs the
   pre-#50 legacy model (availability callback + commitment-in-signature-slot); replace
   it with the ratified `acceptRecoverOwner` predicate, witnessed descriptor-v2 evidence
   in, callback out (R19 purity restored). Full plan + engine delta + test battery:
   [`../research/RECOVERY_INVOKE_B1_PLAN.md`](../research/RECOVERY_INVOKE_B1_PLAN.md).
   **Gate:** §2 recovery cluster ruled + slice greenlit.
2. **All-auth-digests-ride-wire migration** — the parked `(ii)` option from the
   transfer-authority tier call: move `CORE_DECIDERS` from `@ont/protocol` onto the
   B1-normative `@ont/wire` digests directly (retiring the legacy auth verifiers for the
   kernel). A refactor, **no new consensus law** — the §5 equivalence pins already prove
   the digests match, so this is mechanical and low-risk. **Gate:** own boundary-amendment
   slice (a #59/#60-style manifest amendment), reviewer-gated, no DK decision.
3. **Executable vector suite / harness-vector-loader** — instantiate the locked
   `docs/core/vectors/*.json` as runnable fixtures against the existing predicates (the
   safe executable lane: no new consensus behavior). Harness is ChatLunatique's lane;
   coverage is bounded by which predicates exist (scanner/params/DA-verdict/value-record
   + transfer/cancel today; the rest trail their slices). **Gate:** none — DK-independent;
   can start in parallel.

## 4. Recommended order

- **DK-independent, startable now:** queue item 3 (executable vector suite, CL's lane)
  and item 2 (the all-auth-digests refactor, reviewer-gated). Neither needs a ruling.
- **DK-gated:** queue item 1 waits on the §2 recovery cluster. It is the only B2-kernel
  item that needs DK; everything else is either done, refactor, or test-instantiation.

So the entire remaining B2-kernel *decision* surface reduces to: rule the recovery
cluster (matrix PR-17/18/33/34/35 + §8.2/§8.3) and greenlight the invoke slice. The
rest proceeds without you.
