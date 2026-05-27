// Sign the funding (witnesspubkeyhash) inputs of an ONT auction-bid PSBT with
// the keystore's funding key.
//
// The owner key never signs here — it commits to the bid via the OP_RETURN
// payload built by @ont/architect. This signer only authorizes the on-chain
// funding spend (bid amount + fee + bond), so it deliberately supports only
// P2WPKH inputs, the kind our funding address produces.

import type { AuctionBidArtifacts } from "@ont/architect";
import { initEccLib, Psbt } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as tinysecp from "tiny-secp256k1";

import { toBitcoinjsNetwork, type OntNetwork } from "./keys.js";

initEccLib(tinysecp);
const ECPair = ECPairFactory(tinysecp);

export interface SignedBidTransaction {
  readonly signedTransactionHex: string;
  readonly signedTransactionId: string;
  readonly signedInputCount: number;
}

export class SignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignerError";
  }
}

/**
 * Sign every P2WPKH input of an auction-bid PSBT with the funding WIF, finalize,
 * and extract the broadcastable transaction. Throws if any input is a type we
 * don't support or if the funding key doesn't match an input.
 */
export function signAuctionBidArtifacts(input: {
  readonly artifacts: AuctionBidArtifacts;
  readonly fundingWif: string;
  readonly network: OntNetwork;
}): SignedBidTransaction {
  const network = toBitcoinjsNetwork(input.network);
  const psbt = Psbt.fromBase64(input.artifacts.psbtBase64, { network });
  const keyPair = ECPair.fromWIF(input.fundingWif, network);

  let signedInputCount = 0;
  for (let inputIndex = 0; inputIndex < psbt.inputCount; inputIndex += 1) {
    const inputType = psbt.getInputType(inputIndex);
    if (inputType !== "witnesspubkeyhash") {
      throw new SignerError(
        `funding signer only supports witnesspubkeyhash inputs; input ${inputIndex} is ${inputType}`
      );
    }
    if (!psbt.inputHasPubkey(inputIndex, keyPair.publicKey)) {
      throw new SignerError(`funding key does not match input ${inputIndex}`);
    }
    psbt.signInput(inputIndex, keyPair);
    signedInputCount += 1;
  }

  if (signedInputCount === 0) {
    throw new SignerError("auction-bid PSBT had no inputs to sign");
  }

  psbt.finalizeAllInputs();
  const transaction = psbt.extractTransaction(true);
  const signedTransactionId = transaction.getId();

  if (input.artifacts.bidTxid && input.artifacts.bidTxid !== signedTransactionId) {
    throw new SignerError("signed auction-bid txid does not match the unsigned artifact");
  }

  return {
    signedTransactionHex: transaction.toHex(),
    signedTransactionId,
    signedInputCount
  };
}
