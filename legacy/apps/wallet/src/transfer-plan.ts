// Derive the bond-related inputs of a transfer from a resolver's name record,
// so `transfer <name> --to <pubkey>` doesn't make you hand-type the previous
// state txid and the bond outpoint.
//
// The resolver reports the name's current state txid and bond outpoint; this
// turns them into the values @ont/architect's transfer builder needs. The bond
// address isn't in the record, so the caller supplies it (the wallet's funding
// address by default — where its own claims/transfers send the bond). Explicit
// overrides always win, for offline use or non-default bonds.

import type { FundingInputDescriptor } from "@ont/architect";

import type { ResolverNameRecord } from "./resolver.js";

export class TransferPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferPlanError";
  }
}

export interface TransferBondPlan {
  readonly prevStateTxid: string;
  readonly bondInput: FundingInputDescriptor;
  readonly successorBondSats: bigint;
}

export function transferBondPlanFromRecord(
  record: ResolverNameRecord,
  options: {
    readonly bondInputAddress: string;
    readonly explicitPrevStateTxid?: string;
    readonly explicitBondInput?: FundingInputDescriptor;
    readonly explicitSuccessorBondSats?: bigint;
  }
): TransferBondPlan {
  const prevStateTxid = options.explicitPrevStateTxid ?? record.lastStateTxid;

  const bondInput = options.explicitBondInput ?? bondInputFromRecord(record, options.bondInputAddress);

  // Reuse the current bond amount for the successor bond unless told otherwise;
  // fall back to the required minimum if the resolver omitted the value.
  const successorBondSats =
    options.explicitSuccessorBondSats ??
    BigInt(record.currentBondValueSats ?? record.requiredBondSats);

  return { prevStateTxid, bondInput, successorBondSats };
}

function bondInputFromRecord(record: ResolverNameRecord, address: string): FundingInputDescriptor {
  if (
    record.currentBondTxid === undefined ||
    record.currentBondVout === undefined ||
    record.currentBondValueSats === undefined
  ) {
    throw new TransferPlanError(
      `resolver did not report a bond outpoint for "${record.name}" — pass --bond-input <txid:vout:valueSats:address>`
    );
  }
  return {
    txid: record.currentBondTxid,
    vout: record.currentBondVout,
    valueSats: BigInt(record.currentBondValueSats),
    address
  };
}
