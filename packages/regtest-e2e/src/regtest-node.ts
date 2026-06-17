// G1 slice 6a — throwaway bitcoind -regtest control helper (go-live e2e harness).
//
// Spins a disposable regtest node for the end-to-end harness: an ephemeral -datadir (NEVER the user's
// default Bitcoin dir), -txindex=1 (the live indexer reads getrawtransaction(txid,false) bodies), random
// RPC/P2P ports (parallel-safe), and rpcuser/rpcpassword auth wired into a BitcoinRpcConfig the live
// publisher/indexer consume. stop() shuts the node down and removes the ephemeral datadir. cli() is a thin
// JSON-RPC call against the same node for harness wallet/mining ops. NOT a shipped surface; env-gated
// (ONT_E2E_REGTEST=1) so the hermetic suite needs no node. See docs/core/GO_LIVE_PLAN.md (G1 slice 6).
//
// PURPOSE: a disposable regtest node + its BitcoinRpcConfig, started clean and torn down clean.
// SCOPE: process lifecycle + RPC plumbing only; no ONT rules. TESTS: ./regtest-node.test.ts (env-gated).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BitcoinRpcConfig } from "@ont/bitcoin";

export interface RegtestNode {
  /** RPC config for the throwaway node — feeds the live publisher/indexer + cli(). */
  readonly rpc: BitcoinRpcConfig;
  /** The ephemeral datadir (removed by stop()). */
  readonly datadir: string;
  /** Thin JSON-RPC call against this node (harness wallet/mining ops). Throws on RPC error. */
  cli(method: string, params?: readonly unknown[]): Promise<unknown>;
  /** Shut the node down and remove its ephemeral datadir. Idempotent. */
  stop(): Promise<void>;
}

export interface RegtestNodeOptions {
  readonly rpcUser?: string;
  readonly rpcPassword?: string;
}

/** Grab an ephemeral free TCP port on localhost (released immediately, then handed to bitcoind). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      srv.close(() => (port > 0 ? resolve(port) : reject(new Error("could not allocate a free port"))));
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function createRegtestNode(opts?: RegtestNodeOptions): Promise<RegtestNode> {
  const rpcUser = opts?.rpcUser ?? "ont";
  const rpcPassword = opts?.rpcPassword ?? "ont";
  const bitcoind = process.env.ONT_BITCOIND ?? "bitcoind";

  // Ephemeral datadir UNDER os.tmpdir() — never the user's default Bitcoin dir (the helper's safety property).
  const datadir = await mkdtemp(join(tmpdir(), "ont-regtest-"));
  const rpcPort = await freePort();
  const p2pPort = await freePort();
  const rpc: BitcoinRpcConfig = { url: `http://127.0.0.1:${rpcPort}`, username: rpcUser, password: rpcPassword };
  const auth = "Basic " + Buffer.from(`${rpcUser}:${rpcPassword}`).toString("base64");

  // Held child (NOT -daemon) so stop() can await a real exit before removing the datadir.
  const child: ChildProcess = spawn(
    bitcoind,
    [
      "-regtest",
      `-datadir=${datadir}`,
      "-txindex=1", // the live indexer reads getrawtransaction(txid,false) bodies
      `-rpcuser=${rpcUser}`,
      `-rpcpassword=${rpcPassword}`,
      `-rpcport=${rpcPort}`,
      `-port=${p2pPort}`,
      "-rpcbind=127.0.0.1",
      "-rpcallowip=127.0.0.1",
      "-fallbackfee=0.0002",
    ],
    { stdio: "ignore" },
  );
  let spawnError: Error | null = null;
  child.once("error", (e) => {
    spawnError = e;
  });

  const cli = async (method: string, params: readonly unknown[] = []): Promise<unknown> => {
    const res = await fetch(rpc.url, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "1.0", id: "ont-regtest", method, params }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } | null };
    if (body.error) throw new Error(`rpc ${method} failed: ${body.error.message ?? "unknown"}`);
    return body.result;
  };

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      await cli("stop"); // graceful; ignored if already down
    } catch {
      /* best effort — fall through to exit-wait + force-kill */
    }
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const killer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 10_000);
      child.once("exit", () => {
        clearTimeout(killer);
        resolve();
      });
    });
    await rm(datadir, { recursive: true, force: true });
  };

  // Readiness: poll the RPC until it answers, fail closed if bitcoind dies or never comes up.
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (spawnError) {
      await stop();
      throw new Error(`failed to spawn ${bitcoind}: ${String(spawnError)}`);
    }
    if (child.exitCode !== null) {
      await rm(datadir, { recursive: true, force: true });
      throw new Error(`bitcoind exited early (code ${child.exitCode}) — is it installed?`);
    }
    try {
      await cli("getblockchaininfo");
      break;
    } catch (e) {
      if (Date.now() >= deadline) {
        await stop();
        throw new Error(`bitcoind regtest not ready within 30s: ${String(e)}`);
      }
      await sleep(250);
    }
  }

  return { rpc, datadir, cli, stop };
}
