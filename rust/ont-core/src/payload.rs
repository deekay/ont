//! OP_RETURN claim payload codec (S4).
//!
//! Spike format — a versioned, fixed-width encoding small enough for one OP_RETURN
//! push. NOTE: this is *not yet* byte-for-byte `@ont/architect`'s format; matching
//! the TypeScript builder exactly (against an exported fixture) is the S6 golden
//! vector. Kept simple here to exercise the encode/decode + size discipline.
use anyhow::{bail, Result};

pub const CLAIM_PAYLOAD_VERSION: u8 = 1;
pub const CLAIM_PAYLOAD_LEN: usize = 1 + 32 + 32; // version || H(name) || owner x-only

/// `version(1) || name_hash(32) || owner_xonly(32)` = 65 bytes.
pub fn encode_claim_payload(name_hash: &[u8; 32], owner_xonly: &[u8; 32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(CLAIM_PAYLOAD_LEN);
    out.push(CLAIM_PAYLOAD_VERSION);
    out.extend_from_slice(name_hash);
    out.extend_from_slice(owner_xonly);
    out
}

/// Decode `version || H(name) || owner_xonly`, returning `(name_hash, owner_xonly)`.
pub fn decode_claim_payload(bytes: &[u8]) -> Result<([u8; 32], [u8; 32])> {
    if bytes.len() != CLAIM_PAYLOAD_LEN {
        bail!("claim payload must be {CLAIM_PAYLOAD_LEN} bytes, got {}", bytes.len());
    }
    if bytes[0] != CLAIM_PAYLOAD_VERSION {
        bail!("unknown claim payload version {}", bytes[0]);
    }
    let mut name_hash = [0u8; 32];
    let mut owner_xonly = [0u8; 32];
    name_hash.copy_from_slice(&bytes[1..33]);
    owner_xonly.copy_from_slice(&bytes[33..65]);
    Ok((name_hash, owner_xonly))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let name_hash = [0x07u8; 32];
        let owner_xonly = [0x9au8; 32];
        let encoded = encode_claim_payload(&name_hash, &owner_xonly);
        assert_eq!(encoded.len(), CLAIM_PAYLOAD_LEN);
        assert_eq!(encoded[0], CLAIM_PAYLOAD_VERSION);
        let (decoded_name, decoded_owner) = decode_claim_payload(&encoded).expect("decode");
        assert_eq!(decoded_name, name_hash);
        assert_eq!(decoded_owner, owner_xonly);
    }

    #[test]
    fn rejects_wrong_length() {
        assert!(decode_claim_payload(&[1, 2, 3]).is_err());
    }

    #[test]
    fn rejects_unknown_version() {
        let mut bytes = encode_claim_payload(&[0u8; 32], &[0u8; 32]);
        bytes[0] = 99;
        assert!(decode_claim_payload(&bytes).is_err());
    }
}
