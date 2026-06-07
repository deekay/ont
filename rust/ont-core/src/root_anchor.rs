//! Root-anchor payload codec (S6 golden-vector conformance).
//!
//! This is the FIRST ont-core encoder proven byte-for-byte identical to the
//! TypeScript wire format (`packages/protocol/src/wire.ts :: encodeRootAnchorPayload`).
//! The Rust builders' output is read back and validated by `@ont/consensus` in
//! TypeScript, so every byte here must match. The golden vectors in the test
//! module below were emitted directly from the TS encoder — do NOT hand-edit them;
//! regenerate from `wire.ts` if the format ever changes (it should not without a
//! version bump).
//!
//! Layout (73 bytes, big-endian batch size):
//! ```text
//!   magic "ONT" (3) || version (1) || type (1) || prevRoot (32) || newRoot (32) || batchSize u32-BE (4)
//! ```
use anyhow::{bail, Result};

/// Protocol magic — `"ONT"` (matches `PROTOCOL_MAGIC` in `constants.ts`).
pub const PROTOCOL_MAGIC: [u8; 3] = *b"ONT";
/// Wire version — `PROTOCOL_VERSION` in `constants.ts`.
pub const PROTOCOL_VERSION: u8 = 1;
/// `OntEventType.RootAnchor` (0x0b) in `constants.ts`.
pub const EVENT_TYPE_ROOT_ANCHOR: u8 = 0x0b;

/// Header (magic || version || type) then prevRoot(32) || newRoot(32) || batchSize(4).
pub const ROOT_ANCHOR_BODY_LEN: usize = 32 + 32 + 4;
pub const ROOT_ANCHOR_PAYLOAD_LEN: usize = 5 + ROOT_ANCHOR_BODY_LEN; // 73

/// Encode a root-anchor OP_RETURN payload, byte-identical to the TypeScript
/// `encodeRootAnchorPayload`.
pub fn encode_root_anchor_payload(
    prev_root: &[u8; 32],
    new_root: &[u8; 32],
    batch_size: u32,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(ROOT_ANCHOR_PAYLOAD_LEN);
    out.extend_from_slice(&PROTOCOL_MAGIC);
    out.push(PROTOCOL_VERSION);
    out.push(EVENT_TYPE_ROOT_ANCHOR);
    out.extend_from_slice(prev_root);
    out.extend_from_slice(new_root);
    out.extend_from_slice(&batch_size.to_be_bytes());
    out
}

/// Decode and validate a root-anchor payload, returning `(prev_root, new_root, batch_size)`.
pub fn decode_root_anchor_payload(bytes: &[u8]) -> Result<([u8; 32], [u8; 32], u32)> {
    if bytes.len() != ROOT_ANCHOR_PAYLOAD_LEN {
        bail!(
            "root anchor payload must be {ROOT_ANCHOR_PAYLOAD_LEN} bytes, got {}",
            bytes.len()
        );
    }
    if bytes[0..3] != PROTOCOL_MAGIC {
        bail!("bad protocol magic");
    }
    if bytes[3] != PROTOCOL_VERSION {
        bail!("unsupported protocol version {}", bytes[3]);
    }
    if bytes[4] != EVENT_TYPE_ROOT_ANCHOR {
        bail!("payload is not a root anchor (type {:#x})", bytes[4]);
    }
    let mut prev_root = [0u8; 32];
    let mut new_root = [0u8; 32];
    prev_root.copy_from_slice(&bytes[5..37]);
    new_root.copy_from_slice(&bytes[37..69]);
    let batch_size = u32::from_be_bytes([bytes[69], bytes[70], bytes[71], bytes[72]]);
    Ok((prev_root, new_root, batch_size))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repeat32(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn from_hex(hex: &str) -> Vec<u8> {
        assert!(hex.len() % 2 == 0, "odd-length hex");
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex digit"))
            .collect()
    }

    /// Golden vectors emitted by the TS encoder
    /// (`packages/protocol/src/wire.ts :: encodeRootAnchorPayload`). The Rust
    /// output MUST equal these byte-for-byte — this is the S6 cross-language proof.
    #[test]
    fn matches_typescript_golden_vectors() {
        // Vector 1: prev=00*32, new=11*32, batchSize=1
        let got = encode_root_anchor_payload(&repeat32(0x00), &repeat32(0x11), 1);
        assert_eq!(
            got,
            from_hex(concat!(
                "4f4e54010b",
                "0000000000000000000000000000000000000000000000000000000000000000",
                "1111111111111111111111111111111111111111111111111111111111111111",
                "00000001"
            )),
            "vector 1 mismatch"
        );

        // Vector 2: prev=aa*32, new=bb*32, batchSize=4096
        let got = encode_root_anchor_payload(&repeat32(0xaa), &repeat32(0xbb), 4096);
        assert_eq!(
            got,
            from_hex(concat!(
                "4f4e54010b",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "00001000"
            )),
            "vector 2 mismatch"
        );

        // Vector 3: structured roots + batchSize=0xdeadbeef (high-bit set)
        let prev = {
            let mut a = [0u8; 32];
            a.copy_from_slice(&from_hex(&"0123456789abcdef".repeat(4)));
            a
        };
        let new = {
            let mut a = [0u8; 32];
            a.copy_from_slice(&from_hex(&"fedcba9876543210".repeat(4)));
            a
        };
        let got = encode_root_anchor_payload(&prev, &new, 0xdead_beef);
        assert_eq!(
            got,
            from_hex(concat!(
                "4f4e54010b",
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
                "deadbeef"
            )),
            "vector 3 mismatch"
        );
    }

    #[test]
    fn payload_is_73_bytes() {
        let payload = encode_root_anchor_payload(&repeat32(0x00), &repeat32(0x11), 1);
        assert_eq!(payload.len(), ROOT_ANCHOR_PAYLOAD_LEN);
        assert_eq!(payload.len(), 73);
    }

    #[test]
    fn round_trips() {
        let prev = repeat32(0x42);
        let new = repeat32(0x99);
        let encoded = encode_root_anchor_payload(&prev, &new, 7777);
        let (dp, dn, db) = decode_root_anchor_payload(&encoded).expect("decode");
        assert_eq!(dp, prev);
        assert_eq!(dn, new);
        assert_eq!(db, 7777);
    }

    #[test]
    fn rejects_wrong_length() {
        assert!(decode_root_anchor_payload(&[0u8; 10]).is_err());
    }

    #[test]
    fn rejects_wrong_type() {
        let mut bytes = encode_root_anchor_payload(&repeat32(0), &repeat32(0), 1);
        bytes[4] = 0x03; // OntEventType.Transfer, not a root anchor
        assert!(decode_root_anchor_payload(&bytes).is_err());
    }
}
