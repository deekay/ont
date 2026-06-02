// LIVE check (dev-only): broadcasts a real on-chain auction bid against a live
// biddable auction on the configured signet stack, then reads the tx back to
// confirm the node accepted the bond + auction-bid OP_RETURN and the payload
// decodes to our bid. Spends worthless signet coins; the bond is paid to the
// wallet's own funding key (returnable). Targets a "phase-*" test fixture in the
// awaiting_opening_bid phase.
//
// Scope: this proves the BROADCAST + decode path (node accepts the bond + bid
// OP_RETURN, the tx decodes to our AuctionBid). It does NOT assert that the
// resolver's experimental-auction tracker *accepts* the bid: association keys on
// auctionLotCommitment === catalog's, and the deployed signet resolver currently
// runs pre-consolidation code (it still serves auctionClassId/classLabel that the
// current source removed), so its commitment scheme differs from HEAD. The
// offline auction-bid.mts is the authoritative correctness proof against current
// source; full live acceptance will follow a resolver redeploy to HEAD.
//
// Not part of the offline suite. Run: tsx mobile/checks/auction-bid.live.mts
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { decodeOntPayload } from "../../packages/protocol/src/wire.ts";
import { OntEventType } from "../../packages/protocol/src/constants.ts";
import { getOpReturnPayloads } from "../../packages/bitcoin/src/index.ts";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
async function load(path: string): Promise<any> {
  const m = await import(path);
  return m.default ?? m;
}
const hd = await load(`${ROOT}/mobile/src/wallet/hd.ts`);
const auctionWrite = await load(`${ROOT}/mobile/src/wallet/auction-write.ts`);
const faucet = await load(`${ROOT}/mobile/src/api/faucet.ts`);
const resolverMod = await load(`${ROOT}/mobile/src/api/resolver.ts`);
const client = await load(`${ROOT}/mobile/src/api/client.ts`);
const cfg = await load(`${ROOT}/mobile/src/config.ts`);

const { deriveFundingKey, deriveOwnerKey } = hd;
const { broadcastAuctionBid } = auctionWrite;
const { requestTestFunds } = faucet;
const { chain, resolver } = resolverMod;
const { esploraGetText } = client;

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) {
    failures += 1;
    console.error(`FAIL  ${label}${extra ? "  :: " + extra : ""}`);
  } else {
    console.log(`ok    ${label}${extra ? "  :: " + extra : ""}`);
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NETWORK = cfg.NETWORK as "signet" | "main";
const SEED = "7e".repeat(32);
const funding = deriveFundingKey(SEED, NETWORK);
console.log(`esplora: ${cfg.ESPLORA_BASE}  funding: ${funding.fundingAddress}`);

// 1. Find a biddable auction (awaiting_opening_bid), cheapest minimum first.
const all = await resolver.experimentalAuctions();
const biddable = all.auctions
  .filter((a: any) => ["awaiting_opening_bid", "live_bidding", "soft_close"].includes(a.phase))
  .sort((x: any, y: any) => {
    const mx = BigInt(x.currentRequiredMinimumBidSats ?? x.openingMinimumBidSats ?? "0");
    const my = BigInt(y.currentRequiredMinimumBidSats ?? y.openingMinimumBidSats ?? "0");
    return mx < my ? -1 : mx > my ? 1 : 0;
  });
ok("a biddable auction exists", biddable.length > 0);
if (biddable.length === 0) {
  console.error("\nno biddable auction to bid on.");
  process.exit(1);
}
const entry = biddable[0];
const bidAmount = BigInt(entry.currentRequiredMinimumBidSats ?? entry.openingMinimumBidSats);
console.log(`target: ${entry.auctionId} (${entry.normalizedName}) phase=${entry.phase} bid=${bidAmount}`);

// 2. Ensure funding covers bond + fee.
async function utxoTotal(): Promise<number> {
  const raw = await chain.addressUtxos(funding.fundingAddress);
  return raw.filter((u: any) => u.status?.confirmed !== false).reduce((s: number, u: any) => s + u.value, 0);
}
let total = await utxoTotal();
const need = Number(bidAmount) + 5_000;
if (total < need) {
  try {
    const f = await requestTestFunds(funding.fundingAddress, Math.max(1_000_000, need));
    console.log(`faucet funded ${f.fundedSats}`);
  } catch (e) {
    console.error(`faucet error: ${(e as Error).message}`);
  }
  for (let i = 0; i < 15 && total < need; i++) {
    await sleep(2000);
    total = await utxoTotal();
  }
}
ok("funding covers bond + fee", total >= need, `${total} >= ${need}`);
if (total < need) process.exit(1);

// 3. Broadcast the bid. Owner key = the per-name key we'd control if we win.
const owner = deriveOwnerKey(SEED, 0, NETWORK);
let bid: any;
try {
  bid = await broadcastAuctionBid({
    entry,
    ownerPubkey: owner.ownerPubkey,
    bidAmountSats: bidAmount,
    seedHex: SEED,
    network: NETWORK,
  });
} catch (e) {
  ok("node accepted the bid (bond + auction-bid OP_RETURN)", false, (e as Error).message);
  console.error("\nbid broadcast rejected — see error above.");
  process.exit(1);
}
ok("node accepted the bid (bond + auction-bid OP_RETURN)", /^[a-f0-9]{64}$/i.test(bid.txid), bid.txid);
console.log(`bid tx ${bid.txid} — bond ₿${bid.bondSats}, fee ₿${bid.feeSats}, ${bid.vbytes} vB`);

// 4. Read the tx back and confirm the bond output + decoded bid.
let hex = "";
for (let i = 0; i < 10 && !hex; i++) {
  try {
    hex = (await esploraGetText(`/tx/${bid.txid}/hex`)).trim();
  } catch {
    await sleep(2000);
  }
}
ok("bid tx is retrievable from the chain", /^[a-f0-9]+$/i.test(hex));
if (hex) {
  const tx = bitcoin.Transaction.fromHex(hex);
  ok("bond output (vout 0) value equals the bid", BigInt(tx.outs[0].value) === bidAmount);
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
  ok("indexer finds the auction-bid OP_RETURN at vout 1", payloads.length === 1 && payloads[0].vout === 1);
  const decoded = decodeOntPayload(payloads[0].payload);
  ok("on-chain payload decodes to AuctionBid", decoded.type === OntEventType.AuctionBid);
  ok("decoded bid amount matches", (decoded.payload as any).bidAmountSats === bidAmount);
  ok("decoded name matches the auction", (decoded.payload as any).name === entry.normalizedName);
}

console.log("");
if (failures === 0) {
  console.log("ALL AUCTION-BID LIVE CHECKS PASSED — mobile broadcasts a real bonded bid on signet.");
} else {
  console.error(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
