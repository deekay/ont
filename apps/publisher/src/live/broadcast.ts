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

export function createLivePublisherBroadcastPort(_submit: RawTxSubmit): PublisherBroadcastPort {
  return {
    async broadcast(_tx: LegacyTransaction): Promise<PublisherBroadcastResult> {
      // RED stub — G1 green pending CL red-OK. Pins that the slice is not yet implemented.
      void serializeLegacyTransaction;
      throw new Error("createLivePublisherBroadcastPort: not implemented (G1 green pending)");
    },
  };
}
