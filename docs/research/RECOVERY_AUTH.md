# recovery-auth: who signs the on-chain RecoverOwner invoke

> **Status: DRAFT decision paper — pre-B2 named decision `recovery-auth`.**
> Writer: ClaudeleLunatique. Reviewer: ChatLunatique (adversarial pass required).
> Ruling: DK. Drafted 2026-06-12 during the autonomous session (DK grant, event
> `9c1e1ba7`); if writer and reviewer agree, adoption is **provisional pending DK**
> per the session protocol, and DK can flip it on return.
>
> Normativity: `analysis`-tier paper. The ratified outcome lands as spec text in
> [`../spec/ONT_RECOVERY_INVOKE_SPEC.md`](../spec/ONT_RECOVERY_INVOKE_SPEC.md) and
> (for the descriptor change) [`../spec/WIRE_FORMAT.md`](../spec/WIRE_FORMAT.md),
> entering the ledger as `candidate` per normative-hardening.

## 1. The question

[`ONT_RECOVERY_INVOKE_SPEC.md`](../spec/ONT_RECOVERY_INVOKE_SPEC.md) ("What's missing
in code", item 2) leaves the invoke-path signer of the on-chain `RecoverOwner`
payload's 64-byte Schnorr `signature` field undefined, with three candidates:

- **(a)** the owner-key **arming signature replayed** from the armed descriptor;
- **(b)** a **fresh signature by the recovery wallet** over the
  `RecoverOwnerAuthorizationFields` digest;
- **(c)** the owner-key **cancel** signature — which is the *veto* path, already
  defined (`signRecoverOwnerCancelAuthorization`), and not actually a candidate for
  the invoke path. The real choice is **a vs b**.

B1 deliberately pinned only shapes and digests here: W13 fixed the byte-precise
`ont-recover-owner` digest (domain label ‖ `prevStateTxid` ‖ `newOwnerPubkey` ‖
`flags`/`successorBondVout` ‖ `challengeWindowBlocks` ‖ `recoveryDescriptorHash`,
`events.ts:343-358`), and its note routed *whose key verifies that digest* to B2
recovery-authority hardening. B2 cannot write the recovery acceptance rules without
this decision.

## 2. The crux: what the signature must prove

A valid invoke must establish three distinct facts:

1. **The descriptor was owner-authorized** (the arming fact).
2. **This invocation is authorized by the armed recovery authority** (the invoke
   fact — fresh, for *this* state head).
3. **The invoke fields are bound** — above all `newOwnerPubkey`, the key the name
   rotates to, and `prevStateTxid`, the state head being recovered from.

Option (a) proves only fact 1 — and proves it with a **public artifact**. The armed
descriptor, signature included, is *posted to resolvers by design* (W15; that's how
watchers and resolvers enforce the descriptor chain). Anyone can therefore replay it.
The arming signature covers the descriptor fields (`recovery-descriptor.ts:142-170`)
— it does not and cannot cover `newOwnerPubkey` or `prevStateTxid`, which don't exist
at arming time. Under (a):

- If the kernel doesn't bind `newOwnerPubkey` to anything else, **anyone who can read
  a resolver can rotate any armed name to their own key** — name theft with a public
  input. Fatal.
- If the kernel patches this by forcing the successor bond / new owner to derive from
  the descriptor's `recoveryAddress`, theft becomes **permissionless forced recovery**:
  any third party can *start* the challenge window on any armed name, at will,
  repeatedly. The owner's veto is the only stop, so the attacker converts a public
  string into unbounded veto costs for the victim — institutionalizing exactly the
  veto-grief economics flagged open in
  [`OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md) §4.2, except free for the attacker and
  unattributable. Still fatal, just slower.

Option (b) proves facts 2 and 3 directly — the W13 digest already covers every invoke
field — and proves fact 1 **by reference**: `recoveryDescriptorHash` names the armed
descriptor, whose own owner signature the kernel checks as evidence. Nothing about
(b) is novel design; it is what the digest layout was shaped for. The question inside
(b) is *which key* and *how the kernel learns it* — §3.

## 3. The design, precisely (option b1)

The descriptor today commits a `recoveryAddress` — a 1–200 char address *string*
(`recovery-descriptor.ts:19`, W15), not a key. A 64-byte BIP340 signature cannot be
verified against an address whose pubkey is unrevealed. Two sub-options:

- **(b1) Descriptor v2 commits a recovery pubkey.** Add a required
  `recoveryPubkey` (32-byte x-only) field to the signed descriptor, bumping
  `descriptorVersion` to 2. The on-chain 64-byte slot carries a fresh BIP340
  signature by that key over the existing W13 `ont-recover-owner` digest. The wire
  layout of `RecoverOwner` (0x09, 171 bytes, W7) is **byte-for-byte unchanged** —
  this decision defines the *meaning* of an existing field, not its shape.
- **(b2) BIP322 indirection.** Authorize the invoke with a BIP322 signature against
  `recoveryAddress` directly. Rejected: BIP322 verification drags full script
  validation into the kernel (heavy, wrong layer — the same reasoning that made the
  recovery *wallet proof* a separate off-chain object, W15a); the witness is
  variable-size and cannot ride the fixed 64-byte on-chain slot, so the
  authorization would have to live off-chain — making an on-chain consensus event
  **not self-describing about its own validity**, which inverts the audited-core
  boundary (the kernel would need evidence to know whether a *wire event* is even
  authorized, for no compensating gain).

**Kernel acceptance rule under b1** — pure predicate, evidence in / verdict out:

```
acceptRecoverOwner(event, descriptorEvidence, nameState) :=
     bip340Verify(event.signature,
                  descriptorEvidence.recoveryPubkey,
                  recoverOwnerDigest(event))            // fact 2 + 3
  ∧  digest(descriptorEvidence) == event.recoveryDescriptorHash
  ∧  bip340Verify(descriptorEvidence.signature,
                  nameState.ownerPubkey,
                  descriptorDigest(descriptorEvidence)) // fact 1
  ∧  descriptorEvidence is the current armed head of the
     name's descriptor chain (chain links checked as given;
     supplying the chain is the evidence layer's job)
  ∧  event.prevStateTxid == nameState.headTxid
```

**Replay analysis.** The digest binds `prevStateTxid`: a captured invoke signature is
valid only against that exact state head. Once the recovery settles (or is vetoed and
the state advances), the head moves and the signature is dead. Same-head rebroadcast
is the same invocation, not a replay. Cross-name replay fails on `prevStateTxid`;
cross-domain replay (transfer↔recover, invoke↔cancel) fails on W13 domain separation
— already pinned with negative vectors in B1.

**Veto path unchanged** (the spec's (c)): owner-key cancel via the existing cancel
authorization digest. The BIP322 recovery **wallet proof** (W15a) also keeps exactly
its current role — resolver-side arming hygiene, evidence layer, never consulted by
the kernel.

## 4. Options compared

| | (a) replay arming sig | **(b1) fresh sig, descriptor-v2 pubkey** | (b2) BIP322 indirection |
| --- | --- | --- | --- |
| Binds `newOwnerPubkey` / `prevStateTxid` | **no** — pre-dates them | yes (W13 digest) | yes (message permitting) |
| Replayable by third parties | **yes — descriptor is public** | no (fresh key, fresh head) | no |
| Forced-recovery griefing | **yes** (see §2) | no — invoke needs the recovery key | no |
| On-chain event self-authorizing | yes (vacuously — by a public string) | **yes** | **no** — auth lives off-chain |
| Kernel cost | sig verify | sig verify | full script validation in-kernel |
| Wire change | none | **none** (0x09 unchanged) | none on-chain, new off-chain object |
| Off-chain change | none | descriptor v2 (+1 field, version-gated) | new authorization object |
| Wallet requirement | none new | recovery key must be BIP340-capable | any address, but new proof flow |

## 5. What this paper does NOT change

- The **arming flow**, descriptor chain rule, and `/recovery-descriptors` route.
- The **veto path** (c) and its cancel digest.
- The **BIP322 wallet proof** (W15a) — separate object, evidence layer, unchanged.
- The **wire format** — `RecoverOwner` 0x09 layout, 171-byte envelope, W7 table, and
  the W13 digest are all untouched. (No normative-§-amendment of on-chain wire.)
- **Recovery remains opt-in** (Decision #40) and the abort-only watcher credential
  (OPEN_QUESTIONS §4.1) remains open — the veto signer is the owner key today; a
  watcher credential would *add* a veto signer, not touch the invoke signer.

## 6. Recommendation

**(b1).** Fresh BIP340 signature by a recovery key committed in a v2 descriptor, over
the unchanged W13 digest; kernel rule as in §3. (a) is not a viable fallback at any
parameterization — it fails §2 fact 2/3 structurally, not by tuning.

Costs, honestly: (1) **descriptor v2** — one added field in an off-chain shape whose
spec section is normative since wire-normative (#48); amended by this named decision,
version-gated, with v1 descriptors remaining parse-valid but **not invokable** —
armed-v1 names must re-arm with v2 before on-chain invoke exists. With signet
decommissioned and nothing-is-precious ratified, v1 descriptors are conformance
fossils, not a migration burden. (2) **Recovery wallets need a BIP340-capable key** —
the recovery authority can no longer be a bare address whose wallet only does
message-signing. This is the real-world cost; it buys per-invocation freshness and
kernel purity, and our own stack derives such keys everywhere already. The spec's
"raise with Max" note stands as the reopen path if custody practice says otherwise.

### Ripples if ratified

- `ONT_RECOVERY_INVOKE_SPEC.md`: item 2 resolved (cite this paper); the architect
  builder's input shape is fixed — recovery signing key (b), not descriptor replay (a).
- `WIRE_FORMAT.md` §8.2 (descriptor): v2 field set with `recoveryPubkey(32)`,
  digest layout extended under the established lenPrefix/-v2 conventions; v1 kept as
  legacy-parse evidence. New golden vectors for the v2 digest.
- `B2_KERNEL_HARDENING.md`: recovery-authority rules get their source; §3 predicate
  becomes R-rules with negative tests: replayed-arming-sig-as-invoke rejected,
  descriptor-hash mismatch rejected, non-head descriptor rejected, stale
  `prevStateTxid` rejected, cancel-digest-as-invoke rejected, v1-descriptor invoke
  rejected.
- Wallet/CLI (B5): `recover-invoke` takes the recovery WIF/key as the spec already
  sketches; arming UX gains "re-arm to v2" guidance.

### Reopen triggers

- Expert custody feedback (the spec's standing "raise with Max" item) showing
  BIP340-capable recovery keys are impractical for the wallets that matter — reopens
  toward a hardened (b2) with the script-validation cost paid at the evidence layer
  feeding a kernel-checkable artifact, not toward (a).
- The abort-only watcher credential design (OPEN_QUESTIONS §4.1) landing in a form
  that needs invoke-side fields — touches §3's predicate by named amendment.
