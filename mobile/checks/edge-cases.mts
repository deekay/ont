// Edge-case checks for the mobile-only surfaces that don't have an engine
// counterpart: name normalization boundaries, the demo-sign helpers, and the
// mock auction bidder. Offline.
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
async function load(path: string): Promise<any> {
  const m = await import(path);
  return m.default ?? m;
}

const acc = await load(`${ROOT}/mobile/src/wallet/accumulator.ts`);
const vw = await load(`${ROOT}/mobile/src/wallet/value-write.ts`);
const rw = await load(`${ROOT}/mobile/src/wallet/recovery-write.ts`);
const vr = await load(`${ROOT}/mobile/src/wallet/value-record.ts`);
const rd = await load(`${ROOT}/mobile/src/wallet/recovery-descriptor.ts`);
const ma = await load(`${ROOT}/mobile/src/api/mock-auction.ts`);

const { accumulatorKeyForName, normalizeName, isValidName, verifyAccumulatorProof, accumulatorRootForSingleLeaf } = acc;
const { signValueForDemo } = vw;
const { signRecoveryForDemo } = rw;
const { verifyValueRecord } = vr;
const { verifyRecoveryDescriptor } = rd;
const { MockAuctionBidder, isBiddable, minimumNextBidSats } = ma;

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) { failures += 1; console.error(`FAIL  ${label}${extra ? "  :: " + extra : ""}`); }
  else console.log(`ok    ${label}${extra ? "  :: " + extra : ""}`);
};

const PRIV = "11".repeat(32);
const PUB = "ea736b157b121b4dea83df3ee5c64d13b468778233d93b01c2b0f0038977ca79";

// --- name normalization boundaries ---
ok("uppercase normalizes to the same leaf", accumulatorKeyForName("Alice") === accumulatorKeyForName("alice"));
ok("normalizeName lowercases", normalizeName("ABC123") === "abc123");
ok("32 chars valid", isValidName("a".repeat(32)) === true);
ok("33 chars invalid", isValidName("a".repeat(33)) === false);
ok("empty invalid", isValidName("") === false);
ok("hyphen invalid", isValidName("ab-cd") === false);
ok("uppercase is valid (normalizes)", isValidName("Alice") === true);

// --- single-leaf root verifies with empty siblings ---
{
  const leaf = accumulatorKeyForName("solo");
  const root = accumulatorRootForSingleLeaf(leaf, PUB);
  ok("single-leaf root verifies", verifyAccumulatorProof(root, { keyHex: leaf, value: PUB, siblings: [] }) === true);
  ok("single-leaf root rejects wrong value", verifyAccumulatorProof(root, { keyHex: leaf, value: "00".repeat(32), siblings: [] }) === false);
}

// --- demo-sign helpers produce real, verifiable records ---
{
  const r = signValueForDemo({ name: "alice", ownerPrivateKeyHex: PRIV, valueType: 2, payloadUtf8: "https://x", sequence: 1 });
  ok("signValueForDemo verifies", verifyValueRecord(r.record) === true);
  ok("signValueForDemo is simulated", r.simulated === true && r.sequence === 1);
}
{
  const r = signRecoveryForDemo({ name: "alice", ownerPrivateKeyHex: PRIV, recoveryAddress: "tb1qexampleexampleexampleexampleexample0l7k7f", sequence: 2 });
  ok("signRecoveryForDemo verifies", verifyRecoveryDescriptor(r.descriptor) === true);
  ok("signRecoveryForDemo is simulated", r.simulated === true && r.sequence === 2);
}

// --- mock auction bidder ---
const auction = {
  auctionId: "lot1",
  phase: "live_bidding",
  openingMinimumBidSats: "1000",
  currentRequiredMinimumBidSats: "2000",
  currentHighestBidSats: "1500",
} as any;
ok("isBiddable for live_bidding", isBiddable(auction) === true);
ok("not biddable when settled", isBiddable({ ...auction, phase: "settled" }) === false);
ok("minimumNextBidSats reads required-min", minimumNextBidSats(auction) === 2000n);
{
  const bidder = new MockAuctionBidder();
  ok("below-min rejected", bidder.placeBid({ auction, bidAmountSats: "1999", ownerPubkey: PUB }).accepted === false);
  ok("zero rejected", bidder.placeBid({ auction, bidAmountSats: "0", ownerPubkey: PUB }).accepted === false);
  ok("non-numeric rejected", bidder.placeBid({ auction, bidAmountSats: "1.5", ownerPubkey: PUB }).accepted === false);
  const good = bidder.placeBid({ auction, bidAmountSats: "2000", ownerPubkey: PUB });
  ok("at-min accepted", good.accepted === true);
  ok("becomes leader above current high", good.becameLeader === true && good.bidderCommitment === PUB);
}

console.log("");
if (failures === 0) console.log("ALL EDGE-CASE CHECKS PASSED.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
