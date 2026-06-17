// G1 slice 6b — RootAnchor claim-path end-to-end (go-live e2e harness).
//
// The full live round-trip on a throwaway regtest node: fund + sign a RootAnchor anchor tx with bitcoind's
// own wallet (LEGACY addresses, so the signed raw is legacy-serializable), broadcast it through the LIVE
// publisher port (ONT_SOURCE=node, chain-gated), mine it, ingest it through the LIVE indexer block source,
// read it back by txid, bridge to the web snapshot, and render /tx/:txid. Asserts the confirmed RootAnchor
// facts (txid, mined height, newRoot, batchSize) surface in the rendered HTML. The publisher NEVER signs;
// the parseLegacyTransaction guard fails closed on any witness/segwit-funded raw BEFORE broadcast (CL pin).
// Env-gated (ONT_E2E_REGTEST=1). See docs/core/GO_LIVE_PLAN.md (G1 slice 6).
//
// PURPOSE: prove ingest→resolve→render end-to-end against a real node.
// SCOPE: RootAnchor claim path only (value/recovery render is B3-deferred). TESTS: ./root-anchor-e2e.test.ts.

import { parseLegacyTransaction, serializeLegacyTransaction } from "@ont/bitcoin";
import { assembleRootAnchorTx } from "@ont/adapter-publisher";
import { selectPublisherBroadcastPort } from "@ont/publisher";
import {
  createInMemoryConfirmedAnchorStore,
  createInMemoryIndexerCursorStore,
  runIndexerTick,
  selectIndexerBlockSource,
} from "@ont/indexer";
import { createSnapshotWebReadPort, renderTxView, type ConfirmedAnchorTxView } from "@ont/web";
import { createRegtestNode } from "./regtest-node.js";

export interface RootAnchorE2eResult {
  readonly renderedHtml: string;
  readonly anchorTxid: string;
  readonly minedHeight: number;
  readonly newRoot: string;
  readonly batchSize: number;
}

const PREV_ROOT = "bb".repeat(32);
const NEW_ROOT = "7a".repeat(32);
const BATCH_SIZE = 5;

interface WalletUtxo {
  readonly txid: string;
  readonly vout: number;
  readonly spendable: boolean;
}

export async function runRootAnchorE2e(): Promise<RootAnchorE2eResult> {
  const node = await createRegtestNode();
  try {
    // 1. Wallet + matured funds. LEGACY addresses throughout so every spend is a legacy scriptSig (no witness).
    await node.cli("createwallet", ["e2e"]);
    const mineAddr = (await node.cli("getnewaddress", ["", "legacy"])) as string;
    await node.cli("generatetoaddress", [101, mineAddr]); // 101 ⇒ matured coinbase funds

    // 1b. Legacy funding hop. The RootAnchor's prevout must parse via parseLegacyTransaction, but coinbase txs
    // are witness-serialized (the indexer would drop the candidate on an unparseable prevout — the documented
    // G1 segwit-prevout limit). So spend coinbase outputs into a NON-coinbase legacy UTXO whose parent tx (the
    // RootAnchor's prevout) is legacy-serializable.
    const fundAddr = (await node.cli("getnewaddress", ["", "legacy"])) as string;
    const fundingTxid = (await node.cli("sendtoaddress", [fundAddr, 1])) as string;
    await node.cli("generatetoaddress", [1, mineAddr]); // confirm the funding hop

    // 2. Pick the legacy (non-coinbase) funding UTXO created by the hop.
    const utxos = (await node.cli("listunspent", [1, 9999999, [fundAddr]])) as WalletUtxo[];
    const utxo = utxos.find((u) => u.spendable && u.txid === fundingTxid);
    if (utxo === undefined) throw new Error("e2e: legacy funding UTXO not found after the hop");

    // 3. Assemble the UNSIGNED RootAnchor tx with that input, no manual change (fundrawtransaction adds it).
    const unsigned = assembleRootAnchorTx({
      prevRoot: PREV_ROOT,
      newRoot: NEW_ROOT,
      batchSize: BATCH_SIZE,
      fundingInputs: [{ prevoutTxid: utxo.txid, prevoutVout: utxo.vout }],
    });
    if (unsigned === null) throw new Error("e2e: assembleRootAnchorTx returned null");
    const unsignedBytes = serializeLegacyTransaction(unsigned);
    if (unsignedBytes === null) throw new Error("e2e: unsigned RootAnchor tx not serializable");
    const unsignedHex = Buffer.from(unsignedBytes).toString("hex");

    // 4. Fund (legacy change; add_inputs:false so no segwit coinbase input sneaks in) + sign with bitcoind's
    // own wallet (apps/wallet stays out; the publisher never signs).
    const changeAddr = (await node.cli("getnewaddress", ["", "legacy"])) as string;
    const funded = (await node.cli("fundrawtransaction", [
      unsignedHex,
      { changeAddress: changeAddr, add_inputs: false },
    ])) as { hex: string };
    const signed = (await node.cli("signrawtransactionwithwallet", [funded.hex])) as {
      hex: string;
      complete: boolean;
    };
    if (!signed.complete) throw new Error("e2e: signrawtransactionwithwallet did not complete");

    // 5. HARD pre-broadcast gate (CL pin): the publisher seam is LegacyTransaction — a witness/segwit raw
    // fails loudly HERE, before the live publisher port is ever touched.
    const parsed = parseLegacyTransaction(signed.hex);
    if (parsed === null) {
      throw new Error("e2e: signed raw is not legacy-serializable (witness/segwit-funded) — refusing to broadcast");
    }

    // 6. Broadcast through the LIVE publisher port (env-selected, chain-gated — exercises slice 4).
    const env: Record<string, string | undefined> = {
      ONT_SOURCE: "node",
      ONT_CHAIN: "regtest",
      ONT_RPC_URL: node.rpc.url,
      ONT_RPC_USER: node.rpc.username,
      ONT_RPC_PASSWORD: node.rpc.password,
    };
    const broadcastPort = await selectPublisherBroadcastPort(env);
    const broadcast = await broadcastPort.broadcast(parsed);
    if (!broadcast.ok) throw new Error(`e2e: live broadcast failed: ${broadcast.reason}`);
    const anchorTxid = broadcast.txid;

    // 7. Mine the anchor into a block.
    await node.cli("generatetoaddress", [1, mineAddr]);

    // 8. Ingest through the LIVE indexer block source from genesis (env-selected, chain-gated — slice 4).
    const blockSource = await selectIndexerBlockSource(env);
    const anchorStore = createInMemoryConfirmedAnchorStore();
    await runIndexerTick({ blockSource, cursorStore: createInMemoryIndexerCursorStore(0), anchorStore });

    const record = await anchorStore.getByTxid(anchorTxid);
    if (record === null) throw new Error(`e2e: indexer did not confirm anchor ${anchorTxid}`);

    // 9. Bridge the indexer fact → web snapshot → render /tx/:txid (slice 5).
    const view: ConfirmedAnchorTxView = {
      anchorTx: record.feeTxParts.anchorTx,
      minedHeight: record.confirmedAnchor.minedHeight,
      anchoredRoot: record.confirmedAnchor.anchoredRoot,
      batchSize: record.confirmedAnchor.batchSize,
    };
    const port = createSnapshotWebReadPort({ anchorTxByTxid: (t) => (t === anchorTxid ? view : null) });
    const renderedHtml = renderTxView({ txid: anchorTxid, port });

    return {
      renderedHtml,
      anchorTxid,
      minedHeight: record.confirmedAnchor.minedHeight,
      newRoot: record.confirmedAnchor.anchoredRoot,
      batchSize: record.confirmedAnchor.batchSize,
    };
  } finally {
    await node.stop();
  }
}
