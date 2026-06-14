# recovery-evidence-timing: when descriptor evidence must be witnessed for an invoke

> **Status: PROPOSED — decision-ready, DK-ratified design call. Writer:
> ClaudeleLunatique. Reviewer: ChatLunatique (pending).** This is the one genuinely
> open design sub-question inside the #50-b1 recovery-invoke slice
> ([`RECOVERY_INVOKE_B1_PLAN.md`](./RECOVERY_INVOKE_B1_PLAN.md) §3c): PR-34 fixes the
> deadline *mechanism* (`h_r + W_r`, `W_r <= challengeWindowBlocks`), but the
> fail-closed *observation rule* — by when must the descriptor evidence be witnessed
> for an invoke to be acceptable, and what happens if it is not — is unspecified. This
> paper proposes that rule. ChatLunatique's scope ruling (event `9a2c1e62`): it applies
> to **descriptor evidence only**; the §8.3 wallet proof is corroboration and gets no
> kernel witnessing deadline.
>
> Normativity: `analysis`-tier paper. The ratified outcome lands as B2 spec text
> (recovery-invoke acceptance section) + a `B2_KERNEL_HARDENING` R-row, entering the
> ledger as `candidate`. Authored under DK's keep-going grant (event `4892d54d`,
> 2026-06-14).

## 1. The question

Under #50-b1, the kernel accepts a non-cancel `RecoverOwner` invoke only with witnessed
**descriptor evidence** (the descriptor-v2 chain head: its `recoveryPubkey`, the §8.2a
digest, and the owner arming signature) — it needs that evidence to verify both the
invoke's BIP340 signature (against `recoveryPubkey`) and the arming fact (against the
name's owner key). The descriptor is public from arming (posted to resolvers, W15), but
the kernel is a pure predicate over *witnessed* inputs: it cannot ask "does this exist
somewhere?" — only "is this evidence in the witnessed set?".

That leaves a timing hole, flagged in the recovery Gaps and the R19 attack flag:
**by when must the descriptor evidence have been witnessed, relative to the invoke's
mined height `h_r`?** Without a chain-height-keyed answer, **proof-withholding /
late-reveal** flips verdicts: an invoker (or a colluder) withholds the descriptor, lets
some verifiers reject the invoke, then reveals it late so others accept — verifiers
diverge, and the kernel forks. This is the same shape as the data-availability problem
the DA agreement spent §6a–6e taming for batch bytes.

## 2. The precedent: the DA fail-closed observation rule

[`ONT_DATA_AVAILABILITY_AGREEMENT.md`](../spec/ONT_DATA_AVAILABILITY_AGREEMENT.md) §6
solves the structurally identical problem for batch data with three properties:

1. **Keyed off one Bitcoin-witnessed height.** The anchor's mined height `h` is the
   objective time origin; bytes "must be demonstrably servable by height `h+W`".
2. **Fail closed.** A no-show is *uniformly dropped* — "bytes that miss `h+W` forfeit"
   — so every verifier reads the same verdict; a withholder cannot fork, only forfeit.
3. **Evidence in, verdict out (S4).** The kernel consumes an opaque, verifier-checkable
   **served-bytes witness**; the verdict is `eligible(anchor, servedEvidence, W, C)`.
   B2 takes the witness as a typed interface; B3 fills the concrete format.

The anchor's mined height is "one Bitcoin-witnessed time origin" against which servability
is measured. A recovery invoke gives us exactly the same kind of origin: `h_r`, the mined
height of the `RecoverOwner` transaction.

## 3. Proposed rule (the recovery analog)

> A non-cancel `RecoverOwner` invoke mined at canonical height `h_r` is accepted only if
> its **armed descriptor evidence** — the current-interval chain head plus its owner
> arming signature (§8.2a) — is **demonstrably witnessed by height `h_r + W_r`** on the
> canonical chain, where `W_r` is the recovery-evidence window (`W_r <=
> challengeWindowBlocks`, PR-34). **Fail closed:** descriptor evidence not demonstrably
> witnessed by `h_r + W_r` ⇒ the invoke does **not** rotate ownership — uniformly across
> verifiers, never forking; the would-be recovery simply forfeits, exactly as a
> DA no-show forfeits. **Evidence in, verdict out:** the kernel consumes an opaque,
> verifier-checkable descriptor-evidence witness (B2 typed interface; the concrete
> "demonstrably witnessed" format is a B3 evidence-layer deliverable, mirroring the
> served-bytes witness).

The mapping is exact: **descriptor evidence : recovery invoke :: served bytes : batch
anchor.** Same fail-closed posture, same chain-height-keyed deadline, same
evidence-in-verdict-out seam, same verifier convergence.

**The §8.3 wallet proof is excluded** (ChatLunatique scope ruling): it is non-authorizing
corroboration under #50-b1, so it gets **no** kernel witnessing deadline — its absence or
lateness MUST NOT block acceptance, and its presence MUST NOT substitute for the
descriptor evidence. Only the descriptor evidence is on the `W_r` clock.

## 4. Acceptance vs. finalization, and the cancel-window interaction

`W_r <= challengeWindowBlocks` puts the evidence deadline at or before the finalize
height `h_r + challengeWindowBlocks`. Two readings of *when* the fail-closed test binds,
and how it composes with the owner's veto window `[h_r, h_r + challengeWindowBlocks)`:

- **(i) Gate finalization (recommended).** `pendingRecovery` is *entered* at `h_r` so the
  owner's cancel/veto window starts immediately (the owner is protected from the moment
  the invoke is mined, regardless of evidence resolution). **Finalization** at
  `h_r + challengeWindowBlocks` requires *both* (a) no valid cancel mined strictly before
  the deadline **and** (b) the descriptor evidence demonstrably witnessed by `h_r + W_r`.
  Missing evidence by `h_r + W_r` ⇒ finalization never fires (forfeit). This starts the
  veto promptly and fail-closes on evidence without a race.
- **(ii) Gate acceptance.** `pendingRecovery` is not entered at all until the descriptor
  evidence is witnessed (by `h_r + W_r`). Cleaner state model, but the owner's veto window
  doesn't begin until evidence resolves — shrinking the effective veto and coupling the
  owner's protection to the invoker's evidence timing.

**Recommendation: (i).** Entering `pendingRecovery` at `h_r` and gating *finalization* on
the evidence deadline keeps the owner's veto window maximal and independent of the
invoker, while still fail-closing on withheld/late evidence. It also composes cleanly with
PR-34's `W_r <= challengeWindowBlocks` ("a recovery cannot finalize before its evidence
deadline") and PR-35's finalization predicate.

## 5. Recommendation & open sub-questions for DK

**Recommend:** adopt the §3 fail-closed observation rule (descriptor evidence witnessed by
`h_r + W_r`, forfeit on no-show, §8.3 proof excluded) under reading **(i)** (gate
finalization; veto window keys off `h_r`).

Sub-questions DK rules:

1. **Reading (i) vs (ii)** — gate finalization (recommended) vs gate acceptance.
2. **`W_r` launch value.** PR-34 fixes only the constraint `1 <= W_r <= challengeWindowBlocks`.
   The concrete launch value is a launch-freeze parameter; recommend `W_r` materially
   smaller than the minimum challenge window so honest evidence has slack but late-reveal
   is foreclosed well before finalization. (Parameter, not ratified here.)
3. **"Demonstrably witnessed" format** — same B3 deliverable status as the DA served-bytes
   witness: B2 pins the opaque verifier-checkable interface now; B3 fills the format. OK to
   leave the concrete witness to B3?

## 6. Ripples & reopen triggers

- `RECOVERY_INVOKE_B1_PLAN.md` §3c → resolved (this paper); the acceptance predicate gains
  the `h_r + W_r` descriptor-evidence conjunct.
- `B2_KERNEL_HARDENING.md` R-rows (R9/R19 evidence-timing) → gain their rule; PR-34's `W_r`
  deadline gains its fail-closed semantics.
- `ONT_DATA_AVAILABILITY_AGREEMENT.md` → no change; this reuses its §6 pattern by reference.
- **Reopen** if #50 reopens toward b2h (the BIP322 wallet-proof path) — then the wallet
  proof re-enters the witnessing-deadline question and §3's descriptor-only scope widens.
