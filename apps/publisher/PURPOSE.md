# Clean Publisher Service

## Purpose

`@ont/publisher` is the clean runnable publisher shell. Its HTTP API is split so the assemble path can never
reach the broadcast seam:

- `POST /assemble/root-anchor` and `POST /assemble/recover-owner-invoke` assemble an **unsigned** ONT write-side
  transaction through `@ont/adapter-publisher` and return it (`unsignedTxid` + `unsignedTxHex`). These handlers
  do **not** receive the broadcast port — they cannot submit anything.
- `POST /broadcast` is the **only** route handed the injected broadcast port. It relays an already-signed legacy
  raw transaction; it fails closed before the port is touched if the raw is not legacy-serializable.

Signing happens off this service (the B5 wallet). The publisher never signs and never inspects signedness; an
unsigned assembled tx structurally cannot reach `sendrawtransaction`.

## Scope

- The service is wiring and I/O only.
- It consumes `@ont/adapter-publisher` `assembleRootAnchorTx` and `assembleRecoverOwnerInvokeTx`.
- It accepts structured operator intent, normalizes JSON-only edge values such as bigint sat amounts, and lets
  the adapter validate transaction shape.
- The assemble routes return the unsigned template only — `unsignedTxid` is the txid over the *unsigned*
  serialization (a template id, not the chain txid; signing fills scriptSigs and changes it).
- It broadcasts only through an injected `PublisherBroadcastPort`, and only from the `/broadcast` route.
- It does not maintain an accumulator, compute private roots, decide ownership/recovery authority, sign
  transactions, hold keys, import crypto/signing libraries, or contact live Bitcoin infrastructure in tests.
- It does not import `legacy/`, `@ont/*/src|dist`, or any quarantined publisher code.

## Tests

- In-process HTTP handler tests use a mocked broadcast port; no live network.
- The assemble routes return the unsigned tx (`unsignedTxid` + `unsignedTxHex`) and **never** invoke the
  broadcast port — pinned by a structural assertion that the port is left untouched.
- The `/broadcast` route relays a legacy raw verbatim to the port, and fails closed on a non-legacy raw before
  the port is touched.
- Invalid operator intent must fail closed at assembly.
- Broadcast rejects, broadcast throws, malformed JSON, unknown routes, and unsupported methods must return JSON
  errors and never throw.
