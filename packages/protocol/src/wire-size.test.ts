// Pins the on-chain footprint numbers that reviewer-facing docs quote, so the
// docs can't silently drift from the code. STATUS.md and the design brief say
// ONT OP_RETURN events are "up to ~171 bytes (recover-owner; most events
// smaller)" — that figure is the recover-owner payload below, byte-exact.
// If an event format change moves these numbers, update STATUS.md's key-number
// row and the design brief's risk table in the same commit.
import { describe, expect, it } from "vitest";

import {
  encodeAuctionBidPayload,
  encodeAvailabilityMarkerPayload,
  encodeRecoverOwnerPayload,
  encodeRootAnchorPayload,
  encodeTransferPayload,
  RECOVER_OWNER_BODY_LENGTH
} from "./wire.js";

const MAX_DOCUMENTED_OP_RETURN_BYTES = 171;

const recoverOwner = {
  prevStateTxid: "ab".repeat(32),
  newOwnerPubkey: "cd".repeat(32),
  flags: 1,
  successorBondVout: 0,
  challengeWindowBlocks: 144,
  recoveryDescriptorHash: "ef".repeat(32),
  signature: "12".repeat(64)
};

const transfer = {
  prevStateTxid: "ab".repeat(32),
  newOwnerPubkey: "cd".repeat(32),
  flags: 0,
  successorBondVout: 0,
  signature: "12".repeat(64)
};

// Maximum-size bid: a full 32-char name (the v1 ceiling, [a-z0-9]{1,32}).
const maxNameAuctionBid = {
  name: "a".repeat(32),
  flags: 1,
  bondVout: 0,
  settlementLockBlocks: 144,
  bidAmountSats: 50_000n,
  ownerPubkey: "ab".repeat(32),
  auctionLotCommitment: "cd".repeat(16),
  auctionCommitment: "ef".repeat(32),
  bidderCommitment: "12".repeat(16),
  unlockBlock: 100
};

const rootAnchor = {
  prevRoot: "ab".repeat(32),
  newRoot: "cd".repeat(32),
  batchSize: 10_000
};

const availabilityMarker = {
  dataDigest: "ab".repeat(32),
  batchSize: 10_000
};

describe("documented OP_RETURN payload sizes", () => {
  it("recover-owner is exactly the documented 171-byte maximum", () => {
    const framed = encodeRecoverOwnerPayload(recoverOwner);
    // magic "ONT" (3) + version (1) + type (1) + body (166) = 171
    expect(RECOVER_OWNER_BODY_LENGTH).toBe(166);
    expect(framed.length).toBe(MAX_DOCUMENTED_OP_RETURN_BYTES);
  });

  it("every other event stays below the recover-owner maximum (byte-exact)", () => {
    // Pinned exactly so a format change can't silently change the envelope:
    // any drift here means STATUS.md's key-number row and the design brief's
    // risk table must be updated in the same commit.
    expect(encodeAuctionBidPayload(maxNameAuctionBid).length).toBe(152);
    expect(encodeTransferPayload(transfer).length).toBe(135);
    expect(encodeRootAnchorPayload(rootAnchor).length).toBe(73);
    expect(encodeAvailabilityMarkerPayload(availabilityMarker).length).toBe(41);
  });

  it("recover-owner is the envelope: nothing encodes larger", () => {
    const sizes = [
      encodeAuctionBidPayload(maxNameAuctionBid).length,
      encodeTransferPayload(transfer).length,
      encodeRootAnchorPayload(rootAnchor).length,
      encodeAvailabilityMarkerPayload(availabilityMarker).length
    ];
    for (const size of sizes) {
      expect(size).toBeLessThan(MAX_DOCUMENTED_OP_RETURN_BYTES);
    }
  });
});
