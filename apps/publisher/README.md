# @ont/publisher — ONT publisher reference

A v0 reference implementation of the publisher protocol described in
[`docs/research/ONT_PUBLISHER_PROTOCOL_SPEC.md`](../../docs/research/ONT_PUBLISHER_PROTOCOL_SPEC.md).

A publisher is a batching service: it accepts wallet claim requests, takes
payment, batches the claims into a sparse-Merkle accumulator, and anchors
each batch to Bitcoin via an OP_RETURN. It holds no user keys and can't forge
ownership (consensus enforces insertion-uniqueness). The design also requires
an anchor's miner fee to be ≥ Σ per-name gates so the claim gate can't be
batched away — note that consensus-side validation of that fee rule is **not
yet implemented** (see `docs/core/STATUS.md`, Known-incomplete). Anyone can
run one.

## What's here

- **`publisher.ts`** — the state machine: quotes, payment verification,
  batching, anchor broadcast, inclusion-proof assembly. Built on
  `@ont/core`'s `Accumulator` and `@ont/protocol`'s `RootAnchorEventPayload`.
- **`payment.ts`** — `PaymentVerifier` interface + `StubPaymentVerifier`
  (accepts any proof; replace with a real LN-node verifier in production).
- **`anchor.ts`** — `AnchorBroadcaster` interface + `StubAnchorBroadcaster`
  (returns a deterministic synthetic txid; for tests and offline dev).
- **`esplora-anchor.ts`** — `EsploraAnchorBroadcaster`: real anchor
  construction, signing, and broadcast via an Esplora endpoint. This is the
  live private-signet path (pays a flat configured `feeSats`).
- **`server.ts`** — HTTP wiring over `node:http`, mirrors apps/resolver.
- **`types.ts`** — wire types matching the spec.

## Run it

```sh
npm run dev -w @ont/publisher                              # default port 7878
ONT_PUBLISHER_PORT=9000 npm run dev -w @ont/publisher      # custom port
```

Then poke it:

```sh
curl -s http://localhost:7878/info | jq
curl -s -X POST http://localhost:7878/claim/quote \
  -H 'content-type: application/json' \
  -d '{"name":"alice","ownerPubkey":"ab__repeat 32","paymentRail":"lightning"}'
```

## Test

```sh
npm test -w @ont/publisher    # 14 tests across unit + HTTP server level
```

The inclusion proofs returned by the publisher verify against
`@ont/core`'s `verifyAccumulatorProof` — so a wallet that requests a
claim and receives the proof can prove the leaf is in the committed
root without trusting the publisher's word.

## What's stub vs. real

| Thing | v0 | v0.1 / production |
|---|---|---|
| Quote / submit / status HTTP | real | real |
| Accumulator inserts + proofs | real (`@ont/core`) | real |
| OP_RETURN payload encoding | real (`@ont/protocol`) | real |
| Payment verification | accepts any proof | check BOLT11 paymentHash via LN node sidecar |
| Anchor tx broadcast | real on private signet (`EsploraAnchorBroadcaster`); synthetic stub in tests | sign + broadcast via Bitcoin node or Esplora, with fee ≥ Σ gates once that rule is enforced |
| Persistence | in-memory | JSON file or SQLite |
| Multi-publisher coordination | n/a (publisher unaware of others) | consensus handles it (`@ont/core/research/delta-merge-sim.ts`) |

## Honest limitations of v0

- **Name availability is publisher-local only.** A real publisher should
  also check against confirmed batches from other publishers (via a
  resolver) — otherwise it might quote a name that just got claimed
  elsewhere. v0 only checks its own accumulator.
- **No persistence.** Restart loses all quotes, batches, and the
  accumulator state. Fine for dev.
- **One claim per batch.** The submit handler seals a batch with just the
  one claim it just accepted. A real publisher aggregates by time/size.
- **No fee math against actual blockspace.** The consensus rule (fee ≥ Σ
  gates) is the policy; v0 doesn't compute the on-chain fee at all since
  it doesn't actually broadcast.

These are all wired-but-stubbed by design — the structure is correct, the
chain effects aren't. Each is a focused follow-up.
