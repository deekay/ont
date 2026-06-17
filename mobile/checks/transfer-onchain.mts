// Cross-check the mobile on-chain transfer tx builder against the engine. Proves:
//   - the built+signed raw transaction carries the transfer authorization as a
//     standard OP_RETURN that the indexer's own scanner (getOpReturnPayloads)
//     finds, at any vout
//   - the embedded payload decodes (decodeEvent) to a Transfer event whose
//     fields round-trip byte-for-byte through the engine wire codec
//   - fee / change accounting is self-consistent and covers the target fee rate
//   - multi-input coin selection kicks in when one UTXO can't cover the fee
//
// Offline: mock UTXOs, no network. The crypto + framing are real; only the
// broadcast (esplora POST) is omitted here. Mobile modules are CommonJS under
// tsx, so they're loaded via dynamic import + `.default ?? mod` (the same
// interop pattern the other checks use); bitcoinjs-lib via a namespace import.
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { getOpReturnPayloads } from "@ont/bitcoin";
import { deriveOwnerPubkey as engineDerive } from "@ont/protocol";
import { bytesToHex, decodeEvent, encodeEvent, EventType } from "@ont/wire";

const loadMobile = async (path: string) => {
  const mod = await import(path);
  return (mod as any).default ?? mod;
};
const { deriveFundingKey } = await loadMobile("../../mobile/src/wallet/hd.ts");
const { signTransferAuthorization, encodeTransferPayloadHex } = await loadMobile(
  "../../mobile/src/wallet/transfer.ts",
);
const { buildOpReturnSpend } = await loadMobile("../../mobile/src/wallet/tx-build.ts");

type Utxo = { txid: string; vout: number; valueSats: number };

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) {
    failures += 1;
    console.error("FAIL  " + label);
  } else {
    console.log("ok    " + label);
  }
};

const NETWORK = "signet" as const;
const SEED = "11".repeat(32);
const RECIPIENT_PRIV = "1122334455667788991011121314151617181920212223242526272829303132";

const funding = deriveFundingKey(SEED, NETWORK);
const recipientPubkey = engineDerive(RECIPIENT_PRIV);

// Real transfer authorization over a (stand-in) prevStateTxid.
const fields = {
  prevStateTxid: "ab".repeat(32),
  newOwnerPubkey: recipientPubkey,
  flags: 0,
  successorBondVout: 0,
};
const signature = signTransferAuthorization({ ...fields, ownerPrivateKeyHex: RECIPIENT_PRIV });
const opReturnHex = encodeTransferPayloadHex({ ...fields, signature });

// Map a parsed bitcoinjs tx to the engine's BitcoinTransaction output shape so we
// can run the indexer's own OP_RETURN extraction over it.
function toEngineOutputs(tx: bitcoin.Transaction) {
  return tx.outs.map((out) => {
    const script = out.script;
    if (script[0] === bitcoin.opcodes.OP_RETURN) {
      const decompiled = bitcoin.script.decompile(script);
      const data = decompiled && decompiled.length === 2 ? decompiled[1] : undefined;
      return {
        scriptType: "op_return" as const,
        dataHex: data instanceof Uint8Array ? Buffer.from(data).toString("hex") : undefined,
      };
    }
    return { scriptType: "payment" as const, dataHex: undefined };
  });
}

// --- Case 1: single large UTXO (the common funded-from-faucet case) ---
{
  const utxos: Utxo[] = [{ txid: "aa".repeat(32), vout: 0, valueSats: 1_000_000 }];
  const built = buildOpReturnSpend({
    fundingWif: funding.fundingWif,
    fundingAddress: funding.fundingAddress,
    utxos,
    opReturnHex,
    feeRateSatPerVb: 2,
    network: NETWORK,
  });

  const tx = bitcoin.Transaction.fromHex(built.rawTxHex);
  ok("txid matches the extracted transaction id", tx.getId() === built.txid);
  ok("one input was selected", tx.ins.length === 1 && built.inputs.length === 1);
  ok("two outputs: op_return + change", tx.outs.length === 2);

  // The indexer's own scan finds exactly the framed payload, at the op_return vout.
  const payloads = getOpReturnPayloads({ outputs: toEngineOutputs(tx) } as never);
  ok("indexer finds exactly one OP_RETURN payload", payloads.length === 1);
  const foundHex = Buffer.from(payloads[0].payload).toString("hex");
  ok("found payload equals mobile encodeTransferPayloadHex", foundHex === opReturnHex);
  ok(
    "found payload equals engine encodeEvent",
    foundHex === bytesToHex(encodeEvent({ type: EventType.Transfer, ...fields, signature })),
  );

  // Decode back through the engine and confirm it is a Transfer with our fields.
  const decoded = decodeEvent(payloads[0].payload);
  ok("decoded event type is Transfer", decoded.type === EventType.Transfer);
  const reencoded = bytesToHex(encodeEvent(decoded));
  ok("decoded transfer re-encodes to the same bytes", reencoded === opReturnHex);

  // Fee / change accounting.
  const inputTotal = utxos[0].valueSats;
  ok("fee = inputs − change", built.feeSats === inputTotal - built.changeSats);
  ok("fee covers the 2 sat/vB target", built.feeSats >= Math.ceil(built.vbytes * 2));
  ok("change is economical (> dust)", built.changeSats > 330);
  const changeAddr = bitcoin.address.fromOutputScript(tx.outs[1].script, bitcoin.networks.testnet);
  ok("change returns to the funding address", changeAddr === funding.fundingAddress);
}

// --- Case 2: many tiny UTXOs force multi-input selection ---
{
  const utxos: Utxo[] = Array.from({ length: 6 }, (_, i) => ({
    txid: (i + 10).toString(16).padStart(2, "0").repeat(32),
    vout: 0,
    valueSats: 400, // each alone < dust + fee; several are needed
  }));
  const built = buildOpReturnSpend({
    fundingWif: funding.fundingWif,
    fundingAddress: funding.fundingAddress,
    utxos,
    opReturnHex,
    feeRateSatPerVb: 1,
    network: NETWORK,
  });
  const tx = bitcoin.Transaction.fromHex(built.rawTxHex);
  ok("multi-input: more than one UTXO selected", built.inputs.length > 1);
  ok("multi-input: tx parses and input count matches selection", tx.ins.length === built.inputs.length);
  const payloads = getOpReturnPayloads({ outputs: toEngineOutputs(tx) } as never);
  ok(
    "multi-input: payload still found and correct",
    payloads.length === 1 && Buffer.from(payloads[0].payload).toString("hex") === opReturnHex,
  );
  ok(
    "multi-input: fee = inputs − change",
    built.feeSats === built.inputs.reduce((s: number, u: Utxo) => s + u.valueSats, 0) - built.changeSats,
  );
}

// --- Case 3: dust-only funding is rejected, not silently underpaid ---
{
  let threw = false;
  try {
    buildOpReturnSpend({
      fundingWif: funding.fundingWif,
      fundingAddress: funding.fundingAddress,
      utxos: [{ txid: "cc".repeat(32), vout: 0, valueSats: 50 }],
      opReturnHex,
      feeRateSatPerVb: 2,
      network: NETWORK,
    });
  } catch {
    threw = true;
  }
  ok("insufficient funding throws rather than underpaying", threw);
}

if (failures > 0) {
  console.error(`\n${failures} transfer-onchain check(s) failed.`);
  process.exit(1);
}
console.log("\nok    transfer-onchain: built tx carries an indexer-readable, engine-decodable transfer.");
