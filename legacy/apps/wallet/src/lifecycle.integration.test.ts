// End-to-end integration: drive the wallet's primitives through the whole
// lifecycle against a fake resolver and assert each step's state. Catches
// integration-level bugs that the unit suite misses — field-name mismatches,
// ordering between record-writes and saves, the bid-bond → ownership
// transition, and that an exported proof verifies against @ont/consensus.

import { buildAuctionBidArtifacts, parseFundingInputDescriptor } from "@ont/architect";
import { verifyProofBundle } from "@ont/consensus";
import { computeValueRecordHash, signValueRecord } from "@ont/protocol";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bidPackageFromAuction } from "./bid-package.js";
import { type OntNetwork } from "./keys.js";
import { WalletKeystore } from "./keystore.js";
import { assembleDirectAuctionProofBundle } from "./proof-export.js";
import { ResolverClient, type ResolverAuctionState } from "./resolver.js";
import { signAuctionBidArtifacts } from "./signer.js";
import { WalletState } from "./wallet-state.js";

const NETWORK: OntNetwork = "regtest";

type JsonRecord = Record<string, unknown>;

/**
 * Drives the wallet's resolver-shaped HTTP calls from in-memory state. We
 * store responses as loose JSON so the test fixtures can mirror real
 * resolver responses (with their extra fields) without fighting the wallet's
 * narrower types.
 */
class FakeResolver {
  auction: ResolverAuctionState;
  nameRecord: JsonRecord | null = null;
  valueHistory: { records: JsonRecord[] } = { records: [] };
  posts: { path: string; body: string }[] = [];
  currentBlockHeight = 200;

  constructor(normalizedName: string) {
    this.auction = {
      auctionId: `opening-${normalizedName}`,
      normalizedName,
      currentBlockHeight: this.currentBlockHeight,
      phase: "awaiting_opening_bid",
      unlockBlock: 100,
      auctionCloseBlockAfter: null,
      openingMinimumBidSats: "10000",
      currentLeaderBidderCommitment: null,
      currentHighestBidSats: null,
      currentRequiredMinimumBidSats: "10000",
      settlementLockBlocks: 144,
      blocksUntilUnlock: 0,
      blocksUntilClose: null,
      visibleBidOutcomes: []
    };
  }

  /**
   * Install a fetch stub that routes by URL. GETs read from in-memory state;
   * POSTs are recorded for later assertions.
   */
  installFetchStub(): void {
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: { method?: string; body?: string }) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";

      if (method === "POST") {
        this.posts.push({ path: url.pathname, body: init?.body ?? "" });
        return jsonResponse({ ok: true });
      }

      if (url.pathname === "/experimental-auctions") {
        return jsonResponse({ currentBlockHeight: this.currentBlockHeight, auctions: [this.auction] });
      }
      if (/^\/name\/(.+)\/value\/history$/.test(url.pathname)) {
        return jsonResponse(this.valueHistory);
      }
      if (/^\/name\/(.+)\/value$/.test(url.pathname) || /^\/name\/(.+)\/recovery$/.test(url.pathname)) {
        return notFound();
      }
      if (/^\/name\/(.+)$/.test(url.pathname)) {
        return this.nameRecord === null ? notFound() : jsonResponse(this.nameRecord);
      }
      return notFound();
    }));
  }
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

function notFound(): Response {
  return { ok: false, status: 404, text: async () => "" } as unknown as Response;
}

describe("lifecycle integration: claim → sync → set-destination → export-proof", () => {
  let dir: string;
  let keystorePath: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ont-wallet-lifecycle-"));
    keystorePath = join(dir, "ks.json");
    statePath = join(dir, "state.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("walks claim → sync → set-destination → export-proof end-to-end", async () => {
    // ---- setup ----
    const keystore = WalletKeystore.createNew(NETWORK);
    keystore.save(keystorePath, "pw");
    const fake = new FakeResolver("satoshi");
    fake.installFetchStub();
    const client = new ResolverClient("http://r");

    // ---- step 1: claim against an awaiting_opening_bid auction ----
    const auction = await client.findAuctionForName("satoshi");
    expect(auction).not.toBeNull();

    const bidPackage = bidPackageFromAuction(auction!, {
      ownerPubkey: keystore.ownerPubkey,
      bidderId: keystore.ownerPubkey,
      bidAmountSats: 20_000n
    });
    expect(bidPackage.previewStatus).toBe("currently_valid");
    expect(bidPackage.ownerPubkey).toBe(keystore.ownerPubkey);

    const artifacts = buildAuctionBidArtifacts({
      bidPackage,
      fundingInputs: [
        parseFundingInputDescriptor(`${"11".repeat(32)}:0:50000:${keystore.fundingAddress}`)
      ],
      feeSats: 500n,
      network: NETWORK,
      bondAddress: keystore.fundingAddress,
      changeAddress: keystore.fundingAddress
    });
    const signed = signAuctionBidArtifacts({
      artifacts,
      fundingWif: keystore.fundingWif(),
      network: NETWORK
    });
    expect(signed.signedTransactionId).toBe(artifacts.bidTxid);

    // Wallet records the claim + the bid bond as locked-by-default.
    let state = WalletState.loadOrCreate(statePath, NETWORK);
    state.recordPendingClaim(
      { name: bidPackage.name, ownerPubkey: keystore.ownerPubkey },
      {
        bidTxid: signed.signedTransactionId,
        bidAmountSats: bidPackage.bidAmountSats,
        broadcast: false,
        claimedAt: new Date().toISOString()
      }
    );
    state.recordBid({
      bidTxid: signed.signedTransactionId,
      bondVout: artifacts.bondVout,
      bondAmountSats: bidPackage.bidAmountSats,
      name: bidPackage.name,
      auctionId: bidPackage.auctionId,
      bidderId: bidPackage.bidderId,
      broadcast: false
    });
    state.save(statePath);

    expect(state.lockedBondOutpoints().has(`${signed.signedTransactionId}:${artifacts.bondVout}`)).toBe(true);
    expect(state.get("satoshi")?.pendingClaim?.bidTxid).toBe(signed.signedTransactionId);

    // ---- step 2: simulate confirmation, then sync ----
    fake.nameRecord = {
      name: "satoshi",
      status: "mature",
      currentOwnerPubkey: keystore.ownerPubkey,
      lastStateTxid: signed.signedTransactionId,
      maturityHeight: 250,
      requiredBondSats: "10000",
      currentBondTxid: signed.signedTransactionId,
      currentBondVout: artifacts.bondVout,
      currentBondValueSats: bidPackage.bidAmountSats
    };
    fake.auction = {
      ...fake.auction,
      phase: "settled",
      currentLeaderBidderCommitment: null,
      currentHighestBidSats: null,
      currentRequiredMinimumBidSats: null,
      visibleBidOutcomes: [
        {
          txid: signed.signedTransactionId,
          ownerPubkey: keystore.ownerPubkey,
          amountSats: bidPackage.bidAmountSats,
          status: "accepted",
          bondStatus: "winner_releasable",
          bondReleaseBlock: 250,
          bondSpendStatus: "unspent",
          bondVout: artifacts.bondVout
        }
      ]
    };

    state = WalletState.loadOrCreate(statePath, NETWORK);
    const record = await client.getNameRecord("satoshi");
    expect(record).not.toBeNull();
    expect(record!.currentOwnerPubkey).toBe(keystore.ownerPubkey);
    state.recordSync("satoshi", { ownershipRef: record!.lastStateTxid, status: record!.status });

    const liveAuction = await client.findAuctionForName("satoshi");
    const outcome = liveAuction!.visibleBidOutcomes!.find((o) => o.txid === signed.signedTransactionId);
    expect(outcome?.bondStatus).toBe("winner_releasable");
    state.recordBidSync(signed.signedTransactionId, {
      bondStatus: outcome!.bondStatus!,
      bondReleaseBlock: outcome!.bondReleaseBlock ?? null,
      bondSpendStatus: outcome!.bondSpendStatus!
    });
    state.save(statePath);

    expect(state.get("satoshi")?.pendingClaim).toBeUndefined();
    expect(state.get("satoshi")?.status).toBe("mature");
    expect(state.lockedBondOutpoints().size).toBe(0); // bond is releasable now

    // ---- step 3: publish a destination ----
    const valueRecord = signValueRecord({
      name: "satoshi",
      ownerPrivateKeyHex: keystore.ownerPrivateKeyHex(),
      ownershipRef: record!.lastStateTxid,
      sequence: 1,
      previousRecordHash: null,
      valueType: 1,
      payloadHex: Buffer.from("hello", "utf8").toString("hex")
    });
    await client.publishValueRecord(valueRecord);
    expect(fake.posts.find((p) => p.path === "/values")?.body).toContain('"name":"satoshi"');

    const recordHash = computeValueRecordHash(valueRecord);
    state.recordValue("satoshi", { sequence: 1, recordHash });
    state.save(statePath);

    // The resolver "now knows" the value record + history.
    fake.valueHistory = {
      records: [{ ...valueRecord, recordHash }]
    };

    // ---- step 4: export a proof and verify it locally ----
    const liveRecord = await client.getNameRecord("satoshi");
    const liveAuctionAgain = await client.findAuctionForName("satoshi");
    const valueHistory = await client.getValueHistory("satoshi");
    const bundle = assembleDirectAuctionProofBundle({
      record: liveRecord!,
      auction: liveAuctionAgain!,
      ...(valueHistory !== null ? { valueHistory } : {})
    });
    const report = verifyProofBundle(bundle);
    expect(report.valid).toBe(true);
    expect(report.normalizedName).toBe("satoshi");
    expect(report.proofSource).toBe("bitcoin_l1_direct_auction");
  });
});
