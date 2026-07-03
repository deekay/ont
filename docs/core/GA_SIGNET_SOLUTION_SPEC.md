# GA-SIGNET-SOLUTION — validate the BIP325 signet challenge (slice 9)

> **Status: DESIGN SPEC / design-of-record. Writer: ClaudeleLunatique. Builder: ChatLunatique.
> Reviewer: ClaudeleLunatique (fresh-frame) → merge/push (standing authority). DK looped: this is a
> trust-model change (signet header authenticity provider-trusted → caught), not a pure engineering
> call.** Realises [G_TRACK_BUILD_SPINE.md](./G_TRACK_BUILD_SPINE.md) §2.1 slice 9 and opens
> `signet-solution-gate` (#95). **Sequenced firmly post-live-loop** (spine §2.1 slice 9: "sequenced
> after the first live loop so it never blocks G-C-MINIMAL"). This is the **heaviest** G-track slice —
> new signature-verification crypto near the Bitcoin trust boundary — so it is written as a grounded
> design-of-record with explicit open questions, less turnkey than the code-ready 8a/8b, to be
> hardened into build sub-slices once the first signet loop is live and its real coinbase fixtures are
> in hand. `consensus/src` stays **zero-diff** (this is Bitcoin header/block authenticity in
> `@ont/bitcoin`, not the ONT ownership law).

## 0. Purpose

Close the one honesty caveat the whole G-track carries: on signet the served header chain is
**provider-trusted for authenticity** (`signet-solution-gate` (#95)) because header-only validation
cannot catch a forged signet chain — BIP325 block validity turns on the **signet challenge
signature**, which lives in the coinbase, not the 80-byte header the validator sees. This slice
validates that signature against the challenge carried in `@ont/launch-config`, upgrading signet from
*provider-trusted* to *caught*: an operator who grinds a header chain but cannot produce a valid
signet solution for each block **fails closed**. After this slice, "operator can't forge state" holds
on signet at the header-authenticity layer too — the property mainnet gets free from real PoW.

## 1. What BIP325 requires (grounded — read before building)

**The challenge (already carried, grounded).** `@ont/launch-config` exports
`SIGNET_CHALLENGE_SCRIPT_PUBKEY_HEX` (`packages/launch-config/src/index.ts:36`), the default global
signet challenge. Decoded it is a **1-of-2 bare multisig**:
`OP_1 <33B pk1=03ad5e…be430> <33B pk2=0359ef…f2e6c4> OP_2 OP_CHECKMULTISIG`
(`51 21<pk1> 21<pk2> 52 ae`). The launch-config comment already anticipates this slice: *"Header
validation does not consume this yet; GA-SIGNET-SOLUTION will validate block solution material
against it once clients carry the needed coinbase/witness data."*

**The material each block carries.** Per BIP325, every signet block's **coinbase** transaction has an
`OP_RETURN` output whose payload begins with the 4-byte signet magic `0xecc7daa2`, followed by the
serialized **signet solution** (`scriptSig` + `scriptWitness`). Validation reconstructs a
BIP322-style `to_spend`/`to_sign` transaction pair, computes the signature hash over the
**signet-modified block** (the block with the signet-solution bytes stripped from the coinbase
`OP_RETURN`, its coinbase txid and the transaction merkle root recomputed), runs the solution's
scriptSig/witness against the challenge scriptPubKey, and accepts iff the multisig verifies. So the
material needed **beyond the 80-byte header** is: (a) the coinbase's signet `OP_RETURN` payload; (b)
enough to recompute the modified merkle root — the modified coinbase plus the coinbase→root merkle
branch; (c) the header fields the sighash commits to. Only the **coinbase** changes under stripping,
so the modified root is the coinbase txid recomputed then folded up the existing merkle branch.

**The trust shift this creates (the reason DK is looped).** Today every surface reports
`signetHeaderAuthenticity: "provider-trusted"` (`apps/cli/src/live-verify.ts:29`, and the web/mobile
equivalents). This slice makes that label **conditional**: a header range whose blocks all carry
valid signet solutions is `signet-solution-verified` (caught, not merely trusted); a range that does
not fails closed. That is a **trust-surface change** — it changes what a "✓" means and touches the
audit-surface map (§4). It must not be smuggled in as an engineering detail.

## 2. Existing seams vs. what is new (grounded inventory)

**Reuse (already in `@ont/bitcoin`):**
- `getOpReturnPayloads(tx)` (`packages/bitcoin/src/node.ts:507`) — extracts OP_RETURN payloads from a
  parsed tx; the signet solution extraction filters for the `0xecc7daa2` magic on the **coinbase**
  (`BitcoinBlock.transactions[0]`, coinbase-first).
- `merkle-proof.ts` (`merkleRootFromProof` + the coinbase→root branch) — recompute the **modified**
  merkle root from the stripped coinbase txid and the existing branch; no full tx-list re-hash needed
  since only the coinbase changes.
- `legacy-tx.ts` — tx (de)serialization primitives for building `to_spend`/`to_sign` and the coinbase
  txid recompute.
- `parseBitcoinRpcBlock` / `loadBitcoinBlocksFromRpc` / `loadBitcoinBlocksFromEsplora`
  (`packages/bitcoin/src/node.ts:491/455/414`) and `getBitcoinRpcRawTransactionHex:552` — fetch/parse
  the block + raw coinbase over RPC or Esplora (reuses the GA-OPTION-NODE providers' transports).
- `@noble` secp256k1 (already in the dep tree; the light-client core is "pure `@noble` validators") —
  ECDSA verification for the multisig.

**New (the hard part):**
- **BIP325 `to_spend`/`to_sign` construction + signet sighash** — build the synthetic tx pair, strip
  the signet solution, recompute the modified coinbase txid + merkle root, and compute the signature
  hash the solution signs. Grounded **against real signet coinbase fixtures** (mempool.space signet
  blocks), the same real-fixture discipline as GA-CHECKPOINT.
- **A verifier for the exact challenge shape** — run the solution's scriptSig/witness against the
  1-of-2 bare-multisig challenge and ECDSA-verify. **Scope call in §3.**
- **Block/coinbase material transport** — extend the GA-OPTION-NODE `HeaderRangeProvider` story with a
  sibling that also serves per-block coinbase solution material (resolver-served, own-node, or
  Esplora), so a client can fetch what the header-only path does not carry.

## 3. Decision — `signet-solution-verify` (#100), DK-looped + CL concur

**Recommended scope: a special-case verifier for the exact configured challenge shape, not a general
Bitcoin script interpreter.** The launch challenge is a fixed, known **1-of-2 bare multisig** (§1). A
verifier that (a) parses the solution's signature push(es), (b) computes the BIP325 signet sighash,
and (c) ECDSA-verifies against the two configured pubkeys with a 1-of-2 threshold is **a few hundred
lines** and fully sufficient — versus a general script interpreter, which is a large, audit-heavy
surface for zero added coverage of the *known* challenge. The verifier asserts the challenge script
matches the expected 1-of-2-multisig template and **fails closed** on any other shape (so a future
challenge change is caught, not silently mis-verified). Extensible to other templates later if the
signet challenge ever changes.

- **Trust-label upgrade.** `signetHeaderAuthenticity` becomes `signet-solution-verified` when every
  block in the validated range carries a valid solution; **fail closed** to the existing
  provider-trusted/short-range behavior otherwise — never a false upgrade. Web/mobile/CLI copy
  reflects "signet-solution-verified (caught)" vs "resolver mirror".
- **`consensus/src` zero-diff.** New crypto lands in `@ont/bitcoin` (the pinned header-authenticity
  primitive home), extending `validateHeaderChain`'s firewall, **not** the audited ONT ownership law.
  The audit-surface map (#94 A3) is updated to record the new trust-bearing `@ont/bitcoin` surface.
- **DK looped** because it changes what a signet "✓" asserts. **CL design-concur** on the
  interpreter-scope recommendation before canon (A4 pattern).

*Status: design-of-record scope recommendation by ClaudeleLunatique; **not yet ratified** — DK
trust-model sign-off + CL concur pending. Governs [this spec]; recorded on ratification.*

## 4. Build sub-slices (post-live-loop; hermetic-first, real-fixture-grounded)

Ordered so the pure crypto lands and is fixture-proven before any surface flips a trust label.

### 9a — SIGNET-SOLUTION MATERIAL (parse + extract, code-only, hermetic)
Extract the signet solution from a parsed block's coinbase (`getOpReturnPayloads` + `0xecc7daa2`
magic filter); define the `SignetBlockSolutionMaterial` shape (header fields + coinbase modified-txid
inputs + coinbase→root merkle branch + solution scriptSig/witness). Tests: real signet coinbase
fixtures extract a well-formed solution; a block with no signet OP_RETURN ⇒ `null` (fail closed).

### 9b — BIP325 VERIFIER CORE (pure, code-only, hermetic — the hard slice)
`verifySignetBlockSolution(material, challenge)` in `@ont/bitcoin`: build `to_spend`/`to_sign`,
compute the signet sighash over the modified block, ECDSA-verify the 1-of-2 multisig. **Total +
fail-closed**; never throws. Tests: a battery of **real signet blocks** verify green; a tampered
solution / wrong-pubkey / stripped-solution / wrong-challenge-template all fail closed. This is where
the real-fixture discipline is load-bearing — the exact sighash/spend construction is derived and
pinned against real signet blocks, not from prose alone.

### 9c — RANGE GATE + TRUST-LABEL WIRE (code-only, hermetic) — CLI/web/mobile + audit-map
A range is `signet-solution-verified` iff **every** block in the validated
`[checkpoint+1, anchor+depth]` range passes 9b (extends `validateHeaderChain`'s per-height walk with
the solution check when solution material is present). Surfaces upgrade the label only on a fully
verified range; otherwise the existing provider-trusted/fail-closed behavior is unchanged. Update
`docs/core/AUDIT_SURFACE_MAP.md` + `check:audit-map`. Tests: full-range solution ⇒ label upgrades;
one bad block ⇒ fail closed to provider-trusted; no solution material ⇒ unchanged (backward compat).

### 9d — MATERIAL TRANSPORT (code-only) — resolver/own-node/Esplora coinbase serve
A per-block solution-material provider sibling to the GA-OPTION-NODE header providers (resolver
`GET`, own-node RPC, Esplora), same untrusted-provider firewall discipline (the 9b verifier is the
firewall; a withheld/forged material ⇒ no upgrade, fail closed). Live-tested against the first signet
loop's real blocks.

## 5. Watchpoints (my review gate — CL, hold these)

1. **`consensus/src` zero-diff** — new crypto is `@ont/bitcoin` only; the ONT ownership law is
   untouched. The audit-map ratchet is updated for the new `@ont/bitcoin` trust surface, not bypassed.
2. **Fail closed = never a false upgrade.** Any missing/tampered/withheld solution, wrong-template
   challenge, or one bad block in the range ⇒ the range does **not** render `signet-solution-verified`;
   it falls back to the existing provider-trusted / short-range behavior. A "✓ caught" is only ever
   shown for a fully, independently verified range.
3. **Real-fixture-grounded, not prose-grounded.** The BIP325 sighash/spend construction (9b) is pinned
   against **real signet blocks** (mempool.space/Esplora provenance), the GA-CHECKPOINT discipline —
   green on real blocks, fail-closed on tampered ones.
4. **Template assertion.** The verifier asserts the challenge is the expected 1-of-2-multisig shape and
   fails closed on any other; a challenge change is caught, never silently mis-verified.
5. **Backward compatibility.** Ranges with no solution material behave exactly as today
   (provider-trusted) — this slice adds a stronger state, it does not break the pre-slice-9 path.
6. **Trust-label honesty end-to-end.** No surface claims signet independence unless 9b actually
   verified the full range; the `signetHeaderAuthenticity` field is the single source of truth wired
   through CLI/web/mobile.
7. **Standing gates green** — `scripts/check-doc-links.sh`, `npm run check:surfaces`,
   `npm run check:audit-map`, `check:mobile-verify-graph`, `git diff --check`, root build + suite.

## 6. Open questions (honest — resolve before/at build)

- **Exact solution-spend shape.** Whether the default-signet solution is a scriptSig-based or
  witness-based spend of the bare-multisig challenge, and the precise BIP325 sighash preimage, are
  pinned against real signet coinbase fixtures at 9b — flagged here rather than guessed.
- **Range breadth.** Verify every block in `[checkpoint+1, anchor+depth]`, or a sufficient sampled
  sub-range? Recommend **every block** for a true "operator can't forge" claim; note the mobile
  battery/latency cost (why the checkpoint cadence is refreshed-per-release, spine §3(b)).
- **Interpreter scope (the #100 fork).** Special-case 1-of-2-multisig verifier (recommended) vs. a
  minimal general script interpreter — CL concur.
- **Audit implications.** New signature-verification crypto near the trust boundary — does it warrant
  an incremental external-audit note even though it is signet-only and `consensus/src` zero-diff?
  Flag for DK when mainnet enters scope.

## 7. Sequencing + dispatch

- **Post-live-loop only.** Do not build until the first signet loop (G-C-MINIMAL 4b) is live and its
  real coinbase fixtures are captured — 9b's correctness depends on them. Reorderable ahead of the
  live loop only if DK rules signet must be fully independent before the first testable milestone
  (spine §2.1 slice 9).
- **Dispatch:** on DK trust-model sign-off + CL concur on #100 → 9a → 9b → 9c → 9d, each
  hermetic-first and real-fixture-grounded. Review loop: CL builds each in a worktree → I fresh-frame
  review against this spec + the real-fixture battery → merge/push (standing authority).
- **Acceptance bar (slice-9 gate).** A client validating a signet range independently verifies the
  BIP325 signet solution of every block against the launch-config challenge and reports
  `signet-solution-verified`; a forged/withheld/tampered solution fails closed; conformance + real
  signet fixtures pin each path; `consensus/src` zero-diff. That closes `signet-solution-gate` (#95):
  operator-can't-forge holds on signet, claimed honestly — the last honesty caveat retired.
