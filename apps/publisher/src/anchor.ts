// Anchor-tx construction — the interface a publisher uses to broadcast the
// Bitcoin tx whose OP_RETURN commits a batch's new accumulator root. A real
// publisher signs a tx with their funding wallet, includes the OP_RETURN
// payload from @ont/protocol's encodeRootAnchorBody, and broadcasts via a
// Bitcoin node or Esplora. The stub just records the would-be tx and returns
// a deterministic synthetic txid + height so the wallet → publisher
// round-trip works end-to-end without a Bitcoin node.

import { encodeRootAnchorBody, type RootAnchorEventPayload } from "@ont/protocol";

export interface AnchorBroadcastInput {
  readonly batchId: string;
  readonly payload: RootAnchorEventPayload;
}

export interface AnchorBroadcastResult {
  readonly txid: string;
  readonly height: number;
}

export interface AnchorBroadcaster {
  broadcast(input: AnchorBroadcastInput): Promise<AnchorBroadcastResult>;
}

/**
 * Records anchor broadcasts and returns a deterministic synthetic txid (the
 * sha256 of the encoded payload). Useful for end-to-end tests; do not use in
 * production — the txid won't exist on any chain.
 */
export class StubAnchorBroadcaster implements AnchorBroadcaster {
  readonly broadcasts: AnchorBroadcastInput[] = [];
  private height = 1_000_000;

  async broadcast(input: AnchorBroadcastInput): Promise<AnchorBroadcastResult> {
    this.broadcasts.push(input);
    const encoded = encodeRootAnchorBody(input.payload);
    const txid = await syntheticTxid(encoded);
    this.height += 1;
    return { txid, height: this.height };
  }
}

async function syntheticTxid(bytes: Uint8Array): Promise<string> {
  // node:crypto in ESM is dynamic-imported lazily so the module can theoretically
  // load in non-node hosts; this branch is always taken in apps/publisher.
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}
