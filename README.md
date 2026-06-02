# Open Name Tags (ONT)

**Sovereign names settled on Bitcoin.** A short, human-readable name like `alice` that is
genuinely yours — no company, registrar, token, or rent. Ownership is a key you hold; anyone
can verify the owner against Bitcoin without trusting a server.

The plain-language source of truth is [docs/ONT.md](./docs/ONT.md); the single detailed design
is the [design brief](./docs/ONT_DESIGN_BRIEF.md). Amounts use **₿ where ₿1 = 1 satoshi**, so
the claim gate is ₿1,000 ≈ $1.

## For Bitcoin reviewers — start here

If you're here to evaluate the **design** (not to use the product), read these three, in order:

1. **[docs/ONT_ONE_PAGER.md](./docs/ONT_ONE_PAGER.md)** — the one-page version.
2. **[docs/ONT_DESIGN_BRIEF.md](./docs/ONT_DESIGN_BRIEF.md)** — the single detailed design: the
   model, trust surface, scaling + data-availability, economics, prior art, risks and
   alternatives, and the open questions we most want pushed on.
3. **[docs/ONT.md](./docs/ONT.md)** — the plain-language source of truth.

In one line: claim a name for a flat ₿1,000 fee to Bitcoin miners; a public notice window opens;
if no one else claims it, it finalizes cheaply through a batched Bitcoin commitment; if it's
contested, ownership goes to whoever commits the largest returnable bond. Either way the same
owner key controls transfers, off-chain records, and recovery.

## The trust surface

Who-owns-what is a deterministic function of Bitcoin, in a frozen core plus protocol primitives:

- `packages/consensus/src/engine.ts` (event replay), `state.ts` (name state),
  `proof-bundle.ts` (portable proofs, incl. Merkle-inclusion + header-PoW verification against
  Bitcoin)
- `packages/protocol/src/` (names, wire formats, events, transfer/value/recovery payloads)
- `packages/consensus/src/trust-surface.test.ts` **fails the build** if that core grows a
  dependency outside `@ont/protocol` / `@ont/bitcoin`, or gains a file outside the documented
  set — so the audit surface cannot silently grow.

**Verify it yourself:**

```bash
npm install
npm run test -w @ont/consensus      # trust surface + proof bundles (incl. Bitcoin Merkle/PoW)
npm run test -w @ont/protocol
npm run test -w @ont/core
```

## What runs on-chain today vs. prototype (honest)

| Capability | State |
| --- | --- |
| Owner-key transfer, value records, recovery descriptors | Live on signet; byte-checked across two independent implementations |
| Bonded contested-auction bid, resolver-accepted end-to-end | Live on signet |
| Proof-bundle verification against Bitcoin (Merkle + PoW) | Verifier done; producers don't emit inclusion proofs yet |
| Cheap accumulator rail (batched claims) | Built + unit-tested; **not yet wired into the live indexer** |
| Leaderless multi-publisher convergence | Simulated + tested; single-writer publisher in production |
| Mainnet | Not yet — active prototype |

## Two keys

- the **wallet key** signs the Bitcoin transactions that establish or move ownership
- the **owner key** signs the off-chain destination records and authorizes transfers + recovery;
  in v1, losing the owner key means losing update and transfer authority for that name

## Using the product (optional — not needed for review)

Hosted demo: [opennametags.org](https://opennametags.org). Walkthroughs:
[Sparrow private-signet](./docs/demo/SPARROW_PRIVATE_SIGNET.md) ·
[Flint demo](./docs/demo/FLINT_DEMO.md). The hosted demo currently exercises the
contested/auction path end-to-end; the cheap batched-claim path is prototyped (see status above).

## Run it yourself

```bash
# local prototype (bundled fixture chain)
npm install
npm run dev:all          # http://127.0.0.1:3000

# your own web + resolver stack
cp .env.example .env
npm run selfhost:doctor
npm run selfhost:up      # http://127.0.0.1:3000
```

To point the stack at your own Bitcoin backend, see [SELF_HOSTING.md](./docs/core/SELF_HOSTING.md).

## Repository map

TypeScript monorepo (`npm` workspaces).

**Trust surface — audit this first:** `packages/consensus` (engine · state · proof-bundle) +
`packages/protocol` (names · wire · events · transfer/value/recovery payloads).

Everything else:

- `packages/bitcoin` — Bitcoin RPC parsing + chain-source helpers
- `packages/core` — indexer, auction state, snapshots, and the research/scaling prototypes
- `packages/architect` — transaction-prep / PSBT building (shared by web + CLI)
- `packages/db` — snapshot + record persistence adapters
- `apps/web` — hosted site: explorer, auctions, transfer prep
- `apps/resolver` — read API, record API, provenance
- `apps/cli` — auction / transfer / record / operator tooling
- `apps/indexer` — chain indexing entrypoint
- `apps/publisher` — batching publisher for the cheap-claim rail (prototype)
- `apps/wallet` — local desktop wallet/client prototype
- `mobile/` — the iOS wallet (Expo / React Native)

## Documentation

- [docs/ONT.md](./docs/ONT.md) — the single source of truth
- [docs/ONT_DESIGN_BRIEF.md](./docs/ONT_DESIGN_BRIEF.md) — **the single detailed design**
- [docs/design/](./docs/design/) — design depth: sovereignty map, requirements, data-availability,
  MEV/ordering, issuance/fee mechanics, risk register
- [docs/core/](./docs/core/) — architecture, decisions, self-hosting, testing
- [CONTRIBUTING.md](./CONTRIBUTING.md) — local setup + contribution workflow

## Status

Active prototype — **not mainnet-ready**. Honest known tradeoffs:

- ONT events use OP_RETURN payloads up to ~135 bytes, above older conservative relay limits, so
  relay still depends on node policy (modern Bitcoin Core defaults are more permissive). We
  confirmed ≤135-byte ONT OP_RETURNs relay and confirm on signet.
- light-client verification isn't closed end-to-end yet — the verifier checks Merkle + PoW, but
  producers don't emit inclusion proofs yet
- the cheap batched-claim rail isn't wired into the canonical indexer yet, and the publisher is
  single-writer

The full risk register and the open questions we most want feedback on are in the
[design brief](./docs/ONT_DESIGN_BRIEF.md).

## License

[MIT](./LICENSE).
