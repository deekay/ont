// Verify mobile/src/wallet/claim.ts trust checks against clean protocol roots.
import {
  accumulatorRootOf,
  normalizeName as engineNormalizeName,
  sha256Hex,
  utf8ToBytes,
} from "@ont/protocol";

const claimMod = await import("../../mobile/src/wallet/claim.ts");
const claim = (claimMod as any).default ?? claimMod;
const { verifyQuoteCommitments, verifyConfirmedReceipt } = claim;

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) { failures += 1; console.error("FAIL  " + label); }
  else console.log("ok    " + label);
};

const NAME = "satoshi";
const OWNER = "ab".repeat(32); // x-only owner pubkey (the leaf value the publisher inserts)
const OTHER = "cd".repeat(32);
const engineKey = (name: string): string => sha256Hex(utf8ToBytes(engineNormalizeName(name)));
const singleLeafRoot = (name: string, ownerPubkey: string): string =>
  accumulatorRootOf(new Map([[engineKey(name), ownerPubkey.toLowerCase()]]));
const singleLeafProof = (name: string, ownerPubkey: string) => ({
  keyHex: engineKey(name),
  value: ownerPubkey.toLowerCase(),
  siblings: [],
});

// Build a clean-protocol accumulator fixture that commits the name -> owner.
const root = singleLeafRoot(NAME, OWNER);
const membership = singleLeafProof(NAME, OWNER);

const goodReceipt = {
  kind: "ont-publisher-claim-receipt",
  quoteId: "q1",
  status: "confirmed",
  name: NAME,
  anchorTxid: "deadbeef".repeat(8),
  anchorHeight: 100,
  inclusionProof: { root, leaf: membership.keyHex, value: membership.value, siblings: membership.siblings },
};

// --- quote commitment checks ---
const goodQuote = { leaf: engineKey(NAME), ownerCommitment: OWNER, available: true };
ok("quote: good quote accepted", verifyQuoteCommitments(goodQuote, { name: NAME, ownerPubkey: OWNER }).ok);
ok("quote: uppercase owner still matches", verifyQuoteCommitments({ ...goodQuote, ownerCommitment: OWNER.toUpperCase() }, { name: NAME, ownerPubkey: OWNER }).ok);
ok("quote: wrong leaf rejected", verifyQuoteCommitments({ ...goodQuote, leaf: engineKey("eve") }, { name: NAME, ownerPubkey: OWNER }).ok === false);
ok("quote: wrong owner rejected", verifyQuoteCommitments({ ...goodQuote, ownerCommitment: OTHER }, { name: NAME, ownerPubkey: OWNER }).ok === false);
ok("quote: unavailable rejected", verifyQuoteCommitments({ ...goodQuote, available: false, reason: "taken" }, { name: NAME, ownerPubkey: OWNER }).ok === false);

// --- confirmed receipt checks ---
const good = verifyConfirmedReceipt(goodReceipt, { name: NAME, ownerPubkey: OWNER });
ok("receipt: good receipt verifies", good.ok);
ok("receipt: notice window = anchorHeight + 6", good.noticeWindowCloseHeight === 106 && good.noticeWindowBlocks === 6);
ok("receipt: anchorTxid surfaced", good.anchorTxid === goodReceipt.anchorTxid);

// Tamper: wrong committed owner value (proof is for a different owner pubkey).
{
  const r = singleLeafRoot(NAME, OTHER);
  const m = singleLeafProof(NAME, OTHER);
  const rec = { ...goodReceipt, inclusionProof: { root: r, leaf: m.keyHex, value: m.value, siblings: m.siblings } };
  ok("receipt: foreign owner value rejected", verifyConfirmedReceipt(rec, { name: NAME, ownerPubkey: OWNER }).ok === false);
}

// Tamper: proof for a DIFFERENT name (leaf mismatch) but valid against its own root.
{
  const r = singleLeafRoot("eve", OWNER);
  const m = singleLeafProof("eve", OWNER);
  const rec = { ...goodReceipt, inclusionProof: { root: r, leaf: m.keyHex, value: m.value, siblings: m.siblings } };
  ok("receipt: wrong-name leaf rejected", verifyConfirmedReceipt(rec, { name: NAME, ownerPubkey: OWNER }).ok === false);
}

// Tamper: flipped root — proof no longer verifies.
{
  const badRoot = root.slice(0, -2) + (root.endsWith("00") ? "01" : "00");
  const rec = { ...goodReceipt, inclusionProof: { ...goodReceipt.inclusionProof, root: badRoot } };
  ok("receipt: flipped root rejected", verifyConfirmedReceipt(rec, { name: NAME, ownerPubkey: OWNER }).ok === false);
}

// Missing inclusion proof / anchor txid.
ok("receipt: missing proof rejected", verifyConfirmedReceipt({ ...goodReceipt, inclusionProof: undefined }, { name: NAME, ownerPubkey: OWNER }).ok === false);
ok("receipt: missing anchorTxid rejected", verifyConfirmedReceipt({ ...goodReceipt, anchorTxid: undefined }, { name: NAME, ownerPubkey: OWNER }).ok === false);

// Unknown anchor height -> notice window 0 (cannot frame finalization yet).
{
  const rec = { ...goodReceipt, anchorHeight: undefined };
  const res = verifyConfirmedReceipt(rec, { name: NAME, ownerPubkey: OWNER });
  ok("receipt: unknown anchor height -> window 0 but proof still ok", res.ok && res.noticeWindowCloseHeight === 0);
}

console.log("");
if (failures === 0) console.log("ALL CLAIM CHECKS PASSED — mobile trust checks match clean @ont/protocol.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
