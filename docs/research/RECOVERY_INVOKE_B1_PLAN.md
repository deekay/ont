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
3. **R-row spec PRs** grounding the predicate (all `candidate-stays` in
   [`B2_KERNEL_HARDENING.md`](../core/B2_KERNEL_HARDENING.md), each needing a named
   section in `ONT_RECOVERY_INVOKE_SPEC.md` or the B2 kernel spec):
   - **R5** prevStateTxid = current state head (replay protection across intervals);
   - **R6** "armed descriptor" = current-interval chain head (closes the
     compromised-old-recovery-wallet attack — any historical descriptor invocable by
     hash today);
   - **R3** descriptor-chain acceptance (exactly-next sequence, previousDescriptorHash
     links to head) as a kernel predicate, not a store guard;
   - **R4** `ownershipRef` semantics + interval rotation (shared with value records;
     no doc defines it today);
   - **R11** the invoke transaction-shape predicate (bond spend + qualifying successor,
     and whether the successor MUST pay the descriptor's `recoveryAddress`).
4. **Evidence-timing observation rule** — the R19 attack flag and the recovery Gaps
   list: *by when* must the descriptor evidence have been served/witnessed relative to
   the invoke's mined height? Without a defined observation rule, proof-withholding /
   late-reveal can flip verdicts (shaped like the DA fail-closed problem). This is the
   one genuinely open *design* sub-question inside the rewrite.
5. **WIRE §4.2 flags-bit registry** — the invoke/cancel discriminator
   (`RECOVER_OWNER_FLAG_CANCEL = 0x01`) is code-only; the invoke predicate needs
   `flags & CANCEL == 0` to mean "this is an invoke," which rests on a non-normative
   bit today.

## 4. What stays parked (interactions, not part of this slice)

- **transfer-during-recovery conflict rule** — its own return-docket item (DK leaned
  block + explicit-cancel). It shapes whether/how a transfer interacts with an open
  `pendingRecovery`; the invoke rewrite should not pre-empt it. Recommend ruling it in
  parallel since both touch the `pendingRecovery` lifecycle.
- **PR-17/34/35** — recovery interval-opening, recovery bond-fields, cancel-timing.
- **Decision #40 abort-only watcher credential** — relaxes the R15 cancel-signer
  exclusivity by named amendment; touches the cancel side, not invoke.
- **R12 maturity boundary** (`>=` vs `>`) and **R13 single-pending** semantics — pin
  on promotion; the legacy mechanics are reused but their boundaries are unspecified.

## 5. Recommendation & sequencing

Land the spec ratifications as **one batched amendment set** (§3 items 1–5 are
small, mutually consistent, and all flow from #50-b1), then implement the predicate
as a single audited slice with negative tests. Proposed order:

1. **DK greenlights the slice** + batch-approves the §8.2 v2 / §8.3-narrowing
   amendments (they are the RECOVERY_AUTH §6 ripples, already recommended).
2. **Author the R5/R6/R3/R4/R11 spec sections** + the evidence-timing observation
   rule + the §4.2 flags registry (writer/reviewer loop; no DK needed once the
   amendments are greenlit, except the evidence-timing rule which is a design call).
3. **Implement** `acceptRecoverOwner` per §3, witnessed descriptor-v2 evidence in,
   callback out; negative battery from RECOVERY_AUTH §6:
   replayed-arming-sig-as-invoke, descriptor-hash mismatch, non-head descriptor,
   stale `prevStateTxid`, cancel-digest-as-invoke, v1-descriptor invoke,
   wrong-pubkey signature — all rejected.
4. Rule **transfer-during-recovery** in parallel so the `pendingRecovery`
   interaction is settled before the invoke path goes live.

**The one risk to name:** the b2h reopen-trigger. If expert custody feedback (the
standing "raise with Max" item) says BIP340 recovery custody is impractical for the
wallets that matter, #50 reopens toward b2h and this plan's authorization core is
replaced (the bond/lifecycle mechanics and most spec deps survive). The plan is
otherwise on fully-ratified ground.

## 6. Open questions for DK

1. **Greenlight the invoke-rewrite slice?** (b1 is ratified; the slice was parked
   only on the spec deps + the transfer-during-recovery interaction.)
2. **Batch-approve the §8.2 v2 + §8.3-narrowing amendments?** (RECOVERY_AUTH §6
   recommends both; they are the deferred-to-DK normative ripples.)
3. **transfer-during-recovery:** rule it first, or in parallel with the spec
   sections? (Recommend parallel.)
4. **Evidence-timing observation rule:** any steer on the by-when-witnessed posture,
   or leave it to the writer/reviewer loop to draft a fail-closed proposal for your
   ratification? (Recommend the latter.)

### Ripples if greenlit

- `ONT_RECOVERY_INVOKE_SPEC.md`: item 2 (signer) → resolved-and-implemented; gains the
  R5/R6/R3/R4/R11 acceptance sections.
- `WIRE_FORMAT.md`: §8.2 v2, §8.3 narrowing, §4.2 flags registry.
- `B2_KERNEL_HARDENING.md`: R-invoke rows move `candidate-stays` → tested; R19 callback
  violation closed.
- `engine.ts`: `recoveryWalletProofAvailable` removed; `RecoveryDescriptorEvidence`
  witnessed input added; `applyRecoverOwnerRequest` becomes the b1 predicate.

### Reopen triggers

- Expert custody feedback reopening #50 toward b2h (replaces the authorization core).
- The #40 watcher credential landing with invoke-side field needs.
