# recovery-descriptor-witness: what mints `witnessedByHeight` for the §3c descriptor evidence

> **Status: PROPOSED — decision-ready design call. Writer: ClaudeleLunatique.
> Reviewer: ChatLunatique (pending).** This is the concrete "demonstrably
> witnessed" format that [`RECOVERY_EVIDENCE_TIMING.md`](./RECOVERY_EVIDENCE_TIMING.md)
> §5 sub-question 3 deferred to B3 — ratified as a B3 evidence-layer deliverable
> under decision **#66** (DK event `43d30e67`, 2026-06-15). It is the recovery
> analog of [`DA_AVAILABILITY_HEIGHT.md`](./DA_AVAILABILITY_HEIGHT.md) (#84): the
> same "what confirmed-chain height does a fail-closed evidence gate mint" question,
> for the recovery descriptor instead of the served batch bytes.
>
> Normativity: `analysis`-tier paper. The chosen outcome lands as the D-RC slice
> (`packages/evidence/src/…` witness builder) + a `B3_EVIDENCE_HARDENING` row, and a
> one-line confirmation that the §3c witness format is fixed. Authored under DK's
> keep-going grant.

## 1. The question

§3c (RATIFIED, #66) accepts a non-cancel `RecoverOwner` invoke only if its armed
descriptor evidence is **demonstrably witnessed by height `h_r + W_r`** on the
canonical chain. The kernel (`recovery-invoke-authority.ts:296-297`) consumes an
opaque, already-verifier-checked witness `{ kind:
"b3-verified-recovery-descriptor-witness", witnessedByHeight }` and checks
`witnessedByHeight <= h_r + W_r`, fail-closed on a late/absent/malformed witness.

B3 (this slice, D-RC) must MINT `witnessedByHeight` by **recompute-don't-trust** — no
self-declared height is admitted. So: **what confirmed-chain fact mints
`witnessedByHeight`?**

## 2. The constraint that makes this non-trivial

A recovery descriptor is an **off-chain** object (signed JSON, §8.2a), posted to
resolvers at arming (W15). It touches the canonical chain in exactly one place: the
on-chain `RecoverOwner` event (0x09) commits its **digest** `recoveryDescriptorHash`
(32 bytes) — and that commitment is the **invoke itself**, mined at `h_r`. There is
**no independent on-chain arming event**: no event type arms a descriptor, and the
descriptor head-hash is not carried in any batch/accumulator root. (Verified:
`@ont/wire` event registry has no arm event; `recoveryDescriptorDigest` lives in
`@ont/protocol`; the kernel never stores a head-hash — the evidence layer resolves it
from witnessed W15 posts.)

Two doctrines bound the answer:
- **DA firewall (#82).** Resolver presence / attestation / gossip is a liveness
  signal, **never a consensus input**. So "a resolver served the descriptor at height
  X" cannot mint `witnessedByHeight` — it is a non-deterministic oracle that forks.
- **availability-height (#84).** The structurally identical DA gate was ruled
  **O1+O3**: `firstServableHeight` = the anchor's confirmed **mined height `h`**,
  fail-closed over the **presented content witness** (bytes that reconstruct the
  anchored root), with the challenge window **diagnostic-only**. The height is minted
  from the confirmed commitment, not from when content happened to surface.

## 3. Options

- **O1 — mint `witnessedByHeight = h_r` (the invoke's confirmed mined height),
  fail-closed over the presented descriptor record (RECOMMENDED).** D-RC takes the
  presented descriptor record `D`, recomputes `recoveryDescriptorDigest(D)`, requires
  it equals the invoke's committed `recoveryDescriptorHash`, verifies the owner arming
  signature binds `D` to the **current** ownership interval (R2/R4), and mints
  `{ kind, witnessedByHeight: h_r }` where `h_r` is the invoke's confirmed mined
  height (a D-BI fact). Absent / hash-mismatched / unsigned `D` ⇒ **no witness
  minted** ⇒ the kernel's §3c conjunct fails closed. `W_r` is the diagnostic challenge
  window (exactly as #84 made the DA challenge diagnostic). **⇒ D-RC is a FREE
  structural slice, no new law** — the direct mirror of `verifyAvailabilityHeight`.
- **O2 — require an independent pre-invoke on-chain commitment of the descriptor
  digest** (a new arm event, or the descriptor head folded into the anchored
  accumulator), so `witnessedByHeight < h_r` is meaningful. **⇒ NEW wire + consensus
  law** (an on-chain arming surface), heavy, and contradicts the ratified "descriptor
  is an off-chain W15 object" design. Not recommended.
- **O3 — out-of-band witnessing** (resolver attestation height, archive timestamps).
  **REJECTED** — a liveness oracle, violates the #82 firewall and the #84 ruling.

## 4. Why O1 is sound (the late-reveal fork dissolves)

§3c was motivated (RECOVERY_EVIDENCE_TIMING §1) by a **proof-withholding / late-reveal
fork**: an invoker withholds `D`, some verifiers reject, then reveals late so others
accept. Under the hash-commitment model that fork **does not exist**: the chain
commits `recoveryDescriptorHash` at `h_r`, and `D` is **deterministically checkable
once presented** (hash-match + arming-sig verify). So a withheld `D` ⇒ **uniform
reject** by every verifier (nothing to check); a presented `D` ⇒ **uniform verdict**
(content decides, identically for all). There is no selective-reveal divergence to
race. The honest consequence — and the thing CL/DK must weigh — is that under O1 a
**late-revealed** descriptor still validates as long as its content matches the
committed hash; the protection is **content-determinism, not a timing cutoff**,
precisely the #84 posture. `witnessedByHeight = h_r` makes the kernel's `<= h_r + W_r`
check always pass **when a valid witness is minted**, collapsing §3c to "is a valid
descriptor demonstrably presented" — which is the only fork-free, oracle-free reading.

## 5. Recommendation & the slice it implies

**Recommend O1.** D-RC mirrors D-SB-avail (`verifyAvailabilityHeight`):

```
verifyRecoveryDescriptorWitness(input) -> VerifiedRecoveryDescriptorWitness | fail-closed
  input: { descriptor D, committedDescriptorHash (from the invoke, 0x09),
           confirmedInvokeMinedHeight h_r (a D-BI fact),
           currentOwnershipRef, currentOwnerPubkey }   // engine-resolved head/interval (E-RC1)
  gates (recompute-don't-trust, total/fail-closed, never throws):
    1. recoveryDescriptorDigest(D) === committedDescriptorHash        (else reject)
    2. D is the invokable version (v2, R7)                            (else reject)
    3. owner arming signature on D verifies vs currentOwnerPubkey (R2) (else reject)
    4. D.ownershipRef === currentOwnershipRef (R4, old-interval replay) (else reject)
    5. h_r is a well-formed confirmed height
  mint: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: h_r }
```

Scope guards (from the D-RC notes): D-RC does **not** resolve which head/interval is
current (engine-supplied, E-RC1); the §8.3 BIP322 wallet proof is non-authorizing
corroboration with no deadline (E-RC3); the R11 bond-spend / qualifying-successor
surface is **excluded** (it is D-RB, PR-34, engine/B4-side). Planned `rc.*` red
battery: hash-match accept; hash-mismatch reject; v1-descriptor reject (R7);
bad/owner-key-mismatched arming sig reject (R2); old-interval `ownershipRef` reject
(R4); malformed/`null` top-level + closed-shape totality; the §8.3-proof-absent still
accepts (E-RC3); the branded-height mint is the sole height source the kernel sees.

## 6. The open call for review

Under O1, **D-RC is FREE** — it is the #84 analog applied to the descriptor, deriving
from already-ratified #66 (§3c) + #84 (mint-from-confirmed-height, challenge
diagnostic) + the #82 firewall, with no new consensus law. **Two things for CL's
adversarial design pass:**
1. Does O1's reading — `witnessedByHeight = h_r`, `W_r`/challenge **diagnostic**, the
   timing gate collapsing to presence — need a **DK ratification** like #84 did, or is
   it **derivable** (FREE) from #66 + #84 + #82? My lean: derivable, with a one-line
   DK courtesy-confirm; escalate to a DK ruling only if you read it as re-opening
   §3c's timing *intent* (i.e. if "by `h_r + W_r`" was meant to forfeit a genuinely
   late-surfacing descriptor, which the off-chain/hash-commitment model cannot
   deterministically detect without an oracle).
2. Is the witness-builder input surface (§5) the right seam — `D` + committed hash +
   `h_r` + engine-resolved current head/interval — and is anything I have inside
   D-RC actually the engine's job (head/interval resolution) leaking across E-RC1?

## 7. Ripples & reopen triggers

- `B3_EVIDENCE_HARDENING.md` D-RC row → gains the concrete witness format (this paper).
- `recovery-invoke-authority.ts` §3c → unchanged; it already consumes the opaque
  branded witness — D-RC fills the format it was typed against.
- `RECOVERY_EVIDENCE_TIMING.md` §5 sub-Q3 → resolved (this paper).
- **Reopen** if O2 is ever pursued (an on-chain arming surface), or if #50 reopens
  toward the b2h BIP322 path (then the wallet proof re-enters the witnessing question).
