# Morning check — verify the work, then decide next steps

Action-oriented list spanning the **wallet + resolver + publisher**. The
night's work expanded scope beyond just the wallet — there's now a publisher
reference implementation and the cheap-claim rail wires end-to-end against
it. Skip anything that's obvious; the goal is to give you confidence before
deciding what's next.

## 1. Quick sanity (2 min)

```sh
git pull
npm test -w @ont/wallet
npm test -w @ont/publisher
npm test -w @ont/resolver
```

Expected:
- wallet: **63 tests across 13 files** (the new `publisher-client.test.ts` adds 6)
- publisher: **14 tests across 2 files** (the new `@ont/publisher` package)
- resolver: 9 store-level tests

If anything fails, read the test name and let me know what.

## 2. Three end-to-end smokes (3 min)

```sh
npm run smoke:live -w @ont/wallet           # wallet ↔ real resolver (8 checks)
npm run smoke:fixture -w @ont/resolver      # resolver HTTP surface (14 checks)
npm run smoke:cheap-claim -w @ont/wallet    # wallet → publisher cheap rail (5 checks)
```

These are the strongest verifications — they boot the real services and
hit them over real HTTP, catching wire-shape bugs that stubbed unit tests
can't.

## 3. Demo of the self-contained lifecycle (1 min)

```sh
npm run demo -w @ont/wallet
```

Walks claim → state → sign on regtest with synthetic UTXOs. Should print
"self-contained lifecycle complete."

## 4. Try the cheap rail by hand (5 min)

In one terminal:

```sh
npm run dev -w @ont/publisher
```

In another:

```sh
export ONT_WALLET_KEYSTORE=/tmp/morning/ks.json
export ONT_WALLET_STATE=/tmp/morning/state.json
export ONT_WALLET_PASSWORD=morning-pw
export ONT_WALLET_NETWORK=regtest
export ONT_PUBLISHER_URL=http://127.0.0.1:7878
mkdir -p /tmp/morning

npm run dev -w @ont/wallet -- init
npm run dev -w @ont/wallet -- claim alice --rail cheap
npm run dev -w @ont/wallet -- names
```

Expected: wallet talks to publisher, verifies the inclusion proof locally
against `@ont/core`'s accumulator, records "alice" as owned.

## 5. New docs (read in this order)

All in `docs/research/`:

1. **`ONT_WALLET_MORNING_CHECK.md`** — you're here.
2. **`ONT_WALLET_TEST_PLAN.md`** — current coverage, gaps, manual smokes,
   signet live-test plan, what's intentionally not tested yet.
3. **`ONT_PUBLISHER_PROTOCOL_SPEC.md`** — the publisher protocol the wallet
   talks to. HTTP API, state machine, anchor tx construction, honesty
   guarantees, v0-stub-vs-production breakdown.
4. **`ONT_RECOVERY_INVOKE_SPEC.md`** — what's missing for on-chain recovery
   invoke; the protocol decision blocking the architect builder.
5. **`ONT_WALLET_IOS_PORT_PLAN.md`** — three iOS architecture options,
   recommended path (React Native + TS engine), open questions to settle
   before any iOS code starts.

## 6. New apps + scripts on this branch

- **`apps/publisher/`** — new package. Stub payment + anchor; HTTP server;
  state machine; inclusion proofs that verify against `@ont/core`.
- **`apps/publisher/README.md`** — operational doc.
- **`apps/resolver/README.md`** — new operational doc (modes, env vars,
  endpoints, persistence).
- **`apps/wallet/scripts/cheap-claim-smoke.sh`** — wallet ↔ publisher loop.
- **`apps/resolver/scripts/fixture-smoke.sh`** — resolver HTTP surface check.

## 7. Decisions you might make today

In rough priority:

1. **Send the chat update**. The conversation probably shapes everything
   else — the Lexe relationship, the iOS decision, who runs publishers.
2. **iOS direction:** wait vs. start now. My read: wait. See the iOS plan.
3. **Recovery invoke:** if you want it for the meeting, the open question
   in §2 of the recovery spec needs an answer.
4. **Publisher productionization:** the v0 stub proves the loop works.
   The roadmap (real payment verification through a Lexe sidecar on the
   *publisher* side; real Bitcoin broadcast; persistence; multi-claim
   batching) is documented in the publisher's README.
5. **Signet live test of the wallet:** the test plan §6 has the script.

## 8. What's still genuinely missing (and not surprising)

- Cheap rail end-to-end against real chain effects (publisher v0 is stub
  payment + stub broadcast; the structure is real, the chain effects are
  not).
- Recovery invoke and cancel (architect builders missing; protocol
  decision pending).
- Proof bundles for transferred names (needs consensus-layer extension).
- Native mobile (see iOS plan).
- Multi-publisher convergence in the resolver/indexer (the simulator
  exists in `@ont/core/research/delta-merge-sim.ts`; production wiring
  TBD).

None of these are blocking the Lexe conversation. They're the natural
roadmap once that conversation lands.

## Latest pushed commit

`8fca615` on `scaling-research-prototypes`. Branch is in sync with origin.
