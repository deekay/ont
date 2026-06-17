# Clean Publisher Service

## Purpose

`@ont/publisher` is the clean runnable publisher shell. It exposes HTTP routes that assemble ONT write-side
transactions through `@ont/adapter-publisher` and hand the resulting unsigned transaction to an injected
broadcast port.

## Scope

- The service is wiring and I/O only.
- It consumes `@ont/adapter-publisher` `assembleRootAnchorTx` and `assembleRecoverOwnerInvokeTx`.
- It accepts structured operator intent, normalizes JSON-only edge values such as bigint sat amounts, and lets
  the adapter validate transaction shape.
- It broadcasts only through an injected `PublisherBroadcastPort`.
- It does not maintain an accumulator, compute private roots, decide ownership/recovery authority, sign
  transactions, hold keys, import crypto/signing libraries, or contact live Bitcoin infrastructure in tests.
- It does not import `legacy/`, `@ont/*/src|dist`, or any quarantined publisher code.

## Tests

- In-process HTTP handler tests use a mocked broadcast port; no live network.
- Valid RootAnchor and RecoverOwner invoke requests must pass the adapter-built transaction to the broadcast
  port and return only the broadcast result.
- Invalid operator intent must fail closed before broadcast.
- Broadcast rejects, broadcast throws, malformed JSON, unknown routes, and unsupported methods must return JSON
  errors and never throw.
