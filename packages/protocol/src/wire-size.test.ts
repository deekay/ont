// Pins the on-chain footprint numbers that reviewer-facing docs quote, so the
// docs can't silently drift from the code. STATUS.md and the design brief say
// ONT OP_RETURN events are "up to ~171 bytes (recover-owner; most events
// smaller)" — that figure is the recover-owner payload below, byte-exact.
// If an event format change moves these numbers, update STATUS.md's key-number
// row and the design brief's risk table in the same commit.
import { describe, expect, it } from "vitest";

import {
  encodeRecoverOwnerPayload,
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

describe("documented OP_RETURN payload sizes", () => {
  it("recover-owner is exactly the documented ~171-byte maximum", () => {
    const framed = encodeRecoverOwnerPayload(recoverOwner);
    // magic "ONT" (3) + version (1) + type (1) + body (166) = 171
    expect(RECOVER_OWNER_BODY_LENGTH).toBe(166);
    expect(framed.length).toBe(MAX_DOCUMENTED_OP_RETURN_BYTES);
  });

  it("transfer (the other large recurring event) stays below recover-owner", () => {
    expect(encodeTransferPayload(transfer).length).toBeLessThan(
      MAX_DOCUMENTED_OP_RETURN_BYTES
    );
  });
});
