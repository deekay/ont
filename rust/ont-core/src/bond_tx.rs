//! `build_bond_tx` — construct a contested-auction bond transaction (S3).
//!
//! Output layout is deterministic and pinned via `TxOrdering::Custom`:
//!   vout 0 = the bond output (exact `Amount`)
//!   then   = the OP_RETURN payload (`TxBuilder::add_data`)
//!   then   = change (if any)
//! Assert the bond is actually at vout 0 after `finish()` before signing.
//
// TODO(S3): implement on `bdk_wallet::TxBuilder`:
//   wallet.build_tx()
//     .manually_selected_only().add_utxo(funding_outpoint)?
//     .add_recipient(bond_spk, bond_amount)
//     .add_data(&op_return_payload)
//     .fee_rate(rate)
//     .ordering(TxOrdering::Custom { input_sort, output_sort }) // bond -> vout 0
//     .finish()?;
//   then: assert psbt.unsigned_tx.output[0] == bond output; pin version/locktime/sequence.
