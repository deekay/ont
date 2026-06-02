// Cross-check mobile auction-bid commitments + payload encoding against the
// engine. Proves the three commitments (bidder/lot/state) and the OP_RETURN
// payload are byte-for-byte identical to packages/protocol, and that the engine
// decodes a mobile-built payload back to the same fields.
import * as bitcoin from "bitcoinjs-lib";
import {
  computeAuctionBidderCommitment as engineBidder,
  computeAuctionLotCommitment as engineLot,
  computeAuctionBidStateCommitment as engineState,
} from "../../packages/protocol/src/auction-bid-package.ts";
import {
  encodeAuctionBidPayload,
  decodeAuctionBidPayload,
  decodeOntPayload,
} from "../../packages/protocol/src/wire.ts";
import { OntEventType } from "../../packages/protocol/src/constants.ts";
import { getOpReturnPayloads } from "../../packages/bitcoin/src/index.ts";
import { deriveOwnerPubkey as engineDerive } from "../../packages/protocol/src/value-record.ts";

const loadMobile = async (path: string) => {
  const mod = await import(path);
  return (mod as any).default ?? mod;
};
const ab = await loadMobile("../../mobile/src/wallet/auction-bid.ts");
const {
  computeAuctionBidderCommitment,
  computeAuctionLotCommitment,
  computeAuctionBidStateCommitment,
  encodeAuctionBidPayloadHex,
  buildAuctionBidPayloadFields,
} = ab;
const { deriveFundingKey } = await loadMobile("../../mobile/src/wallet/hd.ts");
const { buildOpReturnSpend } = await loadMobile("../../mobile/src/wallet/tx-build.ts");

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) {
    failures += 1;
    console.error("FAIL  " + label);
  } else {
    console.log("ok    " + label);
  }
};

const PRIV = "1122334455667788991011121314151617181920212223242526272829303132";
const ownerPubkey = engineDerive(PRIV);

const ctx = {
  auctionId: "auction-xyz-001",
  name: "satoshi",
  currentBlockHeight: 4500,
  phase: "live_bidding" as const,
  unlockBlock: 4400,
  auctionCloseBlockAfter: 4600,
  openingMinimumBidSats: 50_000n,
  currentLeaderBidderCommitment: "aa".repeat(16),
  currentHighestBidSats: 60_000n,
  currentRequiredMinimumBidSats: 61_000n,
  settlementLockBlocks: 144,
};
const bidderId = "ont-wallet:device-7";

// 1. Commitments are byte-identical to the engine.
ok(
  "bidder commitment matches engine",
  computeAuctionBidderCommitment(bidderId) === engineBidder(bidderId),
);
ok(
  "lot commitment matches engine",
  computeAuctionLotCommitment({ auctionId: ctx.auctionId, name: ctx.name, unlockBlock: ctx.unlockBlock }) ===
    engineLot({ auctionId: ctx.auctionId, name: ctx.name, unlockBlock: ctx.unlockBlock }),
);
ok(
  "state commitment matches engine",
  computeAuctionBidStateCommitment(ctx) === engineState(ctx),
);
ok("bidder/lot commitments are 16 bytes", computeAuctionBidderCommitment(bidderId).length === 32);
ok("state commitment is 32 bytes", computeAuctionBidStateCommitment(ctx).length === 64);

// 2. Assemble payload fields and confirm the OP_RETURN encodes identically.
const bidAmountSats = 61_000n;
const bondVout = 0;
const fields = buildAuctionBidPayloadFields({ ctx, bidderId, ownerPubkey, bidAmountSats, bondVout });

const mobileHex = encodeAuctionBidPayloadHex(fields);
const engineHex = Buffer.from(
  encodeAuctionBidPayload({
    bondVout,
    settlementLockBlocks: ctx.settlementLockBlocks,
    bidAmountSats,
    ownerPubkey,
    auctionLotCommitment: fields.auctionLotCommitment,
    auctionCommitment: fields.auctionStateCommitment,
    bidderCommitment: fields.bidderCommitment,
    unlockBlock: ctx.unlockBlock,
    name: ctx.name,
  }),
).toString("hex");
ok("auction-bid OP_RETURN payload matches engine wire codec", mobileHex === engineHex);
ok("payload starts with ONT magic + version + auction-bid type", mobileHex.slice(0, 10) === "4f4e540107");
ok("flags byte sets INCLUDES_NAME (0x01)", mobileHex.slice(10, 12) === "01");

// 3. Engine decodes the mobile-built payload back to the same fields.
const decoded = decodeAuctionBidPayload(Uint8Array.from(Buffer.from(mobileHex, "hex")));
ok("engine decodes type AuctionBid", OntEventType.AuctionBid === 0x07);
ok("decoded bidAmountSats round-trips", decoded.bidAmountSats === bidAmountSats);
ok("decoded ownerPubkey round-trips", decoded.ownerPubkey === ownerPubkey);
ok("decoded name round-trips", decoded.name === ctx.name);
ok("decoded lot commitment round-trips", decoded.auctionLotCommitment === fields.auctionLotCommitment);
ok("decoded state commitment round-trips", decoded.auctionCommitment === fields.auctionStateCommitment);
ok("decoded bidder commitment round-trips", decoded.bidderCommitment === fields.bidderCommitment);

// 4. State commitment is sensitive to observed state (different height → different commitment).
ok(
  "state commitment changes with observed block height",
  computeAuctionBidStateCommitment({ ...ctx, currentBlockHeight: ctx.currentBlockHeight + 1 }) !==
    computeAuctionBidStateCommitment(ctx),
);
ok(
  "lot commitment is independent of the bid amount",
  encodeAuctionBidPayloadHex(buildAuctionBidPayloadFields({ ctx, bidderId, ownerPubkey, bidAmountSats: 99_000n, bondVout }))
    .length === mobileHex.length,
);

// 5. The built bid TX is what the engine's applyAuctionBid reads: a bond payment
//    at bondVout (value == bid) and the auction-bid OP_RETURN that decodes back.
{
  const funding = deriveFundingKey("22".repeat(32), "signet");
  const built = buildOpReturnSpend({
    fundingWif: funding.fundingWif,
    fundingAddress: funding.fundingAddress,
    utxos: [{ txid: "aa".repeat(32), vout: 0, valueSats: 1_000_000 }],
    opReturnHex: mobileHex,
    paymentOutputs: [{ address: funding.fundingAddress, valueSats: Number(bidAmountSats) }],
    feeRateSatPerVb: 2,
    network: "signet",
  });
  const tx = bitcoin.Transaction.fromHex(built.rawTxHex);
  ok("bid tx has 3 outputs: bond, op_return, change", tx.outs.length === 3);

  // Bond at vout 0: a payment (not OP_RETURN) whose value equals the bid amount.
  const bondOut = tx.outs[0];
  ok("bond output (vout 0) is a payment script", bondOut.script[0] !== bitcoin.opcodes.OP_RETURN);
  ok("bond output value equals the bid amount", BigInt(bondOut.value) === bidAmountSats);
  const bondAddr = bitcoin.address.fromOutputScript(bondOut.script, bitcoin.networks.testnet);
  ok("bond returns to a bidder-controlled address", bondAddr === funding.fundingAddress);

  // OP_RETURN at vout 1: the indexer's scan finds it and it decodes to our bid.
  const engineOutputs = tx.outs.map((out) =>
    out.script[0] === bitcoin.opcodes.OP_RETURN
      ? {
          scriptType: "op_return" as const,
          dataHex: Buffer.from(
            (bitcoin.script.decompile(out.script)?.[1] as Uint8Array) ?? new Uint8Array(),
          ).toString("hex"),
        }
      : { scriptType: "payment" as const, dataHex: undefined },
  );
  const payloads = getOpReturnPayloads({ outputs: engineOutputs } as never);
  ok("indexer finds the auction-bid OP_RETURN", payloads.length === 1 && payloads[0].vout === 1);
  const decodedOnchain = decodeOntPayload(payloads[0].payload);
  ok("on-chain payload decodes to AuctionBid", decodedOnchain.type === OntEventType.AuctionBid);
  ok(
    "on-chain bid amount matches the bond",
    (decodedOnchain.payload as any).bidAmountSats === bidAmountSats,
  );
}

if (failures > 0) {
  console.error(`\n${failures} auction-bid check(s) failed.`);
  process.exit(1);
}
console.log("\nok    auction-bid: mobile commitments + payload are byte-identical to the engine.");
