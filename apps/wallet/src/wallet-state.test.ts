import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WalletState, WalletStateError } from "./wallet-state.js";

describe("WalletState", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ont-wallet-state-"));
    path = join(dir, "state.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty when no file exists", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    expect(state.list()).toEqual([]);
    expect(state.get("alice")).toBeUndefined();
  });

  it("tracks a name and round-trips it through the file", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.track({ name: "Alice", ownerPubkey: "ab".repeat(32), ownershipRef: "cd".repeat(32) });
    state.save(path);

    const reloaded = WalletState.loadOrCreate(path, "signet");
    const entry = reloaded.get("alice");
    expect(entry?.name).toBe("alice");
    expect(entry?.ownerPubkey).toBe("ab".repeat(32));
    expect(reloaded.has("ALICE")).toBe(true);
  });

  it("preserves addedAt when re-tracking the same name", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    const first = state.track({ name: "alice", ownerPubkey: "ab".repeat(32), ownershipRef: "01".repeat(32) });
    const second = state.track({ name: "alice", ownerPubkey: "ab".repeat(32), ownershipRef: "02".repeat(32) });
    expect(second.addedAt).toBe(first.addedAt);
    expect(second.ownershipRef).toBe("02".repeat(32));
  });

  it("records the latest value record", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.track({ name: "alice", ownerPubkey: "ab".repeat(32), ownershipRef: "cd".repeat(32) });
    state.recordValue("alice", { sequence: 3, recordHash: "ff".repeat(32) });
    expect(state.get("alice")?.lastValueSequence).toBe(3);
    expect(state.get("alice")?.lastValueRecordHash).toBe("ff".repeat(32));
  });

  it("records armed recovery", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.track({ name: "alice", ownerPubkey: "ab".repeat(32), ownershipRef: "cd".repeat(32) });
    state.recordRecovery("alice", {
      recoveryAddress: "tb1qexample",
      sequence: 1,
      descriptorHash: "ee".repeat(32),
      challengeWindowBlocks: 144,
      armedAt: new Date().toISOString()
    });
    expect(state.get("alice")?.recovery?.recoveryAddress).toBe("tb1qexample");
    expect(state.get("alice")?.recovery?.sequence).toBe(1);
  });

  it("reconciles a pending claim on sync: adopts the ref + status, clears the marker", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.recordPendingClaim(
      { name: "alice", ownerPubkey: "ab".repeat(32) },
      { bidTxid: "bid".padEnd(64, "0"), bidAmountSats: "20000", broadcast: true, claimedAt: new Date().toISOString() }
    );
    expect(state.get("alice")?.pendingClaim).toBeDefined();

    state.recordSync("alice", { ownershipRef: "fe".repeat(32), status: "mature" });
    const entry = state.get("alice");
    expect(entry?.pendingClaim).toBeUndefined();
    expect(entry?.ownershipRef).toBe("fe".repeat(32));
    expect(entry?.status).toBe("mature");
    expect(entry?.lastSyncedAt).toBeDefined();
  });

  it("refuses to record against an untracked name", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    expect(() => state.recordValue("ghost", { sequence: 1, recordHash: "00".repeat(32) })).toThrow(
      WalletStateError
    );
    expect(() => state.recordSync("ghost", { ownershipRef: "00".repeat(32), status: "mature" })).toThrow(
      WalletStateError
    );
  });

  it("forgets a name", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.track({ name: "alice", ownerPubkey: "ab".repeat(32), ownershipRef: "cd".repeat(32) });
    expect(state.forget("ALICE")).toBe(true);
    expect(state.forget("alice")).toBe(false);
    expect(state.list()).toEqual([]);
  });

  it("records a bid and treats an unsynced bond as locked", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.recordBid({
      bidTxid: "aa".repeat(32),
      bondVout: 0,
      bondAmountSats: "20000",
      name: "Alice",
      auctionId: "opening-alice",
      bidderId: "ab".repeat(32),
      broadcast: true
    });
    const bid = state.getBid("aa".repeat(32));
    expect(bid?.name).toBe("alice");
    expect(state.lockedBondOutpoints().has(`${"aa".repeat(32)}:0`)).toBe(true);
  });

  it("releases a bond from the locked set once sync reports losing_bid_releasable", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.recordBid({
      bidTxid: "bb".repeat(32),
      bondVout: 0,
      bondAmountSats: "20000",
      name: "bob",
      auctionId: "a",
      bidderId: "b",
      broadcast: true
    });
    state.recordBidSync("bb".repeat(32), {
      bondStatus: "losing_bid_releasable",
      bondReleaseBlock: 500,
      bondSpendStatus: "unspent"
    });
    expect(state.lockedBondOutpoints().size).toBe(0);
    expect(state.getBid("bb".repeat(32))?.bondReleaseBlock).toBe(500);
  });

  it("keeps a leading_locked bond in the locked set after sync", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.recordBid({
      bidTxid: "cc".repeat(32),
      bondVout: 0,
      bondAmountSats: "20000",
      name: "claire",
      auctionId: "a",
      bidderId: "b",
      broadcast: true
    });
    state.recordBidSync("cc".repeat(32), {
      bondStatus: "leading_locked",
      bondReleaseBlock: null,
      bondSpendStatus: "unspent"
    });
    expect(state.lockedBondOutpoints().has(`${"cc".repeat(32)}:0`)).toBe(true);
  });

  it("round-trips tracked bids through the file", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.recordBid({
      bidTxid: "dd".repeat(32),
      bondVout: 1,
      bondAmountSats: "30000",
      name: "dave",
      auctionId: "a",
      bidderId: "b",
      broadcast: false
    });
    state.save(path);
    const reloaded = WalletState.loadOrCreate(path, "signet");
    expect(reloaded.listBids()).toHaveLength(1);
    expect(reloaded.getBid("dd".repeat(32))?.bondVout).toBe(1);
  });

  it("rejects a file with an unexpected format", () => {
    const state = WalletState.loadOrCreate(path, "signet");
    state.track({ name: "alice", ownerPubkey: "ab".repeat(32), ownershipRef: "cd".repeat(32) });
    state.save(path);

    const onDisk = readFileSync(path, "utf8").replace("ont-wallet-state", "something-else");
    writeFileSync(path, onDisk, "utf8");
    expect(() => WalletState.loadOrCreate(path, "signet")).toThrow(WalletStateError);
  });
});
