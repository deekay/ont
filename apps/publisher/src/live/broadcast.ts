// G1 live publisher broadcast (go-live phase, RootAnchor claim path).
//
// Submits an ALREADY-SIGNED transaction to a Bitcoin node by serializing it and
// handing the raw hex to an injected submit function. The publisher NEVER signs
// (brief: assemble B4 -> sign wallet B5 -> broadcast). I/O is injected so this is
// unit-testable without a node; real wiring passes
//   (hex) => sendBitcoinRpcRawTransaction(rpc, hex)
// from @ont/bitcoin (the package's designated RPC I/O edge). See
// docs/core/GO_LIVE_PLAN.md (G1).
//
// PURPOSE: turn a signed LegacyTransaction into a node broadcast, fail closed.
// SCOPE: serialize + submit only; no signing, no assembling, no chain gate (that
//   is the wiring-startup slice). TESTS: ./broadcast.test.ts (red battery).
import { serializeLegacyTransaction, type LegacyTransaction } from "@ont/bitcoin";
import type { PublisherBroadcastPort, PublisherBroadcastResult } from "../server.js";

/** Raw-hex submit seam. Real wiring: (hex) => sendBitcoinRpcRawTransaction(rpc, hex). */
export type RawTxSubmit = (transactionHex: string) => Promise<string>;

export function createLivePublisherBroadcastPort(submit: RawTxSubmit): PublisherBroadcastPort {
  return {
    async broadcast(tx: LegacyTransaction): Promise<PublisherBroadcastResult> {
      // Serialize the caller-provided (already-signed) tx verbatim. No signing, no
      // mutation, and no "is it signed?" inspection — authenticity is the B5
      // wallet's responsibility, not this seam's (CL green watch).
      const bytes = serializeLegacyTransaction(tx);
      if (bytes === null) {
        return { ok: false, reason: "tx-not-serializable" };
      }
      const transactionHex = Buffer.from(bytes).toString("hex");
      try {
        const txid = await submit(transactionHex);
        return { ok: true, txid };
      } catch {
        return { ok: false, reason: "broadcast-rejected" };
      }
    },
  };
}
