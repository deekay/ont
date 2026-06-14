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
   `recoveryPubkey`, the §8.2a digest, the owner arming signature, chain-head position)
   to the kernel's evidence set, supplied like the other audited witnessed inputs. The
   evidence-supply layer is canon L3 `@ont/evidence` (a **proposed** package — it does
   **not** exist yet; today's packages are architect/bitcoin/consensus/core/db/protocol/wire),
   or, interim, the existing `@ont/core` indexer; the boundary is named explicitly in
   the landing checklist (§5). The kernel only consumes the witnessed input.
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

## 3. What this depends on — spec is RATIFIED; code + conformance remain

**Correction (per review): the spec amendments already landed.** On this branch
WIRE_FORMAT **§8.2a** (descriptor v2: `recoveryPubkey(32)`, `descriptorVersion 2`, v2
digest) and **§8.3** (wallet proof → corroboration, not the invoke authorizer) are
**RATIFIED b1 (2026-06-14)**, consistent with DECISIONS #50 and
[`ONT_RECOVERY_INVOKE_SPEC.md`](../spec/ONT_RECOVERY_INVOKE_SPEC.md) item 2. DK is
**not** asked to re-approve them. What remains is implementation + conformance.

**3a. Code-package delta (prerequisite, currently missing).** Both `@ont/protocol`
and `@ont/wire` still expose descriptor **v1 only** (`RECOVERY_DESCRIPTOR_VERSION = 1`;
`parseRecoveryDescriptor` rejects v2; no `recoveryPubkey`). Before the engine can build
`RecoveryDescriptorEvidence`, a package step must add v2 parse/digest/verify/sign per
§8.2a, keep v1 parse-valid but **not invokable**, and carry v2 golden + negative
(wrong-`recoveryPubkey`, v1-invoke) vectors. Reviewer-gated, no DK.

**3b. The recovery acceptance-rule cluster — decision-ready in the matrix.** DK rules
these via [`B2_SPEC_PR_DECISION_MATRIX.md`](../core/B2_SPEC_PR_DECISION_MATRIX.md); this
plan is their engine landing. Mapping, with the review's critical-path calls:
   - **PR-33** → R3/R6 (descriptor chain; armed = current-interval head). **Critical** —
     required for the non-head-descriptor and stale-sequence negatives.
   - **PR-18 `ownershipRef`** → R4. **Split:** the *minimum* current-interval
     `ownershipRef` equality is **critical** — it stops old-interval descriptor replay
     (the seller-reclaims-after-sale theft, Decision #40's exact target). Full
     interval-rotation semantics may **trail** with PR-17/R18 if this slice's vectors
     don't exercise them; the current-interval binding cannot be hand-waved.
   - **PR-17 state-head** → R5 (`prevStateTxid == head`). Interval-opening half is a
     flagged individual-review row (recommended: open at finalization).
   - **PR-34** → R8/R11/R12/R13/R15/R16/R19, plus the **CANCEL flag-bit registry**
     (`0x01` — `flags & CANCEL == 0` needs it to be normative) and **X13**
     transfer-vs-recovery. **R11 stays explicit:** a non-cancel invoke rotates the live
     bond to a successor output, so the bond-spend shape and the
     `recoveryAddress`/successor-output binding are in-scope. Individual-review; ruled
     with PR-35.
   - **PR-35** → R18 (finalization).

**3c. Evidence-timing observation rule — the real open design call (DK-ratified).**
PR-34 carries the deadline *mechanism* (`h_r + W_r`, `W_r <= challengeWindowBlocks`).
What is genuinely open is the fail-closed **observation rule**: by when must the
**descriptor evidence** be witnessed for an invoke to be acceptable. Under b1 this
applies to **descriptor evidence only** — the §8.3 wallet proof is corroboration and
gets **no** kernel witnessing deadline. I will draft a fail-closed proposal; it is a
**DK-ratified** call, not writer/reviewer-only.

## 4. What stays parked (interactions, not part of this slice)

- **The matrix recovery-cluster rulings** (PR-17/18/33/34/35) — ruled by DK; this plan
  does not pre-empt them. (§8.2a/§8.3 are already landed, not pending.) In particular
  the transfer-during-recovery precedence is **PR-34's X13** (recommended block +
  CANCEL-only veto), ruled together with PR-35.
- **Decision #40 abort-only watcher credential** — relaxes the R15 cancel-signer
  exclusivity by named amendment; touches the cancel side, not invoke.
- **PR-32 value-record interval rule** (records attach only to materialized intervals)
  — adjacent (shares PR-18 interval rotation), not in this slice.

## 5. Sequencing & landing checklist

Spec is ratified; the DK input needed is narrow (§6). Order:

1. **DK greenlights the slice** + rules the matrix individual-review rows
   (PR-17/PR-34/PR-35; PR-34 & PR-35 together) + ratifies the §3c evidence-timing
   proposal. §8.2a/§8.3 are already landed — no re-approval.
2. **Package v2 (§3a)** — descriptor v2 in `@ont/protocol` + `@ont/wire`; reviewer-gated,
   no DK. Prerequisite to building `RecoveryDescriptorEvidence`.
3. **Engine + caller change** — implement `acceptRecoverOwner` (§2). This is a
   **public-API change, not engine-internal**: `OntEventApplicationOptions` loses
   `recoveryWalletProofAvailable`, and the caller `@ont/core` `indexer.ts`
   (+ `indexer.test.ts`) switches to supplying witnessed descriptor evidence.
4. Negative battery from RECOVERY_AUTH §6 (replayed-arming-sig-as-invoke,
   descriptor-hash mismatch, non-head descriptor, stale `prevStateTxid`,
   cancel-digest-as-invoke, v1-descriptor invoke, wrong-`recoveryPubkey`) — all rejected.

**Landing checklist:** v2 package support (§3a) · `RecoveryDescriptorEvidence` input
type · `OntEventApplicationOptions` callback removed · `@ont/core` indexer + indexer.test
migrated to evidence-supply · evidence-supply boundary decided (new `@ont/evidence` vs
interim `@ont/core` indexer) · acceptance predicate + negative battery · conformance
vectors.

**The one risk to name:** the b2h reopen-trigger. If expert custody feedback (the
standing "raise with Max" item) says BIP340 recovery custody is impractical for the
wallets that matter, #50 reopens toward b2h and this plan's authorization core is
replaced (the bond/lifecycle mechanics survive). Otherwise on fully-ratified ground.

## 6. Open questions for DK

1. **Greenlight the invoke-rewrite slice?** (b1 + §8.2a/§8.3 are ratified; the slice was
   parked on the matrix individual-review rows + the evidence-timing call, not on any
   undrafted design or un-landed spec.)
2. **Rule the matrix individual-review rows** — PR-17, PR-34, PR-35 (PR-34 & PR-35
   together, X13). The rest of the cluster (PR-18, PR-33) is batch-approvable.
3. **Ratify the §3c evidence-timing fail-closed observation rule** (descriptor-evidence
   only; §8.3 proof excluded) — I will draft it for your ratification.

### Ripples if greenlit

- `@ont/protocol` + `@ont/wire`: descriptor **v2** support (§8.2a) — currently v1-only.
- `WIRE_FORMAT.md`: §4.2 flags-bit registry (PR-34). §8.2a/§8.3 already landed.
- `@ont/consensus` `engine.ts` + `OntEventApplicationOptions`; `@ont/core` `indexer.ts`
  + `indexer.test.ts` — callback removed, witnessed descriptor evidence supplied instead.
- `B2_KERNEL_HARDENING.md`: R-invoke rows `candidate-stays` → tested; R19 callback
  violation closed.
- `ONT_RECOVERY_INVOKE_SPEC.md`: item 2 → resolved-and-implemented.

### Reopen triggers

- Expert custody feedback reopening #50 toward b2h (replaces the authorization core).
- The #40 watcher credential landing with invoke-side field needs.
