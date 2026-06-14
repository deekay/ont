# recovery-invoke b1: implementation plan for the on-chain RecoverOwner invoke

> **Status: PROPOSED — decision-ready implementation plan (greenlight = DK on
> return). Writer: ClaudeleLunatique. Reviewer: ChatLunatique (pending).**
> This is NOT a re-decision. The invoke signer is already ratified —
> [`recovery-auth (#50)`](./RECOVERY_AUTH.md) ruled **b1** (DK, event `3edddac1`):
> the on-chain 64-byte slot carries a fresh BIP340 signature by a descriptor-v2
> `recoveryPubkey` over the W13 `ont-recover-owner` digest, with witnessed
> descriptor evidence; b2h remains the standing counter-design, reopening only on
> the custody-feedback trigger. This paper plans the *landing* of that decision:
> the engine delta, the DK-gated spec ratifications it depends on, and a sequencing
> recommendation, so the lead return-docket item can be greenlit fast.
>
> Normativity: `analysis`-tier plan. It commits no normative text and decides no new
> law; it enumerates ratifications DK must make and a recommended order. Authored
> under DK's keep-going grant (event `4892d54d`, 2026-06-14).

## 1. Where we are vs. the ratified target

The audited engine's recovery **invoke** path (`packages/consensus/src/engine.ts`,
`applyRecoverOwnerRequest`) was extracted wholesale from the prototype and still runs
the **pre-#50 legacy model**:

- it pulls a proof *commitment* out of the 64-byte signature slot
  (`extractRecoveryWalletProofHashFromCommitment`), and
- it gates `pendingRecovery` on an **injected `recoveryWalletProofAvailable`
  callback** (`OntEventApplicationOptions`) — an I/O-shaped seam.

That is neither the ratified authorization model nor a pure predicate. It is the
exact gap surfaced during the X/R engine hardening: the cancel path is ratified-clean
and is now tested (`engine.recovery.test.ts`), but the invoke path is a **rewrite, not
a hardening pass** — so the R-recovery hardening deliberately seeded `pendingRecovery`
directly and never exercised or blessed this path.

The ratified target is the b1 acceptance predicate already written in
[`RECOVERY_AUTH.md` §3](./RECOVERY_AUTH.md):

```
acceptRecoverOwner(event, descriptorEvidence, nameState) :=
     bip340Verify(event.signature,
                  descriptorEvidence.recoveryPubkey,
                  recoverOwnerDigest(event))            // fact 2 + 3: fresh, field-bound
  ∧  digest(descriptorEvidence) == event.recoveryDescriptorHash
  ∧  bip340Verify(descriptorEvidence.signature,
                  nameState.ownerPubkey,
                  descriptorDigest(descriptorEvidence)) // fact 1: owner-armed
  ∧  descriptorEvidence is the current armed head of the
     name's descriptor chain
  ∧  event.prevStateTxid == nameState.headTxid
```

## 2. The engine delta

The bond-shape and lifecycle conjuncts the legacy path already enforces (immature
gate R12, single-pending R13, bond-spend + qualifying-successor + outpoint-conflict
R11) are reusable mechanics. The **authorization core** is what changes:

| Legacy (pre-#50) | b1 target |
| --- | --- |
| commitment in the 64-byte slot (`extractRecoveryWalletProofHashFromCommitment`) | a real BIP340 signature in the slot, verified over the W13 digest |
| `recoveryWalletProofAvailable` injected callback decides arming | witnessed **descriptor-v2 evidence** as an explicit kernel input |
| descriptor never verified in-kernel | R2 arming check + R6 head-binding + R10 invoke-sig, all in-kernel |
| I/O-shaped seam (R19 violation) | pure predicate over (event, descriptorEvidence, nameState) — no callback |

Concretely:

1. **Add a witnessed `RecoveryDescriptorEvidence` input** (descriptor-v2 fields incl.
   `recoveryPubkey`, the §8.2 digest, the owner arming signature, chain-head position)
   to the kernel's evidence set, supplied like the other audited witnessed inputs.
   The evidence layer (`@ont/evidence`, non-deciding) assembles and serves it; the
   kernel consumes it.
2. **Replace** the commitment-extraction + availability callback with the three
   verification conjuncts (R10 invoke BIP340 over W13, R2 owner-arming BIP340 over the
   §8.2 digest, R6 `recoveryDescriptorHash == digest(armed head)`), plus the R5
   `prevStateTxid == head` bind and the R7 profile gate (descriptor v2 BIP340 path;
   v1 parse-valid but not invokable).
3. **Delete** `recoveryWalletProofAvailable` from the kernel decision path → R19
   purity restored (the BIP322 wallet proof becomes non-authorizing corroboration at
   the evidence layer per the §8.3 amendment; its absence MUST NOT block, its presence
   MUST NOT substitute).
4. The `RecoverOwner` 0x09 **wire layout is byte-for-byte unchanged** — this defines
   the *meaning* of the existing normative `signature` field, the work WIRE §5 routes
   to B2.

## 3. Spec ratifications this depends on (DK-gated)

The implementation cannot land as ratified law until these do. All are named,
small, and already scoped in the hardening doc / RECOVERY_AUTH ripples:

1. **WIRE §8.2 descriptor v2** — add `recoveryPubkey(32)`, `descriptorVersion 2`,
   digest under the lenPrefix/-v2 conventions; v1 kept as legacy-parse evidence. The
   RECOVERY_AUTH header flags the §8.2/§8.3 normative amendments as **deferred to DK
   ratification**.
2. **WIRE §8.3 narrowing** — the wallet proof's invoke-field bindings narrow to an
   evidence-layer corroboration object (resolver/watcher hygiene), not a kernel
   acceptance input.
3. **The recovery acceptance-rule cluster — already drafted as decision-ready spec-PRs
   in [`B2_SPEC_PR_DECISION_MATRIX.md`](../core/B2_SPEC_PR_DECISION_MATRIX.md), NOT
   undrafted.** DK ratifies them via the matrix (as-recommended or row-by-row); this
   plan is their engine landing. Mapping:
   - **PR-17** (state-head linkage + recovery interval-opening) + **PR-18**
     (`ownershipRef` / interval rotation) → R5 (`prevStateTxid == head`) and R4
     (descriptor binds the current interval). PR-17's interval-opening half is a flagged
     individual-review row (recommended: open at finalization, not invocation).
   - **PR-33** (descriptor chain) → R3/R6 (exactly-next sequence; armed = current-interval
     head — closes the compromised-old-recovery-wallet attack).
   - **PR-34** (RecoverOwner transaction-shape, refined post-#50-b1) → R8/R11/R12/R13/R15/R16/R19,
     and it already carries the three things an earlier draft of this plan flagged as loose:
     the **CANCEL flag-bit registry** (`0x01`, wire-normative), the **recovery-evidence
     witnessing deadline** (`h_r + W_r`, with `W_r <= challengeWindowBlocks` — so the
     evidence-timing rule is *drafted, not open*), and **X13 transfer-vs-recovery
     precedence** (recommended: block in-window transfers, CANCEL-only veto). Flagged
     individual-review; must be ruled together with PR-35.
   - **PR-35** (recovery finalization) → R18.

## 4. What stays parked (interactions, not part of this slice)

- **The cluster decisions themselves** (PR-17/18/33/34/35 + §8.2/§8.3) — ruled by DK
  via the matrix; this plan does not pre-empt them. In particular the
  transfer-during-recovery precedence is **PR-34's X13** (recommended block + CANCEL-only
  veto), ruled together with PR-35.
- **Decision #40 abort-only watcher credential** — relaxes the R15 cancel-signer
  exclusivity by named amendment; touches the cancel side, not invoke.
- **PR-32 value-record interval rule** (records attach only to materialized intervals)
  — adjacent (shares PR-18 interval rotation), not in this slice.

## 5. Recommendation & sequencing

The spec side is already batched in the decision matrix; implement the predicate as a
single audited slice once it is ruled. Proposed order:

1. **DK rules the recovery cluster in the matrix** — PR-17/18/33/34/35 (the
   individual-review rows PR-17/PR-34/PR-35 are flagged there) + the §8.2 v2 /
   §8.3-narrowing amendments (RECOVERY_AUTH §6 ripples) + greenlights this slice.
2. **Land any writer/reviewer-only matrix halves** once greenlit (no further DK input
   on the non-individual-review portions).
3. **Implement** `acceptRecoverOwner` per §2, witnessed descriptor-v2 evidence in,
   callback out; negative battery from RECOVERY_AUTH §6:
   replayed-arming-sig-as-invoke, descriptor-hash mismatch, non-head descriptor,
   stale `prevStateTxid`, cancel-digest-as-invoke, v1-descriptor invoke,
   wrong-pubkey signature — all rejected. (PR-34/PR-35's X13 settles the
   `pendingRecovery` interaction before the path goes live.)

**The one risk to name:** the b2h reopen-trigger. If expert custody feedback (the
standing "raise with Max" item) says BIP340 recovery custody is impractical for the
wallets that matter, #50 reopens toward b2h and this plan's authorization core is
replaced (the bond/lifecycle mechanics and most spec deps survive). The plan is
otherwise on fully-ratified ground.

## 6. Open questions for DK

1. **Greenlight the invoke-rewrite slice?** (b1 is ratified; the slice was parked on
   the matrix recovery-cluster rulings, not on any undrafted design.)
2. **Rule the recovery cluster** (PR-17/18/33/34/35) + the §8.2 v2 / §8.3-narrowing
   amendments in the matrix? PR-34 and PR-35 must be ruled together (X13). The matrix
   is the decision vehicle; this plan is the engine landing once they're ruled.

### Ripples if greenlit

- `ONT_RECOVERY_INVOKE_SPEC.md`: item 2 (signer) → resolved-and-implemented; gains the
  acceptance sections from the ratified PR-17/18/33/34/35 cluster.
- `WIRE_FORMAT.md`: §8.2 v2, §8.3 narrowing, §4.2 flags registry.
- `B2_KERNEL_HARDENING.md`: R-invoke rows move `candidate-stays` → tested; R19 callback
  violation closed.
- `engine.ts`: `recoveryWalletProofAvailable` removed; `RecoveryDescriptorEvidence`
  witnessed input added; `applyRecoverOwnerRequest` becomes the b1 predicate.

### Reopen triggers

- Expert custody feedback reopening #50 toward b2h (replaces the authorization core).
- The #40 watcher credential landing with invoke-side field needs.
