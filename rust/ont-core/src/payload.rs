//! OP_RETURN claim/anchor payload codec (S4).
//!
//! Must mirror `@ont/architect`'s payload format byte-for-byte (≤ ~135 bytes, a
//! single OP_RETURN push, versioned). Validated against a fixture exported from
//! the TypeScript `@ont/architect` in S4, and end-to-end in the S6 golden vector.
//
// TODO(S4): encode(payload) -> Vec<u8> and decode(&[u8]) -> Payload, with a
// round-trip test and a byte-match test against the TS fixture.
