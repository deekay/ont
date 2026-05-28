# ONT wallet — test plan

What we test now, what we should add, and what to run manually to gain confidence
the wallet is ready for the Lexe meeting and for early signet testers.

This is a working document, not a frozen spec. The wallet is `apps/wallet`.

## 1. Goals

- **Correctness of the on-chain machinery.** PSBTs built and signed by the wallet
  must be acceptable to the consensus rules in `@ont/consensus` (transfers don't
  break the bond chain, bids' OP_RETURN commitments match the auction state, etc.).
- **No silent footguns.** The wallet must never (a) burn a tx the consensus
  would reject, (b) spend a locked bid bond, (c) hand out a proof bundle it
  hasn't validated locally, or (d) overwrite state without preserving history.
- **Honest behavior under partial info.** A claim that hasn't synced, a name the
  resolver doesn't know yet, an unreachable broadcast endpoint — each must
  surface a useful message and a safe default, not crash.
- **End-to-end coherence.** The lifecycle as a whole (claim → bond tracking →
  sync → ownership → set-destination → export-proof → verify) must work, not
  just the unit pieces.

## 2. Current automated coverage

Run with `npm test -w @ont/wallet` (typechecks via `tsc --noEmit` then vitest).
Current state: **56 tests across 11 files** as of this writing.

| Module | Tests | Covers |
|---|---|---|
| `keys.test.ts` | 3 | owner key (Schnorr 32B), funding key (P2WPKH), recovery from WIF |
| `keystore.test.ts` | 4 | round-trip encrypted file, signet address derivation, wrong-password rejection, secrets never written in clear |
| `wallet-state.test.ts` | 13 | empty/load, track + preserve addedAt, value/recovery recording, sync, **bid recording, lock semantics (locked / releasable / unsynced), file round-trip including bids** |
| `resolver.test.ts` | 9 | name 404/200, value POST, error response, recovery 404/200/POST, auction find by name, auction-not-found |
| `broadcast.test.ts` | 4 | URL resolution (explicit > env > network default), regtest no-endpoint error, POST /tx, broadcast error |
| `utxos.test.ts` | 4 | confirmed-only filter, include-unconfirmed, server error, non-array response |
| `bid-package.test.ts` | 3 | resolver auction state → valid bid package, builder accepts it, below-minimum flagged via preview |
| `signer.test.ts` | 3 | sign auction-bid (one input), key mismatch error, sign transfer |
| `transfer-plan.test.ts` | 4 | derives from record, falls back to required bond, explicit overrides, throws without bond outpoint |
| `proof-export.test.ts` | 6 | assembles valid bundle (passes `verifyProofBundle`), invalid after transfer, throws without winning bid / accepted bids / bond outpoint, includes value-record chain |

## 3. Gaps to close (planned in this push)

- **End-to-end lifecycle integration test** — see §4. The unit tests prove each
  block; this proves they assemble.
- **`claim` rejection path** — that below-minimum / too-early / closed previews
  throw rather than build, and that `--allow-rejected` overrides.
- **Auto-fund excludes locked bonds at the funding layer** — currently only
  tested at the `WalletState.lockedBondOutpoints()` level. The integration
  test (next slice) exercises the full path through `resolveFundingInputs`.
- **`sync` bid reconciliation** — bid status flips from unsynced to a known
  status; the locked set updates accordingly.
- **`watch` polling loop** — tested by giving it a stubbed resolver that
  returns different states on successive calls.

## 4. Integration test (new — landing this push)

A single high-signal test, `lifecycle.integration.test.ts`, stubs
`global.fetch` and walks the wallet through:

1. `init` → keystore on disk, owner + funding addresses derived.
2. `claim <name> --amount <n>` against a stubbed `/experimental-auctions`
   returning a fresh `awaiting_opening_bid` auction. Asserts the bid commits
   the wallet's owner pubkey, the signed tx is well-formed, state records
   a `pendingClaim` and a locked `TrackedBid`.
3. `sync` against a stubbed `/name/<n>` showing the wallet as owner +
   `/experimental-auctions` showing the bid as `winner_releasable`. Asserts
   `pendingClaim` cleared, ownership ref adopted, bid bond no longer locked.
4. `set-destination <n>` against a stubbed `/values` POST. Asserts the signed
   value record's `previousRecordHash` chains correctly.
5. `export-proof <n>` against stubbed `/name/<n>` + `/experimental-auctions` +
   `/name/<n>/value/history`. Asserts the bundle's `verifyProofBundle` report
   is `valid: true`.

This single test catches integration-level bugs that the unit suite misses:
field-name mismatches between the wallet's typed resolver client and the
real resolver shape, ordering between record-writes and saves, and the bid
bond → ownership transition.

## 5. Manual smoke tests (for morning)

These verify behavior I can't easily fake with stubs.

### 5a. Fully offline (no external services)

```sh
export ONT_WALLET_KEYSTORE=/tmp/wallet-smoke/ks.json
export ONT_WALLET_STATE=/tmp/wallet-smoke/state.json
export ONT_WALLET_PASSWORD=demo-pw
export ONT_WALLET_NETWORK=regtest
rm -rf /tmp/wallet-smoke && mkdir -p /tmp/wallet-smoke

npm run dev -w @ont/wallet -- init
npm run dev -w @ont/wallet -- info
npm run demo -w @ont/wallet                           # full lifecycle on regtest, synthetic UTXO
npm run dev -w @ont/wallet -- names                   # shows the demo's pending claim
npm run dev -w @ont/wallet -- bids                    # shows the bid bond as unknown/locked
```

Expected: every command exits 0, no warnings or stack traces.

### 5b. Resolver-backed (needs `npm run dev:resolver` in another terminal)

```sh
# in another terminal:
npm run dev:resolver

# main terminal:
export ONT_RESOLVER_URL=http://127.0.0.1:8787
npm run dev -w @ont/wallet -- auctions               # list whatever the resolver has
npm run dev -w @ont/wallet -- lookup satoshi         # whichever name exists
```

Expected: `auctions` lists the resolver's live auctions with phase + minimum
bid + blocks-until-close; `lookup` shows the name's owner + state txid.

### 5c. Resolver-backed claim (requires a funded signet address + an unclaimed name)

```sh
export ONT_WALLET_NETWORK=signet
export ONT_BROADCAST_URL=https://mempool.space/signet/api    # or your own esplora
npm run dev -w @ont/wallet -- balance                # check the funding address has UTXOs
npm run dev -w @ont/wallet -- claim <name> --amount 20000 --fee-sats 500
# inspect signed hex; verify locally with `npm run dev -w @ont/wallet -- bids`
# add --broadcast to actually send
```

Expected: balance shows confirmed UTXOs; claim builds and signs; bids shows
the bond as locked-until-synced.

### 5d. The locked-bond safety net

After a claim, the bid bond's UTXO is at the funding address. Without the
wallet's lock-tracking, auto-fund would happily try to spend it.

```sh
npm run dev -w @ont/wallet -- balance                # shows the bond as a spendable UTXO
npm run dev -w @ont/wallet -- transfer <other> --to <pubkey> --fee-sats 500
# expect: auto-funding excludes N locked bid bond(s) — DON'T spend the bond
```

If you see "excluded N locked bid bond(s)" the safety net works.

## 6. Signet live-test plan (the real check for the Lexe meeting)

This is the only path that proves the wallet's resolver-typed interfaces
actually match a real resolver running against a real chain.

1. **Set up signet wallet:** `init` on signet, fund the funding address from
   a signet faucet (≥ 50,000 base units — enough for at least one
   bid + bond + fee + spare for transfer).
2. **Discover:** `auctions` against a signet resolver to see what's biddable.
3. **Claim:** `claim <name> --amount <≥minimum> --fee-sats 500 --broadcast`
   for an `awaiting_opening_bid` auction. Verify it broadcasts; record txid.
4. **Wait for confirmation** (signet block ~2 min in canonical setup; longer
   on public signet).
5. **Sync:** `sync` should reconcile bond status from the resolver. Confirm
   `bids` reports the new bond status (likely `leading_locked` or
   `winner_releasable` depending on whether anyone re-bid).
6. **If uncontested:** name matures into the wallet's ownership. `names`
   should show ownership transferred and pendingClaim cleared.
7. **Set destination:** `set-destination <name> 1 "hello"` and read it back
   via `lookup` from a different resolver if available.
8. **Export proof:** `export-proof <name> --out /tmp/proof.json` then
   `verify /tmp/proof.json` — both should report VALID.
9. **Transfer:** make a second wallet, `transfer <name> --to <its owner>
   --fee-sats 500 --broadcast`. Confirm the second wallet's `sync` sees it
   own the name.

## 7. What's intentionally not tested yet

- **iOS / native mobile.** Direction doc §4. The CLI is the engine; mobile is
  a downstream client decision.
- **Cheap batched-claim rail end-to-end.** The `LightningPayer` adapter is
  wired and tested in isolation; the publisher protocol isn't designed in
  code, so there's nothing to integrate against. When the rail exists,
  `claim --rail cheap` will use the adapter.
- **Recovery invoke (on-chain RECOVER_OWNER).** Arming a recovery descriptor
  is tested and works; on-chain invocation depends on whether
  `@ont/architect` has (or grows) a builder for it. See task #9.
- **Proof bundles for transferred names.** `export-proof` covers names still
  held by their original auction winner — the bundle source
  `bitcoin_l1_direct_auction` doesn't model post-auction transfers. Extending
  this requires consensus-layer work in `@ont/consensus`'s `verifyProofBundle`
  (the frozen-core layer), so it should be a deliberate, separate PR.

## 8. Definition of "ready" (for the Lexe meeting)

- All automated tests pass: 56+ wallet tests, 290+ workspace tests.
- The integration test (§4) holds.
- The signet live test (§6) was run at least once against a public or private
  signet resolver with a real claim and transfer.
- The honest gaps in §7 are written into the wallet direction doc §0 (already
  there).
- The chat update lands and we get Lexe's read on the swap/PTLC piece.
