// Slice 6a red battery — createRegtestNode lifecycle (go-live e2e harness control helper).
// ENV-GATED: runs only with ONT_E2E_REGTEST=1 (needs a local bitcoind); otherwise the whole suite is
// skipped so the hermetic `npm test` needs no node. Pins CL's harness watches: ephemeral datadir (never the
// default Bitcoin dir), regtest at genesis over RPC, distinct datadir+port per node (parallel-safe), and a
// clean teardown that removes the datadir. RED until createRegtestNode is implemented (stub throws).
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRegtestNode, type RegtestNode } from "./regtest-node.js";

const RUN = process.env.ONT_E2E_REGTEST === "1";
const d = RUN ? describe : describe.skip;

d("createRegtestNode (G1 slice 6a — regtest lifecycle)", () => {
  let node: RegtestNode | null = null;
  let extra: RegtestNode | null = null;

  afterEach(async () => {
    if (extra) {
      await extra.stop();
      extra = null;
    }
    if (node) {
      await node.stop();
      node = null;
    }
  });

  it("starts a throwaway regtest node, answers RPC as regtest at genesis, then stops + cleans its datadir", async () => {
    node = await createRegtestNode();
    expect(node.rpc.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const info = (await node.cli("getblockchaininfo")) as { chain: string; blocks: number };
    expect(info.chain).toBe("regtest");
    expect(info.blocks).toBe(0);
    const { datadir } = node;
    expect(existsSync(datadir)).toBe(true);
    await node.stop();
    node = null;
    expect(existsSync(datadir)).toBe(false); // ephemeral datadir removed on stop
  }, 60_000);

  it("uses an ephemeral datadir under os.tmpdir() (never the user's default Bitcoin dir) and is parallel-safe", async () => {
    node = await createRegtestNode();
    extra = await createRegtestNode();
    // Exact isolation property: the datadir is under the OS temp root, not DK's default node state.
    expect(node.datadir.startsWith(tmpdir())).toBe(true);
    expect(node.datadir).toMatch(/regtest/i);
    // distinct datadir + port per node (parallel-safe)
    expect(extra.datadir).not.toBe(node.datadir);
    expect(extra.rpc.url).not.toBe(node.rpc.url);
  }, 90_000);
});
