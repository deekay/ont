# Publisher protocol — v0 spec

Status: candidate spec, drafted from existing design commitments in
`@ont/protocol`, `@ont/consensus`, `@ont/core/research`. Not frozen.

This is the protocol a wallet talks to a publisher over, and what the
publisher does internally. It is deliberately small: the publisher is **a
batching service**, not an authority. The wallet's `claim --rail cheap` is
the canonical client.

## Goals (and non-goals)

- **One-shot UX:** the wallet posts a claim and a payment; the publisher
  returns an inclusion proof and an anchor txid. No multi-round dance.
- **Replaceable:** any publisher can serve any wallet; a wallet can fall
  back to a different publisher or to direct L1.
- **No new trust assumptions:** the publisher cannot forge ownership (the
  consensus rules enforce insertion-uniqueness against the accumulator) and
  cannot quietly inflate fees beyond the on-chain miner cost (the consensus
  rule "fee ≥ Σ gates" caps what they can pocket).
- **Honest profit-seeking is enough:** the publisher publishes data because
  withholding it forfeits revenue; a griefer can only delay, never steal.

Non-goals: multi-publisher coordination protocol (each publisher runs
independently; conflicts resolve at the consensus layer via commit
priority — see `@ont/core/research/delta-merge-sim.ts`). Custody of user
funds beyond the moments between payment and anchor confirmation. Any
custody of user keys.

## What the wallet wants from the publisher

1. **A quote:** "is this name available, and what would it cost?"
2. **A way to pay:** Lightning invoice or L1 address.
3. **A receipt:** the inclusion proof + anchor txid once the batch lands.

That's the whole interaction.

## HTTP API

All JSON, all over HTTPS in production (HTTP fine for local dev). The
publisher binds to a base URL like `https://publisher.example/api`.

### `GET /info`

Static metadata about the publisher. Cacheable.

```json
{
  "kind": "ont-publisher-info",
  "version": "0.1",
  "operatorName": "string (free-text, observability only)",
  "contact": "string (URL or email; not relied on)",
  "paymentRails": ["lightning", "l1"],
  "serviceBaseSats": "string (publisher's fee floor)",
  "batching": {
    "maxBatchAgeSeconds": 600,
    "maxBatchSize": 1024,
    "expectedAnchorIntervalSeconds": 600
  },
  "network": "main" | "signet" | "testnet" | "regtest",
  "termsUrl": "string (URL or empty)"
}
```

The wallet checks `network` matches its own and `paymentRails` includes a
rail it supports.

### `POST /claim/quote`

```json
// request
{
  "name": "satoshi",
  "ownerPubkey": "<32B hex, the wallet's owner key — the same key the bundle
                  will commit>",
  "paymentRail": "lightning" | "l1"
}

// response
{
  "kind": "ont-publisher-quote",
  "quoteId": "<opaque string; treat as a bearer token>",
  "name": "satoshi",
  "available": true,
  "gateBaseSats": "1000",            // the protocol-mandated gate
  "serviceBaseSats": "200",           // publisher's fee
  "totalBaseSats": "1200",            // what the wallet pays
  "expiresAt": "ISO-8601",            // ~5 minutes typical
  "paymentRail": "lightning",
  "lightningInvoice": "lnbc...",      // only if paymentRail === "lightning"
  "l1Address": "bc1q...",             // only if paymentRail === "l1"
  "ownerCommitment": "<32B hex>",     // what value the leaf will commit;
                                       // wallet verifies this is H(ownerPubkey)
  "leaf": "<32B hex = sha256(name)>"  // what leaf the publisher will insert
}
```

If `available: false`, the response carries a `reason` field (`taken`,
`reserved`, `auction_pending`) and no quote id.

The wallet validates `leaf === sha256(name)` and `ownerCommitment ===
H(ownerPubkey)` before paying — these are the only fields it must trust the
publisher about, and both are deterministic.

### `POST /claim/submit`

```json
// request
{
  "quoteId": "<from /claim/quote>",
  "paymentProof": {
    "rail": "lightning",
    "paymentHash": "<for BOLT11 — proves the wallet paid the publisher's invoice>"
  }
}

// response (immediately after payment confirms)
{
  "kind": "ont-publisher-claim-receipt",
  "quoteId": "<same>",
  "status": "queued" | "batched" | "anchored" | "confirmed" | "rejected",
  "name": "satoshi",
  "batchId": "<opaque, present once status >= batched>",
  "anchorTxid": "<32B hex, present once status >= anchored>",
  "anchorHeight": 123456,           // present once status === confirmed
  "inclusionProof": {                // present once status === confirmed
    "root": "<32B hex>",
    "leaf": "<32B hex>",
    "value": "<32B hex>",
    "siblings": [{"level": 0, "hash": "<32B hex>"}, ...]
  }
}
```

If status is anything below `confirmed`, the wallet polls `GET /claim/{quoteId}`
until it is.

### `GET /claim/{quoteId}`

Same response shape as `POST /claim/submit`. Idempotent; the canonical way
for the wallet to fetch the inclusion proof after the batch anchors.

### `GET /batch/{batchId}`

Used for data availability — anyone can pull the batch's leaves to
reconstruct it.

```json
{
  "kind": "ont-publisher-batch",
  "batchId": "<opaque>",
  "anchorTxid": "<32B hex, once anchored>",
  "anchorHeight": 123456,
  "prevRoot": "<32B hex>",
  "newRoot": "<32B hex>",
  "leaves": [
    { "name": "satoshi", "ownerPubkey": "<32B hex>", "leaf": "<32B hex>", "value": "<32B hex>" },
    ...
  ]
}
```

The publisher MUST publish this within the batch's data-availability window
(per `@ont/core/research/da-convergence-sim.ts`); failing to do so makes
their batch indeterminable to late verifiers.

### `GET /health`

```json
{ "status": "ok", "anchorBacklog": 3, "lastAnchorAt": "ISO-8601" }
```

## Internal state machine (publisher side)

Per claim:

```
        ┌────────┐  pay      ┌──────┐  batch     ┌─────────┐  broadcast  ┌──────────┐  confirm  ┌───────────┐
quote → │ quoted │ ────────▶ │ paid │ ─────────▶ │ batched │ ──────────▶ │ anchored │ ────────▶ │ confirmed │
        └────────┘            └──────┘            └─────────┘             └──────────┘            └───────────┘
              │                  │                     │
              │                  │                     └─ rejected (consensus check failed — name was claimed
              │                  │                                       in a higher-priority batch first)
              │                  └─ rejected (payment timeout)
              └─ expired (quote not paid in time)
```

Rejections are the failure modes the wallet must surface to the user.
Refunds: a rejected claim's payment is refunded to the wallet (mechanism
specific to the rail — Lightning needs a fallback path).

## Anchor tx construction

Once a batch is sealed:

1. Compute the new root by applying each leaf to the previous root.
2. Build the OP_RETURN payload with `encodeRootAnchorBody({ prevRoot, newRoot, batchSize })`.
3. Build a Bitcoin tx with:
   - inputs from the publisher's funding wallet
   - one OP_RETURN output carrying the encoded payload
   - one change output back to the publisher
4. Fee MUST be `≥ Σ gates` of the batched names. Consensus rejects the
   batch otherwise; the publisher loses the work (and the payments are
   refundable). This is the "gate IS the miner fee" invariant.
5. Broadcast the tx; persist the (batchId → txid) mapping.
6. When the tx confirms, populate each claim's `anchorHeight` + assemble
   `inclusionProof` from the accumulator state.

## What the publisher must NOT do

- Charge more than `serviceBaseSats` advertised in `/info` (otherwise wallets
  will defect to L1 once the publisher fee exceeds the L1 cost).
- Include a name that's already in the accumulator (consensus rejects the
  whole batch — punishes the publisher).
- Withhold batch data after anchoring (loses repeat business and triggers
  the data-availability challenge).
- Touch the wallet's owner key. It never sees it; the owner key is committed
  in the leaf's `value`, not signed over anything the publisher holds.

## What the wallet must NOT do

- Pay without verifying `leaf === sha256(name)` and `ownerCommitment ===
  H(ownerPubkey)` from the quote.
- Treat the publisher's `confirmed` response as authoritative — re-verify
  by reading the anchor tx and accumulator proof against `@ont/consensus`
  (`verifyProofBundle`).

## Why this is small

Everything the publisher does is mechanical assembly of existing
primitives — accumulator inserts, root-anchor encoding, Bitcoin fee math,
LN payment receipt. The trust model is "publisher honest about ordering
inside its own batch, consensus enforces everything else." Anyone can run
one. A user who can't find one falls back to direct-L1.

The interesting design questions are downstream:

- **Trustless payment-on-inclusion-proof** (PTLC / ECDSA adaptor): pay
  only if the publisher delivers a specific anchor that commits your leaf.
  Bilateral, no network-wide PTLC routing. **Open question** (LN-node substrate
  capabilities) — see `OPEN_QUESTIONS_FOR_EXPERTS.md`.
- **Multi-publisher convergence**: the `delta-merge-sim.ts` simulator
  models it; the resolver/indexer applies the deterministic rule
  (Bitcoin commit priority, txid tiebreak). The publisher spec is unaware
  of other publishers — it just submits its own batch.
- **Service-DoS protection** (a non-paying caller floods quotes): payment-
  lock on quote, optional PoW, optional ratelimits. Out of scope for v0.

## v0 implementation scope (`apps/publisher`)

In order of "must" → "want":

1. **Must:** HTTP server, `/info`, `/claim/quote`, `/claim/submit`,
   `/claim/{quoteId}`, `/batch/{batchId}`, `/health`.
2. **Must:** in-memory state (Map of quoteId → claim, batchId → batch).
   File or db persistence is a v0.1 add.
3. **Must:** `StubPaymentVerifier` — accepts any paymentProof, marks as
   paid. Mirrors `StubLightningPayer` in the wallet. Real payment
   verification (LN invoice paymentHash check) is v0.1.
4. **Must:** `StubAnchorBroadcaster` — builds the would-be anchor tx,
   computes the new root, populates inclusion proofs, but does NOT
   broadcast. Same shape; lets the wallet → publisher round-trip work
   end-to-end on regtest without a Bitcoin node.
5. **Want:** real broadcast (uses `@ont/bitcoin` or esplora POST /tx).
6. **Want:** persistence (json file or SQLite).
7. **Want:** real LN payment verification through a node sidecar.
