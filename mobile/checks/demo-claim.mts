// Prove the DEMO claim flow exercises the REAL verification — the mock
// publisher's synthetic receipt carries an inclusion proof that the app's real
// verifyConfirmedReceipt / verifyAccumulatorProof accepts for the right reasons.
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
async function load(path: string): Promise<any> {
  const m = await import(path);
  return m.default ?? m;
}

const mockMod = await load(`${ROOT}/mobile/src/api/mock-publisher.ts`);
const claimMod = await load(`${ROOT}/mobile/src/wallet/claim.ts`);
const accMod = await load(`${ROOT}/mobile/src/wallet/accumulator.ts`);
const { MockPublisherClient } = mockMod;
const { fetchVerifiedQuote, verifyConfirmedReceipt, verifyQuoteCommitments } = claimMod;
const { accumulatorKeyForName } = accMod;

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) { failures += 1; console.error(`FAIL  ${label}${extra ? "  :: " + extra : ""}`); }
  else console.log(`ok    ${label}${extra ? "  :: " + extra : ""}`);
};

const ownerPubkey = "ea736b157b121b4dea83df3ee5c64d13b468778233d93b01c2b0f0038977ca79";
const name = "democlaim";

const client = new MockPublisherClient();
ok("client marks itself as demo", client.isDemo === true);

const quote = await fetchVerifiedQuote(client, { name, ownerPubkey, rail: "lightning" });
ok("quote leaf == sha256(name)", quote.leaf === accumulatorKeyForName(name), quote.leaf);
ok("quote commits this owner key", quote.ownerCommitment.toLowerCase() === ownerPubkey);
ok("quote has a (demo) lightning invoice", typeof quote.lightningInvoice === "string");
const recheck = verifyQuoteCommitments(quote, { name, ownerPubkey });
ok("verifyQuoteCommitments accepts the demo quote", recheck.ok === true, JSON.stringify(recheck.problems));

const receipt = await client.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
ok("receipt is confirmed", receipt.status === "confirmed");
ok("receipt carries an inclusion proof", !!receipt.inclusionProof);
ok("demo proof has empty sibling path (single-leaf)", receipt.inclusionProof.siblings.length === 0);

const verdict = verifyConfirmedReceipt(receipt, { name, ownerPubkey });
ok("verifyConfirmedReceipt: ok", verdict.ok === true, JSON.stringify(verdict.problems));
ok("notice window = anchorHeight + 6", verdict.noticeWindowCloseHeight === verdict.anchorHeight + 6);

const tampered = { ...receipt, inclusionProof: { ...receipt.inclusionProof, value: "00".repeat(32) } };
ok("tampered proof is rejected by the real verifier", verifyConfirmedReceipt(tampered, { name, ownerPubkey }).ok === false);

const wrongOwnerVerdict = verifyConfirmedReceipt(receipt, { name, ownerPubkey: "11".repeat(32) });
ok("proof does not validate for a different wallet", wrongOwnerVerdict.ok === false);

console.log("");
if (failures === 0) console.log("ALL DEMO-CLAIM CHECKS PASSED — demo fakes the service, not the crypto.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
