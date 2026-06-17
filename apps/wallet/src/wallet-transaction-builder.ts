// B5-WALLET — the tx-construction/signing capability the CLI DELEGATE submit commands consume. Distinct from
// the narrow WalletSigner (value-record/recovery) so claim stays on its minimal contract; createWalletSigner
// returns a signer that satisfies both. The owner key stays closed over — never an input or an output here.
import type { TransferArtifactInput, BuildTransferResult } from "./transfer-artifacts.js";
import type {
  ImmatureSaleTransferInput,
  MatureSaleTransferInput,
  BuildSaleResult,
  CoSignSaleResult,
} from "./sale-transfer-artifacts.js";
import type { AuctionBidArtifactInput, BuildAuctionBidResult } from "./auction-bid-artifacts.js";

export interface WalletTransactionBuilder {
  /** Single-signer gift transfer → fully signed tx artifact. */
  buildAndSignTransfer(input: TransferArtifactInput): BuildTransferResult;
  /** Single-signer auction bid: AuctionBid carrier (0x07, 32-byte commitments) + bidder bond → fully signed tx. */
  buildAndSignAuctionBid(input: AuctionBidArtifactInput): BuildAuctionBidResult;
  /** Cooperative immature-sale, SELLER role: carrier + ONT auth + sign seller-owned inputs → partial PSBT. */
  buildImmatureSaleTransfer(input: ImmatureSaleTransferInput): BuildSaleResult;
  /** Cooperative mature-sale, SELLER role: ≥1 seller binding input, no successor bond → partial PSBT. */
  buildMatureSaleTransfer(input: MatureSaleTransferInput): BuildSaleResult;
  /** Cooperative sale, BUYER/co-signer role: sign this wallet's own inputs in the PSBT; finalize when complete. */
  coSignSaleTransfer(partialPsbtBase64: string): CoSignSaleResult;
}
