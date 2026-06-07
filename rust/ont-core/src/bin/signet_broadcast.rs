//! S7 — fund → async-Esplora sync → build_bond_tx → sign → broadcast on the
//! private signet (esplora shim at https://opennametags.org/esplora).
//!
//! Deterministic signing wallet (fixed test tprv), so the deposit address is
//! stable across runs: run once to print the address, fund it
//! (`ont-private-signet-fund <addr> 0.0005`), then run again to broadcast.
//!
//! STATUS: the build → sign → broadcast path is complete and the binary connects
//! to the live signet esplora (gets the tip, derives the deposit address). The
//! `full_scan` step is BLOCKED on the droplet's esplora shim, which serves
//! `/address/{addr}/utxo` + `/tx` (broadcast) but NOT `/address/{addr}/txs`
//! (Core has no address index via scantxoutset). bdk_esplora's full_scan needs
//! per-address tx history. Unblock: add `/address/{addr}/txs` to the shim (via the
//! electrs/electrum backend's get_history) or point at a complete electrs Esplora.
//! Plan + acceptance: ~/.sprout/RESEARCH/ONT_BDK_RUST_BUILD_PLAN_2026_06_06.md (S7).
use anyhow::{bail, Context, Result};

use bdk_esplora::esplora_client::Builder;
use bdk_esplora::EsploraAsyncExt;
use bdk_wallet::bitcoin::{Amount, FeeRate, Network};
use bdk_wallet::{KeychainKind, SignOptions, Wallet};

use ont_core::bond_tx::{build_bond_tx, BondTxParams};
use ont_core::payload::encode_claim_payload;

// BIP84 testnet/signet signing descriptors (public test vector — spike only).
const EXTERNAL: &str = "wpkh(tprv8ZgxMBicQKsPdy6LMhUtFHAgpocR8GC6QmwMSFpZs7h6Eziw3SpThFfczTDh5rW2krkqffa11UpX3XkeTTB2FvzZKWXqPY54Y6Rq4AQ5R8L/84'/1'/0'/0/*)";
const INTERNAL: &str = "wpkh(tprv8ZgxMBicQKsPdy6LMhUtFHAgpocR8GC6QmwMSFpZs7h6Eziw3SpThFfczTDh5rW2krkqffa11UpX3XkeTTB2FvzZKWXqPY54Y6Rq4AQ5R8L/84'/1'/0'/1/*)";
const ESPLORA_URL: &str = "https://opennametags.org/esplora";
const MIN_FUNDS_SAT: u64 = 20_000;
const BOND_SAT: u64 = 10_000;

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let mut wallet = Wallet::create(EXTERNAL.to_string(), INTERNAL.to_string())
        .network(Network::Signet)
        .create_wallet_no_persist()
        .context("create signing wallet")?;

    let deposit = wallet.reveal_next_address(KeychainKind::External);
    eprintln!("deposit address: {}", deposit.address);

    let client = Builder::new(ESPLORA_URL).build_async().context("build esplora client")?;
    eprintln!("syncing against {ESPLORA_URL} (tip {}) …", client.get_height().await.context("get tip")?);
    let request = wallet.start_full_scan().build();
    let update = client.full_scan(request, 5, 1).await.context("full scan")?;
    wallet.apply_update(update).context("apply update")?;

    let balance = wallet.balance().total();
    eprintln!("balance: {} sat", balance.to_sat());
    if balance < Amount::from_sat(MIN_FUNDS_SAT) {
        eprintln!(
            "not enough funds — fund the deposit address above:\n  ont-private-signet-fund {} 0.0005\nthen re-run.",
            deposit.address
        );
        return Ok(());
    }

    // Bond output pays a fresh wallet address (demo); the point is a real signed
    // ONT-shaped bond tx (bond at vout 0 + OP_RETURN) that the network accepts.
    let bond_addr = wallet.reveal_next_address(KeychainKind::External);
    let params = BondTxParams {
        bond_spk: bond_addr.address.script_pubkey(),
        bond_amount: Amount::from_sat(BOND_SAT),
        payload: encode_claim_payload(&[0x11; 32], &[0x22; 32]),
        fee_rate: FeeRate::from_sat_per_vb(2).context("fee rate")?,
    };

    let mut psbt = build_bond_tx(&mut wallet, &params).context("build bond tx")?;
    let finalized = wallet.sign(&mut psbt, SignOptions::default()).context("sign")?;
    if !finalized {
        bail!("PSBT not fully finalized after signing");
    }
    let tx = psbt.extract_tx().context("extract tx")?;
    let txid = tx.compute_txid();
    client.broadcast(&tx).await.context("broadcast")?;
    eprintln!("BROADCAST OK — signet txid: {txid}");
    eprintln!("  bond at vout 0: {} sat to {}", BOND_SAT, bond_addr.address);
    Ok(())
}
