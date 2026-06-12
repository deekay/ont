# @ont/wire — purpose, scope, tests

*(Written purpose/scope/tests statement required for every new component by the
nothing-is-precious amendment to clean-build (#46).)*

## Purpose

The wire layer of the rebuild: byte-level encode/decode for ONT on-chain events
and off-chain owner-signed shapes, exactly as specified by
[docs/spec/WIRE_FORMAT.md](../../docs/spec/WIRE_FORMAT.md). No policy, no
authorization semantics, no state — grammar only (SOFTWARE_CANON layer 1).

## Scope

- IN: event frame + layouts (§3–4), name canonical-bytes rule (§2), owner-key
  Schnorr digest constructions (§5), auction commitments (§6), domain label
  registry (§7), off-chain envelope shapes and digests (§8).
- OUT: whether an event changes name state (B2 kernel), gate fees (B2), DA
  deadlines (B2/B3), recovery-authority semantics (B2), proof bundles (B3),
  wallet-handoff envelopes (B5). See WIRE_FORMAT §9.

## Tests

Tests-first per clean-build (#46): this package starts as the **B1 conformance
suite** — `vectors/` plus self-validating tests — and the implementation is
added afterward to satisfy it. The suite is the contract; the implementation
has no authority over it.

- `vectors/*.json` — conformance vectors, generated deterministically by
  `tools/generate-vectors.mjs` from the spec text. Every vector carries a
  `cite` into WIRE_FORMAT.md (traceability standard: doc-cite → test → impl).
  `kind: "valid"` / `"reject"` (negative tests are first-class) /
  `"legacy-evidence"` (mined from quarantine-bound legacy code; documents the
  old codec, never a conformance target).
- `test/conformance.test.ts` — recomputes every derived value (digests,
  commitments, messages, sizes) from the spec constructions and checks the
  vectors match; verifies vector signatures; carries the cross-context
  negative checks (§5) and the "every event ≤ 184 bytes" property (§4.6).
- Where a construction is carried forward from legacy unchanged (transfer /
  recover digests, key derivation, proof message), the generator cross-checks
  fresh computation against the legacy implementation and records
  `crossCheckedAgainstLegacy: true` — golden-vector mining per B0.

Key material in vectors is the public BIP-39 test mnemonic (`abandon … about`)
— conformance vectors carry no secret material. The decommissioned signet's
conformance-locked 12 words are NOT used here.

Known gap (flagged for review): `signatureBase64` in wallet-proof vectors is a
placeholder — B1 owns shape/message/hash, and real BIP322 signature vectors
land with the implementation (legacy used `bip322-js`).
