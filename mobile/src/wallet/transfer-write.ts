// Transfer orchestration: read a name's current state, then sign a transfer
// authorization handing it to a recipient's owner key.
//
// A transfer is settled ON-CHAIN (an OP_RETURN carrying this authorization plus a
// successor bond), which the app can't broadcast yet — that's the shared on-chain
// path the auction bid also needs. So this module produces the real, self-verified
// signed authorization; demo mode simulates the broadcast (same principle as demo
// claims/bids: the crypto is real, only the on-chain step is faked).
import { ApiError, esploraBroadcast } from "../api/client";
import { chain, resolver } from "../api/resolver";
import { accumulatorKeyForName, normalizeName } from "./accumulator";
import { deriveFundingKey, type OntNetwork } from "./hd";
import {
  computeTransferAuthorizationHash,
  encodeTransferPayloadHex,
  signTransferAuthorization,
  verifyTransferAuthorization,
} from "./transfer";
import { buildOpReturnSpend, type FundingUtxo } from "./tx-build";

export interface TransferState {
  readonly name: string;
  readonly status: string;
  readonly currentOwnerPubkey: string | null;
  /** The name's lastStateTxid — the prevStateTxid the transfer references. */
  readonly prevStateTxid: string | null;
}

export async function readTransferState(name: string): Promise<TransferState | null> {
  try {
    const rec = await resolver.name(normalizeName(name));
    return {
      name: rec.name,
      status: rec.status,
      currentOwnerPubkey: rec.currentOwnerPubkey ?? null,
      prevStateTxid: rec.lastStateTxid ?? null,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export interface SignedTransfer {
  readonly name: string;
  readonly newOwnerPubkey: string;
  readonly prevStateTxid: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly signature: string;
  readonly authHash: string;
  /** Always true today: the on-chain broadcast is simulated. */
  readonly simulated: boolean;
}

function isValidOwnerPubkey(hex: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hex.trim());
}

/**
 * Sign a transfer authorization (gift: flags 0, successorBondVout 0). The
 * signature is real and self-verified against the signing owner key; the caller
 * decides whether to (demo) simulate the broadcast or hold it for the real path.
 */
export function signTransfer(input: {
  readonly name: string;
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
  readonly newOwnerPubkey: string;
  readonly prevStateTxid: string;
}): SignedTransfer {
  const newOwnerPubkey = input.newOwnerPubkey.trim().toLowerCase();
  if (!isValidOwnerPubkey(newOwnerPubkey)) {
    throw new Error("Recipient owner key must be 32 bytes of hex (64 characters).");
  }
  if (newOwnerPubkey === input.ownerPubkey.trim().toLowerCase()) {
    throw new Error("A name can only be transferred to a different owner key.");
  }
  const fields = { prevStateTxid: input.prevStateTxid, newOwnerPubkey, flags: 0, successorBondVout: 0 };
  const signature = signTransferAuthorization({ ...fields, ownerPrivateKeyHex: input.ownerPrivateKeyHex });
  if (!verifyTransferAuthorization({ ...fields, ownerPubkey: input.ownerPubkey, signature })) {
    throw new Error("Transfer authorization failed to self-verify.");
  }
  return {
    name: normalizeName(input.name),
    newOwnerPubkey,
    prevStateTxid: input.prevStateTxid,
    flags: fields.flags,
    successorBondVout: fields.successorBondVout,
    signature,
    authHash: computeTransferAuthorizationHash(fields),
    simulated: true,
  };
}

/** Demo prevStateTxid stand-in for a name that lives only in demo holdings. */
export function demoPrevStateTxid(name: string): string {
  return accumulatorKeyForName(normalizeName(name));
}

export interface BroadcastedTransfer {
  readonly txid: string;
  readonly feeSats: number;
  readonly vbytes: number;
  readonly changeSats: number;
}

/**
 * Broadcast a REAL on-chain transfer of a MATURE name. Builds a transaction that
 * spends the wallet's funding UTXOs into an OP_RETURN carrying the signed
 * transfer authorization (plus change), and broadcasts it via the esplora shim.
 *
 * Only valid for mature names: the engine's mature-transfer path requires no
 * successor bond and does not constrain which inputs are spent — just a valid
 * authorization over the name's real `lastStateTxid`. The caller MUST pass a
 * `signed` produced from the resolver's actual lastStateTxid (not the demo
 * stand-in), or the indexer will not match it to a name.
 */
export async function broadcastMatureTransfer(input: {
  readonly signed: SignedTransfer;
  readonly seedHex: string;
  readonly network: OntNetwork;
  readonly feeRateSatPerVb?: number;
}): Promise<BroadcastedTransfer> {
  const funding = deriveFundingKey(input.seedHex, input.network);
  const raw = await chain.addressUtxos(funding.fundingAddress);
  const utxos: FundingUtxo[] = raw
    .filter((u) => u.status?.confirmed !== false)
    .map((u) => ({ txid: u.txid, vout: u.vout, valueSats: u.value }));
  if (utxos.length === 0) {
    throw new Error(
      "Funding address has no confirmed coins to pay the network fee. Use Deposit to fund it first.",
    );
  }

  const opReturnHex = encodeTransferPayloadHex({
    prevStateTxid: input.signed.prevStateTxid,
    newOwnerPubkey: input.signed.newOwnerPubkey,
    flags: input.signed.flags,
    successorBondVout: input.signed.successorBondVout,
    signature: input.signed.signature,
  });

  const built = buildOpReturnSpend({
    fundingWif: funding.fundingWif,
    fundingAddress: funding.fundingAddress,
    utxos,
    opReturnHex,
    feeRateSatPerVb: input.feeRateSatPerVb,
    network: input.network,
  });

  const txid = await esploraBroadcast(built.rawTxHex);
  return { txid, feeSats: built.feeSats, vbytes: built.vbytes, changeSats: built.changeSats };
}
