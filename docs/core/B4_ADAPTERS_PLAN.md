# B4 — real adapters: feeding the audited B3 enforcement from the live network

> **Status: IN PROGRESS. Writer: ClaudeleLunatique. Reviewer: ChatLunatique.** Opens after B3
> integration merged to `main` @ `b3b74f8` (DK: "let's go on to B4"). Branch: `clean-build-b4`.
>
> **Slice progress:** B4-HEADER **GREEN @ `0ee8a70`** (green-OK `0877d466`; hdr.* 18/18; `@ont/adapter-header`).
> B4-INDEX design-concur granted (`ca3e20aa`). B4-INDEX-ANCHOR **GREEN @ `bf060d4`** (green-OK `909f7202`;
> idx-anchor.* 24/24; `@ont/adapter-indexer` + the `@ont/bitcoin` merkle primitive promotion, consensus
> regression 466✓). B4-INDEX-COMMIT **GREEN @ `57243f7`** (green-OK `b3939632`; idx-commit.*
> 12/12). B4-INDEX-DATASOURCE **GREEN @ `7c9552b`** (CL red-OK r2 `d6800ce3` → green-OK; idx-ds.* 23/23;
> adapter-indexer 59/59). B4-INDEX-INVOKE **GREEN @ `ba5cfcb`** (green-OK `235d906d`; idx-invoke.* 13/13;
> adapter-indexer 72/72; shared `src/inclusion.ts` refactor @ `38add0d`). **✅ B4-INDEX COMPLETE** —
> HEADER + INDEX-{ANCHOR,COMMIT,DATASOURCE,INVOKE} all green; DK milestone posted (`72b71e8f`).
> B4-DA **design-concur (§10)** — pending CL.

## 1. The gap

B3 made the audited evidence layer ENFORCE a batched claim end-to-end — but only over **typed seams
backed by fixtures** (`@ont/claim-path`). Nothing yet feeds those seams from the live Bitcoin network /
real publishers. B4 = the real **publisher / indexer / resolver / canonical-header / DA-transport**
adapters that implement the B3 seams against the network, so the enforcement runs on real data.

The B3/B4 boundary is ratified (#46 / B0; restated + endorsed by CL at B3 close): **B3 owns
deterministic, fail-closed orchestration over the audited predicates + typed seams; B4 implements the
real adapters feeding those seams and NEVER reopens a consensus call.** Adapters do I/O and produce
witnesses/projections; they decide nothing.

## 2. The seams B4 fills (the exact B3 contracts)

| B3 seam (consumer) | B4 adapter | what it produces |
|---|---|---|
| `BitcoinHeaderSource { headerHexAtHeight }` (I-SPV / I-HARNESS inclusion) | **canonical-header source** | the canonical best-chain headers, validated by `validateHeaderChain` (#82) over a node/Esplora feed |
| `BatchDataSource.{baseLeavesForPrevRoot, servedLeavesForRoot}` (availability) | **indexer + DA transport** | the K-deep base + the presented served bytes (W15 transport / `/da/{root}`) |
| `BatchDataSource.{committedBatchForRoot, feeTxForAnchor}` (gate-fee) | **indexer** | the verified committed-batch projection (firewall-minted) + the parsed anchor tx + prevouts |
| `ConfirmedBatchAnchor` / `ConfirmedRecoverOwnerInvoke` (I-FEE-A / I-REC) | **indexer** | chain-bound anchor / invoke facts (the inclusion firewall lives here) |
| write-side (anchors, DA serving, refunds) | **publisher** | RootAnchor / claim txs + `/da/{root}` serving + per-leaf loss/refund |
| read API + signed submissions | **resolver** | HTTP read + append-only store-guards (signature / sequence / ownership-ref) |

The firewall responsibility moves HERE: every B3 seam that B3 treats as "verified / firewall-minted"
(canonical header, served-bytes availability, committed-batch projection, confirmed-inclusion facts) is
where a B4 adapter must do the recompute-don't-trust work so a hostile / buggy network source cannot feed
a false witness. B3 already pins the kernel verdicts; B4's bar is "produce a CORRECT, validated witness,
or none."

## 3. Mining material (old code = reference, not law)

Per #46 (mine for golden vectors / shapes, assume the logic is bad; nothing-is-precious): the pre-rewrite
units are reference. `packages/core` (engine / `mergeAccumulatorBatch` / `research/batch-rail.ts`
ingestion), `apps/indexer` (~0.4k batch block-ingestion, no HTTP), `apps/resolver` (~3.0k HTTP read +
submission store-guards `validation.ts`; **drop the `ONT_EXPERIMENTAL_AUCTION_*` old-model leakage**),
`apps/publisher` (~2.3k pay-first / anchoring / `/da/{root}` / refund), `packages/architect` (~1.4k PSBT
builder — shapes only), `packages/db` (~1.1k Postgres/file `ont_documents` JSONB — schema is reference).
`@ont/bitcoin` already carries the RPC/Esplora config types + `validateHeaderChain`; the live header/block
FETCH client is B4.

## 4. Tests-first for I/O adapters (the bar)

Adapters do real I/O, so the B1–B3 "pure predicate" gate shape changes. The bar (nothing-is-precious: NO
parity-against-old; bar = hardened spec + conformance/negative suites):
1. **Seam-contract conformance** over RECORDED / fixture network data — the adapter produces exactly the
   typed B3 seam output (e.g. a `BitcoinHeaderSource` whose `headerHexAtHeight` returns the validated
   header; a `committedBatchForRoot` projection that `gateFeeValidation` accepts).
2. **Hostile-input negative suite** — malformed / withholding / forked / lying network data → the adapter
   fails closed (returns null / rejects), NEVER emits a witness that would move a kernel verdict. This is
   the firewall test: pipe the adapter's output into the real B3 predicate and assert no false-accept.
3. **Live-network smoke** is SEPARATE (a manual / tagged check, not the unit gate) — signet is
   decommissioned, so live runs are opt-in, downtime accepted.
4. Pure helpers inside an adapter (parsers, validators) keep the normal tests-first red→green.

## 5. Candidate slices (dependency-ordered)

- **B4-HEADER — canonical-header source (RECOMMENDED FIRST).** A node/Esplora header-range fetch →
  `validateHeaderChain` (#82) → `BitcoinHeaderSource`. Foundational: I-SPV's launch gate + I-HARNESS's
  inclusion both consume it, and it's the smallest well-bounded adapter. Tests: fixture header ranges
  (incl. a real mainnet segment) through the contract + a hostile-feed negative suite (forged child /
  withheld / reorg).
- **B4-INDEX — indexer.** Block ingestion → the `BatchDataSource` projections + `ConfirmedBatchAnchor` /
  `ConfirmedRecoverOwnerInvoke` facts + persistence (`@ont/db` rewrite). Mines `@ont/core` + batch-rail
  (DA-filter / ordering / notice-window) re-keyed to the merged kernel. The firewall-minting heart of B4.
- **B4-DA — DA transport / served-bytes.** The `/da/{root}` serve + `servedLeavesForRoot` delivery (W15).
- **B4-PUB — publisher.** Write-side: RootAnchor / claim tx assembly (mine `@ont/architect` PSBT shapes) +
  pay-first + per-leaf loss/refund.
- **B4-RESOLVE — resolver.** HTTP read API + append-only submission store-guards (spec-cited or dropped;
  no `ONT_EXPERIMENTAL_AUCTION_*`).

## 6. Sequencing (recommended)

1. **B4-HEADER** first — the launch-gate feed both B3 inclusion seams depend on; smallest adapter.
2. **B4-INDEX** — the projection/fact firewall the availability + gate-fee + recovery seams need.
3. **B4-DA** — served-bytes delivery (pairs with the indexer).
4. **B4-PUB** + **B4-RESOLVE** — write-side + read API.
5. Live signet/mainnet cutover per launch gating (external audit concurrent from kernel freeze).

## 7. Design-concur — open calls (my leans)

1. **First slice = B4-HEADER.** **Lean: yes** — it's the #82 launch-gate's real feed, both inclusion
   seams depend on it, and it's the smallest well-bounded adapter (range-fetch → `validateHeaderChain` →
   seam).
2. **Package layout.** New in-repo parallel packages (#46/B0 ruling) — e.g. `@ont/adapter-header`,
   `@ont/indexer`, `@ont/resolver`, `@ont/publisher` — depending on `@ont/bitcoin` / `@ont/consensus` /
   `@ont/evidence` / `@ont/claim-path`; old `apps/*` + `packages/{core,architect,db}` stay quarantined,
   mined, then decommissioned. **Lean: per-adapter packages**; confirm naming.
3. **Tests-first bar for I/O (§4).** Recorded-fixture seam conformance + hostile-input negative suite
   (piped into the real B3 predicate) as the unit gate; live-network smoke separate. **Lean: this.**
4. **Indexer ⇄ resolver split.** The inventory flagged the indexer may fold into the resolver's ingestion
   path. **Lean: keep the indexer a distinct package** (ingestion / projection-minting) that the resolver
   consumes — cleaner firewall boundary; confirm.
5. **No new consensus law.** B4 is adapters; any "rule" question that surfaces (e.g. a submission-
   validation rule not spec-cited) is PARKED for DK, not decided in an adapter. Confirm the parking line.

On concur (esp. #1 first-slice + #3 the I/O test bar) I open **B4-HEADER design-first** → red battery.

## 7a. Design-concur — RESOLVED (ChatLunatique, event 3ad21d56)

All five concurred. Refinements folded:
1. **B4-HEADER first** — confirmed.
2. **Package naming** — `@ont/indexer` / `@ont/resolver` / `@ont/publisher` are ALREADY the package names of
   the quarantined `apps/*`, so the parallel B4 packages use `@ont/adapter-header`, `@ont/adapter-indexer`,
   `@ont/adapter-resolver`, `@ont/adapter-publisher` (or an explicit rename/decommission of the old apps
   first). `@ont/adapter-header` stays header-only; if it grows block/tx fetch, split or rename to
   `@ont/adapter-bitcoin`.
3. **I/O test bar** — recorded-fixture seam conformance + hostile-input negatives piped into the REAL B3
   predicate (prove no false-accept); live-network smoke separate. The gate proves "valid adapter output
   feeds B3 accept; hostile adapter input yields no witness and B3 rejects," not "the fetcher returns bytes."
4. **Indexer distinct** — keep the indexer the projection/fact firewall; the resolver CONSUMES indexed
   facts and must NOT mint committed-batch projections / confirmed-inclusion facts as a request side effect.
5. **No new law** — adapters validate shape / provenance / transport freshness / source consistency; they
   never invent acceptance rules. Any rule-ish question is parked for DK / spec ratification.

## 8. B4-HEADER design — canonical-header source (design-first)

Package: **`@ont/adapter-header`** (header-only). Depends on `@ont/bitcoin` (`validateHeaderChain`,
`BitcoinHeaderSource`); the firewall test also imports `@ont/consensus` (`verifyProofBundleAgainstBitcoin`)
+ the I-HARNESS synthetic-anchor fixture pattern.

**Trust boundary (CL).** `checkpoint` (`BitcoinDifficultyCheckpoint`) + `params` (`BitcoinNetworkParams`)
are LAUNCH / TRUSTED config supplied by the caller — NOT from the provider. The provider supplies only raw
candidate headers (UNTRUSTED). The adapter returns a `BitcoinHeaderSource` ONLY after the full fetched
candidate validates through `validateHeaderChain` (#82); outside the validated range, `headerHexAtHeight`
returns null.

**Scope (this slice): ONE trusted active-chain provider.** Multi-source / fork-selection (a lower-work
valid fork must lose) is OUT — a later slice (or the indexer's chain selection). This slice consumes the
single provider's presented active chain and validates it; it does NOT choose among competing chains.

**Seam + API (CL fixes folded — async I/O; exact-count firewall; split pure / async).**
```
HeaderRangeProvider { fetchHeaderHex(startHeight, count): Promise<readonly string[] | null> }  // ASYNC I/O seam

// PURE (sync, testable): the exact-count firewall + validation core.
buildCanonicalHeaderSourceFromHeaders(headersHex, startHeight, expectedCount, checkpoint, params)
  -> { ok: true, headerSource, tipHeight, cumulativeWorkHex } | { ok: false, reason }
  1. count     Array + headersHex.length === expectedCount (a positive int) — else "header-range-count-mismatch"
               (BEFORE validate: a withheld short tail / overlong response must NOT become a shorter source)
  2. validate  validateHeaderChain(headersHex, startHeight, checkpoint, params); !ok -> the spv-* reason surfaced
  3. source    ok -> its headerSource (+ tipHeight / cumulativeWorkHex)

// ASYNC wrapper: the network I/O around the pure core.
async fetchCanonicalHeaderSource({ provider, startHeight, count, checkpoint, params })
  -> Promise<same result>
  1. fetch     headers = await provider.fetchHeaderHex(startHeight, count); null / reject / throw -> "header-provider-unavailable"
  2. core      buildCanonicalHeaderSourceFromHeaders(headers, startHeight, count, checkpoint, params)
  total + fail-closed: never throws / never rejects (provider reject + throw both caught).
```
`checkpoint` + `params` are trusted launch config (caller). **Currentness caveat (CL): with only
`fetchHeaderHex(start,count)` the adapter cannot prove the range is still active-chain AFTER fetch — this
slice does NOT claim stale/reorg detection** (it consumes one trusted active-chain provider). A
`fetchTip` / `isCurrent(height,hash)` seam is a later addition if reorg-currentness is wanted.

**The firewall (the point of the slice):** the returned `headerSource` is the ONLY thing B3's inclusion
verifier (`verifyProofBundleAgainstBitcoin`) trusts. A hostile provider (forged child / withheld / broken
linkage / insufficient PoW / short or overlong range) yields NO source (reject), or a source whose
validated range excludes the hostile header — so B3 cannot falsely accept. The unit gate pipes the adapter
output into the real predicate and asserts the accept/reject split.

**Planned `hdr.*` red battery (CL pins):**
- valid recorded range → source; the source feeds `verifyProofBundleAgainstBitcoin` and a bundle anchored
  in-range ACCEPTS (firewall-positive; reuse the I-HARNESS synthetic mined-anchor + bundle fixture).
- **exact-count firewall:** provider returns `count-1` (withheld tail) or `count+1` (overlong) →
  `header-range-count-mismatch`, no source.
- provider returns null / rejects (async) / throws → `header-provider-unavailable`, no source (never throws).
- forged easy-`nBits` child → `validateHeaderChain` rejects → no source (firewall-negative: nothing reaches
  B3, so no accept).
- broken linkage / insufficient PoW / malformed header → reject (spv-* surfaced).
- out-of-range height → `headerHexAtHeight` returns null → B3's `btc.*.chain` canonical check fails.
- malformed checkpoint / params → fail closed (`spv-checkpoint-malformed` / `spv-params-malformed`).
- determinism (pure core); never throws / never rejects. (Multi-source + reorg-currentness OUT for this slice.)

**LANDED (green @ `0ee8a70`, CL green-OK):** `@ont/adapter-header`, hdr.* 18/18. Shared range guard
`isWellFormedRange(startHeight, count)` (int `start ≥ 0` + int `count ≥ 1`) used by BOTH the pure core and
the async wrapper (CL green-watch), so `count=0`/non-int count rejects with `header-range-malformed` BEFORE
any fetch/validate (no vacuous source). Adapter-local reasons `header-range-malformed` /
`header-range-count-mismatch`; `spv-*` (incl. strict-parse `spv-header-malformed`, `spv-pow-insufficient`)
surfaced verbatim from `validateHeaderChain`. Red rounds: `5969b9f` (round 1) → `e3eaca4` (round 2: provider
exact-arg forwarding, range-malformed separated from count-mismatch, two hostile-header surfaces).

## 9. B4-INDEX design — the indexer (the firewall-minting heart) (design-first)

Package: **`@ont/adapter-indexer`** (distinct from the resolver, §7a #4). Block ingestion → the verified
`BatchDataSource` projections + the chain-bound `ConfirmedBatchAnchor` / `ConfirmedRecoverOwnerInvoke`
facts. This is where the inclusion + committed-batch firewalls live: B3 treats every one of these as
"verified / firewall-minted," so the indexer must **recompute-don't-trust** each from raw block bytes +
the validated header source (B4-HEADER), or emit nothing.

### 9.1 The exact B3 seams B4-INDEX fills (verbatim contracts)

| Seam output (B3 consumer) | Shape | Firewall-mint = recompute from |
|---|---|---|
| `ConfirmedBatchAnchor` (I-FEE-A, I-HARNESS) | `{ anchorTxid, minedHeight, anchoredRoot, batchSize }` | parse a RootAnchor tx (WIRE 0x0b) + bind to chain: `legacyTxidOf` + merkle inclusion vs the block header's `merkleRoot` + the header at `minedHeight` in the validated `BitcoinHeaderSource` |
| `BatchDataSource.feeTxForAnchor` (gate-fee) | `GateFeeTxWitnessParts = Pick<GateFeeWitness, "anchorTx" \| "prevoutTxs">` (NO schedule) | the same parsed anchor tx + each input's prevout tx (txid-bound); the orchestrator injects the TRUSTED schedule |
| `BatchDataSource.committedBatchForRoot` (gate-fee) | `CommittedBatchContents { anchoredRoot, batchSize, leaves: CommittedLeaf[] }` (`canonicalNameByteLength` per leaf) | recompute the FULL committed leaf set from batch material + verify it commits to `anchoredRoot`/`batchSize` — `canonicalNameByteLength` is FEE-CRITICAL (a lowered length underpays like a low schedule) |
| `BatchDataSource.baseLeavesForPrevRoot` (availability) | `ReadonlyMap<string,string> \| null` | the K-deep base accumulator leaf set whose root === `prevRoot` (verify the map hashes to `prevRoot`) |
| `BatchDataSource.servedLeavesForRoot` (availability) | `readonly ServedLeaf[] \| null` | the PRESENTED served bytes for `anchoredRoot` (pairs with B4-DA's `/da/{root}`); withheld → null → fails availability |
| `ConfirmedRecoverOwnerInvoke` (I-REC) | `{ txid, minedHeight, recoveryDescriptorHash, invokeFields }` | parse a RecoverOwner tx (WIRE 0x09) + chain-bind `minedHeight` (same inclusion firewall as the anchor) |

The B3 orchestrator already supplies the TRUSTED inputs (gate-fee schedule, DA windows K/W/C, recovery
params) — the indexer NEVER supplies a policy/schedule/window (false-accept defense, restated from
I-FEE-PATH). The indexer's bar: a CORRECT validated projection/fact, or `null`.

### 9.2 Proposed sub-slice decomposition (dependency-ordered; like I-FEE split)

B4-INDEX is too large for one red→green. Proposed sub-slices, each its own design→red→green:

1. **B4-INDEX-ANCHOR (first).** Block + candidate RootAnchor tx → `ConfirmedBatchAnchor` + `feeTxForAnchor`
   parts. The inclusion firewall (txid + merkle-inclusion + header-canonicality bind), foundational —
   every other fact builds on a confirmed anchor, and the fee-tx parts are the SAME parsed anchor tx +
   prevouts. Smallest well-bounded heart. **First.**
2. **B4-INDEX-COMMIT.** Batch material → `committedBatchForRoot` verified projection. The fee-critical
   committed-set recompute (root/size + `canonicalNameByteLength` per leaf).
3. **B4-INDEX-DATASOURCE.** `baseLeavesForPrevRoot` (K-deep base, verify map→prevRoot) +
   `servedLeavesForRoot` (presented served bytes; pairs with B4-DA).
4. **B4-INDEX-INVOKE.** RecoverOwner tx → `ConfirmedRecoverOwnerInvoke` (reuses the ANCHOR inclusion firewall).
5. **Persistence** (`@ont/db` rewrite) is plumbing BEHIND these projections — a thin store, not a
   decision-maker; folded into each sub-slice's adapter or a final sub-slice. Not consensus-relevant.

### 9.3 Mining material (reference, not law)

`apps/indexer` (~0.4k batch block-ingestion, no HTTP), `research/batch-rail.ts` (DA-filter / ordering /
notice-window — re-key to the merged kernel + #37 trigger), `@ont/core` `mergeAccumulatorBatch` (the
accumulator delta math — shape only), `@ont/db` `ont_documents` JSONB (schema reference). The RootAnchor /
RecoverOwner DECODES come from `@ont/wire` (WIRE 0x0b / 0x09); `legacyTxidOf` + merkle from `@ont/bitcoin` /
`@ont/evidence`. **Confirm** the wire decoders exist as importable (else a parser is a pure red→green helper).

### 9.4 First sub-slice — B4-INDEX-ANCHOR design (CL-concurred, API tightened, event ca3e20aa)

**Decomposition + ANCHOR-first + the 5 forks: CONCURRED.** CL confirmations folded: `@ont/wire`
`decodeEvent` IS the importable RootAnchor (0x0b) / RecoverOwner (0x09) decoder; persistence deferred;
unspec'd batch-material / rule-ish gaps PARKED for DK. Two API fixes + extra red pins (below) folded.

**CL fix 1 — one structured tx, no facts-from-A / fee-from-B.** The input is a structured
`anchorTx: LegacyTransaction` (NOT raw hex) — `legacyTxidOf` + `GateFeeWitness` already operate on
`LegacyTransaction`. The RootAnchor payload is decoded from the SAME tx's OP_RETURN output(s); the txid
used for inclusion is `legacyTxidOf(anchorTx)`; `feeTxParts.anchorTx` is that EXACT same object. So the
included/decoded tx and the fee tx can never diverge.

**CL fix 2 — `prevoutTxs` in the input (since ANCHOR emits `feeTxParts`).** Lean taken: include them here
and red-pin `feeTxParts.anchorTx` is the exact tx used for `legacyTxidOf`/inclusion. Fee ADEQUACY is not
re-checked here (that's the audited `gateFeeValidation`); ANCHOR passes `{anchorTx, prevoutTxs}` through and
the firewall pipe proves a hostile/absent-prevout path yields no ADMITTED fee fact downstream.

**Merkle recompute — a pure exported primitive (CL: do not depend on the hidden verifier helper).** The
recompute lives privately in `proof-bundle.ts` (`merkleRootFromProof`: display→internal `reverse`, pos-bit
sibling pairing, dsha256, root compared to `header.slice(36,68)`). This slice PROMOTES it to an exported
`@ont/bitcoin` primitive `merkleRootFromProof(txidDisplayHex, siblingsDisplayHex, pos)` (+ a tiny
`merkleRootHexFromHeaderHex` reading bytes 36..68), with a focused byte-order red battery, then REPOINTS
`proof-bundle.ts` to the shared primitive (behavior-preserving; the full `@ont/consensus` suite is the
regression gate). Single source of truth for consensus-critical merkle byte order — the legacyTxidOf /
headerMeetsTarget relocation precedent. **Kernel-touch flagged** (proof-bundle repoint at green, suite-gated).

```
// PURE core: bind a candidate RootAnchor tx to the chain (total + fail-closed; never throws).
buildConfirmedBatchAnchor({
  anchorTx: LegacyTransaction,                 // UNTRUSTED — structured tx (one tx for inclusion AND fees)
  prevoutTxs: readonly LegacyTransaction[],    // UNTRUSTED — each input's prevout tx (for feeTxParts)
  blockHeaderHex: string,                      // UNTRUSTED — the block's 80-byte header
  minedHeight: number,                         // UNTRUSTED — claimed height
  merkle: readonly string[],                   // UNTRUSTED — sibling path (display hex, esplora order)
  pos: number,                                 // UNTRUSTED — tx index within the block
  headerSource: BitcoinHeaderSource,           // TRUSTED — validated by B4-HEADER
  anchorVout?: number,                         // optional explicit OP_RETURN selector (else exactly-one rule)
}) -> { ok: true, confirmedAnchor, feeTxParts } | { ok: false, reason }
  1. txid       txid = legacyTxidOf(anchorTx); null -> "anchor-malformed"
  2. payload    scan anchorTx.outputs for OP_RETURN data that decodeEvent -> RootAnchor; if anchorVout given
                use only that output; else EXACTLY ONE decodable RootAnchor (0 or >1 -> "anchor-malformed";
                no silent first-match). wrong-type / non-anchor / malformed payload -> "anchor-malformed"
                (decodeEvent throws -> caught). batchSize / newRoot taken from the DECODE only.
  3. canonical  hdr = headerSource.headerHexAtHeight(minedHeight) (null/throw caught);
                hdr !== blockHeaderHex -> "anchor-noncanonical-header"
  4. inclusion  merkleRootFromProof(txid, merkle, pos) === merkleRootHexFromHeaderHex(blockHeaderHex)
                — else "anchor-not-included" (forged merkle / wrong position / wrong block)
  5. mint       confirmedAnchor = { anchorTxid: txid, minedHeight, anchoredRoot: decoded.newRoot,
                                     batchSize: decoded.batchSize }
                feeTxParts      = { anchorTx, prevoutTxs }   // SAME anchorTx object as inclusion
```
Reasons: `anchor-malformed` / `anchor-noncanonical-header` / `anchor-not-included`. The firewall: a
forged / withheld / non-canonical / wrong-payload anchor mints NO fact, so the B3 gate-fee + harness
predicates can't accept it.

**Planned `idx-anchor.*` red battery (CL pins; firewall pipe into the REAL `enforceGateFee` = the bar):**
- **firewall-positive** — valid `anchorTx` + block + prevouts → `ConfirmedBatchAnchor` + `feeTxParts` that
  `enforceGateFee` (real B3) ADMITS (reuse the I-FEE-A synthetic fee-adequate anchor fixture so the minted
  fact feeds the kernel; assert `gate-fee-adequate`).
- **payload selection** — exactly one decodable RootAnchor OP_RETURN unless `anchorVout` is given; multiple
  RootAnchor OP_RETURNs / wrong-type (Transfer 0x03) / missing payload → `anchor-malformed` (no first-match).
- **merkle byte-order primitive** — direct `merkleRootFromProof` pins: display→internal reverse, pos-bit
  pairing, root === header bytes 36..68; a wrong-order / wrong-pos proof → no match.
- **inclusion firewall** — anchor tx not in block (forged merkle / wrong `pos`) → `anchor-not-included`.
- **header firewall** — `headerSource` returns null / throws, or `blockHeaderHex` ≠ the source's header at
  `minedHeight` → `anchor-noncanonical-header`, never throws.
- **no side-channel trust** — a lying caller-supplied `anchoredRoot`/`batchSize` field cannot override the
  DECODED `newRoot`/`batchSize` (the API has no such field; pin that mint reads only the decode).
- **facts-from-A / fee-from-B** — `feeTxParts.anchorTx` is the exact tx whose `legacyTxidOf` was included +
  decoded (same object); a different fee tx is structurally impossible.
- **firewall-negative pipe** — each hostile path (bad merkle / bad header / wrong payload / absent prevout)
  yields no minted fact, OR a minted fact whose `feeTxParts` makes `enforceGateFee` REJECT (no admitted fee).
- determinism; never throws.

### 9.5 Design-concur — RESOLVED (ChatLunatique, event ca3e20aa)

All five forks concurred (decomposition + ANCHOR-first; `feeTxForAnchor` fold; `@ont/wire decodeEvent`
confirmed importable; persistence deferred; parking line for unspec'd batch-material / rule-ish gaps). Two
API fixes (structured `anchorTx: LegacyTransaction`; `prevoutTxs` in the input) + the merkle-primitive
promotion + the extra red pins are folded into §9.4. CL: "with those adjustments, the red path is clear" —
proceeding to **B4-INDEX-ANCHOR red battery** (no further concur round needed).

**LANDED (green @ `bf060d4`, CL red-OK r2 `19f9317f` + green-watch).** `@ont/adapter-indexer`, idx-anchor.*
24/24. `merkleRootFromProof` + `merkleRootHexFromHeaderHex` promoted to `@ont/bitcoin` (pos non-neg-int
guard); `proof-bundle.ts` repointed to the shared primitive (private copy + orphaned helpers removed),
behavior-preserving — `@ont/consensus` 466 pass / 2 skip. `buildConfirmedBatchAnchor` 0–5 step bind;
`opReturnData` consumes the script EXACTLY (OP_RETURN + single direct-push/PUSHDATA1, no trailing — CL
green-watch, trailing-bytes test added). Red rounds: `1ee1185` (r1) → `20e05f7` (r2: pos / anchorVout
no-fallback / minedHeight shape).

## 9.6 B4-INDEX-COMMIT design — the committed-batch projection (design-first)

The fee-critical firewall. `committedBatchForRoot(anchoredRoot) → CommittedBatchContents | null` must be a
VERIFIED projection (#52), NOT raw producer data: a lowered `canonicalNameByteLength` underpays exactly
like a low schedule, so the indexer RECOMPUTES every leaf from the batch material and binds the full set to
the anchored accumulator root — a lying name or length cannot survive.

**The binding (recompute-don't-trust).** The audited accumulator commits `leafKey = H(name) → ownerPubkey`
(the NAME itself is not in the tree — only its hash). `accumulatorRootOf(leaves)` replays `prevRoot + delta
→ newRoot` (insert-only disjoint delta, batch-completeness `bc.*`). So the projection: recompute each
batch entry's `leafKey = sha256Hex(normalizeName(name))` (reject non-canonical name bytes, W3), form the
delta, verify `accumulatorRootOf(baseLeaves ∪ delta) === anchoredRoot` and `|delta| === batchSize`, and set
`canonicalNameByteLength = utf8ByteLength(normalizeName(name))` from the VERIFIED name. A lying name → its
hash isn't the committed leaf key → root mismatch → null; a lowered length is impossible (recomputed).

```
// PURE core (total + fail-closed; never throws).
buildCommittedBatchForRoot({
  anchoredRoot,                                   // from the confirmed anchor (trusted: chain-bound)
  batchSize,                                       // from the confirmed anchor
  baseLeaves: ReadonlyMap<string, string>,         // the prevRoot base (K-deep), verified accumulatorRootOf === prevRoot
  batchEntries: readonly { name, ownerPubkey }[],  // UNTRUSTED published batch material
  prevRoot,                                        // to verify baseLeaves and disjointness
}) -> CommittedBatchContents | null
  1. base       accumulatorRootOf(baseLeaves) === prevRoot — else null (a hostile base can't be trusted)
  2. delta      for each entry: isCanonicalName(name) (W3 GATE — reject, NOT normalizeName) else null;
                leafKey = sha256Hex(utf8ToBytes(name)); ownerPubkey = the raw accumulator value, REQUIRED
                32-byte lowercase hex (no case-normalized mint) else null; delta disjoint from baseLeaves +
                internally unique (insert-only) else null
  3. bind       accumulatorRootOf(baseLeaves ∪ delta) === anchoredRoot — else null
  4. size       delta.size === batchSize — else null
  5. project    leaves = [{ leafKeyHex: leafKey, canonicalNameByteLength: utf8ToBytes(name).length }] from the
                VERIFIED name (extra/riding fields ignored), SORTED by leafKeyHex; { anchoredRoot, batchSize, leaves }
  // any malformed root/base/value or accumulatorRootOf throw → null (never an exception / case-normalized mint)
```

**CL tightenings folded (event 909f7202-thread, concur):** (1) W3 canonical-name GATE via `@ont/wire`
`isCanonicalName` — reject non-canonical bytes, do not `normalizeName` (the W2 accepting parser); (2)
shape/catch firewall — `ownerPubkey` 32-byte lowercase hex (`value === ownerPubkey` under current B3), catch
any `accumulatorRootOf` throw → null, never a throw / case-normalized mint; (3) deterministic projection —
`leaves` sorted by `leafKeyHex` (replay is order-independent; the seam output must be too).

**Planned `idx-commit.*` red battery (firewall pipe = the bar):**
- **firewall-positive** — a valid base + batch → a projection that `gateFeeValidation` / `enforceGateFee`
  consumes to the CORRECT Σ g (reuse the I-FEE-A leaf set; assert the recomputed lengths drive the fee).
- **lying length** — a producer-supplied shorter `canonicalNameByteLength` is structurally absent (the API
  takes names, not lengths); pin the projected length is recomputed from the name (a 1-byte vs 9-byte name
  changes Σ g, and the wrong name can't bind).
- **lying name / wrong leaf** — a name whose `H(name)` isn't in the anchored accumulator → root mismatch → null.
- **wrong size** — `delta.size !== batchSize` → null (a dropped/extra leaf, #52: Σ g over the FULL set).
- **hostile base** — `accumulatorRootOf(baseLeaves) !== prevRoot` → null (no trust of an unverified base).
- **non-canonical name bytes** (W3, mixed-case) → null (NOT a projection for the lowercased name);
  **bad ownerPubkey** (non-32-byte / non-lowercase-hex) → null; **malformed base** (bad hex) → null, no throw;
  **duplicate committed name** (non-disjoint / internally repeated) → null.
- **riding side-channel** (CL) — an entry carrying an extra `canonicalNameByteLength: 1` (or any fee-looking
  field) is NOT read; the projected length is recomputed from the verified name and `enforceGateFee` prices
  that full length (a length-1 reading would underpay → reject).
- **deterministic / order-independent** — input permutation → byte-identical `CommittedBatchContents`
  (leaves sorted by `leafKeyHex`); never throws.

### 9.7 B4-INDEX-COMMIT design-concur — RESOLVED (ChatLunatique, concur)

All four open calls concurred: `{ name, ownerPubkey }[]` is the right minimal material (value records are a
later projection); base map + `accumulatorRootOf === prevRoot` is the B4 firewall (membership proofs not
this slice); insert-only disjointness + internal uniqueness enforced here; no-new-law / unspec'd
batch-material encoding parked for DK. Three tightenings + the riding side-channel pin (above) folded.
Proceeding to **B4-INDEX-COMMIT red battery** (no further concur round needed).

**LANDED (green @ `57243f7`, CL red-OK `591f59e5` + green-watch).** idx-commit.* 12/12; adapter-indexer
36/36. `buildCommittedBatchForRoot` 1–5 step bind (try/catch → null): base-verify → W3 `isCanonicalName`
gate + lowercase-hex owner + insert-only → bind → size → sorted projection (length recomputed from the
verified name). Green-watch fix: `@ont/consensus` moved devDeps → deps (the prod export returns
`CommittedBatchContents`). Red: `d6c1899`.

## 9.8 B4-INDEX-DATASOURCE design — the availability seam (design-first)

`baseLeavesForPrevRoot(prevRoot)` + `servedLeavesForRoot(anchoredRoot)` — the two `BatchDataSource`
accessors the B3 availability stage consumes (`verifyAvailabilityHeight({ baseLeaves, servedDelta, binding,
confirmedAnchorMinedHeight })`). Both are firewall-minted (recompute-don't-trust): a withheld / tampered /
empty source mints `null`, so the availability stage fails closed (`base-leaves-absent` /
`served-bytes-withheld`) — it can never reconstruct a false root.

**The binding.** `ServedLeaf { keyHex, valueHex }` (32-byte lowercase hex; key = `H(name)`, value =
ownerPubkey). The served delta is insert-only disjoint from the base, and `accumulatorRootOf(base ∪ delta)
=== anchoredRoot` over a base whose `accumulatorRootOf === prevRoot` (`bindServedBytes` / the audited
availability builder enforce exactly this). So the two firewall cores:

```
// baseLeavesForPrevRoot firewall — NEVER an empty-base default (base-leaves-absent is a fail-closed reject).
verifyBaseLeaves(prevRoot, baseLeaves: ReadonlyMap<string,string>) -> ReadonlyMap | null
  accumulatorRootOf(baseLeaves) === prevRoot ? baseLeaves : null

// servedLeavesForRoot firewall — the presented DA bytes must reconstruct the anchored root.
verifyServedDelta({ prevRoot, anchoredRoot, baseLeaves, presentedServed: readonly ServedLeaf[] })
  -> readonly ServedLeaf[] | null
  // verified base (accumulatorRootOf === prevRoot); each leaf 32-byte lowercase hex; non-empty; insert-only
  // disjoint from base + internally unique; accumulatorRootOf(base ∪ presentedServed) === anchoredRoot
  // → presentedServed; else null (withheld / tampered / omitted-or-extra leaf). Total + fail-closed.
```
A thin `BatchDataSource` wrapper keyed by root holds the indexed base + the presented served set and runs
these cores per access. `presentedServed` is the UNTRUSTED DA-transport payload (B4-DA's `/da/{root}`);
this slice VERIFIES it, B4-DA FETCHES it.

**Planned `idx-ds.*` red battery (firewall pipe = the bar):**
- **firewall-positive** — a verified base + served delta → both accessors return; piped into the REAL
  `verifyAvailabilityHeight` they reconstruct `anchoredRoot` and yield `firstServableHeight === anchorHeight`
  (reuse the served-bytes fixture; assert `bound.anchoredRoot === anchoredRoot`).
- **base firewall** — `accumulatorRootOf(baseLeaves) !== prevRoot` → null (NEVER an empty-base default; a
  null/empty base is `base-leaves-absent`, not a silent empty default).
- **served firewall** — withheld (`null`/empty) → null; a tampered / omitted / extra leaf so
  `root(base ∪ served) !== anchoredRoot` → null; non-disjoint (served key already in base) → null.
- **shape** — a non-32-byte / non-lowercase-hex `keyHex`/`valueHex` → null; duplicate served key → null.
- **fresh canonical copies out** (CL) — `verifyBaseLeaves` returns a fresh Map (`not.toBe` the caller's);
  `verifyServedDelta` returns a fresh array sorted by `keyHex` (order-independent like COMMIT).
- **non-Map base** (map-like object) / **null base** → null (never synthesized into an empty accumulator);
  a genesis empty Map is valid ONLY for the empty `prevRoot`.
- **wrapper cross-bind** (CL) — `servedLeavesForRoot(anchoredRoot)` verifies the record's payload against
  THAT record's indexed `prevRoot`/`baseLeaves` (not a raw lookup); a wrong/unverified base → null.
- **firewall-negative pipe** — each hostile served/base path → `verifyAvailabilityHeight` throws/rejects →
  no availability (the adapter mints null upstream).
- determinism; never throws.

### 9.9 B4-INDEX-DATASOURCE design-concur — RESOLVED (ChatLunatique, event 01771c30)

All four open calls concurred (two pure cores + thin wrapper; `presentedServed` fixture-injected here /
real `/da/{root}` transport in B4-DA; absent/unverified base fails closed, never a silent empty accumulator;
no-new-law / W15 transport parked for DK). Four tightenings folded (above + the green contracts in
`availability-source.ts`): (1) `verifyBaseLeaves` requires a real Map, validates every key/value lowercase
hex, catches `accumulatorRootOf`, returns a FRESH canonical Map (never caller-owned); (2) served strictness
— validate `prevRoot`/`anchoredRoot` + each leaf lowercase hex before replay, reject duplicate keys, return
a fresh sorted-by-`keyHex` array; (3) no-empty-default nuance — null/missing never becomes empty; an
explicit empty Map is valid only for the genesis empty `prevRoot`; (4) wrapper cross-bind —
`servedLeavesForRoot` verified against the indexed `prevRoot`/`baseLeaves`, not a raw root lookup.
Green-watch: `@ont/evidence` added as a direct adapter-indexer dependency (`ServedLeaf` is a prod import).
Red round 2 (CL, event 6c86af32) folded: valid-hex UPPERCASE rejects (lowercase-only, since
`accumulatorRootOf` lowercases — letter-containing fixtures so uppercase differs); empty Map with a
non-genesis `prevRoot` → null (empty allowed only when it verifies); the served projection returns FRESH
leaf objects (not caller-owned). Proceeding to **B4-INDEX-DATASOURCE red battery** (red-OK pending).

**LANDED (green @ `7c9552b`, CL red-OK r2 `d6800ce3` + green-watch).** idx-ds.* 23/23; adapter-indexer
59/59. `verifyBaseLeaves` + `verifyServedDelta` cores (try/catch → null): `HEX_64_LOWER` (lowercase-only)
on roots + every key/value BEFORE `accumulatorRootOf` (stricter than the permissive lowercasing layer);
FRESH canonical Map / FRESH sorted leaf objects; genesis empty binds iff `prevRoot === root(∅)`. Wrapper
already real. Red rounds: `6fde09a` (r1) → `077eceb` (r2: uppercase / empty-non-genesis / fresh leaves).

## 9.10 B4-INDEX-INVOKE design — the recover-owner invoke fact (design-first)

The last B4-INDEX sub-slice: `ConfirmedRecoverOwnerInvoke { txid, minedHeight, recoveryDescriptorHash,
invokeFields }` — the chain-bound recovery-invoke fact the B3 I-REC orchestrator (`enforceRecoveryInvoke`)
consumes. It REUSES the ANCHOR inclusion firewall (txid + header-canonicality + merkle-inclusion bind +
`minedHeight`), decoding a RecoverOwner (WIRE 0x09) instead of a RootAnchor. No fee witness (I-REC takes
none), so it mints only the invoke fact. `invokeFields` = the decoded RecoverOwner MINUS `type`/`minedHeight`.

```
// PURE core: bind a candidate RecoverOwner invoke tx to the chain (total + fail-closed; never throws).
buildConfirmedRecoverOwnerInvoke({
  invokeTx: LegacyTransaction,        // UNTRUSTED — the structured invoke tx
  blockHeaderHex, minedHeight, merkle, pos,   // UNTRUSTED — inclusion coordinates (as ANCHOR)
  headerSource,                       // TRUSTED — validated by B4-HEADER
  invokeVout?,                        // optional explicit OP_RETURN selector (else exactly-one rule)
}) -> { ok: true, confirmedInvoke } | { ok: false, reason }
  0. height     minedHeight non-neg-int else "invoke-noncanonical-header" (before header lookup)
  1. txid       legacyTxidOf(invokeTx); null -> "invoke-malformed"
  2. payload    decode RecoverOwner (WIRE 0x09) from the OP_RETURN (exactly-one or explicit invokeVout,
                no-fallback; wrong-type/missing/multiple -> "invoke-malformed")
  3. canonical  headerSource.headerHexAtHeight(minedHeight) === blockHeaderHex else "invoke-noncanonical-header"
  4. inclusion  merkleRootFromProof(txid, merkle, pos) === header root(36..68) else "invoke-not-included"
  5. mint       confirmedInvoke { txid, minedHeight, recoveryDescriptorHash: decoded.recoveryDescriptorHash,
                invokeFields: { prevStateTxid, newOwnerPubkey, flags, successorBondVout,
                challengeWindowBlocks, recoveryDescriptorHash, signature } }  // from the DECODE only
```
Reasons: `invoke-malformed` / `invoke-noncanonical-header` / `invoke-not-included` (the ANCHOR firewall,
re-keyed). The firewall pipe (bar): the minted `confirmedInvoke` feeds the REAL `enforceRecoveryInvoke`
(with a descriptor + nameState + recoveryParams fixture, reusing the I-REC recipe) → `recovery-invoke-
authorized`; hostile (forged merkle / wrong header / wrong payload) → no fact → I-REC can't authorize.

**Planned `idx-invoke.*` red battery:** firewall-positive (minted fact → `enforceRecoveryInvoke` authorizes);
payload selection (exactly-one / explicit `invokeVout` / wrong-type / multiple → `invoke-malformed`);
inclusion firewall (forged merkle → `invoke-not-included`); header firewall (null/mismatch/throw →
`invoke-noncanonical-header`); `minedHeight` shape; `invokeFields` taken only from the decode (no
side-channel); determinism; never throws.

### 9.11 B4-INDEX-INVOKE design-concur — open calls (my leans)

1. **Reuse the ANCHOR inclusion firewall.** Both bind a tx to the chain identically (header-canonicality +
   `merkleRootFromProof` + `minedHeight`); only the decode differs (0x09 vs 0x0b). **Lean: factor a shared
   `src/inclusion.ts` (`opReturnData` + a `bindTxInclusion` core) reused by ANCHOR + INVOKE**, re-pointing
   ANCHOR (regression-gated by idx-anchor.* 24/24 + the firewall pipe) — single inclusion-firewall source,
   the merkle-primitive-promotion ethos. (Alt: INVOKE self-contained, duplicating the bind — I disfavor.)
2. **On-chain carrier of the 171-byte RecoverOwner.** A RecoverOwner (171B) / Transfer (135B) exceeds the
   80-byte OP_RETURN *standardness* relay limit — but that is policy, NOT consensus: a confirmed block can
   carry a larger OP_RETURN (OP_PUSHDATA1, ≤255B), and the indexer reads confirmed bytes regardless of relay
   standardness. **Lean: reuse `opReturnData` (PUSHDATA1) as the carrier**, consistent with ANCHOR. BUT the
   on-chain carrier of >80B events is not pinned in WIRE_FORMAT — **if the carrier needs a normative spec
   decision (OP_RETURN-PUSHDATA1 vs witness vs multi-output), that is PARKED for DK** (a wire/carrier rule),
   and INVOKE proceeds on the OP_RETURN-PUSHDATA1 assumption with a flagged reopen.
3. **No fee witness.** `enforceRecoveryInvoke` takes no fee; INVOKE mints only `confirmedInvoke` (no
   `feeTxParts`/`prevoutTxs`). **Lean: this.**
4. **No new law.** Decode (0x09) + the inclusion bind are ratified shapes; only the carrier-encoding (call 2)
   may need DK. Confirm the parking line.

On concur (esp. #1 shared-helper + #2 the carrier ruling) I open **B4-INDEX-INVOKE red battery**.

### 9.12 B4-INDEX-INVOKE design-concur — RESOLVED (ChatLunatique, event 1feac86c)

All concurred. (1) Shared inclusion helper: factor `opReturnData` + `bindTxInclusion`, keep decoder-specific
payload selection per-adapter, re-point ANCHOR (idx-anchor.* 24/24 + the firewall pipe = the regression
gate; preserve ANCHOR behavior unless a red pin changes it). (2) Carrier: **PROCEED with exact `OP_RETURN
<single push> <payload>` incl. `OP_PUSHDATA1` for the 171-byte RecoverOwner** — `WIRE_FORMAT` frames ONT
OP_RETURN payloads and §4.6 acknowledges >80B as relay-policy / confirmed-block ingestion territory;
alternative carriers (witness, multi-output split) PARKED for DK, not implemented here. (3) No fee witness /
(4) no new law: confirmed — INVOKE mints only the chain-bound fact; `enforceRecoveryInvoke` owns authority.
Red pins folded: `invokeFields` is exactly the unmined RecoverOwner fields (no `type`/`minedHeight`/`source`;
top-level `recoveryDescriptorHash` == decoded); a non-invoke-flags RecoverOwner STILL mints and the kernel
rejects `non-invoke-flags` (adapter decodes+binds, never pre-decides authority); structured-tx discipline
(txid == the decoded+included tx); ANCHOR-mirrored payload selection (explicit vout no-fallback, exactly-one
otherwise); malformed `minedHeight` never consults `headerSource`; PUSHDATA1 positive + reject trailing /
multi-push / unsupported push forms. Refactor landed @ `38add0d` (shared `src/inclusion.ts`, ANCHOR
re-pointed, 59/59 green). Proceeding to **B4-INDEX-INVOKE red battery** (no further concur round needed).

## 10. B4-DA design — the served-bytes transport (`/da/{root}`) (design-first)

B4-INDEX is complete (HEADER + INDEX-{ANCHOR,COMMIT,DATASOURCE,INVOKE} all green). B4-DA is the served-bytes
DELIVERY behind B4-INDEX-DATASOURCE's `servedLeavesForRoot`: DATASOURCE took `presentedServed` as a
fixture-injected `ServedLeaf[]` and VERIFIES it reconstructs the anchored root; B4-DA does the REAL fetch +
parse of the `/da/{root}` payload into that `ServedLeaf[]`. **Split (the B4-HEADER precedent): B4-DA
FETCHES + PARSES (untrusted bytes → `ServedLeaf[]`); DATASOURCE VERIFIES (root reconstruction).** A withheld
/ malformed serve → `null` → DATASOURCE fails closed (`served-bytes-withheld`); a parsed delta that doesn't
reconstruct → DATASOURCE rejects. B4-DA decides nothing.

Package: **`@ont/adapter-da`**. Prod dep `@ont/evidence` (`ServedLeaf`); the firewall test imports the
DATASOURCE cores (`@ont/adapter-indexer`) + `@ont/evidence` (`verifyAvailabilityHeight`) for the pipe.

### 10.1 The served-transport format — UNSPEC'd → a parked-for-DK proposal

**Recon finding:** the `/da/{root}` served-bytes encoding is NOT specified anywhere — `WIRE_FORMAT` frames
on-chain events (its W15/availability-marker frame was retired by marker-fold), and `@ont/evidence`
`served-bytes.ts` consumes a `ServedLeaf[]` (it never serializes one). The old `apps/*` are mining
reference only. So B4-DA needs a served-transport serialization that does not yet exist in canon.

**Proposed minimal canonical format (decision-ready; PARKED for DK as new transport spec):**
```
served-transport := version(1) ‖ count(u32, big-endian — WIRE u32 convention) ‖ count × leaf
leaf            := keyHex-bytes(32) ‖ valueHex-bytes(32)      // 64 bytes per leaf, internal binary
```
- `version` MUST be `0x01` (unknown → reject); total length MUST equal `5 + 64 × count` EXACTLY (no trailing
  bytes — the B4-HEADER exact-count discipline); `count` is the declared leaf count and must match.
- Parse output: each leaf → `{ keyHex, valueHex }` as 32-byte LOWERCASE hex. Structural decode only —
  DATASOURCE owns dedup / disjointness / non-empty / root reconstruction (B4-DA does not re-verify).
- This is a SERIALIZATION (delivery), not a consensus rule, but it is NEW wire/transport spec → **DK
  ratifies the format**; B4-DA proceeds on this proposal with a flagged reopen (the `>80B carrier`
  precedent). Alternative encodings (length-prefixed-hex, JSON, CBOR, erasure-coded chunks) parked for DK.

### 10.2 B4-DA API (design)

```
// the network I/O seam (real HTTP /da/{root} in production; fixture in tests). ASYNC.
DaSource { fetchServed(anchoredRoot: string): Promise<string | null> }   // raw served-transport hex, or null

// PURE: parse the served-transport bytes → ServedLeaf[] (structural; lowercase-hex; exact-length firewall).
parseServedTransport(rawHex: string): readonly ServedLeaf[] | null
  version 0x01 + length === 5 + 64*count + lowercase-hex leaves → ServedLeaf[]; else null

// ASYNC wrapper: fetch → parse (never throws / rejects).
fetchServedLeaves({ daSource, anchoredRoot }): Promise<readonly ServedLeaf[] | null>
  raw = await daSource.fetchServed(anchoredRoot); null/reject/throw → null; else parseServedTransport(raw)
```
The B3 path: B4-DA `fetchServedLeaves` → DATASOURCE `verifyServedDelta({prevRoot, anchoredRoot, baseLeaves,
presentedServed})` → REAL `verifyAvailabilityHeight` reconstructs `anchoredRoot`. A hostile DA source
(withheld / tampered bytes / wrong leaves) yields no verified delta, so availability fails closed.

**Planned `da.*` red battery:** parse round-trip (a canonical buffer → the exact `ServedLeaf[]`); the parsed
delta feeds DATASOURCE `verifyServedDelta` + the REAL `verifyAvailabilityHeight` to reconstruct `anchoredRoot`
(firewall-positive); exact-length firewall (short/long/trailing → null); bad version → null; non-lowercase
/ malformed hex impossible from binary (bytes → lowercase always), so the hostile case is a tampered leaf →
DATASOURCE root-mismatch → no availability; provider null / reject / throw → null (never throws); a
parsed-but-wrong delta (omitted/extra leaf) → DATASOURCE rejects (pipe-negative); determinism.

### 10.3 B4-DA design-concur — open calls (my leans)

1. **Fetch/parse split (B4-HEADER precedent).** async `DaSource.fetchServed` seam + pure
   `parseServedTransport` + async `fetchServedLeaves` wrapper; B4-DA fetches+parses, DATASOURCE verifies.
   **Lean: this.**
2. **Served-transport format (§10.1) — the BIG call.** Propose `version ‖ count(u32 BE) ‖ count×[key32‖value32]`,
   exact-length, lowercase-hex out. **PARK for DK** (new transport spec); proceed on the proposal with a
   flagged reopen. **Lean: this minimal canonical binary format.**
3. **No re-verification in B4-DA.** The root-reconstruction firewall stays in DATASOURCE; B4-DA only decodes
   bytes (a structural parse). **Lean: this** (single firewall source, like the indexer/resolver split).
4. **No new consensus law.** The transport is delivery; consensus is unchanged. The format proposal is the
   only DK-facing item. Confirm the parking line.

On concur (esp. #2 the format ruling) I open the **B4-DA red battery**.
