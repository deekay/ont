# recovery-descriptor-witness: what mints `witnessedByHeight` for the §3c descriptor evidence

> **Status: RATIFIED O1 (DK, event `74ae7d5c`, 2026-06-16) = DECISIONS #86
> (recovery-witness-height). Writer: ClaudeleLunatique. Reviewer: ChatLunatique
> (O1 direction + narrowed builder seam concurred, event `81c3e8a0`).** This is the
> concrete "demonstrably witnessed" format that
> [`RECOVERY_EVIDENCE_TIMING.md`](./RECOVERY_EVIDENCE_TIMING.md) §5 sub-question 3
> deferred to B3 — the *format* is a B3 deliverable under decision **#66** (DK event
> `43d30e67`, 2026-06-15), and **what mints the height** was the consensus amendment,
> the exact recovery analog of
> [`DA_AVAILABILITY_HEIGHT.md`](./DA_AVAILABILITY_HEIGHT.md) (#84). DK ratified **O1**.
>
> Normativity: `analysis`-tier paper; the ratified rule is recorded in `DECISIONS.md`
> #86. The outcome lands as the D-RC slice (`packages/evidence/src/recovery-descriptor-witness.ts`
> witness builder) + a `B3_EVIDENCE_HARDENING` row. Authored under DK's keep-going grant.

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
`@ont/wire` event registry has no arm event; the digest D-RC recomputes,
`recoveryDescriptorDigest`, is exported from `@ont/wire` — the kernel
`recovery-invoke-authority.ts` already imports it from there; the kernel never stores a
head-hash — the evidence layer resolves it from witnessed W15 posts.)

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
  presented descriptor record `D`, recomputes `recoveryDescriptorDigest(D)`, and
  requires it equals the invoke's committed `recoveryDescriptorHash`; on that match
  (plus a well-formed confirmed `h_r`) it mints `{ kind, witnessedByHeight: h_r }`,
  where `h_r` is the invoke's confirmed mined height (a D-BI fact). Absent /
  hash-mismatched / malformed `D` ⇒ **no witness minted** ⇒ the kernel's §3c conjunct
  fails closed. The invoke's **authorization** — R2 owner arming signature, R3 current
  head-hash/sequence, R4 ownershipRef/current interval, R7 version — is **NOT re-checked
  here**; it stays in the kernel's `acceptRecoverOwner`, each with its own reason (the
  narrowed seam, §5). `W_r` is the diagnostic challenge window (exactly as #84 made the
  DA challenge diagnostic). **⇒ a small slice mirroring `verifyAvailabilityHeight` — but
  choosing what mints the height is a consensus call, so it is GATED on DK ratification,
  NOT free (§6).**
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
once presented** (D-RC's digest match here; the kernel then verifies the arming
signature). So a withheld `D` ⇒ **uniform reject** by every verifier (nothing to
check); a presented `D` ⇒ **uniform verdict** (content decides, identically for all). There is no selective-reveal divergence to
race. The honest consequence — and the thing CL/DK must weigh — is that under O1 a
**late-revealed** descriptor still validates as long as its content matches the
committed hash; the protection is **content-determinism, not a timing cutoff**,
precisely the #84 posture. `witnessedByHeight = h_r` makes the kernel's `<= h_r + W_r`
check always pass **when a valid witness is minted**, collapsing §3c to "is a valid
descriptor demonstrably presented" — which is the only fork-free, oracle-free reading.

## 5. Recommendation & the slice it implies

**Recommend O1.** D-RC mirrors D-SB-avail (`verifyAvailabilityHeight`). **Narrowed seam
(CL, event `81c3e8a0`): D-RC mints the descriptor witness HEIGHT only — it proves
"this descriptor content matches the invoke commitment, therefore height `h_r`"; it
does NOT re-authorize the invoke.** The authorization conjuncts (R2 owner arming sig,
R3 current head-hash/sequence, R4 ownershipRef/current interval, R7 version, prevStateTxid,
invoke sig) **stay in the kernel's `acceptRecoverOwner`**, each with its own reason. If
the builder withheld the witness on a bad owner sig / old interval, it would silently
move kernel authorization into B3 and collapse those distinct kernel reasons into "no
witness" — so they are deliberately NOT mint preconditions.

```
verifyRecoveryDescriptorWitness(input) -> VerifiedRecoveryDescriptorWitness | fail-closed
  input: { descriptor D, committedDescriptorHash (from the invoke, 0x09),
           confirmedInvokeMinedHeight h_r (a D-BI fact; + invoke txid/provenance
                                           as needed to bind that height) }
  gates (recompute-don't-trust, total/fail-closed, never throws):
    1. recoveryDescriptorDigest(D) === committedDescriptorHash        (else reject)
    2. h_r is a well-formed confirmed height bound to that invoke      (else reject)
    3. closed-shape: no resolver servedAt / source / producer / endpoint / timestamp
       channel admitted (extra field ⇒ reject; absent/malformed D ⇒ reject, never throw)
  mint: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: h_r }
```

Scope guards (from the D-RC notes): D-RC does **not** resolve which head/interval is
current (engine-supplied, E-RC1) and does **not** check R2/R3/R4/R7 (kernel's job); the
§8.3 BIP322 wallet proof is non-authorizing corroboration with no deadline (E-RC3); the
R11 bond-spend / qualifying-successor surface is **excluded** (it is D-RB, PR-34,
engine/B4-side). *Optional:* an R2/R4 **prefilter** is allowed only if labelled
non-authoritative, with the kernel checks still the decider. Planned `rc.*` red battery
(CL's list): hash-match mints `{kind, witnessedByHeight: h_r}`; hash-mismatch / malformed
`D` / malformed `h_r` / absent `D` reject (never throw); any `servedAt`/source/producer/
endpoint/timestamp field rejected-or-ignored under closed-shape; a late resolver
timestamp cannot produce `h_r + k` — the only minted height is `h_r`; the minted witness
feeds `acceptRecoverOwner`'s happy path; the existing malicious-late-branded-witness test
stays a KERNEL guard; v1-descriptor / bad-owner-sig / old-interval / current-head-mismatch
stay KERNEL authority vectors (not builder preconditions).

## 6. The DK ratification ask (GATED)

CL's verdict (event `81c3e8a0`): O1 is the right deterministic construction, but it is
**NOT FREE** — it is the recovery analog of #84, and #84 was a DK consensus ruling, not
just byte layout. #66 already ratified a real timing interface (`witnessedByHeight >
h_r + W_r` fails closed); O1 makes `W_r` **diagnostic** (any validly presented descriptor
mints `h_r`, so a genuinely late-surfacing descriptor no longer forfeits). That may be
the only oracle-free answer under the off-chain/hash-commitment model — but choosing it
is a consensus call. **I concur: GATED pending DK.**

**Narrow ruling requested of DK.** Ratify **O1** for recovery descriptor evidence: a
presented descriptor `D` that reconstructs the invoke-committed `recoveryDescriptorHash`
mints `witnessedByHeight = h_r` (the invoke's confirmed mined height); resolver
timestamps / gossip / served-at heights are **not** consensus inputs; `W_r` is
**diagnostic** once a valid D-RC witness exists. Alternatives: **O2** (a new on-chain
arming law so `witnessedByHeight < h_r` is meaningful) or **O3** (an out-of-band oracle)
— both rejected unless DK wants to reopen the design.

## 7. Ripples & reopen triggers

- `B3_EVIDENCE_HARDENING.md` D-RC row → gains the concrete witness format (this paper).
- `recovery-invoke-authority.ts` §3c → unchanged; it already consumes the opaque
  branded witness — D-RC fills the format it was typed against.
- `RECOVERY_EVIDENCE_TIMING.md` §5 sub-Q3 → resolved (this paper).
- **Reopen** if O2 is ever pursued (an on-chain arming surface), or if #50 reopens
  toward the b2h BIP322 path (then the wallet proof re-enters the witnessing question).
