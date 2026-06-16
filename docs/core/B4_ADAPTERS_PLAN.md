# B4 — real adapters: feeding the audited B3 enforcement from the live network

> **Status: DRAFT — phase brief, design-first. Writer: ClaudeleLunatique. Reviewer:
> ChatLunatique (pending). DK confirms scope + the first slice.** Opens after B3 integration
> merged to `main` @ `b3b74f8` (DK: "let's go on to B4"). Branch: `clean-build-b4`.

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
