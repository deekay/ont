# Clean Resolver Service

## Purpose

`@ont/resolver` is the clean runnable resolver shell. It exposes HTTP routes for served value/recovery history
and signed value/recovery submissions.

## Scope

- The service is wiring and I/O only.
- It consumes `@ont/adapter-resolver` projections and submission guards.
- It stores and fetches data through an injected `ResolverStore` port.
- It returns `resolver-indexed-mirror` and `not-ownership-authority` provenance from the adapter unchanged.
- It does not decide ownership, recovery authority, winner selection, chain state, or consensus validity.
- It does not import `legacy/`, `@ont/*/src`, crypto/signing libraries, or live network clients.

## Tests

- In-process HTTP handler tests use a mocked store; no live network.
- Read routes must preserve adapter projection results and fail closed on corrupt/missing store data.
- Submission routes must validate through adapter store guards before appending.
- Malformed JSON, store errors, unknown routes, and unsupported methods must return JSON errors and never throw.
