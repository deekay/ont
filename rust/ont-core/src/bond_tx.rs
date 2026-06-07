//! `build_bond_tx` — construct a contested-auction bond transaction (S3).
//!
//! Output layout is pinned deterministically via `TxOrdering::Custom` so the bond
//! always lands at **vout 0** and the bytes are reproducible (never the default
//! `TxOrdering::Shuffle`, which randomizes outputs via a thread-local RNG and
//! would break both invariants). The bond vout is asserted after `finish()`.
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use bdk_wallet::bitcoin::script::PushBytesBuf;
use bdk_wallet::bitcoin::{absolute, Amount, FeeRate, Psbt, ScriptBuf, TxIn, TxOut};
use bdk_wallet::{TxOrdering, Wallet};

/// Inputs for a contested-auction bond transaction.
pub struct BondTxParams {
    /// Where the bond value is locked (the bond output's scriptPubKey).
    pub bond_spk: ScriptBuf,
    /// The bond amount — sits at vout 0 exactly.
    pub bond_amount: Amount,
    /// OP_RETURN payload (e.g. the claim payload from `payload::encode_claim_payload`).
    pub payload: Vec<u8>,
    /// Fee rate for the transaction.
    pub fee_rate: FeeRate,
}

/// Build an unsigned bond PSBT: bond at vout 0, an OP_RETURN carrying `payload`,
/// deterministic ordering, explicit version/locktime. Returns the PSBT or an
/// error if construction fails or the bond is not at vout 0.
pub fn build_bond_tx(wallet: &mut Wallet, params: &BondTxParams) -> Result<Psbt> {
    let payload = PushBytesBuf::try_from(params.payload.clone())
        .context("OP_RETURN payload too large for a single push")?;
    let bond_spk = params.bond_spk.clone();
    let bond_spk_for_sort = bond_spk.clone();

    let mut builder = wallet.build_tx();
    builder.ordering(TxOrdering::Custom {
        input_sort: Arc::new(|a: &TxIn, b: &TxIn| a.previous_output.cmp(&b.previous_output)),
        output_sort: Arc::new(move |a: &TxOut, b: &TxOut| {
            // Bond output ranks first (0); everything else (OP_RETURN, change)
            // follows, ordered deterministically by script bytes then value.
            let rank = |o: &TxOut| -> u8 {
                if o.script_pubkey == bond_spk_for_sort { 0 } else { 1 }
            };
            rank(a)
                .cmp(&rank(b))
                .then_with(|| a.script_pubkey.as_bytes().cmp(b.script_pubkey.as_bytes()))
                .then_with(|| a.value.cmp(&b.value))
        }),
    });
    builder.add_recipient(bond_spk.clone(), params.bond_amount);
    builder.add_data(&payload);
    builder.fee_rate(params.fee_rate);
    builder.version(2);
    builder.nlocktime(absolute::LockTime::ZERO);

    let psbt = builder.finish().context("failed to build bond tx")?;

    let first = psbt
        .unsigned_tx
        .output
        .first()
        .context("bond tx has no outputs")?;
    if first.script_pubkey != bond_spk || first.value != params.bond_amount {
        bail!("bond output is not at vout 0");
    }
    Ok(psbt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::{consensus, Address, Network};
    use bdk_wallet::test_utils::get_funded_wallet_wpkh;
    use std::str::FromStr;

    fn bond_spk() -> ScriptBuf {
        Address::from_str("bcrt1q3qtze4ys45tgdvguj66zrk4fu6hq3a3v9pfly5")
            .unwrap()
            .require_network(Network::Regtest)
            .unwrap()
            .script_pubkey()
    }

    fn params() -> BondTxParams {
        BondTxParams {
            bond_spk: bond_spk(),
            bond_amount: Amount::from_sat(10_000),
            payload: b"ont-bond-spike-v0".to_vec(),
            fee_rate: FeeRate::from_sat_per_vb(2).unwrap(),
        }
    }

    fn build_once() -> Vec<u8> {
        let (mut wallet, _txid) = get_funded_wallet_wpkh();
        let psbt = build_bond_tx(&mut wallet, &params()).expect("build bond tx");
        assert_eq!(
            psbt.unsigned_tx.output[0].script_pubkey,
            bond_spk(),
            "bond must be at vout 0"
        );
        consensus::encode::serialize(&psbt.unsigned_tx)
    }

    #[test]
    fn bond_tx_is_deterministic_and_bond_is_vout0() {
        let first = build_once();
        let second = build_once();
        assert_eq!(first, second, "unsigned tx bytes must be byte-stable across runs");
    }
}
