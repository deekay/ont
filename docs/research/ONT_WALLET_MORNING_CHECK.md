# Morning check — verify the wallet, then decide next steps

Action-oriented list. Skip anything that's obvious; the goal is to give
you confidence the night's work is solid before deciding what's next.

## 1. Quick sanity (2 min)

```sh
git pull
npm test -w @ont/wallet
```

Expected: **57 tests passing across 12 files** (12 test files now — the
new `lifecycle.integration.test.ts` is the end-to-end one).

If anything fails, read the test name and let me know what.

## 2. End-to-end against a real resolver (1 min)

```sh
npm run smoke:live -w @ont/wallet
```

Expected: spins up the resolver in fixture mode on :8989, runs 5 grouped
checks, prints `all live-resolver smoke checks passed`. This is the
strongest verification — proves the wallet's typed client matches the
resolver's real JSON shapes.

If it fails, the resolver's startup log is at `${tmp}/resolver.log`
(printed in the error path).

## 3. Self-contained demo (1 min)

```sh
npm run demo -w @ont/wallet
```

Walks the lifecycle on regtest with synthetic UTXOs. Should print:
"self-contained lifecycle complete. The signed transaction above is ready
to broadcast."

## 4. Try the new commands by hand (5 min)

In one terminal:

```sh
npm run dev:resolver        # leave running
```

In another:

```sh
export ONT_WALLET_KEYSTORE=/tmp/morning/ks.json
export ONT_WALLET_STATE=/tmp/morning/state.json
export ONT_WALLET_PASSWORD=morning-pw
export ONT_WALLET_NETWORK=regtest
export ONT_RESOLVER_URL=http://127.0.0.1:8787
mkdir -p /tmp/morning

npm run dev -w @ont/wallet -- init
npm run dev -w @ont/wallet -- auctions
npm run dev -w @ont/wallet -- auctions --name marble
npm run dev -w @ont/wallet -- auctions --phase live_bidding
npm run dev -w @ont/wallet -- watch --once
```

Each should produce a useful, readable output.

## 5. The new docs

Three new docs this round, all in `docs/research/`:

- **`ONT_WALLET_TEST_PLAN.md`** — full test coverage spec, manual smoke
  scripts, signet live-test plan, and what's intentionally not tested yet.
  Read first if you want context for everything else.
- **`ONT_RECOVERY_INVOKE_SPEC.md`** — what's missing for on-chain recovery
  invocation. There's a protocol decision blocking the architect builder.
- **`ONT_WALLET_IOS_PORT_PLAN.md`** — three architecture options for iOS,
  with a recommended path (React Native + the existing TS engine) and the
  open questions to settle before any iOS code starts. Read this when you
  want to decide on the mobile question.

## 6. Decisions you might make today

In rough priority:

1. **Send the chat update** (or a revised version). That conversation
   probably shapes everything else — the Lexe relationship, the iOS
   decision, the publisher protocol.
2. **iOS direction:** wait for the chat to land vs. start now. See the iOS
   port plan; my read is *wait*. If you decide to start, the plan
   recommends Option B (React Native).
3. **Recovery invoke:** if you want it for the meeting, the open question
   in §2 of the recovery spec needs an answer. Worth raising with whoever
   knows the design intent (Steve? someone else?).
4. **Signet live test:** the test plan §6 has the script. Worth running
   end-to-end once you have a funded signet wallet.

## 7. What's still genuinely missing (and not surprising)

- Cheap batched-claim rail end-to-end (publisher protocol unbuilt).
- Recovery invoke and cancel (architect builders missing; protocol decision
  pending).
- Proof bundles for transferred names (needs consensus-layer extension).
- Native mobile (see iOS plan).

None of these are blocking the Lexe conversation. They're the natural
roadmap once that conversation lands.

## Latest pushed commit

`85f7180` on `scaling-research-prototypes`. Branch is in sync with origin.
