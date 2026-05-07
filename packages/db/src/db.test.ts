import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildClientConfig,
  loadIndexerSnapshotFile,
  parseIndexerSnapshot,
  saveIndexerSnapshotFile
} from "./index.js";

describe("indexer snapshot persistence", () => {
  it("round-trips a snapshot through disk", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ont-db-test-"));
    const filePath = join(tempDir, "snapshot.json");

    const snapshot = {
      launchHeight: 100,
      currentHeight: 101,
      currentBlockHash: "blockhash101",
      processedBlocks: 2,
      names: [
        {
          name: "alice",
          status: "immature" as const,
          currentOwnerPubkey: "11".repeat(32),
          claimCommitTxid: "aa".repeat(32),
          claimRevealTxid: "bb".repeat(32),
          claimHeight: 100,
          maturityHeight: 52_100,
          requiredBondSats: "6250000",
          currentBondTxid: "aa".repeat(32),
          currentBondVout: 0,
          currentBondValueSats: "6250000",
          lastStateTxid: "bb".repeat(32),
          winningCommitBlockHeight: 100,
          winningCommitTxIndex: 0
        }
      ],
      spentOutpoints: [
        {
          outpointTxid: "aa".repeat(32),
          outpointVout: 0,
          spentTxid: "dd".repeat(32),
          spentBlockHeight: 102,
          spentTxIndex: 0,
          spendingInputIndex: 0
        }
      ],
      transactionProvenance: [
        {
          txid: "cc".repeat(32),
          blockHeight: 101,
          txIndex: 1,
          inputs: [],
          outputs: [
            {
              valueSats: "0",
              scriptType: "op_return" as const,
              dataHex: "6a"
            },
            {
              valueSats: "6250000",
              scriptType: "payment" as const
            }
          ],
          events: [
            {
              vout: 1,
              type: 7,
              typeName: "AUCTION_BID" as const,
              payload: {
                flags: 0,
                bondVout: 0,
                settlementLockBlocks: 525600,
                bidAmountSats: "1700000000",
                ownerPubkey: "77".repeat(32),
                auctionLotCommitment: "44".repeat(16),
                auctionCommitment: "55".repeat(32),
                bidderCommitment: "66".repeat(16),
                name: "alice",
                unlockBlock: 100
              },
              validationStatus: "applied" as const,
              reason: "auction_bid_recorded",
              affectedName: null
            }
          ],
          invalidatedNames: []
        }
      ],
      recentCheckpoints: [
        {
          launchHeight: 100,
          currentHeight: 100,
          currentBlockHash: "blockhash100",
          processedBlocks: 1,
          names: [],
          spentOutpoints: [],
          transactionProvenance: []
        }
      ]
    };

    saveIndexerSnapshotFile(filePath, snapshot);
    expect(loadIndexerSnapshotFile(filePath)).toEqual(snapshot);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses valid in-memory snapshot objects", () => {
    expect(
      parseIndexerSnapshot({
        launchHeight: 100,
        currentHeight: null,
        currentBlockHash: null,
        processedBlocks: 0,
        names: [],
        spentOutpoints: [],
        transactionProvenance: [],
        recentCheckpoints: [
          {
            launchHeight: 100,
            currentHeight: 99,
            currentBlockHash: "hash99",
            processedBlocks: 0,
            names: [],
            spentOutpoints: [],
            transactionProvenance: []
          }
        ]
      })
    ).toEqual({
      launchHeight: 100,
      currentHeight: null,
      currentBlockHash: null,
      processedBlocks: 0,
      names: [],
      spentOutpoints: [],
      transactionProvenance: [],
      recentCheckpoints: [
        {
          launchHeight: 100,
          currentHeight: 99,
          currentBlockHash: "hash99",
          processedBlocks: 0,
          names: [],
      spentOutpoints: [],
          transactionProvenance: []
        }
      ]
    });
  });

  it("defaults missing spentOutpoints to an empty array for older snapshots", () => {
    expect(
      parseIndexerSnapshot({
        launchHeight: 100,
        currentHeight: null,
        currentBlockHash: null,
        processedBlocks: 0,
        names: [],
        transactionProvenance: []
      }).spentOutpoints
    ).toEqual([]);
  });

  it("enables ssl defaults for Supabase-style connection strings", () => {
    expect(
      buildClientConfig(
        "postgresql://postgres.example:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
      )
    ).toMatchObject({
      connectionString:
        "postgresql://postgres.example:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
      ssl: {
        rejectUnauthorized: false
      }
    });
  });
});
