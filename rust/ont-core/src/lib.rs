//! `ont-core` — the Rust BDK transaction-construction layer for ONT.
//!
//! This crate replaces the TypeScript `@ont/architect` builders + broadcast paths
//! (currently `bitcoinjs-lib`). The verification engine `@ont/consensus` stays in
//! TypeScript; this crate's output MUST be byte-identical to what that engine
//! validates on read-back.
//!
//! Spike scaffold (S1). Full plan + acceptance criteria:
//! `~/.sprout/RESEARCH/ONT_BDK_RUST_BUILD_PLAN_2026_06_06.md`.
//!
//! Hard rules carried from the research (do not regress):
//! - Never ship `TxOrdering::Shuffle` (the `finish()` default) — it randomizes
//!   vout via a thread-local RNG and breaks both the bond-at-vout-0 invariant and
//!   byte-reproducibility. Always use `TxOrdering::Custom` with a total,
//!   deterministic output comparator, and assert the bond vout after `finish()`.
//! - Pin version / nLockTime / nSequence explicitly so the TS side can mirror.
//! - Prefer `manually_selected_only()` + explicit UTXOs for deterministic inputs.

pub mod payload; // OP_RETURN claim/anchor payload codec (S4)
pub mod bond_tx; // build_bond_tx with TxOrdering::Custom, bond at vout 0 (S3)

#[cfg(test)]
mod tests {
    /// S1 acceptance: the crate + the pinned `bdk_wallet` dependency resolve and
    /// compile under the installed toolchain. Real builder/codec tests land in
    /// S3–S6.
    #[test]
    fn scaffold_compiles() {
        assert_eq!(2 + 2, 4);
    }
}
