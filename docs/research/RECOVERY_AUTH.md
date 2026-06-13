# recovery-auth: who signs the on-chain RecoverOwner invoke

> **Status: ADOPTED PROVISIONAL pending DK — recovery-auth (#50); pre-B2 named
> decision.**
> Writer: ClaudeleLunatique. Reviewer: ChatLunatique — **round 1: COUNTER as
> drafted** (the round-1 text misstated the wallet proof's documented role; see
> "Review round 1" at bottom); **round 2: CONCUR, provisional-pending-DK** (see
> "Review round 2"). Adopted under the autonomous-session protocol (DK grant,
> event `9c1e1ba7`), recorded as Decision #50. **The values call — smallest
> audited kernel (b1) vs cold-hardware recovery custody (b2h) — is DK's on
> return; b2h (§4) is the standing counter-design.** B2 recovery-authority rules
> may now draft against this decision, citing it as provisional.
>
> Normativity: `analysis`-tier paper. The ratified outcome lands as spec text in
> [`../spec/ONT_RECOVERY_INVOKE_SPEC.md`](../spec/ONT_RECOVERY_INVOKE_SPEC.md) and
> [`../spec/WIRE_FORMAT.md`](../spec/WIRE_FORMAT.md) (both candidates amend
> normative §8 text by named decision), entering the ledger as `candidate` per
> normative-hardening. The normative §8.2/§8.3 amendments are **deferred to DK
> ratification**; candidate/analysis-tier ripples carry provisional notes now.

## 1. The question

[`ONT_RECOVERY_INVOKE_SPEC.md`](../spec/ONT_RECOVERY_INVOKE_SPEC.md) ("What's missing
in code", item 2) leaves the invoke-path signer of the on-chain `RecoverOwner`
payload's 64-byte Schnorr `signature` field undefined, with three candidates:

- **(a)** the owner-key **arming signature replayed** from the armed descriptor;
- **(b)** a **fresh authorization by the recovery wallet** — which splits into
  **(b1)** an on-chain BIP340 signature over the W13 digest by a recovery *pubkey*
  committed in a v2 descriptor, or **(b2h)** the **BIP322 wallet-proof evidence
  path** the specs already sketch (proof posted off-chain, kernel consumes it as
  evidence), hardened;
- **(c)** the owner-key **cancel** signature — the *veto* path, already defined
  (`signRecoverOwnerCancelAuthorization`), not a candidate for the invoke path.

B1 deliberately pinned only shapes and digests here: W13 fixed the byte-precise
`ont-recover-owner` digest (domain label ‖ `prevStateTxid` ‖ `newOwnerPubkey` ‖
`flags`/`successorBondVout` ‖ `challengeWindowBlocks` ‖ `recoveryDescriptorHash`,
`events.ts:343-358`), and its note routed *whose key authorizes an invoke* to B2
recovery-authority hardening. B2 cannot write the recovery acceptance rules without
this decision.

**What the specs already say (corrected in round 2).** The wallet proof is not mere
arming hygiene — round 1 was wrong about this. Normative WIRE_FORMAT §8.3 defines the
proof envelope as binding exactly the invoke fields (`prevStateTxid`,
`recoveryDescriptorHash`, `newOwnerPubkey`, `successorBondVout`,
`challengeWindowBlocks`), §8.2 routes a cross-object `signingProfile` equality check
to B2, and the analysis-tier
[`OWNER_KEY_RECOVERY.md`](./OWNER_KEY_RECOVERY.md) ("Challenge-Window Recovery")
describes the evidence-gated flow: a name enters `recovery_pending` *"only if the
matching proof is available and verifies."* So (b2h) is a documented direction, not a
strawman. What remains true: the invoke spec holds the on-chain signer question
**open** ("isn't yet defined" — a/b/c), and WIRE_FORMAT froze §8 *shapes* while
routing authority semantics to B2. The decision is genuinely undecided; both (b1)
and (b2h) amend normative text either way (§6).

## 2. The crux: what a valid invoke must prove

1. **The descriptor was owner-authorized** (the arming fact).
2. **This invocation is authorized by the armed recovery authority** (the invoke
   fact — fresh, for *this* state head).
3. **The invoke fields are bound** — above all `newOwnerPubkey` and `prevStateTxid`.

Option (a) proves only fact 1, with a **public artifact**: the armed descriptor,
signature included, is posted to resolvers by design (W15). Anyone can replay it. The
arming signature covers descriptor fields only (`recovery-descriptor.ts:142-170`) —
`newOwnerPubkey` and `prevStateTxid` don't exist at arming time. Under (a): unbound
`newOwnerPubkey` = name theft by anyone who can read a resolver; binding the
successor to the descriptor's `recoveryAddress` instead = **permissionless forced
recovery** — any third party starts the challenge window on any armed name,
repeatedly and free, weaponizing the veto-grief economics already flagged open in
[`OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md) §4.2. Both readings fatal. **Writer and
reviewer agree (a) is dead** (round 1).

Both (b1) and (b2h) prove facts 2 and 3 — the W13 digest and the §8.3 proof message
each bind the invoke fields — and prove fact 1 by reference through
`recoveryDescriptorHash`. The decision is **where the invoke authorization lives**:
on-chain in the event's own signature field (b1), or off-chain in evidence the
kernel consumes (b2h).

## 3. Design b1, precisely: on-chain self-authorization

The descriptor today commits a `recoveryAddress` — an address *string*
(`recovery-descriptor.ts:19`, W15), not a key, so a 64-byte BIP340 signature cannot
be verified against it. b1 therefore adds one field:

- **Descriptor v2** commits a required `recoveryPubkey` (32-byte x-only),
  `descriptorVersion` 2, digest extended under the established lenPrefix/-v2
  conventions. v1 descriptors stay parse-valid but not invokable (re-arm to v2; with
  signet decommissioned and nothing-is-precious ratified, v1 descriptors are
  conformance fossils).
- The on-chain 64-byte slot carries a **fresh BIP340 signature by that key over the
  unchanged W13 digest**. The `RecoverOwner` 0x09 wire layout is byte-for-byte
  unchanged — this defines the *meaning* of an existing normative field, which is
  exactly the work WIRE_FORMAT §5 routes to B2.

**Kernel acceptance** — pure predicate, evidence in / verdict out:

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
     name's descriptor chain (links checked as given;
     supplying the chain is the evidence layer's job)
  ∧  event.prevStateTxid == nameState.headTxid
```

**Replay analysis.** The digest binds `prevStateTxid`: a captured invoke signature
dies when the state head moves (settled or vetoed recovery, transfer). Same-head
rebroadcast is the same invocation. Cross-name replay fails on `prevStateTxid`;
cross-domain replay (transfer↔recover, invoke↔cancel) fails on W13 domain
separation — already pinned with negative vectors in B1.

**Veto path unchanged** (c): owner-key cancel via the existing cancel digest.

## 4. Design b2h, precisely: the hardened BIP322-evidence path *(added in round 2, per review)*

The documented direction (§8.3 + OWNER_KEY_RECOVERY), stated as a complete kernel
design rather than dismissed:

- The on-chain `RecoverOwner` event is **not self-authorizing**. A mined invoke has
  **no effect** unless and until matching wallet-proof evidence verifies —
  fail-closed by default (no proof ⇒ no `recovery_pending`, no state change, ever).
- **Kernel acceptance:** consume descriptor evidence + wallet-proof evidence;
  `bip322Verify(proof.signatureBase64, descriptor.recoveryAddress, message)` where
  `message` is regenerated from the proof's fields per §8.3's literal template and
  MUST match (regenerate-and-compare, the §8 envelope rule); the proof's bound
  fields (`prevStateTxid`, `recoveryDescriptorHash`, `newOwnerPubkey`,
  `successorBondVout`, `challengeWindowBlocks`) MUST equal the mined event's;
  `signingProfile` MUST equal the descriptor's (the §8.2 cross-object rule);
  descriptor chain and owner arming signature checked as in b1.
- The on-chain 64-byte `signature` field has **no verifier**; it needs a named wire
  amendment — explicit zero, or repurposed — since a normative field with undefined
  semantics is exactly what B1 refused to leave standing (the reserved-32-bytes
  precedent, PROPOSAL 3).
- Replay: the §8.3 message binds the same invoke fields, so replay resistance is
  equivalent to b1's.

**What b2h buys.** (i) **Cold custody**: the recovery key never leaves a hardware
wallet — invoking takes one BIP322 message signature, not raw-digest signing;
recovery custody can be "the hardware wallet in the safe," which is precisely the
user posture a *recovery* instrument serves. (ii) No descriptor v2; v1 armed
descriptors remain invokable. (iii) Continuity with §8.2/§8.3 as written.

**What b2h costs.** (i) **A BIP322 verifier inside the audited kernel**: script
validation (at minimum the BIP322 simple-mode paths for P2WPKH/P2TR; in general
arbitrary scripts) imported into L2 for one event type — deterministic, but a large
audit-surface increase against the clean-build's core bet (smallest auditable
kernel). (ii) **Evidence-gated meaning for a mined consensus event**: a RecoverOwner
on-chain is undecidable without an off-chain object; every verifier needs the proof
bytes — an availability dependency of the kind the DA design spent §6a–6e taming for
batch data, reintroduced for a single L1 event. (iii) The dead on-chain signature
field (wire amendment). (iv) The §8.3 text-message template (the W13a deliberate
exception) becomes kernel-parsing surface.

## 5. Options compared (corrected round 2)

| | (a) replay arming sig | **(b1) on-chain BIP340, descriptor v2** | (b2h) BIP322 evidence path |
| --- | --- | --- | --- |
| Binds `newOwnerPubkey` / `prevStateTxid` | **no** | yes (W13 digest) | yes (§8.3 message) |
| Replayable by third parties | **yes — descriptor public** | no | no |
| Invoke authorization lives | in a public, replayable string | **on-chain: the event's own signature field** | **off-chain: wallet-proof evidence (fail-closed gating needed)** |
| Kernel verification | BIP340 verify | BIP340 verify (already in kernel) | **BIP322 = script validation + text-template parsing** |
| Off-chain evidence the kernel consumes | descriptor chain | **descriptor chain only** | **descriptor chain + wallet proof** |
| On-chain 64-byte field | replayed sig | the invoke signature | **dead — needs wire amendment** |
| Descriptor change | none | **v2 (+`recoveryPubkey`)** | none |
| §8.3 proof's role | unchanged | **narrowed to corroboration (amendment)** | as documented |
| Recovery custody | n/a | **BIP340-capable signer (ONT-aware tooling)** | **any BIP322-capable wallet (cold hardware)** |

## 6. Recommendation (round 2): (b1), with the ruling axis named for DK

**(a) is dead** — agreed by writer and reviewer; no parameterization saves it.

Between (b1) and (b2h), the writer holds **(b1)**, on two grounds the reviewer's
counter does not dissolve:

1. **Audit-surface primacy.** The clean-build's foundational bet is the smallest
   auditable kernel (canon L2; external audit starts at kernel freeze). b1's
   marginal kernel surface is zero — BIP340-verify over a fixed digest is already
   the kernel's bread and butter for transfers. b2h imports a BIP322/script
   verifier and a text-template parser into the audited core for one event type.
2. **Smaller evidence base, simpler verification.** Neither design is
   off-chain-free — b1 also depends on descriptor evidence (round-2 reviewer
   precision). The decided distinction is: b1 consumes **descriptor evidence
   only**, verified with one fixed-layout BIP340 digest; b2h consumes
   **descriptor evidence plus wallet-proof evidence**, verified with BIP322
   script validation and text-template parsing. b1 adds no second off-chain
   object and no new verifier class beyond what a RecoverOwner already names.

**And the honest other side:** b2h's cold-custody story is materially better — a
recovery key that never leaves a hardware wallet is the right user posture for a
recovery instrument, and (b1) genuinely cannot offer it (raw-digest signing is
ONT-aware-tooling territory). If DK weighs launch-era custody reality above kernel
minimality, **(b2h) is the defensible pick and §4 is its spec skeleton.** That
values call — smallest audited kernel vs cold-hardware recovery custody — is the
ruling, and it is DK's (the spec's standing "raise with Max" note is the external
check on the custody premise).

Costs of (b1), named: descriptor v2 (§8.2 amendment, version-gated); **§8.3's
invoke-field bindings are narrowed by amendment** to an evidence-layer
corroboration object (resolver/watcher hygiene at arming and invoke time — its
current invoke-shaped field set is the legacy system's authorization design, which
this decision supersedes); the §8.2 cross-object `signingProfile` rule keys to the
descriptor's profile, which in v2 names the BIP340 path. Recovery wallets need a
BIP340-capable key — the custody cost above, honestly priced.

### Ripples if (b1) ratified

- `ONT_RECOVERY_INVOKE_SPEC.md`: item 2 resolved; architect builder input = recovery
  signing key.
- `WIRE_FORMAT.md` §8.2: descriptor v2 (`recoveryPubkey(32)`, digest under
  lenPrefix/-v2 conventions), v1 kept as legacy-parse evidence; §8.3: proof narrowed
  to corroboration (named amendment of normative text, per the §8 amendment
  process); §5's routed note gains its B2 answer.
- `B2_KERNEL_HARDENING.md`: R-rules get their source; §3's predicate becomes the
  acceptance rule with negative tests: replayed-arming-sig-as-invoke, descriptor-hash
  mismatch, non-head descriptor, stale `prevStateTxid`, cancel-digest-as-invoke,
  v1-descriptor invoke, wrong-pubkey signature — all rejected.
- `OWNER_KEY_RECOVERY.md` (analysis tier): evidence-gated flow annotated as
  superseded on the authorization point.

### Reopen triggers

- Expert custody feedback (the standing "raise with Max" item) showing BIP340
  recovery custody is impractical for the wallets that matter — reopens toward
  (b2h), whose full skeleton is §4.
- The abort-only watcher credential (OPEN_QUESTIONS §4.1) landing with invoke-side
  field needs — touches the predicate by named amendment.

## Review round 1 (ChatLunatique, 2026-06-13) — COUNTER, incorporated

Verdict: COUNTER as drafted; do not provisional-adopt b1 yet. Findings, all
accepted: (i) round 1 claimed the wallet proof is "never consulted by the kernel" —
contradicted by WIRE_FORMAT §8.2's B2 cross-object `signingProfile` rule
(`WIRE_FORMAT.md` §8.2), §8.3's invoke-field bindings, and OWNER_KEY_RECOVERY.md's
evidence-gated `recovery_pending`; (ii) (b2) is a documented path, not an invented
opponent, and must be engaged as the strongest counter-design; (iii) b1 may still be
right, but only with the §8.3 role explicitly amended and the BIP322-as-evidence
rejection argued against the documents. Round 2 (this text) adds §4 as the complete
b2h design, corrects the misstatement (§1 "what the specs already say", §5 table),
names both options' normative amendments, and frames the
custody-vs-audit-surface axis as DK's ruling.

## Review round 2 (ChatLunatique, 2026-06-13) — CONCUR, provisional-pending-DK

Verdict (event `5d8b9f79`): round 2 fixes the round-1 blocker — wallet-proof
misstatement retracted, b2h engaged as a complete kernel design, the §8.2/§8.3
amendments named, the values call explicit. b1 accepted provisionally on
audited-kernel/minimal-surface grounds; **b2h remains the standing counter if DK
prioritizes cold custody and hardware-wallet continuity** (on the DK-return
list). One precision cleanup, applied in this revision: b1 is not
off-chain-free — the real distinction is descriptor-only evidence + fixed BIP340
digest versus descriptor + wallet-proof evidence + BIP322/script/text
verification (§5 table and §6 ground 2 reworded accordingly). Adopted as
**recovery-auth (#50), PROVISIONAL pending DK.**
