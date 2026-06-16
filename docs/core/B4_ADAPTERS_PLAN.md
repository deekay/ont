# B4 — real adapters: feeding the audited B3 enforcement from the live network

> **Status: IN PROGRESS. Writer: ClaudeleLunatique. Reviewer: ChatLunatique.** Opens after B3
> integration merged to `main` @ `b3b74f8` (DK: "let's go on to B4"). Branch: `clean-build-b4`.
>
> **Slice progress:** B4-HEADER **GREEN @ `0ee8a70`** (CL red-OK round 2 `49222e9e` → green-OK; hdr.*
> 18/18; `@ont/adapter-header`). B4-INDEX **design-concur (§9)** — pending CL.

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

### 9.4 First sub-slice — B4-INDEX-ANCHOR design

```
// PURE core: bind a candidate RootAnchor tx to the chain.
buildConfirmedBatchAnchor({ anchorTxHex, blockHeaderHex, minedHeight, merkleProof, headerSource })
  -> { ok: true, confirmedAnchor, feeTxParts } | { ok: false, reason }
  1. parse      decode RootAnchor (WIRE 0x0b) from anchorTxHex; not an anchor / malformed -> "anchor-malformed"
  2. canonical  headerSource.headerHexAtHeight(minedHeight) === blockHeaderHex — else "anchor-noncanonical-header"
  3. inclusion  merkleRootFromProof(legacyTxidOf(anchorTx), merkleProof) === blockHeader.merkleRoot — else
                "anchor-not-included" (forged merkle / wrong position / wrong block)
  4. mint       ConfirmedBatchAnchor { anchorTxid = legacyTxidOf(anchorTx), minedHeight, anchoredRoot, batchSize }
                (anchoredRoot / batchSize read from the DECODED anchor, never a producer assertion)
  // feeTxParts { anchorTx, prevoutTxs } assembled from the parsed tx + supplied prevout txs (txid-bound).
```
Trusted inputs: `headerSource` (from B4-HEADER, already validated). Untrusted: `anchorTxHex`,
`blockHeaderHex`, `merkleProof`, `prevout txs`. The firewall: a forged/withheld/non-canonical anchor mints
NO fact, so the B3 gate-fee + harness predicates can't accept it.

**Planned `idx-anchor.*` red battery (firewall pipe = the bar):**
- valid block + anchor tx → `ConfirmedBatchAnchor` + `feeTxParts` that `enforceGateFee` (real B3) ADMITS
  (firewall-positive; reuse the I-FEE-A synthetic-anchor fixture so the minted fact feeds the kernel).
- anchor tx not in block (forged merkle / wrong position) → `anchor-not-included`, no fact.
- block header not in validated `headerSource` at `minedHeight` → `anchor-noncanonical-header`.
- malformed / wrong-type tx (a Transfer 0x03, not a RootAnchor) → `anchor-malformed`.
- `anchoredRoot` / `batchSize` taken from the DECODE, NOT from any caller-supplied field (a lying
  side-channel field must not override the decoded values) → pin no-trust-of-side-channel.
- determinism; never throws.

### 9.5 Design-concur — open calls (my leans)

1. **Sub-slice decomposition + ANCHOR first (§9.2).** **Lean: yes** — ANCHOR is the inclusion firewall
   everything builds on, smallest, and folds `feeTxForAnchor` (same parsed tx).
2. **`feeTxForAnchor` folds into B4-INDEX-ANCHOR** (it's the same parsed anchor tx + prevouts). **Lean: yes.**
3. **Wire decoders** — confirm `@ont/wire` exposes importable RootAnchor (0x0b) / RecoverOwner (0x09)
   decoders; if not, the decode is a pure red→green helper inside the adapter (no new law). **Lean: reuse
   if present, else helper.**
4. **Persistence scope** — `@ont/db` rewrite as thin store behind the projections, deferrable to a final
   sub-slice; the firewall-minting (this slice) does not depend on it. **Lean: defer persistence.**
5. **No new law** — the committed-batch recompute, inclusion bind, and base-map→prevRoot check are all
   recompute-don't-trust over ALREADY-ratified shapes (#52 committed set, merkle inclusion, accumulator
   root). Any rule-ish gap (e.g. an unspec'd batch-material encoding) is PARKED for DK. Confirm the line.

On concur (esp. #1 decomposition + #2 fee-tx fold) I open **B4-INDEX-ANCHOR red battery**.
