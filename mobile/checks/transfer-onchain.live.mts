// LIVE check (dev-only): proves the mobile on-chain transfer broadcast path end
// to end against the configured signet stack. Funds a funding address from the
// faucet, builds a real transfer transaction (funding input → OP_RETURN(135-byte
// transfer authorization) → change), broadcasts it via the esplora shim, and
// reads the tx back to confirm the node accepted the oversized OP_RETURN and the
// payload survives the round trip.
//
// This is the one thing the offline check can't prove: that the live node relays
// a >80-byte ONT datacarrier and our PSBT is valid against real UTXOs. It spends
// worthless signet coins and writes a junk OP_RETURN (no matching name, so the
// indexer ignores it as a transfer — we're proving broadcast mechanics only).
//
// Not part of the offline suite. Run: tsx mobile/checks/transfer-onchain.live.mts
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
async function load(path: string): Promise<any> {
  const m = await import(path);
  return m.default ?? m;
}

const hd = await load(`${ROOT}/mobile/src/wallet/hd.ts`);
const transfer = await load(`${ROOT}/mobile/src/wallet/transfer.ts`);
const txBuild = await load(`${ROOT}/mobile/src/wallet/tx-build.ts`);
const faucet = await load(`${ROOT}/mobile/src/api/faucet.ts`);
const resolverMod = await load(`${ROOT}/mobile/src/api/resolver.ts`);
const client = await load(`${ROOT}/mobile/src/api/client.ts`);
const cfg = await load(`${ROOT}/mobile/src/config.ts`);

const { deriveFundingKey, deriveOwnerKey } = hd;
const { signTransferAuthorization, encodeTransferPayloadHex } = transfer;
const { buildOpReturnSpend } = txBuild;
const { requestTestFunds } = faucet;
const { chain } = resolverMod;
const { esploraBroadcast, esploraGetText } = client;

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
const SEED = "7e".repeat(32); // fixed dev test seed → stable funding address
const funding = deriveFundingKey(SEED, NETWORK);
console.log(`esplora target: ${cfg.ESPLORA_BASE}`);
console.log(`funding address: ${funding.fundingAddress}`);

// 1. Ensure the funding address has a spendable UTXO (faucet + mined block).
async function utxos() {
  const raw = await chain.addressUtxos(funding.fundingAddress);
  return raw
    .filter((u: any) => u.status?.confirmed !== false)
    .map((u: any) => ({ txid: u.txid, vout: u.vout, valueSats: u.value }));
}

let funded = await utxos();
if (funded.length === 0) {
  try {
    const f = await requestTestFunds(funding.fundingAddress);
    console.log(`faucet funded: ${f.fundedSats} base units (txid ${f.txid.slice(0, 12)}…)`);
  } catch (e) {
    console.error(`faucet error: ${(e as Error).message}`);
  }
  for (let i = 0; i < 15 && funded.length === 0; i++) {
    await sleep(2000);
    funded = await utxos();
  }
}
ok("funding address has a spendable UTXO", funded.length > 0, `${funded.length} utxo(s)`);
if (funded.length === 0) {
  console.error("\nno funding — cannot broadcast.");
  process.exit(1);
}

// 2. Build a real transfer transaction (recipient = a fresh derived owner key).
const recipient = deriveOwnerKey(SEED, 1, NETWORK).ownerPubkey;
const owner = deriveOwnerKey(SEED, 0, NETWORK);
const fields = {
  prevStateTxid: "ab".repeat(32),
  newOwnerPubkey: recipient,
  flags: 0,
  successorBondVout: 0,
};
const signature = signTransferAuthorization({ ...fields, ownerPrivateKeyHex: owner.ownerPrivateKeyHex });
const opReturnHex = encodeTransferPayloadHex({ ...fields, signature });
ok("transfer OP_RETURN payload is 135 bytes", opReturnHex.length === 135 * 2, `${opReturnHex.length / 2}B`);

const built = buildOpReturnSpend({
  fundingWif: funding.fundingWif,
  fundingAddress: funding.fundingAddress,
  utxos: funded,
  opReturnHex,
  feeRateSatPerVb: 2,
  network: NETWORK,
});
console.log(`built tx ${built.txid} — ${built.vbytes} vB, fee ₿${built.feeSats}, change ₿${built.changeSats}`);

// 3. Broadcast — the key assertion: the node accepts the oversized OP_RETURN.
let broadcastTxid = "";
try {
  broadcastTxid = await esploraBroadcast(built.rawTxHex);
} catch (e) {
  ok("node accepted the 135-byte OP_RETURN transfer tx", false, (e as Error).message);
  console.error("\nbroadcast rejected — see error above.");
  process.exit(1);
}
ok("node accepted the 135-byte OP_RETURN transfer tx", /^[a-f0-9]{64}$/i.test(broadcastTxid), broadcastTxid);
ok("broadcast txid matches the locally computed txid", broadcastTxid === built.txid);

// 4. Read the tx back from the chain and confirm the payload survived.
let confirmedHex = "";
for (let i = 0; i < 10 && !confirmedHex; i++) {
  try {
    confirmedHex = (await esploraGetText(`/tx/${broadcastTxid}/hex`)).trim();
  } catch {
    await sleep(2000);
  }
}
ok("tx is retrievable from the chain", /^[a-f0-9]+$/i.test(confirmedHex), `${confirmedHex.length / 2}B`);
if (confirmedHex) {
  const tx = bitcoin.Transaction.fromHex(confirmedHex);
  let foundPayload = "";
  for (const out of tx.outs) {
    if (out.script[0] === bitcoin.opcodes.OP_RETURN) {
      const decompiled = bitcoin.script.decompile(out.script);
      const data = decompiled && decompiled.length === 2 ? decompiled[1] : undefined;
      if (data instanceof Uint8Array) foundPayload = Buffer.from(data).toString("hex");
    }
  }
  ok("on-chain OP_RETURN equals the transfer payload we built", foundPayload === opReturnHex);
}

console.log("");
if (failures === 0) {
  console.log("ALL TRANSFER-ONCHAIN LIVE CHECKS PASSED — mobile broadcasts a real ONT transfer on signet.");
} else {
  console.error(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
